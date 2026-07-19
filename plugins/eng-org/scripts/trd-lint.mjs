/**
 * trd-lint.mjs — TRD template linter for the eng-org plugin.
 *
 * Pure core: lintTrd(text) → { ok: boolean, findings: string[] }
 * Thin CLI shell: node trd-lint.mjs <path>
 *   exit 0  → lintTrd returned ok: true
 *   exit 1  → lintTrd returned findings (printed to stderr, one per line)
 *   exit 2  → IO error (file not found, unreadable, etc.)
 *
 * Node stdlib only. Zero external dependencies.
 * Consumes ./lib/frontmatter.mjs for ALL section/field parsing.
 * Target: Node v20.
 *
 * MISTAKES guards honored:
 *   2026-07-13 fence-aware sections → parseSections from lib (not home-grown)
 *   2026-07-09 raw-heading-no-slug  → heading constants match template char-for-char
 *   2026-07-11 DRY-anchor          → heading lists declared ONCE, exported for tests
 *   2026-07-15 no-silent-key-drop  → every missing E2 field is a reported finding
 *   2026-07-15 lazy-multiline-regex → all regexes are single-line-anchored
 *   2026-07-15 bare-catch          → CLI IO errors discriminate on e.code
 */

import { parseSections, parseFields } from './lib/frontmatter.mjs';
import { readFileSync } from 'node:fs';
import { argv, exit, stderr } from 'node:process';

// ---------------------------------------------------------------------------
// Section-heading constants (declared ONCE; exported for tests — R4 / DRY)
// ---------------------------------------------------------------------------

/**
 * Ratio core section headings (§1–§5), in order.
 * These MUST be byte-identical to the headings in templates/trd.template.md.
 * R3: no slug — exact raw heading text.
 */
export const RATIO_SECTIONS = [
  '1. What Are We Doing?',
  '2. How Are We Doing It?',
  '3. DB Schema (include ONLY when DB changes)',
  '4. API Contracts',
  '5. Acceptance Criteria',
];

/**
 * eng-org extension section headings (E1–E4), in order.
 * MUST be byte-identical to headings in templates/trd.template.md.
 */
export const EXT_SECTIONS = [
  'E1. Design Principles Applied',
  'E2. Blast Radius & Change Budget',
  'E3. File-by-File Change Map',
  'E4. Test-Tier Strategy',
];

/**
 * Ratio sections for which the N/A sentinel satisfies the non-empty check.
 * ONLY §3 and §4 — never §1, §2, §5, or E1–E4.
 * H-Scripts-2: sentinel scoped to exact sections, line-anchored.
 */
const SENTINEL_ALLOWED = new Set([
  '3. DB Schema (include ONLY when DB changes)',
  '4. API Contracts',
]);

/**
 * E2 budget keys required for REQ-M3-1 scope-explosion-guard.
 * E2 field contract frozen here (tl-scripts-analysis §4).
 */
export const E2_REQUIRED_BUDGET_FIELDS = [
  'files_touched_max',
  'loc_max',
  'allow_full_rewrite',
];

// ---------------------------------------------------------------------------
// Internal helpers (pure, single-line-anchored regexes — R6)
// ---------------------------------------------------------------------------

/**
 * Test whether a line is a "placeholder" that does not count as real content.
 * A line is a placeholder if (after trimming) it:
 *   - Consists only of [...] bracket text
 *   - Is exactly "TODO" or "TBD"
 *   - Is an HTML comment <!-- ... -->
 * R6: line-anchored patterns only.
 *
 * @param {string} line - already trimmed
 * @returns {boolean}
 */
function isPlaceholderLine(line) {
  if (line.length === 0) return false; // blank handled separately
  // HTML comment: starts with <!-- and ends with -->
  if (/^<!--/.test(line) && /-->$/.test(line)) return true;
  // Opening HTML comment without closing on same line
  if (/^<!--/.test(line)) return true;
  // Bare TODO or TBD (whole trimmed line)
  if (line === 'TODO' || line === 'TBD') return true;
  // Bracket placeholder: [anything] — the whole trimmed line is a [...] fill
  if (/^\[.*\]$/.test(line)) return true;
  return false;
}

/**
 * Test whether a line (trimmed) is a Markdown thematic break (horizontal rule).
 * Matches: ---, ***, ___ or 3+ repetitions of dash, asterisk, or underscore with no other chars.
 * R6: line-anchored pattern.
 *
 * @param {string} line - already trimmed
 * @returns {boolean}
 */
function isHorizontalRule(line) {
  return /^(-{3,}|\*{3,}|_{3,})$/.test(line);
}

/**
 * Test whether a section body satisfies the "non-empty" requirement.
 *
 * Non-empty ⟺ the body contains ≥1 line for which:
 *   trim().length > 0  AND  not a placeholder/comment line
 *                      AND  not inside a mermaid fenced block
 *                      AND  not a horizontal rule.
 *
 * Mermaid fenced blocks (```mermaid … ```) are excluded because they are
 * document-level diagram artifacts validated globally by hasMermaidFence —
 * they must not mask an otherwise-empty section (BUG-L2).
 * Only mermaid fences are excluded; other fenced blocks (```sql, ```ts, etc.)
 * ARE counted as content because they represent authored prose/schema.
 *
 * Horizontal rules (---, ***, ___) are structural dividers, not authored prose.
 *
 * For §3 and §4 only, a body whose sole non-blank, non-placeholder line
 * starts with "N/A" (case-sensitive) also satisfies non-empty (sentinel).
 *
 * @param {string} body - raw section body string (from parseSections)
 * @param {string} heading - the section heading (to decide sentinel eligibility)
 * @returns {boolean}
 */
function isNonEmpty(body, heading) {
  const lines = body.split('\n');
  /** @type {string[]} */
  const contentLines = [];

  let inMermaidFence = false;

  for (const raw of lines) {
    const trimmed = raw.trim();

    // Track mermaid fence open/close (line-anchored, R6).
    if (!inMermaidFence && /^\s*```mermaid/.test(raw)) {
      inMermaidFence = true;
      continue; // skip the opening fence marker itself
    }
    if (inMermaidFence) {
      if (/^\s*```\s*$/.test(raw)) {
        inMermaidFence = false; // closing fence marker
      }
      continue; // skip all lines inside (and the closing marker)
    }

    if (trimmed.length === 0) continue;          // blank line
    if (isPlaceholderLine(trimmed)) continue;    // placeholder / comment
    if (isHorizontalRule(trimmed)) continue;     // structural divider
    contentLines.push(trimmed);
  }

  if (contentLines.length === 0) return false;

  // For sentinel-eligible sections (§3 and §4 only): a body whose sole
  // content line starts with N/A satisfies non-empty. R6: line-anchored.
  if (SENTINEL_ALLOWED.has(heading)) {
    if (contentLines.length === 1 && /^N\/A\b/.test(contentLines[0])) {
      return true;
    }
  } else {
    // For all other sections: a body whose sole content line matches the
    // N/A sentinel pattern is treated as empty — sentinel NOT honored here
    // (H-Scripts-2: sentinel scoped to exact sections).
    if (contentLines.length === 1 && /^N\/A\b/.test(contentLines[0])) {
      return false;
    }
  }

  // General case: any real content line suffices.
  return true;
}

/**
 * Detect ≥1 mermaid fenced block in the full document text.
 *
 * A mermaid fence open is a line matching /^\s*```mermaid/ at fence-open
 * position. Inline prose containing "mermaid" does NOT count.
 * R6: line-anchored regex; operates per-line, no [\s\S]*? spanning.
 *
 * @param {string} text
 * @returns {boolean}
 */
function hasMermaidFence(text) {
  const lines = text.split('\n');
  for (const line of lines) {
    // Line-anchored: the fence marker must be at the start of the line.
    if (/^\s*```mermaid/.test(line)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------------------

/**
 * Lint a TRD document text.
 *
 * Algorithm:
 *   1. Call parseSections ONCE — build a Map<heading, body> (H-Scripts-3).
 *   2. For each Ratio section, check presence and non-empty.
 *   3. For each Ext section, check presence and non-empty.
 *   4. For E2 specifically, check all three budget keys via parseFields.
 *   5. Check ≥1 mermaid fence in the full text.
 *
 * @param {string} text - full TRD document text
 * @returns {{ ok: boolean, findings: string[] }}
 */
export function lintTrd(text) {
  /** @type {string[]} */
  const findings = [];

  // Step 1 — ONE parseSections pass; build a Map (H-Scripts-3 / R-d N+1 guard).
  const sections = parseSections(text);
  /** @type {Map<string, string>} */
  const sectionMap = new Map();
  for (const s of sections) {
    // For level-2 headings only; if a later same-heading exists, first wins
    // (template headings are unique, so this is a guard, not a policy).
    if (s.level === 2 && !sectionMap.has(s.heading)) {
      sectionMap.set(s.heading, s.body);
    }
  }

  // Step 2 — Ratio sections §1–§5
  for (const heading of RATIO_SECTIONS) {
    if (!sectionMap.has(heading)) {
      findings.push(`section '${heading}' is missing`);
      continue;
    }
    const body = sectionMap.get(heading);
    if (!isNonEmpty(body, heading)) {
      findings.push(`section '${heading}' is present but empty`);
    }
  }

  // Step 3 — Ext sections E1–E4
  for (const heading of EXT_SECTIONS) {
    if (!sectionMap.has(heading)) {
      findings.push(`extension section '${heading}' is missing`);
      continue;
    }
    const body = sectionMap.get(heading);
    if (!isNonEmpty(body, heading)) {
      findings.push(`extension section '${heading}' is present but empty`);
    }
  }

  // Step 4 — E2 budget field presence (R5 / no-silent-key-drop)
  const e2Heading = 'E2. Blast Radius & Change Budget';
  if (sectionMap.has(e2Heading)) {
    const e2Body = sectionMap.get(e2Heading);
    const fields = parseFields(e2Body);
    for (const key of E2_REQUIRED_BUDGET_FIELDS) {
      if (!(key in fields)) {
        findings.push(`E2 missing budget field: ${key}`);
      }
    }
  }
  // If E2 is missing entirely, it was already caught in Step 3.

  // Step 5 — mermaid fence (R6: per-line, line-anchored)
  if (!hasMermaidFence(text)) {
    findings.push('no ```mermaid fenced block found');
  }

  return { ok: findings.length === 0, findings };
}

// ---------------------------------------------------------------------------
// CLI shell (thin — IO lives here; lintTrd is pure)
// ---------------------------------------------------------------------------

// Only run when executed directly (node trd-lint.mjs <path>).
// Detect by comparing import.meta.url to argv[1].
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);

if (argv[1] === __filename) {
  const filePath = argv[2];

  if (!filePath) {
    stderr.write('Usage: node trd-lint.mjs <path-to-trd.md>\n');
    exit(1);
  }

  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (e) {
    // R7: discriminate on e.code — no bare catch, no false PASS.
    if (e.code === 'ENOENT') {
      stderr.write(`trd-lint: file not found: ${filePath}\n`);
    } else if (e.code === 'EACCES') {
      stderr.write(`trd-lint: permission denied: ${filePath}\n`);
    } else {
      stderr.write(`trd-lint: cannot read file: ${filePath}: ${e.message}\n`);
    }
    exit(2);
  }

  const { ok, findings } = lintTrd(text);

  if (ok) {
    process.stdout.write(`trd-lint: PASS — ${filePath}\n`);
    exit(0);
  } else {
    for (const finding of findings) {
      stderr.write(`trd-lint: FAIL — ${finding}\n`);
    }
    exit(1);
  }
}
