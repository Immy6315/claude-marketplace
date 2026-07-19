/**
 * design-lint.mjs — mechanical-smell linter for source files (stdlib-only).
 *
 * Pure core: lintSource(text, filePath, config) → { findings: Finding[] }
 * Thin CLI shell: node design-lint.mjs [--config <path>] <file1> [file2 ...]
 *   exit 0 → no findings
 *   exit 1 → findings present (advisory findings alone still trigger exit 1;
 *             they are clearly tagged so consumers can filter — see EXIT POLICY)
 *   exit 2 → IO error (file not found, permission denied, bad config JSON, etc.)
 *
 * EXIT POLICY: exit 1 fires whenever ANY finding exists, including advisory ones.
 * Advisory findings are tagged `severity: 'advisory'` in the Finding object so
 * a downstream consumer can `findings.filter(f => f.severity !== 'advisory')` to
 * strip heuristic noise if desired. This matches the sibling trd-lint / scope-
 * explosion-guard convention: the script always signals findings via exit 1; the
 * caller decides how to act on advisories.
 *
 * Node stdlib only. Zero external dependencies.
 * Input surface: SOURCE FILES ONLY (.ts .tsx .js .jsx .mjs .cjs).
 *   Any other extension → skip with a printed note; no error.
 * Does NOT import lib/frontmatter.mjs (config is JSON, not markdown).
 * Target: Node v20.
 *
 * MISTAKES guards honored:
 *   2026-07-10 no-machine-absolute-path → no machine-home path literals in source
 *   2026-07-11 DRY-anchor              → DEFAULT_CONFIG declared ONCE, exported
 *   2026-07-15 documented-but-unenforced → all 6 smells are proven by fixtures
 *   2026-07-15 bare-catch              → IO errors discriminate on e.code; no false PASS
 *   2026-07-15 gr-P1-#2               → pure core exported; test imports real symbols
 *   2026-07-15 always-PASS oracle      → fixtures assert findings contents, not magic bytes
 *   H-Scripts-DL-1 fail-closed        → per-file error → exit 2, never silent PASS
 *   H-Scripts-DL-2 ReDoS              → all regexes line-anchored and linear-time
 *   H-Scripts-DL-3 raw-byte-leak      → findings carry path:line:smell + short snippet only
 *   H-Scripts-DL-4 heuristic scope    → fn/param detection honestly scoped; documented caveats
 *
 * 6 SMELL CLASSES (mechanical / objective only):
 *   1. file-length     — file exceeds fileMaxLines (or testFileMaxLines for *.test.*)
 *   2. function-length — function body exceeds functionMaxLines
 *   3. param-count     — function signature exceeds paramMaxCount
 *   4. duplicate-block — sliding window of dupWindowLines non-blank/non-comment lines
 *                        hashed with sha1; ≥ dupMinRepeats occurrences → advisory finding
 *   5. todo-marker     — TODO / FIXME / XXX / HACK in comment context only
 *   6. escape-hatch    — `as any` cast or eslint-disable directive
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { argv, exit, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Config — DEFAULT_CONFIG (exported; NO magic numbers elsewhere)
// ---------------------------------------------------------------------------

/**
 * Default configuration for design-lint.
 * All thresholds read from this object; callers may shallow-merge an override
 * from a JSON file supplied via `--config <path>`.
 *
 * @type {{
 *   fileMaxLines: number,
 *   testFileMaxLines: number,
 *   functionMaxLines: number,
 *   paramMaxCount: number,
 *   dupWindowLines: number,
 *   dupMinRepeats: number
 * }}
 */
export const DEFAULT_CONFIG = {
  fileMaxLines: 600,
  testFileMaxLines: 1000,
  functionMaxLines: 80,
  paramMaxCount: 5,
  dupWindowLines: 6,
  dupMinRepeats: 2,
};

/** TODO/FIXME marker set (fixed; comment-scoped only — see smell 5). */
export const TODO_MARKERS = ['TODO', 'FIXME', 'XXX', 'HACK'];

/** Source file extension allowlist (smell detectors are code-smell detectors). */
export const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

// ---------------------------------------------------------------------------
// Exit codes (declared ONCE)
// ---------------------------------------------------------------------------

const EXIT_CLEAN = 0;
const EXIT_FINDINGS = 1;
const EXIT_IO_ERROR = 2;

// ---------------------------------------------------------------------------
// Smell severity
// ---------------------------------------------------------------------------

/** @typedef {'error' | 'advisory'} Severity */

// ---------------------------------------------------------------------------
// Finding type
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   path: string,
 *   line: number,
 *   endLine?: number,
 *   smell: string,
 *   severity: Severity,
 *   snippet: string
 * }} Finding
 */

// ---------------------------------------------------------------------------
// Internal helpers — all regexes are line-anchored and linear-time (H-DL-2)
// ---------------------------------------------------------------------------

/**
 * Test whether a line (trimmed) is blank or comment-only.
 * Used by the duplicate-block heuristic to skip structural noise.
 * Handles: blank, //-comment, #-comment, block-comment-only lines.
 * R6: line-anchored patterns; no nested quantifiers.
 *
 * @param {string} trimmed - already trimmed line
 * @returns {boolean}
 */
function isBlankOrCommentOnly(trimmed) {
  if (trimmed.length === 0) return true;
  // // single-line comment
  if (/^\/\//.test(trimmed)) return true;
  // # shell-style comment
  if (/^#/.test(trimmed)) return true;
  // /* block comment start only — line like: /* ... */ or /* ...
  if (/^\/\*/.test(trimmed)) return true;
  // * continuation in a block comment
  if (/^\*/.test(trimmed)) return true;
  return false;
}

/**
 * Truncate a string to at most maxChars characters for safe snippet emission.
 * H-DL-3: never emit full raw line; short snippet only.
 *
 * @param {string} s
 * @param {number} maxChars
 * @returns {string}
 */
function truncate(s, maxChars) {
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars) + '…';
}

// ---------------------------------------------------------------------------
// Smell 1: file-length
// ---------------------------------------------------------------------------

/**
 * Check whether the file exceeds its line-count limit.
 * Test files (path contains .test. or .spec.) use testFileMaxLines.
 *
 * @param {string[]} lines
 * @param {string} filePath
 * @param {typeof DEFAULT_CONFIG} cfg
 * @returns {Finding[]}
 */
export function checkFileLength(lines, filePath, cfg) {
  const isTest = /\.(test|spec)\./.test(filePath);
  const limit = isTest ? cfg.testFileMaxLines : cfg.fileMaxLines;
  if (lines.length > limit) {
    return [{
      path: filePath,
      line: limit + 1,
      smell: 'file-length',
      severity: 'error',
      snippet: `${lines.length} lines (limit ${limit})`,
    }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Smell 2: function-length  (H-DL-4: heuristic, honestly scoped)
// ---------------------------------------------------------------------------

/**
 * Detect functions whose body exceeds cfg.functionMaxLines.
 *
 * Detection heuristic (honestly scoped — H-DL-4):
 *   - Matches `function` declarations, `async function`, method shorthand,
 *     and arrow function assignments (the `=>` form assigned to a const/let/var
 *     or as an export).
 *   - Tracks brace depth to find the closing `}`.
 *   - Does NOT handle: class fields with arrow fns, destructured params across
 *     multiple lines before the `{`, or unusual formatting. Results for those
 *     forms are advisory.
 *
 * @param {string[]} lines
 * @param {string} filePath
 * @param {typeof DEFAULT_CONFIG} cfg
 * @returns {Finding[]}
 */
export function checkFunctionLength(lines, filePath, cfg) {
  const findings = [];
  // Match function/method/arrow-assignment openings.
  // Line-anchored; no nested quantifiers; linear time.
  const FUNC_OPEN_RE = /^\s*(export\s+)?(default\s+)?(async\s+)?function[\s*]|^\s*(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(|^\s*\w+\s*\(.*\)\s*\{/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (FUNC_OPEN_RE.test(line)) {
      // Find opening brace on this line or within the next few lines
      let braceDepth = 0;
      let startLine = i;
      let bodyStart = -1;

      for (let j = i; j < lines.length && j < i + 5; j++) {
        const segment = lines[j];
        for (let k = 0; k < segment.length; k++) {
          if (segment[k] === '{') {
            braceDepth++;
            if (bodyStart === -1) bodyStart = j;
          } else if (segment[k] === '}') {
            braceDepth--;
          }
        }
        if (braceDepth === 0 && bodyStart !== -1) {
          // Single-line function — skip
          i = j + 1;
          break;
        }
        if (braceDepth > 0 && bodyStart !== -1) {
          // Multi-line: scan for the closing brace
          let endLine = j;
          for (let m = j + 1; m < lines.length; m++) {
            const seg = lines[m];
            for (let k = 0; k < seg.length; k++) {
              if (seg[k] === '{') braceDepth++;
              else if (seg[k] === '}') braceDepth--;
            }
            if (braceDepth === 0) {
              endLine = m;
              break;
            }
          }
          const bodyLength = endLine - bodyStart;
          if (bodyLength > cfg.functionMaxLines) {
            findings.push({
              path: filePath,
              line: startLine + 1,
              endLine: endLine + 1,
              smell: 'function-length',
              severity: 'error',
              snippet: truncate(line.trim(), 60) + ` (${bodyLength} lines, limit ${cfg.functionMaxLines})`,
            });
          }
          i = endLine + 1;
          break;
        }
      }
      if (i === startLine) i++; // no brace found — advance
    } else {
      i++;
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Smell 3: param-count  (H-DL-4: heuristic, honestly scoped)
// ---------------------------------------------------------------------------

/**
 * Detect function signatures with more than cfg.paramMaxCount parameters.
 *
 * Heuristic (H-DL-4): counts top-level commas in the first parameter list
 * opening found on the line. Destructured params (`{ a, b }`) count as one
 * param each at the top level. Generic type params (`<T, U>`) are stripped
 * before counting. Documented caveat: multiline param lists are NOT scanned
 * (only the opening line is checked).
 *
 * Line-anchored regex; no nested quantifiers.
 *
 * @param {string[]} lines
 * @param {string} filePath
 * @param {typeof DEFAULT_CONFIG} cfg
 * @returns {Finding[]}
 */
export function checkParamCount(lines, filePath, cfg) {
  const findings = [];
  // Match lines that look like function/method/arrow signatures.
  // R6: line-anchored, linear.
  const FUNC_SIG_RE = /^\s*(export\s+)?(default\s+)?(async\s+)?function\s+\w*\s*\(|^\s*(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(|^\s*\w+\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!FUNC_SIG_RE.test(line)) continue;

    // Find the first `(` and extract the content up to the matching `)`.
    const openIdx = line.indexOf('(');
    if (openIdx === -1) continue;

    // Strip generic type params before the `(` (linear scan, no regex backtrack)
    // e.g. `function foo<T, U>(a, b)` — we want the param portion only.
    let depth = 0;
    let paramContent = '';
    let inParams = false;

    for (let k = openIdx; k < line.length; k++) {
      const ch = line[k];
      if (ch === '(') {
        if (!inParams) { inParams = true; depth = 1; continue; }
        depth++;
        paramContent += ch;
      } else if (ch === ')') {
        depth--;
        if (depth === 0) break;
        paramContent += ch;
      } else if (inParams) {
        paramContent += ch;
      }
    }

    if (!inParams) continue;
    paramContent = paramContent.trim();
    if (paramContent.length === 0) continue; // zero params

    // Count top-level commas (depth-aware for nested braces/parens/brackets).
    let commaCount = 0;
    let nestDepth = 0;
    for (let k = 0; k < paramContent.length; k++) {
      const ch = paramContent[k];
      if (ch === '(' || ch === '{' || ch === '[' || ch === '<') nestDepth++;
      else if (ch === ')' || ch === '}' || ch === ']' || ch === '>') nestDepth--;
      else if (ch === ',' && nestDepth === 0) commaCount++;
    }

    const paramCount = commaCount + 1;
    if (paramCount > cfg.paramMaxCount) {
      findings.push({
        path: filePath,
        line: i + 1,
        smell: 'param-count',
        severity: 'error',
        snippet: truncate(line.trim(), 60) + ` (${paramCount} params, limit ${cfg.paramMaxCount})`,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Smell 4: duplicate-block (advisory, deterministic sha1 window)
// ---------------------------------------------------------------------------

/**
 * Detect duplicate code blocks via a sliding window of cfg.dupWindowLines
 * consecutive non-blank, non-comment-only lines.
 *
 * Algorithm (Q2 / A-12 — deterministic):
 *   1. Collect "content lines": non-blank, non-comment-only trimmed lines,
 *      keeping the original 1-based line number.
 *   2. Slide a window of dupWindowLines over the content lines.
 *   3. Normalize each line: trim() + replace(/\s+/g, ' ').
 *   4. Hash the joined window with sha1 (node:crypto, deterministic).
 *   5. Track first-seen location per hash; when a hash recurs ≥ dupMinRepeats
 *      times, emit ONE advisory finding with first + current line ranges.
 *
 * Tagged severity:'advisory' — does not by itself force exit 1 per module header,
 * but in practice exit 1 fires for any finding (including advisory) unless the
 * caller filters; see EXIT POLICY in module header.
 *
 * @param {string[]} lines
 * @param {string} filePath
 * @param {typeof DEFAULT_CONFIG} cfg
 * @returns {Finding[]}
 */
export function checkDuplicateBlocks(lines, filePath, cfg) {
  const W = cfg.dupWindowLines;
  const minRepeats = cfg.dupMinRepeats;

  // Step 1: collect content lines with original 1-based line numbers.
  /** @type {{ text: string, lineNo: number }[]} */
  const contentLines = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!isBlankOrCommentOnly(trimmed)) {
      contentLines.push({ text: trimmed, lineNo: i + 1 });
    }
  }

  if (contentLines.length < W) return [];

  // Step 2-4: sliding window + sha1.
  /** @type {Map<string, { lineNo: number, count: number }>} */
  const seen = new Map();
  /** @type {Map<string, Finding>} */
  const emitted = new Map();
  /** @type {Finding[]} */
  const findings = [];

  for (let i = 0; i <= contentLines.length - W; i++) {
    const window = contentLines.slice(i, i + W);
    // Step 3: normalize
    const normalized = window.map(cl => cl.text.replace(/\s+/g, ' ')).join('\n');
    // Step 4: sha1 (deterministic, stdlib)
    const hash = createHash('sha1').update(normalized).digest('hex');

    if (!seen.has(hash)) {
      seen.set(hash, { lineNo: window[0].lineNo, count: 1 });
    } else {
      const entry = seen.get(hash);
      entry.count++;
      if (entry.count >= minRepeats && !emitted.has(hash)) {
        // Emit ONE finding per hash (first occurrence vs current)
        const firstLine = entry.lineNo;
        const currentLine = window[0].lineNo;
        const snippet = truncate(window[0].text, 40);
        findings.push({
          path: filePath,
          line: firstLine,
          endLine: currentLine + W - 1,
          smell: 'duplicate-block',
          severity: 'advisory',
          snippet: `first@${firstLine}, repeat@${currentLine}: ${snippet}`,
        });
        emitted.set(hash, findings[findings.length - 1]);
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Smell 5: TODO/FIXME markers in comment context only
// ---------------------------------------------------------------------------

/**
 * Scan a source line char-by-char, tracking string-literal context, and return
 * the index of the first comment opener that occurs OUTSIDE any string literal.
 *
 * Recognised comment openers: `//`, `/*`, and a leading `#` (first non-ws char).
 * String delimiters tracked: `'`, `"`, and `` ` `` with backslash-escape support.
 * Returns -1 when no real comment opener exists on the line.
 *
 * O(line length), no backtracking, no nested quantifiers (H-DL-2).
 *
 * @param {string} line
 * @returns {number} index of the first real comment opener, or -1
 */
function findCommentStart(line) {
  // Leading # (first non-whitespace) can only appear outside a string.
  const trimmed = line.trimStart();
  if (trimmed.startsWith('#')) return line.length - trimmed.length;

  let inString = false;
  /** @type {string} */
  let quote = '';

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inString) {
      if (ch === '\\') {
        i++; // skip escaped char
        continue;
      }
      if (ch === quote) inString = false;
      continue;
    }

    // Not in a string — check for string openers or comment openers.
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === '/' && i + 1 < line.length) {
      const next = line[i + 1];
      if (next === '/' || next === '*') return i;
    }
  }
  return -1;
}

/**
 * Detect TODO / FIXME / XXX / HACK markers in comment context.
 *
 * Comment forms recognized (source files — .ts .js .mjs etc.):
 *   // ... TODO ...
 *   /* ... FIXME ... *\/
 *   # TODO ...     (shell/Python-style; also present in some .js config)
 *
 * Explicitly NOT flagged: marker word inside a string literal or identifier.
 * Uses findCommentStart() to locate the first real comment opener outside any
 * string literal, then checks for the marker word in the comment portion.
 *
 * Line-anchored regexes; no nested quantifiers (H-DL-2).
 *
 * @param {string[]} lines
 * @param {string} filePath
 * @returns {Finding[]}
 */
export function checkTodoMarkers(lines, filePath) {
  const findings = [];
  const MARKER_WORD_RE = /\b(TODO|FIXME|XXX|HACK)\b/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const commentIdx = findCommentStart(line);
    if (commentIdx === -1) continue;

    const commentPortion = line.slice(commentIdx);
    if (MARKER_WORD_RE.test(commentPortion)) {
      findings.push({
        path: filePath,
        line: i + 1,
        smell: 'todo-marker',
        severity: 'error',
        snippet: truncate(commentPortion.trim(), 60),
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Smell 6: escape-hatch (`as any` and eslint-disable directives)
// ---------------------------------------------------------------------------

/**
 * Detect `as any` TypeScript casts and eslint-disable directives.
 *
 * Patterns (line-anchored / linear — H-DL-2):
 *   - `as any` — anywhere on the line (after trimming)
 *   - eslint-disable (block-level)
 *   - eslint-disable-next-line
 *   - eslint-disable-line
 *
 * @param {string[]} lines
 * @param {string} filePath
 * @returns {Finding[]}
 */
export function checkEscapeHatches(lines, filePath) {
  const findings = [];

  // Line-anchored linear regexes — no backtracking risk.
  // `as any` — allow optional type suffix like `as any[]` or `as any)`.
  const AS_ANY_RE = /\bas\s+any\b/;
  // eslint-disable variants — all start with eslint-disable at word boundary.
  const ESLINT_DISABLE_RE = /\beslint-disable(?:-next-line|-line)?\b/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (AS_ANY_RE.test(trimmed)) {
      findings.push({
        path: filePath,
        line: i + 1,
        smell: 'escape-hatch:as-any',
        severity: 'error',
        snippet: truncate(trimmed, 60),
      });
    } else if (ESLINT_DISABLE_RE.test(trimmed)) {
      findings.push({
        path: filePath,
        line: i + 1,
        smell: 'escape-hatch:eslint-disable',
        severity: 'error',
        snippet: truncate(trimmed, 60),
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Pure core: lintSource
// ---------------------------------------------------------------------------

/**
 * Lint a single source file's text content for the 6 mechanical smells.
 *
 * Pure function — no IO, no side effects. Deterministic for the same inputs.
 *
 * @param {string} text - full file text (UTF-8)
 * @param {string} filePath - path for reporting (not read here; IO is caller's job)
 * @param {Partial<typeof DEFAULT_CONFIG>} [overrides] - shallow-merge over DEFAULT_CONFIG
 * @returns {{ findings: Finding[] }}
 */
export function lintSource(text, filePath, overrides) {
  /** @type {typeof DEFAULT_CONFIG} */
  const cfg = Object.assign({}, DEFAULT_CONFIG, overrides);
  const lines = text.split('\n');

  /** @type {Finding[]} */
  const all = [];

  // Run each smell detector in order.
  for (const f of checkFileLength(lines, filePath, cfg)) all.push(f);
  for (const f of checkFunctionLength(lines, filePath, cfg)) all.push(f);
  for (const f of checkParamCount(lines, filePath, cfg)) all.push(f);
  for (const f of checkDuplicateBlocks(lines, filePath, cfg)) all.push(f);
  for (const f of checkTodoMarkers(lines, filePath)) all.push(f);
  for (const f of checkEscapeHatches(lines, filePath)) all.push(f);

  return { findings: all };
}

// ---------------------------------------------------------------------------
// Config loading (CLI tier — reads from disk)
// ---------------------------------------------------------------------------

/**
 * Load an optional JSON config file and shallow-merge over DEFAULT_CONFIG.
 * Returns { ok: true, cfg } on success.
 * Returns { ok: false, message } on read or parse error → caller exits 2.
 *
 * @param {string} configPath
 * @returns {{ ok: true, cfg: typeof DEFAULT_CONFIG } | { ok: false, message: string }}
 */
function loadConfig(configPath) {
  let text;
  try {
    text = readFileSync(configPath, 'utf8');
  } catch (e) {
    const code = (e && e.code) ? e.code : 'UNKNOWN';
    if (code === 'ENOENT') {
      return { ok: false, message: `design-lint: config file not found: ${configPath}` };
    } else if (code === 'EACCES') {
      return { ok: false, message: `design-lint: permission denied reading config: ${configPath}` };
    } else {
      return { ok: false, message: `design-lint: cannot read config (${code}): ${configPath}` };
    }
  }
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, message: `design-lint: config must be a JSON object: ${configPath}` };
    }
    return { ok: true, cfg: Object.assign({}, DEFAULT_CONFIG, parsed) };
  } catch (e) {
    return { ok: false, message: `design-lint: invalid JSON in config: ${configPath}: ${e.message}` };
  }
}

// ---------------------------------------------------------------------------
// Safe file read (mirrors scope-explosion-guard safeRead — fail-closed)
// ---------------------------------------------------------------------------

/**
 * Read a source file with discriminated IO error handling.
 * Returns { ok: true, text } or { ok: false, message } for exit-2 paths.
 * H-DL-1: pathological inputs (huge / binary / unreadable) never become silent PASS.
 *
 * @param {string} filePath
 * @returns {{ ok: true, text: string } | { ok: false, message: string }}
 */
function safeReadSource(filePath) {
  try {
    const text = readFileSync(filePath, 'utf8');
    return { ok: true, text };
  } catch (e) {
    const code = (e && e.code) ? e.code : 'UNKNOWN';
    if (code === 'ENOENT') {
      return { ok: false, message: `design-lint: file not found: ${filePath}` };
    } else if (code === 'EACCES') {
      return { ok: false, message: `design-lint: permission denied: ${filePath}` };
    } else {
      return { ok: false, message: `design-lint: cannot read file (${code}): ${filePath}: ${e.message}` };
    }
  }
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

/**
 * @param {string[]} args - process.argv.slice(2)
 * @returns {{ configPath: string|null, filePaths: string[] }}
 */
function parseCliArgs(args) {
  let configPath = null;
  /** @type {string[]} */
  const filePaths = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) {
      configPath = args[++i];
    } else if (args[i].startsWith('-')) {
      // Unknown flag — warn and skip (don't error; CLI may evolve)
      stderr.write(`design-lint: unknown flag "${args[i]}" (ignored)\n`);
    } else {
      filePaths.push(args[i]);
    }
  }
  return { configPath, filePaths };
}

// ---------------------------------------------------------------------------
// Extension check helper
// ---------------------------------------------------------------------------

/**
 * Return the extension of a file path (lower-cased), including the dot.
 * e.g. "foo.ts" → ".ts", "foo.test.mjs" → ".mjs"
 *
 * @param {string} filePath
 * @returns {string}
 */
function extOf(filePath) {
  const dot = filePath.lastIndexOf('.');
  if (dot === -1) return '';
  return filePath.slice(dot).toLowerCase();
}

// ---------------------------------------------------------------------------
// CLI shell (thin — IO lives here; lintSource is pure)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);

if (argv[1] === __filename) {
  const { configPath, filePaths } = parseCliArgs(argv.slice(2));

  if (filePaths.length === 0) {
    stderr.write('Usage: node design-lint.mjs [--config <path>] <file1> [file2 ...]\n');
    exit(EXIT_IO_ERROR);
  }

  // Load config (optional; invalid/unreadable → exit 2, NOT silent fallback)
  /** @type {typeof DEFAULT_CONFIG} */
  let cfg = DEFAULT_CONFIG;
  if (configPath !== null) {
    const cfgResult = loadConfig(configPath);
    if (!cfgResult.ok) {
      stderr.write(cfgResult.message + '\n');
      exit(EXIT_IO_ERROR);
    }
    cfg = cfgResult.cfg;
  }

  let anyFindings = false;
  let ioError = false;

  for (const filePath of filePaths) {
    // Skip non-source files — print note, do not error.
    const ext = extOf(filePath);
    if (!SOURCE_EXTENSIONS.has(ext)) {
      stdout.write(`design-lint: skipping non-source file: ${filePath} (ext="${ext}")\n`);
      continue;
    }

    // Read file — fail-closed (H-DL-1)
    const readResult = safeReadSource(filePath);
    if (!readResult.ok) {
      stderr.write(readResult.message + '\n');
      ioError = true;
      continue;
    }

    // Lint
    const { findings } = lintSource(readResult.text, filePath, cfg);

    for (const f of findings) {
      anyFindings = true;
      const loc = f.endLine ? `${f.line}-${f.endLine}` : `${f.line}`;
      const sev = f.severity === 'advisory' ? '[advisory]' : '[error]';
      stderr.write(`design-lint: ${sev} ${f.path}:${loc}: ${f.smell}: ${f.snippet}\n`);
    }

    if (findings.length === 0) {
      stdout.write(`design-lint: PASS — ${filePath}\n`);
    }
  }

  if (ioError) {
    exit(EXIT_IO_ERROR);
  }
  if (anyFindings) {
    exit(EXIT_FINDINGS);
  }
  exit(EXIT_CLEAN);
}
