/**
 * scope-explosion-guard.mjs — anti-rewrite / scope-explosion guard.
 *
 * Pure core: evaluateBudget({ filesTouched, loc, budget, tolerance, allowFullRewrite })
 *            → { verdict: 'PASS' | 'BLOCK' | 'OVERRIDE', reasons: string[] }
 *
 * Thin CLI shell: node scope-explosion-guard.mjs
 *   --trd <path>       TRD file containing §E2 budget fields
 *   --changed <path>   JSON file produced by git-changed-to-json.mjs (array of paths)
 *   --numstat <path>   File containing `git diff --numstat` output
 *   [--tolerance <n>]  Tolerance multiplier, default 1.5
 *
 * Exit codes:
 *   0  → PASS or OVERRIDE (allow_full_rewrite=true)
 *   1  → BLOCK (diff exceeds budget × tolerance)
 *   2  → IO error (file not found, permission denied, etc.)
 *   3  → Budget parse error (missing §E2, missing/non-numeric budget key)
 *
 * Node stdlib only. Zero external dependencies.
 * Consumes ./lib/frontmatter.mjs for ALL §E2 parsing.
 * NEVER imports trd-lint.mjs (avoid lint↔guard cycle).
 * Target: Node v20.
 *
 * MISTAKES guards honored:
 *   2026-07-10 no-machine-absolute-path  → zero machine-home path literals in source
 *   2026-07-11 DRY-parse-anchor          → getSection/parseFields from lib only
 *   2026-07-15 no-bare-catch             → IO errors discriminate on e.code
 *   2026-07-15 documented-but-unenforced → BLOCK path proven by test fixture
 *   2026-07-15 always-PASS oracle        → fixtures assert verdict, not magic numbers
 *   2026-07-11 numeric-metadata-bound    → budget + LOC read at runtime from parsed inputs
 */

import { getSection, parseFields } from './lib/frontmatter.mjs';
import { readFileSync } from 'node:fs';
import { argv, exit, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// E2 budget key names — declared ONCE (frozen contract, REQ-M1-2).
// Do NOT import from trd-lint.mjs (no lint↔guard cycle).
// Source of truth: templates/trd.template.md §E2 + trd-scripts-analysis §4.
// ---------------------------------------------------------------------------

/** @type {readonly string[]} */
const E2_BUDGET_KEYS = /** @type {const} */ ([
  'files_touched_max',
  'loc_max',
  'allow_full_rewrite',
]);

/** Heading to pass to getSection — must be byte-identical to trd.template.md. */
const E2_HEADING = 'E2. Blast Radius & Change Budget';

// ---------------------------------------------------------------------------
// Default tolerance (exposed as --tolerance flag at CLI tier)
// ---------------------------------------------------------------------------

const DEFAULT_TOLERANCE = 1.5;

// ---------------------------------------------------------------------------
// Exit codes (documented in module header)
// ---------------------------------------------------------------------------

const EXIT_PASS = 0;
const EXIT_BLOCK = 1;
const EXIT_IO_ERROR = 2;
const EXIT_BUDGET_PARSE_ERROR = 3;

// ---------------------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------------------

/**
 * @typedef {{ filesTouched: number, loc: number, budget: Budget, tolerance: number, allowFullRewrite: boolean }} EvalInput
 * @typedef {{ files_touched_max: number, loc_max: number }} Budget
 * @typedef {{ verdict: 'PASS' | 'BLOCK' | 'OVERRIDE', reasons: string[] }} EvalResult
 */

/**
 * Evaluate whether the actual diff (files touched + LOC) is within the declared budget.
 *
 * Decision logic (A-7):
 *   OVERRIDE: allowFullRewrite === true  → skip BLOCK regardless of counts
 *   BLOCK:    filesTouched > budget.files_touched_max × tolerance
 *             OR loc > budget.loc_max × tolerance
 *   PASS:     otherwise (including exactly-at-budget)
 *
 * Boundary rule: exactly at budget × tolerance → PASS; one over → BLOCK.
 *
 * @param {EvalInput} input
 * @returns {EvalResult}
 */
export function evaluateBudget({ filesTouched, loc, budget, tolerance, allowFullRewrite }) {
  // A-8: human-gated full-rewrite override — skip BLOCK when set in EM-approved TRD.
  if (allowFullRewrite === true) {
    return {
      verdict: 'OVERRIDE',
      reasons: [
        'OVERRIDE: allow_full_rewrite=true (provenance: EM-approved TRD)',
      ],
    };
  }

  const reasons = [];

  const fileLimit = budget.files_touched_max * tolerance;
  const locLimit = budget.loc_max * tolerance;

  const filesOver = filesTouched > fileLimit;
  const locOver = loc > locLimit;

  if (filesOver) {
    reasons.push(
      `files-touched ${filesTouched} exceeds budget ${budget.files_touched_max} × ${tolerance} = ${fileLimit}`,
    );
  }
  if (locOver) {
    reasons.push(
      `LOC (added+deleted) ${loc} exceeds budget ${budget.loc_max} × ${tolerance} = ${locLimit}`,
    );
  }

  if (filesOver || locOver) {
    return { verdict: 'BLOCK', reasons };
  }

  return {
    verdict: 'PASS',
    reasons: [
      `files-touched ${filesTouched} ≤ ${fileLimit} (budget ${budget.files_touched_max} × ${tolerance})`,
      `LOC ${loc} ≤ ${locLimit} (budget ${budget.loc_max} × ${tolerance})`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Numstat parser (pure, stdlib split — A-6)
// ---------------------------------------------------------------------------

/**
 * Parse `git diff --numstat` output and return total churn (added + deleted lines).
 * Binary rows (where added/deleted are `-`) contribute 0, never throw.
 *
 * Format per line: `<added>\t<deleted>\t<filename>`
 *   Binary: `-\t-\t<filename>`
 *
 * @param {string} text - raw numstat output
 * @returns {number} total added + deleted lines (sum across all files)
 */
export function parseNumstat(text) {
  if (typeof text !== 'string' || text.trim().length === 0) return 0;

  let total = 0;
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    const parts = trimmed.split('\t');
    // Each numstat line has at least 3 tab-separated fields: added, deleted, filename
    if (parts.length < 2) continue;

    const added = parts[0];
    const deleted = parts[1];

    // Binary file marker — contribute 0, no throw
    if (added === '-' || deleted === '-') continue;

    const a = Number(added);
    const d = Number(deleted);

    // Skip lines where parsing yields NaN (malformed — tolerate silently)
    if (!Number.isFinite(a) || !Number.isFinite(d)) continue;

    // SEC-1: Negative integers are not valid numstat output (real git never emits them;
    // only binary rows use '-', which are handled above).  A negative value signals
    // adversarial / tampered input that would underflow the running total and produce a
    // false PASS.  Fail closed: throw so the CLI exits with EXIT_BUDGET_PARSE_ERROR (3).
    if (a < 0 || d < 0) {
      throw new RangeError(
        `parseNumstat: negative value in numstat row "${trimmed}" ` +
          `(added=${a}, deleted=${d}); ` +
          'real git diff --numstat never emits negative integers — treating as adversarial input',
      );
    }

    total += a + d;
  }
  return total;
}

// ---------------------------------------------------------------------------
// §E2 budget extractor (uses lib/frontmatter.mjs — A-6 / DRY)
// ---------------------------------------------------------------------------

/**
 * @typedef {{ ok: true, budget: Budget, allowFullRewrite: boolean } | { ok: false, error: string }} BudgetResult
 */

/**
 * Extract and validate the §E2 budget from a TRD file's text.
 * Uses getSection + parseFields from lib/frontmatter.mjs — NO re-parse.
 *
 * Failure modes (MISTAKES 2026-07-15 documented-but-unenforced):
 *   - Missing §E2 section → explicit error, NOT silent PASS
 *   - Missing budget key  → explicit error, NOT silent PASS
 *   - Non-numeric budget value → explicit error (no NaN comparison)
 *
 * @param {string} trdText
 * @returns {BudgetResult}
 */
export function extractBudget(trdText) {
  const body = getSection(trdText, E2_HEADING);

  if (body === null) {
    return { ok: false, error: `TRD is missing section "${E2_HEADING}"` };
  }

  const fields = parseFields(body);

  // Validate all three required keys exist and have appropriate types.
  for (const key of E2_BUDGET_KEYS) {
    if (!(key in fields) || fields[key] === null || fields[key] === undefined) {
      return { ok: false, error: `§E2 is missing required field "${key}"` };
    }
  }

  const filesMax = fields['files_touched_max'];
  const locMax = fields['loc_max'];
  const allowFullRewrite = fields['allow_full_rewrite'];

  // Numeric budget keys must parse to finite numbers — no NaN comparison.
  if (typeof filesMax !== 'number' || !Number.isFinite(filesMax)) {
    return {
      ok: false,
      error: `§E2 field "files_touched_max" is not a valid integer (got ${JSON.stringify(filesMax)})`,
    };
  }
  if (typeof locMax !== 'number' || !Number.isFinite(locMax)) {
    return {
      ok: false,
      error: `§E2 field "loc_max" is not a valid integer (got ${JSON.stringify(locMax)})`,
    };
  }

  return {
    ok: true,
    budget: { files_touched_max: filesMax, loc_max: locMax },
    allowFullRewrite: allowFullRewrite === true,
  };
}

// ---------------------------------------------------------------------------
// CLI shell — IO lives ONLY here (readFileSync, argv, exit)
// ---------------------------------------------------------------------------

/**
 * Parse CLI arguments.
 * @param {string[]} args - process.argv.slice(2)
 * @returns {{ trd: string|null, changed: string|null, numstat: string|null, tolerance: number }}
 */
function parseArgs(args) {
  let trd = null;
  let changed = null;
  let numstat = null;
  let tolerance = DEFAULT_TOLERANCE;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--trd' && args[i + 1]) {
      trd = args[++i];
    } else if (args[i] === '--changed' && args[i + 1]) {
      changed = args[++i];
    } else if (args[i] === '--numstat' && args[i + 1]) {
      numstat = args[++i];
    } else if (args[i] === '--tolerance' && args[i + 1]) {
      const n = Number(args[++i]);
      if (Number.isFinite(n) && n > 0) {
        tolerance = n;
      } else {
        stderr.write(`[scope-explosion-guard] invalid --tolerance value "${args[i]}"; using default ${DEFAULT_TOLERANCE}\n`);
      }
    }
  }
  return { trd, changed, numstat, tolerance };
}

/**
 * Safe file read with discriminated error on e.code.
 * @param {string} filePath
 * @param {string} label - human label for error messages
 * @returns {{ ok: true, text: string } | { ok: false, code: number }}
 */
function safeRead(filePath, label) {
  try {
    const text = readFileSync(filePath, 'utf8');
    return { ok: true, text };
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      stderr.write(`[scope-explosion-guard] IO error: ${label} not found: ${filePath}\n`);
    } else if (e && e.code === 'EACCES') {
      stderr.write(`[scope-explosion-guard] IO error: permission denied reading ${label}: ${filePath}\n`);
    } else {
      const code = (e && e.code) ? e.code : 'UNKNOWN';
      stderr.write(`[scope-explosion-guard] IO error (${code}) reading ${label}: ${filePath}\n`);
    }
    return { ok: false, code: EXIT_IO_ERROR };
  }
}

// Only run CLI when this file is the entry point (pure-core remains importable by tests).
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  const { trd: trdPath, changed: changedPath, numstat: numstatPath, tolerance } =
    parseArgs(argv.slice(2));

  if (!trdPath || !changedPath || !numstatPath) {
    stderr.write(
      'Usage: scope-explosion-guard.mjs --trd <path> --changed <path> --numstat <path> [--tolerance <n>]\n',
    );
    exit(EXIT_IO_ERROR);
  }

  // Read TRD file
  const trdRead = safeRead(trdPath, '--trd');
  if (!trdRead.ok) exit(EXIT_IO_ERROR);

  // Read changed-files JSON (output of git-changed-to-json.mjs)
  const changedRead = safeRead(changedPath, '--changed');
  if (!changedRead.ok) exit(EXIT_IO_ERROR);

  // Read numstat file
  const numstatRead = safeRead(numstatPath, '--numstat');
  if (!numstatRead.ok) exit(EXIT_IO_ERROR);

  // Parse §E2 budget via lib/frontmatter.mjs
  const budgetResult = extractBudget(trdRead.text);
  if (!budgetResult.ok) {
    stderr.write(`[scope-explosion-guard] Budget parse error: ${budgetResult.error}\n`);
    exit(EXIT_BUDGET_PARSE_ERROR);
  }

  // Parse changed-files JSON → files-touched count
  let changedFiles;
  try {
    changedFiles = JSON.parse(changedRead.text);
  } catch {
    stderr.write('[scope-explosion-guard] Budget parse error: --changed file is not valid JSON\n');
    exit(EXIT_BUDGET_PARSE_ERROR);
  }
  if (!Array.isArray(changedFiles)) {
    stderr.write('[scope-explosion-guard] Budget parse error: --changed file must be a JSON array\n');
    exit(EXIT_BUDGET_PARSE_ERROR);
  }
  const filesTouched = changedFiles.length;

  // Parse numstat → LOC (added + deleted)
  // SEC-1: parseNumstat throws RangeError on negative integers (adversarial input).
  // Catch here and exit 3 (budget parse error) — fail closed, never silent PASS.
  let loc;
  try {
    loc = parseNumstat(numstatRead.text);
  } catch (e) {
    stderr.write(`[scope-explosion-guard] Budget parse error: ${e instanceof Error ? e.message : String(e)}\n`);
    exit(EXIT_BUDGET_PARSE_ERROR);
  }

  // Evaluate budget
  const result = evaluateBudget({
    filesTouched,
    loc,
    budget: budgetResult.budget,
    tolerance,
    allowFullRewrite: budgetResult.allowFullRewrite,
  });

  // Emit result (counts + verdict only — no file contents, no TRD prose)
  stdout.write(`[scope-explosion-guard] files-touched=${filesTouched} loc=${loc} tolerance=${tolerance}\n`);
  for (const reason of result.reasons) {
    stdout.write(`[scope-explosion-guard] ${reason}\n`);
  }
  stdout.write(`[scope-explosion-guard] verdict=${result.verdict}\n`);

  if (result.verdict === 'BLOCK') {
    exit(EXIT_BLOCK);
  }
  // PASS or OVERRIDE → exit 0
  exit(EXIT_PASS);
}
