/**
 * frontmatter.mjs — shared frontmatter/section parser for eng-org plugin scripts.
 *
 * Pure, synchronous, deterministic. No IO, no Date.now(), no Math.random().
 * Same input → same output, byte-for-byte.
 *
 * SUPPORTED YAML SUBSET (hand-rolled — NOT a YAML library):
 *   - Top-level `key: value` scalars only.
 *   - Scalar coercion: true/false → boolean; null/empty → null;
 *     bare integer (/^-?\d+$/) → number; else → string.
 *   - Quoted scalars ('…' or "…") — quotes stripped, '#' inside quotes
 *     is NOT a comment (quote-aware, per verdict-lint L506).
 *   - `# comment` to end of line stripped only when '#' is outside a quote pair.
 *   - Simple block lists: `key:` on its own line followed by `  - item` lines →
 *     data[key] = array of scalars or {field: value} maps (one nesting level only).
 *   - Duplicate keys: last wins (documented; no throw, no merge).
 *
 * NOT SUPPORTED (callers must not assume these work):
 *   - Multi-document streams (---)
 *   - Anchors/aliases (&anchor /*alias)
 *   - Multiline scalars (| or >)
 *   - Flow collections ({a: 1} / [1,2])
 *   - Nesting deeper than 1 level
 *
 * Exports (named only, no default — matches repo convention):
 *   parseFrontmatter(text)           → { data, body }
 *   parseSections(text)              → [{ heading, level, body }]
 *   getSection(text, heading, opts?) → string | null
 *   parseFields(body)                → Record<string, unknown>
 *
 * Node stdlib only. Zero external dependencies.
 * Target: Node v20.
 */

// ---------------------------------------------------------------------------
// Internal constants (declared ONCE — MISTAKES 2026-07-11 anchor-DRY)
// ---------------------------------------------------------------------------

/**
 * ATX heading: one or more '#' followed by exactly one space.
 * Declared ONCE here; all heading detection flows through this regex.
 * MISTAKES 2026-07-11: HEADING_RE re-declared byte-identical in 4 sibling parsers.
 */
const HEADING_RE = /^(#{1,6}) /;

/** UTF-8 BOM character (U+FEFF). */
const BOM = '﻿';

/** Fence-open/close pattern (``` or ~~~, with optional language tag on open). */
const FENCE_RE = /^\s*(```|~~~)/;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Toggle fence state: returns true when the line opens or closes a code fence.
 * @param {string} line
 * @returns {boolean}
 */
function isFenceLine(line) {
  return FENCE_RE.test(line);
}

/**
 * Coerce a raw YAML scalar string to its typed value.
 * Shared between parseFrontmatter (block) and parseFields (section body).
 * MISTAKES 2026-07-11: do not duplicate scalar-coercion logic.
 *
 * @param {string} raw - trimmed value string (quotes NOT yet stripped)
 * @returns {unknown}
 */
function coerce(raw) {
  // Strip surrounding single or double quotes → literal string, no further coercion.
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }

  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null' || raw === '') return null;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}

/**
 * Strip a trailing comment from a YAML value line.
 * Only strips a `# …` segment that is OUTSIDE any quote pair.
 * Carries the quote-aware behavior from verdict-lint.mjs L506.
 *
 * Handles two forms:
 *   - `value # comment` → strips ` # comment`
 *   - `# comment`       → the whole value is a comment; returns ""
 *
 * @param {string} raw - raw line (everything after `key: `)
 * @returns {string} value with comment stripped
 */
function stripComment(raw) {
  // Case: entire value is a comment (starts with #, no content before it).
  if (/^\s*#/.test(raw)) {
    // But respect quote context: if the '#' is the very first non-space character
    // and there are no open quotes before it, the whole thing is a comment → "".
    const before = raw.slice(0, raw.indexOf('#'));
    const singleQ = (before.match(/'/g) || []).length;
    const doubleQ = (before.match(/"/g) || []).length;
    if (singleQ % 2 === 0 && doubleQ % 2 === 0) return '';
  }
  // Case: `value # comment` — strip the ` # ...` suffix outside any quote pair.
  return raw.replace(/((?:^|\s)#.*)$/, (match, _m, offset) => {
    const before = raw.slice(0, offset);
    const singleQ = (before.match(/'/g) || []).length;
    const doubleQ = (before.match(/"/g) || []).length;
    // Inside a quote pair → preserve the '#'.
    if (singleQ % 2 !== 0 || doubleQ % 2 !== 0) return match;
    return '';
  });
}

/**
 * Parse a single `key: value` line into [key, rawValue] or null if not a
 * valid top-level key line.
 *
 * @param {string} line
 * @returns {[string, string] | null}
 */
function parseKeyValue(line) {
  // Key must start at column 0 (no leading whitespace) and match identifier pattern.
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)/);
  if (!m) return null;
  const key = m[1];
  const rawVal = stripComment(m[2]).trim();
  return [key, rawVal];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a leading YAML frontmatter block from markdown text.
 *
 * Rules:
 *   - Strips a leading UTF-8 BOM before delimiter detection.
 *   - Opening delimiter: `---` on the first content line (trimmed).
 *   - Closing delimiter: next standalone `---` line (trimmed). If the closing
 *     delimiter is absent (unterminated), treat the whole text as body with no
 *     frontmatter (do NOT swallow the document — TASK-1 E4).
 *   - Parses the block as the documented YAML subset.
 *   - TOLERANT: never throws on malformed input.
 *
 * @param {string} text
 * @returns {{ data: Record<string, unknown>, body: string }}
 */
export function parseFrontmatter(text) {
  /** @type {Record<string, unknown>} */
  const data = Object.create(null);
  const empty = { data, body: text };

  if (typeof text !== 'string' || text.length === 0) {
    return { data: Object.create(null), body: '' };
  }

  // Strip BOM.
  const t = text.startsWith(BOM) ? text.slice(1) : text;
  const lines = t.split(/\r?\n/);

  // Opening delimiter must be the very first line.
  if (lines[0].trim() !== '---') {
    return { data: Object.create(null), body: t };
  }

  // Find closing delimiter.
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closeIdx = i;
      break;
    }
  }

  // Unterminated frontmatter → no-frontmatter (E4: do NOT swallow doc).
  if (closeIdx < 0) {
    return { data: Object.create(null), body: t };
  }

  // Body is everything after the closing ---.
  const bodyLines = lines.slice(closeIdx + 1);
  const body = bodyLines.join('\n');

  // Parse the YAML block.
  const fmLines = lines.slice(1, closeIdx);
  _parseYamlSubset(fmLines, data);

  return { data, body };
}

/**
 * Parse the YAML-subset block lines into `data`.
 * Internal — not exported.
 *
 * @param {string[]} lines
 * @param {Record<string, unknown>} data - mutated in place
 */
function _parseYamlSubset(lines, data) {
  /** @type {string | null} current list key */
  let listKey = null;
  /** @type {unknown[] | null} current list buffer */
  let listBuf = null;
  /** @type {{ [field: string]: unknown } | null} current list-item map */
  let currentItem = null;

  for (const raw of lines) {
    // Skip blank lines.
    if (raw.trim() === '') continue;

    // Strip comment (quote-aware) for the purpose of classification.
    const line = stripComment(raw);

    // --- List item continuation: `    field: value` (4-space or tab indent after `- `)
    //     Only when we are inside a list.
    if (listBuf !== null && /^\s{4}/.test(raw)) {
      // 4-space-indented continuation field of the current item.
      const contMatch = line.trim().match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)/);
      if (contMatch && currentItem !== null) {
        const fk = contMatch[1];
        const fv = stripComment(contMatch[2]).trim();
        currentItem[fk] = coerce(fv);
      }
      continue;
    }

    // --- List item start: `  - field: value` or `  - scalar`
    if (listBuf !== null && /^\s*-\s/.test(raw)) {
      const itemContent = line.replace(/^\s*-\s/, '');
      const kvMatch = itemContent.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)/);
      if (kvMatch) {
        // Map item: `- field: value`
        const fk = kvMatch[1];
        const fv = stripComment(kvMatch[2]).trim();
        currentItem = Object.assign(Object.create(null), { [fk]: coerce(fv) });
        listBuf.push(currentItem);
      } else {
        // Scalar item: `- value`
        const scalarRaw = itemContent.trim();
        currentItem = null;
        listBuf.push(coerce(scalarRaw));
      }
      continue;
    }

    // --- Top-level `key:` (list opener — no value on the same line, not even a comment)
    // Must test the ORIGINAL raw line, not the comment-stripped version: `k: # comment`
    // is a null scalar, NOT a list opener (comment-stripping yields `k:` which would
    // otherwise falsely match).
    const listOpenerMatch = raw.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*$/);
    if (listOpenerMatch) {
      // Flush any current list.
      if (listKey !== null && listBuf !== null) {
        data[listKey] = listBuf;
      }
      listKey = listOpenerMatch[1];
      listBuf = [];
      currentItem = null;
      continue;
    }

    // --- Top-level `key: value` scalar (uses comment-stripped line)
    const kv = parseKeyValue(line);
    if (kv) {
      // Flush pending list on any new top-level key.
      if (listKey !== null && listBuf !== null) {
        data[listKey] = listBuf;
        listKey = null;
        listBuf = null;
        currentItem = null;
      }
      const [k, rawVal] = kv;
      data[k] = coerce(rawVal);
      continue;
    }

    // Unrecognized line — tolerate (no throw).
  }

  // Flush trailing list.
  if (listKey !== null && listBuf !== null) {
    data[listKey] = listBuf;
  }
}

/**
 * Parse ATX markdown sections from text.
 *
 * Rules:
 *   - `level` = count of leading '#' (1–6).
 *   - `heading` = RAW text after the '#…' + space, verbatim (NO slug/normalization —
 *     MISTAKES 2026-07-09: heading typo survived reviewers because read as slug).
 *   - `body` = lines between this heading and the next heading (any level) or EOF,
 *     joined with '\n', heading line excluded.
 *   - FENCE-AWARE: headings inside ``` or ~~~ fenced blocks are NOT section
 *     boundaries (MISTAKES 2026-07-13). Fence lines belong to the enclosing body.
 *   - Preamble before the first heading is NOT a section (dropped).
 *   - A leading frontmatter block (`---…---`) is recognized and skipped — its `---`
 *     lines are not mistaken for headings. Callers may pass `.body` from
 *     parseFrontmatter() instead, but passing whole text is also supported.
 *   - TOLERANT: never throws on malformed input.
 *
 * @param {string} text
 * @returns {Array<{ heading: string, level: number, body: string }>}
 */
export function parseSections(text) {
  if (typeof text !== 'string' || text.length === 0) return [];

  // Strip BOM.
  const t = text.startsWith(BOM) ? text.slice(1) : text;
  const lines = t.split(/\r?\n/);

  /** @type {Array<{ heading: string, level: number, body: string }>} */
  const sections = [];

  // Skip a leading frontmatter block so `---` lines are not parsed as headings.
  let start = 0;
  if (lines.length > 0 && lines[0].trim() === '---') {
    let closeIdx = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') { closeIdx = i; break; }
    }
    if (closeIdx > 0) {
      start = closeIdx + 1;
    }
    // If unterminated: start stays 0 but the `---` on line 0 won't match HEADING_RE
    // (it has no space after), so it is naturally skipped.
  }

  /** @type {string | null} */
  let currentHeading = null;
  let currentLevel = 0;
  /** @type {string[]} */
  let currentBodyLines = [];
  let inFence = false;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];

    // Fence toggle (MISTAKES 2026-07-13: fence-aware section splitting).
    if (isFenceLine(line)) {
      inFence = !inFence;
      if (currentHeading !== null) {
        currentBodyLines.push(line);
      }
      continue;
    }

    // Inside a fence: all lines (including apparent headings) go to body.
    if (inFence) {
      if (currentHeading !== null) {
        currentBodyLines.push(line);
      }
      continue;
    }

    // Heading detection (only outside fence).
    const hm = HEADING_RE.exec(line);
    if (hm) {
      // Flush current section.
      if (currentHeading !== null) {
        sections.push({
          heading: currentHeading,
          level: currentLevel,
          body: currentBodyLines.join('\n'),
        });
      }
      currentHeading = line.slice(hm[1].length + 1); // raw text after '# '
      currentLevel = hm[1].length;
      currentBodyLines = [];
      continue;
    }

    // Regular body line.
    if (currentHeading !== null) {
      currentBodyLines.push(line);
    }
    // Preamble (before first heading) is silently dropped.
  }

  // Flush last section.
  if (currentHeading !== null) {
    sections.push({
      heading: currentHeading,
      level: currentLevel,
      body: currentBodyLines.join('\n'),
    });
  }

  return sections;
}

/**
 * Return the body of the FIRST section whose heading matches `heading` exactly
 * (case-sensitive, exact char-for-char — no slug — MISTAKES 2026-07-09).
 * Optionally constrained to a specific heading level via `opts.level`.
 *
 * @param {string} text
 * @param {string} heading
 * @param {{ level?: number }} [opts]
 * @returns {string | null}
 */
export function getSection(text, heading, opts) {
  const sections = parseSections(text);
  for (const s of sections) {
    if (s.heading !== heading) continue;
    if (opts && typeof opts.level === 'number' && s.level !== opts.level) continue;
    return s.body;
  }
  return null;
}

/**
 * Parse `key: value` fields from a section body string.
 * Uses the SAME scalar coercion as parseFrontmatter (shared helper `coerce`).
 * Useful for reading E2 budget fields from a section body without a full
 * frontmatter block.
 *
 * TOLERANT: never throws on malformed input.
 *
 * @param {string} body
 * @returns {Record<string, unknown>}
 */
export function parseFields(body) {
  /** @type {Record<string, unknown>} */
  const data = Object.create(null);
  if (typeof body !== 'string' || body.length === 0) return data;

  const lines = body.split(/\r?\n/);
  _parseYamlSubset(lines, data);
  return data;
}
