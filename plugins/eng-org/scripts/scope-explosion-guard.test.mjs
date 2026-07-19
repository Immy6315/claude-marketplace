/**
 * scope-explosion-guard.test.mjs — tests for scope-explosion-guard.mjs.
 *
 * Run: node --test scripts/scope-explosion-guard.test.mjs
 *
 * Coverage:
 *   Unit tier  (pure core): evaluateBudget + parseNumstat + extractBudget
 *   CLI tier:  spawnSync proves exit codes (PASS/BLOCK/IO-error/budget-error)
 *   Self-test: no-machine-absolute-path grep (MISTAKES 2026-07-10)
 *
 * House conventions:
 *   - One assertion per test() block.
 *   - Test title matches what the body asserts.
 *   - No import outside Node stdlib + ./scope-explosion-guard.mjs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  evaluateBudget,
  parseNumstat,
  extractBudget,
} from './scope-explosion-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.resolve(__dirname, 'scope-explosion-guard.mjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal TRD string with a populated §E2 section.
 * @param {{ files_touched_max?: number|string, loc_max?: number|string, allow_full_rewrite?: boolean|string, omitE2?: boolean, omitKey?: string }} opts
 */
function buildTrd({
  files_touched_max = 5,
  loc_max = 300,
  allow_full_rewrite = false,
  omitE2 = false,
  omitKey = null,
} = {}) {
  const e2Lines = [];
  if (omitKey !== 'files_touched_max') e2Lines.push(`files_touched_max: ${files_touched_max}`);
  if (omitKey !== 'loc_max') e2Lines.push(`loc_max: ${loc_max}`);
  if (omitKey !== 'allow_full_rewrite') e2Lines.push(`allow_full_rewrite: ${allow_full_rewrite}`);

  if (omitE2) {
    return `## 1. What Are We Doing?\nSome content.\n`;
  }
  return `## E2. Blast Radius & Change Budget\n${e2Lines.join('\n')}\n`;
}

/** Shared budget for convenience. */
const STD_BUDGET = { files_touched_max: 5, loc_max: 300 };

// ---------------------------------------------------------------------------
// Unit — evaluateBudget (pure core)
// ---------------------------------------------------------------------------

test('evaluateBudget: under-budget files and LOC → PASS', () => {
  const result = evaluateBudget({
    filesTouched: 3,
    loc: 200,
    budget: STD_BUDGET,
    tolerance: 1.5,
    allowFullRewrite: false,
  });
  assert.equal(result.verdict, 'PASS');
});

test('evaluateBudget: exactly-at-budget files AND LOC → PASS (boundary)', () => {
  // Exactly at limit: filesTouched === files_touched_max × tolerance
  const result = evaluateBudget({
    filesTouched: 7,   // 5 × 1.5 = 7.5, so 7 is ≤ — PASS
    loc: 450,          // 300 × 1.5 = 450, exactly at → PASS
    budget: STD_BUDGET,
    tolerance: 1.5,
    allowFullRewrite: false,
  });
  assert.equal(result.verdict, 'PASS');
});

test('evaluateBudget: one-over files limit → BLOCK (off-by-one)', () => {
  // 5 × 1.5 = 7.5; filesTouched = 8 > 7.5 → BLOCK
  const result = evaluateBudget({
    filesTouched: 8,
    loc: 100,
    budget: STD_BUDGET,
    tolerance: 1.5,
    allowFullRewrite: false,
  });
  assert.equal(result.verdict, 'BLOCK');
});

test('evaluateBudget: one-over LOC limit → BLOCK (proves OR not AND)', () => {
  // files within budget; loc = 451 > 300 × 1.5 = 450 → BLOCK
  const result = evaluateBudget({
    filesTouched: 2,
    loc: 451,
    budget: STD_BUDGET,
    tolerance: 1.5,
    allowFullRewrite: false,
  });
  assert.equal(result.verdict, 'BLOCK');
});

test('evaluateBudget: both files AND LOC over budget → BLOCK', () => {
  const result = evaluateBudget({
    filesTouched: 20,
    loc: 2000,
    budget: STD_BUDGET,
    tolerance: 1.5,
    allowFullRewrite: false,
  });
  assert.equal(result.verdict, 'BLOCK');
});

test('evaluateBudget: allow_full_rewrite=true + grossly over budget → OVERRIDE', () => {
  const result = evaluateBudget({
    filesTouched: 100,
    loc: 50000,
    budget: STD_BUDGET,
    tolerance: 1.5,
    allowFullRewrite: true,
  });
  assert.equal(result.verdict, 'OVERRIDE');
});

test('evaluateBudget: OVERRIDE prints explicit override line', () => {
  const result = evaluateBudget({
    filesTouched: 100,
    loc: 50000,
    budget: STD_BUDGET,
    tolerance: 1.5,
    allowFullRewrite: true,
  });
  assert.ok(result.reasons.some(r => r.includes('allow_full_rewrite=true')));
  assert.ok(result.reasons.some(r => r.includes('EM-approved TRD')));
});

test('evaluateBudget: custom tolerance=2.0 honored', () => {
  // filesTouched = 8; files_touched_max=5; 5×2=10; 8 ≤ 10 → PASS
  const result = evaluateBudget({
    filesTouched: 8,
    loc: 100,
    budget: STD_BUDGET,
    tolerance: 2.0,
    allowFullRewrite: false,
  });
  assert.equal(result.verdict, 'PASS');
});

test('evaluateBudget: empty diff (0 files, 0 LOC) → PASS', () => {
  const result = evaluateBudget({
    filesTouched: 0,
    loc: 0,
    budget: STD_BUDGET,
    tolerance: 1.5,
    allowFullRewrite: false,
  });
  assert.equal(result.verdict, 'PASS');
});

test('evaluateBudget: BLOCK reasons list is non-empty and contains relevant info', () => {
  const result = evaluateBudget({
    filesTouched: 20,
    loc: 5000,
    budget: STD_BUDGET,
    tolerance: 1.5,
    allowFullRewrite: false,
  });
  assert.ok(result.reasons.length > 0);
  assert.ok(result.reasons.some(r => r.includes('20')));
});

// ---------------------------------------------------------------------------
// Unit — parseNumstat
// ---------------------------------------------------------------------------

test('parseNumstat: normal line sums added+deleted', () => {
  const text = '10\t5\tsomefile.js\n';
  assert.equal(parseNumstat(text), 15);
});

test('parseNumstat: multiple lines are summed', () => {
  const text = '10\t5\tfile1.js\n20\t3\tfile2.js\n';
  assert.equal(parseNumstat(text), 38);
});

test('parseNumstat: binary row (- - filename) contributes 0 churn, no throw', () => {
  const text = '-\t-\tbinary.png\n5\t2\tcode.js\n';
  assert.equal(parseNumstat(text), 7);
});

test('parseNumstat: empty string → 0', () => {
  assert.equal(parseNumstat(''), 0);
});

test('parseNumstat: whitespace-only string → 0', () => {
  assert.equal(parseNumstat('   \n  '), 0);
});

test('parseNumstat: all-binary rows → 0 total', () => {
  const text = '-\t-\ta.png\n-\t-\tb.gif\n';
  assert.equal(parseNumstat(text), 0);
});

test('parseNumstat: mixed binary and text rows', () => {
  const text = '-\t-\timage.png\n3\t1\tapp.js\n-\t-\tlogo.svg\n8\t4\tlib.js\n';
  assert.equal(parseNumstat(text), 16);
});

// ---------------------------------------------------------------------------
// Unit — extractBudget (§E2 via lib/frontmatter.mjs)
// ---------------------------------------------------------------------------

test('extractBudget: valid §E2 returns ok=true with correct budget', () => {
  const trd = buildTrd({ files_touched_max: 5, loc_max: 300, allow_full_rewrite: false });
  const result = extractBudget(trd);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.budget.files_touched_max, 5);
    assert.equal(result.budget.loc_max, 300);
    assert.equal(result.allowFullRewrite, false);
  }
});

test('extractBudget: allow_full_rewrite=true is parsed correctly', () => {
  const trd = buildTrd({ allow_full_rewrite: true });
  const result = extractBudget(trd);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.allowFullRewrite, true);
  }
});

test('extractBudget: missing §E2 → ok=false, NOT silent PASS', () => {
  const trd = buildTrd({ omitE2: true });
  const result = extractBudget(trd);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error.includes('E2'));
  }
});

test('extractBudget: missing files_touched_max → ok=false explicit error', () => {
  const trd = buildTrd({ omitKey: 'files_touched_max' });
  const result = extractBudget(trd);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error.includes('files_touched_max'));
  }
});

test('extractBudget: missing loc_max → ok=false explicit error', () => {
  const trd = buildTrd({ omitKey: 'loc_max' });
  const result = extractBudget(trd);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error.includes('loc_max'));
  }
});

test('extractBudget: non-numeric files_touched_max → ok=false, no NaN comparison', () => {
  const trd = buildTrd({ files_touched_max: 'not-a-number' });
  const result = extractBudget(trd);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error.includes('files_touched_max'));
  }
});

test('extractBudget: non-numeric loc_max → ok=false, no NaN comparison', () => {
  const trd = buildTrd({ loc_max: 'unlimited' });
  const result = extractBudget(trd);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error.includes('loc_max'));
  }
});

test('extractBudget: unterminated TRD frontmatter tolerated (lib handles)', () => {
  // Unterminated frontmatter: parseFrontmatter treats whole text as body.
  // getSection still searches body for the E2 heading.
  const trd = `---\ntitle: Test\n## E2. Blast Radius & Change Budget\nfiles_touched_max: 5\nloc_max: 300\nallow_full_rewrite: false\n`;
  // This is an unterminated frontmatter; lib/frontmatter.mjs returns body=whole-text.
  // parseSections still finds the heading in the body.
  const result = extractBudget(trd);
  // May succeed or fail depending on how parseSections handles it; must not throw.
  assert.ok(typeof result.ok === 'boolean');
});

// ---------------------------------------------------------------------------
// Integration — full evaluateBudget + extractBudget pipeline
// ---------------------------------------------------------------------------

test('pipeline: under-budget TRD + diff → PASS', () => {
  const trd = buildTrd({ files_touched_max: 10, loc_max: 500, allow_full_rewrite: false });
  const budgetResult = extractBudget(trd);
  assert.equal(budgetResult.ok, true);
  if (!budgetResult.ok) return;

  const result = evaluateBudget({
    filesTouched: 5,
    loc: 200,
    budget: budgetResult.budget,
    tolerance: 1.5,
    allowFullRewrite: budgetResult.allowFullRewrite,
  });
  assert.equal(result.verdict, 'PASS');
});

test('pipeline: over-budget TRD + large diff → BLOCK (acceptance criterion fixture)', () => {
  // ACCEPTANCE CRITERION: over-budget fixture must produce BLOCK (non-zero exit).
  // This tests the pure core; CLI tier spawnSync test below confirms the exit code.
  const trd = buildTrd({ files_touched_max: 5, loc_max: 300, allow_full_rewrite: false });
  const budgetResult = extractBudget(trd);
  assert.equal(budgetResult.ok, true);
  if (!budgetResult.ok) return;

  const result = evaluateBudget({
    filesTouched: 50,   // 50 >> 5 × 1.5 = 7.5
    loc: 5000,          // 5000 >> 300 × 1.5 = 450
    budget: budgetResult.budget,
    tolerance: 1.5,
    allowFullRewrite: budgetResult.allowFullRewrite,
  });
  assert.equal(result.verdict, 'BLOCK');
});

test('pipeline: allow_full_rewrite=true + over-budget diff → OVERRIDE (acceptance criterion)', () => {
  const trd = buildTrd({ files_touched_max: 5, loc_max: 300, allow_full_rewrite: true });
  const budgetResult = extractBudget(trd);
  assert.equal(budgetResult.ok, true);
  if (!budgetResult.ok) return;

  const result = evaluateBudget({
    filesTouched: 200,
    loc: 100000,
    budget: budgetResult.budget,
    tolerance: 1.5,
    allowFullRewrite: budgetResult.allowFullRewrite,
  });
  assert.equal(result.verdict, 'OVERRIDE');
});

// ---------------------------------------------------------------------------
// CLI tier — spawnSync (proves exit codes 0/1/2/3)
// ---------------------------------------------------------------------------

/** Create a temp dir, write fixtures, return cleanup fn + paths. */
function setupCliFixture({
  trdContent,
  changedContent,
  numstatContent,
}) {
  const dir = mkdtempSync(join(tmpdir(), 'seg-test-'));
  const trdPath = join(dir, 'trd.md');
  const changedPath = join(dir, 'changed.json');
  const numstatPath = join(dir, 'numstat.txt');

  writeFileSync(trdPath, trdContent, 'utf8');
  writeFileSync(changedPath, changedContent, 'utf8');
  writeFileSync(numstatPath, numstatContent, 'utf8');

  return {
    trdPath,
    changedPath,
    numstatPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('CLI: under-budget diff → exit 0 (PASS)', () => {
  const { trdPath, changedPath, numstatPath, cleanup } = setupCliFixture({
    trdContent: buildTrd({ files_touched_max: 10, loc_max: 500 }),
    changedContent: JSON.stringify(['a.js', 'b.js']),
    numstatContent: '5\t3\ta.js\n4\t1\tb.js\n',
  });
  try {
    const r = spawnSync(process.execPath, [GUARD,
      '--trd', trdPath, '--changed', changedPath, '--numstat', numstatPath]);
    assert.equal(r.status, 0);
  } finally {
    cleanup();
  }
});

test('CLI: over-budget diff → exit 1 (BLOCK) — acceptance criterion', () => {
  const { trdPath, changedPath, numstatPath, cleanup } = setupCliFixture({
    trdContent: buildTrd({ files_touched_max: 5, loc_max: 300 }),
    changedContent: JSON.stringify(['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'f.js', 'g.js', 'h.js', 'i.js']),
    numstatContent: '200\t100\ta.js\n300\t200\tb.js\n',  // 800 LOC >> 300×1.5=450
  });
  try {
    const r = spawnSync(process.execPath, [GUARD,
      '--trd', trdPath, '--changed', changedPath, '--numstat', numstatPath]);
    assert.equal(r.status, 1);
  } finally {
    cleanup();
  }
});

test('CLI: allow_full_rewrite=true + over-budget → exit 0 (OVERRIDE) — acceptance criterion', () => {
  const { trdPath, changedPath, numstatPath, cleanup } = setupCliFixture({
    trdContent: buildTrd({ files_touched_max: 5, loc_max: 300, allow_full_rewrite: true }),
    changedContent: JSON.stringify(Array.from({ length: 100 }, (_, i) => `file${i}.js`)),
    numstatContent: '1000\t500\tbig.js\n',
  });
  try {
    const r = spawnSync(process.execPath, [GUARD,
      '--trd', trdPath, '--changed', changedPath, '--numstat', numstatPath]);
    assert.equal(r.status, 0);
    const out = r.stdout.toString();
    assert.ok(out.includes('OVERRIDE'));
    assert.ok(out.includes('allow_full_rewrite=true'));
  } finally {
    cleanup();
  }
});

test('CLI: OVERRIDE output includes EM-approved TRD provenance line', () => {
  const { trdPath, changedPath, numstatPath, cleanup } = setupCliFixture({
    trdContent: buildTrd({ files_touched_max: 5, loc_max: 300, allow_full_rewrite: true }),
    changedContent: JSON.stringify(['a.js', 'b.js']),
    numstatContent: '5\t5\ta.js\n',
  });
  try {
    const r = spawnSync(process.execPath, [GUARD,
      '--trd', trdPath, '--changed', changedPath, '--numstat', numstatPath]);
    const out = r.stdout.toString();
    assert.ok(out.includes('EM-approved TRD'));
  } finally {
    cleanup();
  }
});

test('CLI: missing --trd flag → exit 2 (IO error)', () => {
  const r = spawnSync(process.execPath, [GUARD, '--changed', '/dev/null', '--numstat', '/dev/null']);
  assert.equal(r.status, 2);
});

test('CLI: non-existent TRD file → exit 2 (ENOENT → IO error)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'seg-test-'));
  const changedPath = join(dir, 'changed.json');
  const numstatPath = join(dir, 'numstat.txt');
  writeFileSync(changedPath, '[]', 'utf8');
  writeFileSync(numstatPath, '', 'utf8');
  try {
    const r = spawnSync(process.execPath, [GUARD,
      '--trd', join(dir, 'nonexistent.md'),
      '--changed', changedPath,
      '--numstat', numstatPath]);
    assert.equal(r.status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: missing §E2 in TRD → exit 3 (budget parse error), NOT exit 0', () => {
  const { trdPath, changedPath, numstatPath, cleanup } = setupCliFixture({
    trdContent: '## Something Else\nno e2 here\n',
    changedContent: '[]',
    numstatContent: '',
  });
  try {
    const r = spawnSync(process.execPath, [GUARD,
      '--trd', trdPath, '--changed', changedPath, '--numstat', numstatPath]);
    assert.equal(r.status, 3);
  } finally {
    cleanup();
  }
});

test('CLI: empty changed-files array [] → exit 0 (PASS — nothing changed)', () => {
  const { trdPath, changedPath, numstatPath, cleanup } = setupCliFixture({
    trdContent: buildTrd({ files_touched_max: 5, loc_max: 300 }),
    changedContent: '[]',
    numstatContent: '',
  });
  try {
    const r = spawnSync(process.execPath, [GUARD,
      '--trd', trdPath, '--changed', changedPath, '--numstat', numstatPath]);
    assert.equal(r.status, 0);
  } finally {
    cleanup();
  }
});

test('CLI: --tolerance flag is honored (custom tolerance=2 allows more files)', () => {
  // 8 files; files_touched_max=5; default 1.5 → 7.5 → BLOCK; tolerance=2 → 10 → PASS
  const { trdPath, changedPath, numstatPath, cleanup } = setupCliFixture({
    trdContent: buildTrd({ files_touched_max: 5, loc_max: 300 }),
    changedContent: JSON.stringify(['a','b','c','d','e','f','g','h']),
    numstatContent: '5\t3\ta.js\n',
  });
  try {
    const r = spawnSync(process.execPath, [GUARD,
      '--trd', trdPath, '--changed', changedPath, '--numstat', numstatPath,
      '--tolerance', '2']);
    assert.equal(r.status, 0);
  } finally {
    cleanup();
  }
});

test('CLI: malformed numstat binary row does not throw (contributes 0)', () => {
  const { trdPath, changedPath, numstatPath, cleanup } = setupCliFixture({
    trdContent: buildTrd({ files_touched_max: 10, loc_max: 500 }),
    changedContent: JSON.stringify(['a.js']),
    numstatContent: '-\t-\tbinary.png\n5\t3\ta.js\n',
  });
  try {
    const r = spawnSync(process.execPath, [GUARD,
      '--trd', trdPath, '--changed', changedPath, '--numstat', numstatPath]);
    assert.equal(r.status, 0);
  } finally {
    cleanup();
  }
});

test('CLI: LOC-only over-budget BLOCKS (proves OR condition, not AND)', () => {
  // filesTouched=2 (within 5×1.5=7.5), loc=1000 (>> 300×1.5=450) → BLOCK
  const { trdPath, changedPath, numstatPath, cleanup } = setupCliFixture({
    trdContent: buildTrd({ files_touched_max: 5, loc_max: 300 }),
    changedContent: JSON.stringify(['a.js', 'b.js']),
    numstatContent: '500\t500\ta.js\n',  // 1000 LOC
  });
  try {
    const r = spawnSync(process.execPath, [GUARD,
      '--trd', trdPath, '--changed', changedPath, '--numstat', numstatPath]);
    assert.equal(r.status, 1);
  } finally {
    cleanup();
  }
});

test('CLI: stdout emits only counts+verdict (no file contents/TRD prose)', () => {
  const trdText = buildTrd({ files_touched_max: 10, loc_max: 500 });
  // Embed something prose-like in the TRD that should NOT appear in stdout
  const trdWithProse = trdText + '\nThis is sensitive TRD prose that must not leak.\n';
  const { trdPath, changedPath, numstatPath, cleanup } = setupCliFixture({
    trdContent: trdWithProse,
    changedContent: JSON.stringify(['a.js']),
    numstatContent: '5\t3\ta.js\n',
  });
  try {
    const r = spawnSync(process.execPath, [GUARD,
      '--trd', trdPath, '--changed', changedPath, '--numstat', numstatPath]);
    const out = r.stdout.toString();
    assert.ok(!out.includes('sensitive TRD prose'));
    assert.ok(!out.includes('must not leak'));
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// SEC-1 regression — parseNumstat negative-integer underflow (fix iteration 1)
// A crafted numstat row with a negative number must NOT produce a false PASS.
// ---------------------------------------------------------------------------

test('SEC-1 regression: parseNumstat throws RangeError on negative added column', () => {
  // -95000\t0\tsrc/x.ts  — adversarial row that previously underflowed total
  assert.throws(
    () => parseNumstat('-95000\t0\tsrc/x.ts\n'),
    RangeError,
    'Negative added value must throw RangeError (fail-closed), not reduce total',
  );
});

test('SEC-1 regression: parseNumstat throws RangeError on negative deleted column', () => {
  assert.throws(
    () => parseNumstat('0\t-1\tsrc/x.ts\n'),
    RangeError,
    'Negative deleted value must throw RangeError (fail-closed)',
  );
});

test('SEC-1 regression: mixed valid rows + negative row still throws (no partial sum)', () => {
  // 100+50 = 150 legitimate lines, then adversarial -95000 row
  const text = '100\t50\tlegit.ts\n-95000\t0\tsrc/x.ts\n';
  assert.throws(() => parseNumstat(text), RangeError);
});

test('SEC-1 regression: CLI exits 3 on negative numstat row (never PASS)', () => {
  const { trdPath, changedPath, numstatPath, cleanup } = setupCliFixture({
    trdContent: buildTrd({ files_touched_max: 5, loc_max: 300 }),
    changedContent: JSON.stringify(['src/x.ts']),
    // -95000 added row: without fix this underflowed total to negative → false PASS
    numstatContent: '-95000\t0\tsrc/x.ts\n',
  });
  try {
    const r = spawnSync(process.execPath, [GUARD,
      '--trd', trdPath, '--changed', changedPath, '--numstat', numstatPath]);
    // Must NOT be 0 (PASS); must be 3 (budget parse error — adversarial numstat rejected)
    assert.notEqual(r.status, 0, 'Adversarial -95000 numstat row must NOT produce exit 0 (false PASS)');
    assert.equal(r.status, 3, 'Adversarial -95000 numstat row must exit 3 (fail-closed)');
  } finally {
    cleanup();
  }
});

test('SEC-1 regression: binary dash rows still work after fix (no regression on - rows)', () => {
  // Real git binary rows use literal '-', not negative integers — must still be 0, no throw
  assert.doesNotThrow(() => parseNumstat('-\t-\tbinary.png\n5\t3\tcode.ts\n'));
  assert.equal(parseNumstat('-\t-\tbinary.png\n5\t3\tcode.ts\n'), 8);
});

// ---------------------------------------------------------------------------
// Self-test: no machine-absolute paths in guard SOURCE (MISTAKES 2026-07-10)
// ---------------------------------------------------------------------------

test('no machine-absolute paths in scope-explosion-guard.mjs source', () => {
  const source = readFileSync(GUARD, 'utf8');
  const forbidden = ['/Users/', '/home/', 'C:\\Users'];
  for (const prefix of forbidden) {
    assert.ok(
      !source.includes(prefix),
      `Guard source must not contain machine-absolute path prefix "${prefix}"`,
    );
  }
});
