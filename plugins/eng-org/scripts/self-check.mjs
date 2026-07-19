/**
 * self-check.mjs — dogfooding self-check for the eng-org plugin.
 *
 * Pure core: decide({ sourceFindings, trdResult }) → { exitCode, blocking, accepted, advisory }
 * Thin CLI shell: node self-check.mjs
 *   exit 0 → no un-allowlisted error findings AND lintTrd.ok === true
 *   exit 1 → un-allowlisted error finding(s) OR lintTrd failure
 *   exit 2 → IO/import failure (fail-closed, e.code-discriminated)
 *
 * Node stdlib only. Zero external dependencies.
 * Imports real pure cores from sibling scripts (MISTAKES 2026-07-15 gr-P1-#2).
 * All paths resolved via fileURLToPath(import.meta.url) + node:path.
 * No machine-absolute path literals anywhere in this file (MISTAKES 2026-07-10).
 *
 * MISTAKES guards honored:
 *   2026-07-10 no-machine-absolute-path  — fileURLToPath + dirname; no home-dir literals
 *   2026-07-15 always-PASS oracle        — explicit per-entry allowlist; per-site tier-2 keying
 *   2026-07-15 gr-P1-#2 inline-not-import — imports real lintTrd, lintSource, DEFAULT_CONFIG
 *   2026-07-15 bare-catch               — IO errors discriminate on e.code; exit 2 fail-closed
 *   2026-07-15 contract-anchor          — both lintTrd and lintSource calls are real and tested
 *
 * ACCEPTED_FINDINGS — two tiers:
 *   Tier 1 (14 entries): self-referential / spec-permitted long files.
 *     Match key: basename(finding.path) === entry.path AND finding.smell === entry.smell
 *     AND entry.fnLine is undefined (no per-site anchor on tier-1 entries).
 *   Tier 2 (7 entries): pre-existing function-length findings backed by TECH_DEBT.md.
 *     Match key: same as tier 1 PLUS finding.line === entry.fnLine (start-line anchor).
 *     Per-site keying (path+smell+fnLine) is MANDATORY: path+smell alone would absorb a NEW
 *     over-long function in the same file — that is the always-PASS trap (MISTAKES 2026-07-15).
 *     The fnLine field corresponds to finding.line (1-based start line) from design-lint's
 *     checkFunctionLength. The fn field is the human-readable name for documentation.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { argv, exit, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Exit codes (declared ONCE — mirrors sibling CLI convention)
// ---------------------------------------------------------------------------

const EXIT_CLEAN = 0;
const EXIT_FINDINGS = 1;
const EXIT_IO_ERROR = 2;

// ---------------------------------------------------------------------------
// Accepted findings allowlist — two tiers, inline, every entry justified.
// A test asserts every entry has a non-empty reason (test #7).
// A test asserts every tier-2 entry (those with fnLine) has a techDebt id (#11).
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   path: string,
 *   smell: string,
 *   reason: string,
 *   fn?: string,
 *   fnLine?: number,
 *   techDebt?: string
 * }} AcceptedFinding
 */

/**
 * Accepted-findings allowlist (exported for tests and for greppability).
 *
 * Tier 1 — self-referential / spec-permitted (match key: path + smell).
 * Tier 2 — pre-existing function-length sites, TECH_DEBT-backed
 *           (match key: path + smell + fnLine).
 *
 * @type {AcceptedFinding[]}
 */
export const ACCEPTED_FINDINGS = [
  // ---------------------------------------------------------------------------
  // Tier 1 — 14 entries (from tl-scripts-analysis.md §Q2 table plus design-lint.mjs file-length plus self-check self-referential)
  // ---------------------------------------------------------------------------

  // Entry 1 — REQUIRED (AC-6.6): verdict-lint.mjs legitimately exceeds the 600-line limit.
  // A-11 explicitly calibrated the 600-line threshold knowing verdict-lint is 1138 lines.
  {
    path: 'verdict-lint.mjs',
    smell: 'file-length',
    reason: 'Spec-permitted length; A-11 calibrated the 600-line limit knowing verdict-lint is 1138 lines. REQUIRED entry per AC-6.6.',
  },

  // Entry 2 — verdict-lint.test.mjs legitimately exceeds the 1000-line test-file limit.
  {
    path: 'verdict-lint.test.mjs',
    smell: 'file-length',
    reason: 'Fixture-heavy verdict-lint test (2432 lines) legitimately long; A-11 gave test files a 1000-line limit; pre-existing, spec-tolerated.',
  },

  // Entry 3 — design-lint.mjs file-length: the linter itself is 786 lines (exceeds 600).
  // Self-referential: a linter that documents 6 smell classes with full examples and exported
  // helpers is legitimately long; analogous to how verdict-lint.mjs is long by design.
  {
    path: 'design-lint.mjs',
    smell: 'file-length',
    reason: 'Self-referential: design-lint itself is 786 lines because it implements 6 smell detectors with full JSDoc, exported helpers, and a CLI shell. Legitimately long; no available decomposition without creating a lib dependency.',
  },

  // Entry 4 — design-lint.mjs todo-marker: the linter doc-comments name the markers it detects.
  {
    path: 'design-lint.mjs',
    smell: 'todo-marker',
    reason: 'Self-referential: the linter doc-comments name the markers it detects (smell 5). Not a real debt marker.',
  },

  // Entry 5 — design-lint.mjs escape-hatch:as-any: doc-comments describe the detector.
  {
    path: 'design-lint.mjs',
    smell: 'escape-hatch:as-any',
    reason: 'Self-referential: doc-comments describe the escape-hatch detector (smell 6). The linter must mention the patterns it detects.',
  },

  // Entry 6 — design-lint.mjs escape-hatch:eslint-disable: doc-comments describe the detector.
  {
    path: 'design-lint.mjs',
    smell: 'escape-hatch:eslint-disable',
    reason: 'Self-referential: doc-comments describe the eslint-disable arm of the escape-hatch detector (smell 6).',
  },

  // Entry 7 — design-lint.test.mjs escape-hatch:as-any: POSITIVE-detection fixtures must contain the pattern.
  {
    path: 'design-lint.test.mjs',
    smell: 'escape-hatch:as-any',
    reason: 'Self-referential: POSITIVE-detection test fixtures must contain the pattern to prove the detector fires. Unavoidable.',
  },

  // Entry 8 — design-lint.test.mjs escape-hatch:eslint-disable: POSITIVE-detection fixtures.
  {
    path: 'design-lint.test.mjs',
    smell: 'escape-hatch:eslint-disable',
    reason: 'Self-referential: POSITIVE-detection test fixtures must contain the pattern to prove the detector fires. Unavoidable.',
  },

  // Entry 9 — design-lint.test.mjs param-count: the 6-param test case exercises the detector.
  {
    path: 'design-lint.test.mjs',
    smell: 'param-count',
    reason: 'Self-referential: the 6-param test case exercises the param-count detector. Intentional positive-detection fixture.',
  },

  // Entry 10 — trd-lint.mjs todo-marker: comment names the marker the TRD linter looks for.
  {
    path: 'trd-lint.mjs',
    smell: 'todo-marker',
    reason: 'Self-referential: comment names the marker the TRD linter detects. Not a real debt marker.',
  },

  // Entry 11 — trd-lint.unit-verify.test.mjs todo-marker: fixture uses the marker as detection input.
  {
    path: 'trd-lint.unit-verify.test.mjs',
    smell: 'todo-marker',
    reason: 'Self-referential: test fixture uses the marker as placeholder-detection input. Unavoidable in a detector test suite.',
  },

  // Entry 12 — self-check.mjs escape-hatch:eslint-disable: the ACCEPTED_FINDINGS entries here
  // name the smells they cover (e.g. smell: 'escape-hatch:eslint-disable'), triggering the detector
  // on the self-check's own source. Self-referential by the same logic as design-lint.mjs entries.
  {
    path: 'self-check.mjs',
    smell: 'escape-hatch:eslint-disable',
    reason: 'Self-referential: this file\'s ACCEPTED_FINDINGS entries name the smells they cover, including escape-hatch:eslint-disable. The self-check documents what it allows — unavoidable.',
  },

  // Entry 13 — self-check.mjs escape-hatch:as-any: same rationale as entry 12.
  {
    path: 'self-check.mjs',
    smell: 'escape-hatch:as-any',
    reason: 'Self-referential: ACCEPTED_FINDINGS entries reference escape-hatch:as-any in their reason strings and smell fields. The self-check documents what it allows.',
  },

  // Entry 14 — self-check.mjs todo-marker: comments referencing the todo-marker smell name
  // may trigger the detector on this file.
  {
    path: 'self-check.mjs',
    smell: 'todo-marker',
    reason: 'Self-referential: comments in this file reference the todo-marker smell by name, triggering the detector. The self-check documents the smells it handles.',
  },

  // ---------------------------------------------------------------------------
  // Tier 2 — 7 pre-existing function-length findings, TECH_DEBT-backed.
  // Match key: path + smell + fnLine (fnLine === finding.line, 1-based start line).
  // Per-site keying: a new over-long function at a DIFFERENT line still trips red.
  // ---------------------------------------------------------------------------

  // Tier-2 entry 1 — invalidation.mjs buildDependencyGraph (L228, 112 lines)
  {
    path: 'invalidation.mjs',
    smell: 'function-length',
    fn: 'buildDependencyGraph',
    fnLine: 228,
    techDebt: 'TD-2026-07-18-01',
    reason: 'Pre-existing 112-line fn; not touched by this REQ; TECH_DEBT retirement 2026-08-18.',
  },

  // Tier-2 entry 2 — invalidation.mjs async main (L368, 126 lines)
  {
    path: 'invalidation.mjs',
    smell: 'function-length',
    fn: 'main',
    fnLine: 368,
    techDebt: 'TD-2026-07-18-02',
    reason: 'Pre-existing 126-line fn; not touched by this REQ; TECH_DEBT retirement 2026-08-18.',
  },

  // Tier-2 entry 3 — output-cap.mjs loadCapParameter (L192, 87 lines)
  {
    path: 'output-cap.mjs',
    smell: 'function-length',
    fn: 'loadCapParameter',
    fnLine: 192,
    techDebt: 'TD-2026-07-18-03',
    reason: 'Pre-existing 87-line fn; not touched by this REQ; TECH_DEBT retirement 2026-08-18.',
  },

  // Tier-2 entry 4 — output-cap.mjs enforceOutputCap (L348, 131 lines)
  {
    path: 'output-cap.mjs',
    smell: 'function-length',
    fn: 'enforceOutputCap',
    fnLine: 348,
    techDebt: 'TD-2026-07-18-04',
    reason: 'Pre-existing 131-line fn; not touched by this REQ; TECH_DEBT retirement 2026-08-18.',
  },

  // Tier-2 entry 5 — verdict-lint.mjs computeDerivedVerdictWithMeta (L319, 128 lines)
  {
    path: 'verdict-lint.mjs',
    smell: 'function-length',
    fn: 'computeDerivedVerdictWithMeta',
    fnLine: 319,
    techDebt: 'TD-2026-07-18-05',
    reason: 'Pre-existing 128-line fn; not touched by this REQ; TECH_DEBT retirement 2026-08-18. verdict-lint.mjs is immutable-adjacent (G-10).',
  },

  // Tier-2 entry 6 — verdict-lint.mjs parseFrontmatter (L490, 96 lines)
  {
    path: 'verdict-lint.mjs',
    smell: 'function-length',
    fn: 'parseFrontmatter',
    fnLine: 490,
    techDebt: 'TD-2026-07-18-06',
    reason: 'Pre-existing 96-line fn; not touched by this REQ; TECH_DEBT retirement 2026-08-18. verdict-lint.mjs is immutable-adjacent (G-10).',
  },

  // Tier-2 entry 7 — verdict-lint.mjs parseGrReview (L780, 111 lines)
  {
    path: 'verdict-lint.mjs',
    smell: 'function-length',
    fn: 'parseGrReview',
    fnLine: 780,
    techDebt: 'TD-2026-07-18-07',
    reason: 'Pre-existing 111-line fn; not touched by this REQ; TECH_DEBT retirement 2026-08-18. verdict-lint.mjs is immutable-adjacent (G-10).',
  },
];

// ---------------------------------------------------------------------------
// Pure decision core — exported for tests; no IO allowed here.
// ---------------------------------------------------------------------------

/**
 * Determine the exit code and categorise findings.
 *
 * Rules:
 *   - Advisory findings never block.
 *   - Error findings are candidate-blocking UNLESS matched by ACCEPTED_FINDINGS.
 *   - Tier-1 match: entry.path === basename(finding.path) AND entry.smell === finding.smell
 *     AND entry.fnLine is undefined.
 *   - Tier-2 match: same as above PLUS entry.fnLine === finding.line.
 *   - TRD result failure is always blocking (no allowlist for TRD).
 *   - Exit 0 iff no blocking findings remain AND trdResult.ok.
 *   - Exit 1 otherwise.
 *
 * @param {{
 *   sourceFindings: Array<{path:string,line:number,smell:string,severity:string,snippet:string}>,
 *   trdResult: { ok: boolean, findings: string[] }
 * }} params
 * @returns {{ exitCode: 0|1, blocking: Array, accepted: Array, advisory: Array }}
 */
export function decide({ sourceFindings, trdResult }) {
  const advisory = [];
  const accepted = [];
  const blocking = [];

  for (const finding of sourceFindings) {
    if (finding.severity === 'advisory') {
      advisory.push(finding);
      continue;
    }
    const fileBase = basename(finding.path);
    const matched = isAccepted(fileBase, finding.smell, finding.line);
    if (matched) {
      accepted.push(finding);
    } else {
      blocking.push(finding);
    }
  }

  const trdBlocking = !trdResult.ok;
  const exitCode = (blocking.length === 0 && !trdBlocking) ? EXIT_CLEAN : EXIT_FINDINGS;
  return { exitCode, blocking, accepted, advisory };
}

/**
 * Check whether a finding (fileBase, smell, line) is covered by ACCEPTED_FINDINGS.
 * Tier-1: match on fileBase + smell (fnLine undefined).
 * Tier-2: match on fileBase + smell + line (fnLine defined).
 *
 * @param {string} fileBase
 * @param {string} smell
 * @param {number} line
 * @returns {boolean}
 */
function isAccepted(fileBase, smell, line) {
  for (const entry of ACCEPTED_FINDINGS) {
    if (entry.path !== fileBase) continue;
    if (entry.smell !== smell) continue;
    if (entry.fnLine !== undefined) {
      if (entry.fnLine === line) return true;
    } else {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// CLI shell helpers — extracted to keep main() concise (< 80 lines).
// ---------------------------------------------------------------------------

/**
 * Load pure core exports (fail-closed on import error).
 * @returns {Promise<{lintSource: Function, DEFAULT_CONFIG: object, lintTrd: Function}>}
 */
async function loadCores() {
  try {
    const dl = await import('./design-lint.mjs');
    const tl = await import('./trd-lint.mjs');
    return { lintSource: dl.lintSource, DEFAULT_CONFIG: dl.DEFAULT_CONFIG, lintTrd: tl.lintTrd };
  } catch (e) {
    stderr.write(`self-check: import error (code=${e.code ?? 'unknown'}): ${e.message}\n`);
    exit(EXIT_IO_ERROR);
  }
}

/**
 * Read a file as UTF-8; exit 2 on any IO error (fail-closed).
 * @param {string} filePath
 * @returns {string}
 */
function safeRead(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (e) {
    stderr.write(`self-check: cannot read file (code=${e.code ?? 'unknown'}): ${filePath} — ${e.message}\n`);
    exit(EXIT_IO_ERROR);
  }
}

/**
 * Enumerate *.mjs files in a directory; exit 2 on error.
 * @param {string} dir
 * @returns {string[]} absolute paths
 */
function enumScripts(dir) {
  try {
    return readdirSync(dir)
      .filter(f => f.endsWith('.mjs'))
      .map(f => join(dir, f));
  } catch (e) {
    stderr.write(`self-check: cannot enumerate dir (code=${e.code ?? 'unknown'}): ${dir} — ${e.message}\n`);
    exit(EXIT_IO_ERROR);
  }
}

/**
 * Print the human-readable summary to stdout (relative/basename paths only).
 * @param {object} params
 */
function printSummary({ scriptCount, advisory, accepted, blocking, trdResult, fixtureBase, exitCode }) {
  stdout.write(`\nself-check: scanned ${scriptCount} source file(s)\n`);

  if (advisory.length > 0) {
    stdout.write(`\n--- advisory (never blocking) [${advisory.length}] ---\n`);
    for (const f of advisory) {
      stdout.write(`  [advisory] ${basename(f.path)}:${f.line}: ${f.smell}: ${f.snippet}\n`);
    }
  }
  if (accepted.length > 0) {
    stdout.write(`\n--- accepted (allowlisted) [${accepted.length}] ---\n`);
    for (const f of accepted) {
      stdout.write(`  [accepted] ${basename(f.path)}:${f.line}: ${f.smell}: ${f.snippet}\n`);
    }
  }
  if (blocking.length > 0) {
    stdout.write(`\n--- BLOCKING (un-allowlisted errors) [${blocking.length}] ---\n`);
    for (const f of blocking) {
      stdout.write(`  [BLOCKING] ${basename(f.path)}:${f.line}: ${f.smell}: ${f.snippet}\n`);
    }
  }

  const trdLabel = trdResult.ok ? `PASS (${fixtureBase})` : `FAIL`;
  if (!trdResult.ok) {
    stdout.write(`\n--- TRD fixture FAIL ---\n`);
    for (const msg of trdResult.findings) {
      stdout.write(`  [TRD] ${msg}\n`);
    }
  } else {
    stdout.write(`\nTRD fixture: ${trdLabel}\n`);
  }

  stdout.write(`\n--- verdict ---\n`);
  stdout.write(`  blocking:  ${blocking.length}\n`);
  stdout.write(`  accepted:  ${accepted.length}\n`);
  stdout.write(`  advisory:  ${advisory.length}\n`);
  stdout.write(`  TRD ok:    ${trdResult.ok}\n`);
  stdout.write(exitCode === EXIT_CLEAN
    ? `\nself-check: PASS (exit 0)\n`
    : `\nself-check: FAIL (exit ${exitCode})\n`
  );
}

// ---------------------------------------------------------------------------
// CLI shell — thin IO wrapper. Resolves paths, loads cores, calls decide.
// ---------------------------------------------------------------------------

async function main() {
  const scriptsDir = dirname(fileURLToPath(import.meta.url));
  const fixtureFile = join(scriptsDir, 'fixtures', 'self-check-sample-trd.md');

  const { lintSource, DEFAULT_CONFIG, lintTrd } = await loadCores();

  const fixtureText = safeRead(fixtureFile);
  const scriptFiles = enumScripts(scriptsDir);

  const allSourceFindings = [];
  for (const filePath of scriptFiles) {
    const text = safeRead(filePath);
    const result = lintSource(text, filePath, DEFAULT_CONFIG);
    allSourceFindings.push(...result.findings);
  }

  const trdResult = lintTrd(fixtureText);
  const { exitCode, blocking, accepted, advisory } = decide({
    sourceFindings: allSourceFindings,
    trdResult,
  });

  printSummary({
    scriptCount: scriptFiles.length,
    advisory,
    accepted,
    blocking,
    trdResult,
    fixtureBase: basename(fixtureFile),
    exitCode,
  });

  exit(exitCode);
}

// Run main only when this file is the CLI entry point, not when imported as a module.
// This allows test files to `import { ACCEPTED_FINDINGS, decide }` without triggering IO.
if (argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
