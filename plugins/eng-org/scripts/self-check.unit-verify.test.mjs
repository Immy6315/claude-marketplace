/**
 * self-check.unit-verify.test.mjs — INDEPENDENT unit-verify (UV) test suite.
 *
 * Written by the independent test-unit agent for REQ-20260718-d904-09.
 * Does NOT share fixtures or logic with self-check.test.mjs.
 *
 * Mandate: adversarially verify the anti-always-PASS invariants, per-site
 * tier-2 keying, tier-1/tier-2 discrimination, structural honesty of
 * ACCEPTED_FINDINGS, advisory handling, TRD-failure blocking, and the
 * no-machine-absolute-path guarantee.
 *
 * Node stdlib only. Imports real exports from self-check.mjs.
 * No vi.mock(), no stubs, no inline reimplementations.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Real imports from the code under test (NEVER inline copies)
// ---------------------------------------------------------------------------
import { ACCEPTED_FINDINGS, decide } from './self-check.mjs';
import { lintTrd } from './trd-lint.mjs';

// ---------------------------------------------------------------------------
// Path helpers — no machine-absolute literals
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const SELF_CHECK_SRC_PATH = join(__dirname, 'self-check.mjs');
const FIXTURE_PATH = join(__dirname, 'fixtures', 'self-check-sample-trd.md');

// ---------------------------------------------------------------------------
// Shared helpers — locally defined (no cross-suite sharing)
// ---------------------------------------------------------------------------

/** Produce a minimal error finding. */
function errorFinding(path, smell, line = 1, snippet = 'uv-test-snippet') {
  return { path, smell, severity: 'error', line, snippet };
}

/** Produce a minimal advisory finding. */
function advisoryFinding(path, smell, line = 1) {
  return { path, smell, severity: 'advisory', line, snippet: 'uv-advisory' };
}

const CLEAN_TRD = { ok: true, findings: [] };
const BROKEN_TRD = { ok: false, findings: ['UV: missing section 5. Acceptance Criteria'] };

// ===========================================================================
// UV-1 — ALWAYS-PASS ORACLE COUNTER-TEST (the crux)
// A finding whose (path, smell) is totally absent from ACCEPTED_FINDINGS
// MUST land in blocking and force exitCode 1.
// ===========================================================================

test('UV-1 always-PASS oracle counter-test: brand-new-file.mjs function-length → blocking, exit 1', () => {
  // Verify it is truly NOT in ACCEPTED_FINDINGS first.
  const inAllowlist = ACCEPTED_FINDINGS.some(
    e => basename('brand-new-file.mjs') === e.path && e.smell === 'function-length'
  );
  assert.equal(inAllowlist, false, 'precondition: brand-new-file.mjs must NOT be in ACCEPTED_FINDINGS');

  const finding = errorFinding('brand-new-file.mjs', 'function-length', 10);
  const { exitCode, blocking, accepted, advisory } = decide({
    sourceFindings: [finding],
    trdResult: CLEAN_TRD,
  });

  assert.equal(blocking.length, 1, 'finding from brand-new-file.mjs must be in blocking');
  assert.equal(accepted.length, 0, 'accepted must be empty — not allowlisted');
  assert.equal(advisory.length, 0, 'advisory must be empty — severity is error');
  assert.equal(exitCode, 1,
    'exitCode MUST be 1 — if it is 0 the allowlist is an always-PASS oracle (MISTAKES 2026-07-15)');
});

test('UV-1b always-PASS oracle: multiple unknown files with multiple smells → all blocking', () => {
  const findings = [
    errorFinding('totally-new-service.mjs', 'param-count', 5),
    errorFinding('another-brand-new.mjs', 'file-length', 1),
    errorFinding('yet-another.mjs', 'todo-marker', 42),
  ];

  // Verify none are in the allowlist
  for (const f of findings) {
    const inList = ACCEPTED_FINDINGS.some(e => e.path === basename(f.path) && e.smell === f.smell);
    assert.equal(inList, false, `precondition: ${f.path}/${f.smell} must not be in ACCEPTED_FINDINGS`);
  }

  const { exitCode, blocking } = decide({ sourceFindings: findings, trdResult: CLEAN_TRD });
  assert.equal(blocking.length, 3, 'all 3 unknown findings must block');
  assert.equal(exitCode, 1, 'exit must be 1 with 3 blocking findings');
});

// ===========================================================================
// UV-2 — PER-SITE KEYING COUNTER-TEST (tier-2, the anti-always-PASS for tier-2)
// ===========================================================================

// UV-2a: invalidation.mjs at an allowlisted line IS accepted.
test('UV-2a per-site keying: invalidation.mjs function-length at fnLine=228 is accepted', () => {
  // Confirm the entry exists
  const entry = ACCEPTED_FINDINGS.find(
    e => e.path === 'invalidation.mjs' && e.smell === 'function-length' && e.fnLine === 228
  );
  assert.ok(entry, 'precondition: tier-2 entry for invalidation.mjs fnLine=228 must exist');

  const finding = errorFinding('scripts/invalidation.mjs', 'function-length', 228);
  const { exitCode, accepted, blocking } = decide({
    sourceFindings: [finding],
    trdResult: CLEAN_TRD,
  });
  assert.equal(accepted.length, 1, 'invalidation.mjs fnLine=228 must be accepted');
  assert.equal(blocking.length, 0, 'must not block');
  assert.equal(exitCode, 0, 'must exit 0 when only allowed tier-2 finding is present');
});

// UV-2b: invalidation.mjs at a DIFFERENT line (999) is NOT accepted → blocks.
test('UV-2b per-site keying: invalidation.mjs function-length at line=999 is NOT accepted → blocking', () => {
  // Confirm line 999 is not in any tier-2 entry for invalidation.mjs
  const anyMatch = ACCEPTED_FINDINGS.some(
    e => e.path === 'invalidation.mjs' && e.smell === 'function-length' && e.fnLine === 999
  );
  assert.equal(anyMatch, false, 'precondition: line 999 must not be in any tier-2 entry for invalidation.mjs');

  const finding = errorFinding('scripts/invalidation.mjs', 'function-length', 999);
  const { exitCode, blocking, accepted } = decide({
    sourceFindings: [finding],
    trdResult: CLEAN_TRD,
  });
  assert.equal(blocking.length, 1,
    'function-length at line 999 on invalidation.mjs MUST block — per-site keying is the anti-always-PASS guard');
  assert.equal(accepted.length, 0, 'must NOT be accepted');
  assert.equal(exitCode, 1, 'exit MUST be 1 — new over-long fn in same file is not waived by existing tier-2 entry');
});

// UV-2c: invalidation.mjs also has fnLine=368 (main). Verify it is accepted.
test('UV-2c per-site keying: invalidation.mjs function-length at fnLine=368 (main) is accepted', () => {
  const entry = ACCEPTED_FINDINGS.find(
    e => e.path === 'invalidation.mjs' && e.smell === 'function-length' && e.fnLine === 368
  );
  assert.ok(entry, 'precondition: tier-2 entry for invalidation.mjs fnLine=368 must exist');

  const finding = errorFinding('scripts/invalidation.mjs', 'function-length', 368);
  const { exitCode, accepted } = decide({ sourceFindings: [finding], trdResult: CLEAN_TRD });
  assert.equal(accepted.length, 1, 'invalidation.mjs fnLine=368 must be accepted');
  assert.equal(exitCode, 0);
});

// UV-2d: A line between the two invalidation.mjs tier-2 anchors (e.g. 300) must still block.
test('UV-2d per-site keying: invalidation.mjs function-length at line=300 (between tier-2 anchors) → blocking', () => {
  const anyMatch = ACCEPTED_FINDINGS.some(
    e => e.path === 'invalidation.mjs' && e.smell === 'function-length' && e.fnLine === 300
  );
  assert.equal(anyMatch, false, 'precondition: line 300 not in any tier-2 entry for invalidation.mjs');

  const finding = errorFinding('scripts/invalidation.mjs', 'function-length', 300);
  const { exitCode, blocking } = decide({ sourceFindings: [finding], trdResult: CLEAN_TRD });
  assert.equal(blocking.length, 1, 'must block at line 300 — per-site keying not a range');
  assert.equal(exitCode, 1);
});

// UV-2e: output-cap.mjs per-site keying — fnLine=192 accepted, fnLine=1 not accepted.
test('UV-2e per-site keying: output-cap.mjs fnLine=192 accepted; fnLine=1 blocks', () => {
  const entry = ACCEPTED_FINDINGS.find(
    e => e.path === 'output-cap.mjs' && e.smell === 'function-length' && e.fnLine === 192
  );
  assert.ok(entry, 'tier-2 entry for output-cap.mjs fnLine=192 must exist');

  const accepted192 = errorFinding('scripts/output-cap.mjs', 'function-length', 192);
  const r1 = decide({ sourceFindings: [accepted192], trdResult: CLEAN_TRD });
  assert.equal(r1.accepted.length, 1, 'fnLine=192 must be accepted');
  assert.equal(r1.exitCode, 0);

  const blocked1 = errorFinding('scripts/output-cap.mjs', 'function-length', 1);
  const r2 = decide({ sourceFindings: [blocked1], trdResult: CLEAN_TRD });
  assert.equal(r2.blocking.length, 1, 'fnLine=1 on output-cap.mjs must block');
  assert.equal(r2.exitCode, 1);
});

// UV-2f: output-cap.mjs fnLine=348 accepted.
test('UV-2f per-site keying: output-cap.mjs fnLine=348 (enforceOutputCap) is accepted', () => {
  const entry = ACCEPTED_FINDINGS.find(
    e => e.path === 'output-cap.mjs' && e.smell === 'function-length' && e.fnLine === 348
  );
  assert.ok(entry, 'tier-2 entry for output-cap.mjs fnLine=348 must exist');

  const finding = errorFinding('scripts/output-cap.mjs', 'function-length', 348);
  const { exitCode, accepted } = decide({ sourceFindings: [finding], trdResult: CLEAN_TRD });
  assert.equal(accepted.length, 1);
  assert.equal(exitCode, 0);
});

// ===========================================================================
// UV-3 — TIER-1 VS TIER-2 DISCRIMINATION
// Tier-1 entries (no fnLine) must accept any line number for matching path+smell.
// But a DIFFERENT smell on the same tier-1 file must NOT be accepted by the tier-1 entry.
// A function-length finding on verdict-lint.mjs at a line NOT in tier-2 must block.
// ===========================================================================

// UV-3a: verdict-lint.mjs file-length is tier-1 — accepts any line number.
test('UV-3a tier-1 discrimination: verdict-lint.mjs file-length (tier-1) accepted at any line', () => {
  for (const line of [1, 100, 999, 1138]) {
    const finding = errorFinding('scripts/verdict-lint.mjs', 'file-length', line);
    const { exitCode, accepted } = decide({ sourceFindings: [finding], trdResult: CLEAN_TRD });
    assert.equal(accepted.length, 1,
      `verdict-lint.mjs file-length must be accepted at line=${line} (tier-1 has no fnLine restriction)`);
    assert.equal(exitCode, 0, `exit must be 0 at line=${line}`);
  }
});

// UV-3b: verdict-lint.mjs function-length at a line NOT in tier-2 (e.g. line 1) → blocks.
test('UV-3b tier-1 vs tier-2 discrimination: verdict-lint.mjs function-length at line=1 → blocking', () => {
  // Tier-2 entries for verdict-lint.mjs are fnLine=319, 490, 780 only.
  const nonTier2Line = 1;
  const anyMatch = ACCEPTED_FINDINGS.some(
    e => e.path === 'verdict-lint.mjs' && e.smell === 'function-length' && e.fnLine === nonTier2Line
  );
  assert.equal(anyMatch, false, 'precondition: line 1 must not be in any tier-2 entry for verdict-lint.mjs');

  const finding = errorFinding('scripts/verdict-lint.mjs', 'function-length', nonTier2Line);
  const { exitCode, blocking } = decide({ sourceFindings: [finding], trdResult: CLEAN_TRD });
  assert.equal(blocking.length, 1,
    'function-length on verdict-lint.mjs at line 1 must block — tier-1 only covers file-length, not function-length');
  assert.equal(exitCode, 1);
});

// UV-3c: verdict-lint.mjs function-length at tier-2 line=319 IS accepted.
test('UV-3c tier-2 anchor: verdict-lint.mjs function-length fnLine=319 is accepted', () => {
  const entry = ACCEPTED_FINDINGS.find(
    e => e.path === 'verdict-lint.mjs' && e.smell === 'function-length' && e.fnLine === 319
  );
  assert.ok(entry, 'tier-2 entry for verdict-lint.mjs fnLine=319 must exist');

  const finding = errorFinding('scripts/verdict-lint.mjs', 'function-length', 319);
  const { exitCode, accepted } = decide({ sourceFindings: [finding], trdResult: CLEAN_TRD });
  assert.equal(accepted.length, 1, 'fnLine=319 must be accepted');
  assert.equal(exitCode, 0);
});

// UV-3d: verdict-lint.mjs function-length at tier-2 line=490 and 780 are both accepted.
test('UV-3d tier-2 anchors: verdict-lint.mjs fnLine=490 and fnLine=780 are accepted', () => {
  for (const fnLine of [490, 780]) {
    const entry = ACCEPTED_FINDINGS.find(
      e => e.path === 'verdict-lint.mjs' && e.smell === 'function-length' && e.fnLine === fnLine
    );
    assert.ok(entry, `tier-2 entry for verdict-lint.mjs fnLine=${fnLine} must exist`);

    const finding = errorFinding('scripts/verdict-lint.mjs', 'function-length', fnLine);
    const { exitCode, accepted } = decide({ sourceFindings: [finding], trdResult: CLEAN_TRD });
    assert.equal(accepted.length, 1, `fnLine=${fnLine} must be accepted`);
    assert.equal(exitCode, 0);
  }
});

// UV-3e: verdict-lint.mjs function-length at line=500 (between tier-2 anchors 490 and 780) → blocks.
test('UV-3e tier-2 gap: verdict-lint.mjs function-length at line=500 (not an anchor) → blocking', () => {
  const anyMatch = ACCEPTED_FINDINGS.some(
    e => e.path === 'verdict-lint.mjs' && e.smell === 'function-length' && e.fnLine === 500
  );
  assert.equal(anyMatch, false, 'precondition: line 500 not an anchor for verdict-lint.mjs function-length');

  const finding = errorFinding('scripts/verdict-lint.mjs', 'function-length', 500);
  const { exitCode, blocking } = decide({ sourceFindings: [finding], trdResult: CLEAN_TRD });
  assert.equal(blocking.length, 1, 'line 500 must block — not in any tier-2 anchor');
  assert.equal(exitCode, 1);
});

// UV-3f: design-lint.mjs file-length (tier-1) is accepted regardless of line.
test('UV-3f tier-1: design-lint.mjs file-length is tier-1 — accepted at any line', () => {
  const entry = ACCEPTED_FINDINGS.find(
    e => e.path === 'design-lint.mjs' && e.smell === 'file-length' && e.fnLine === undefined
  );
  assert.ok(entry, 'tier-1 entry for design-lint.mjs file-length must exist');

  const finding = errorFinding('scripts/design-lint.mjs', 'file-length', 786);
  const { exitCode, accepted } = decide({ sourceFindings: [finding], trdResult: CLEAN_TRD });
  assert.equal(accepted.length, 1, 'design-lint.mjs file-length must be accepted');
  assert.equal(exitCode, 0);
});

// UV-3g: design-lint.mjs function-length (NOT in allowlist) → blocks.
test('UV-3g tier-1/tier-2 discrimination: design-lint.mjs function-length → blocking (not in any tier)', () => {
  const inList = ACCEPTED_FINDINGS.some(
    e => e.path === 'design-lint.mjs' && e.smell === 'function-length'
  );
  assert.equal(inList, false, 'precondition: design-lint.mjs function-length not in any tier');

  const finding = errorFinding('scripts/design-lint.mjs', 'function-length', 100);
  const { exitCode, blocking } = decide({ sourceFindings: [finding], trdResult: CLEAN_TRD });
  assert.equal(blocking.length, 1);
  assert.equal(exitCode, 1);
});

// ===========================================================================
// UV-4 — ADVISORY FINDINGS NEVER BLOCK
// ===========================================================================

test('UV-4a advisory findings never block: single advisory → exit 0', () => {
  const finding = advisoryFinding('scripts/some-file.mjs', 'duplicate-block', 55);
  const { exitCode, advisory, blocking } = decide({
    sourceFindings: [finding],
    trdResult: CLEAN_TRD,
  });
  assert.equal(advisory.length, 1, 'advisory finding must land in advisory array');
  assert.equal(blocking.length, 0, 'advisory must not be blocking');
  assert.equal(exitCode, 0, 'exit must be 0 for advisory-only input');
});

test('UV-4b advisory findings never block: advisory on a real allowlisted path still advisory', () => {
  // Even if the path IS in ACCEPTED_FINDINGS, an advisory finding should go to advisory,
  // not to accepted (the classify-first path is severity check, not allowlist check).
  const finding = advisoryFinding('scripts/verdict-lint.mjs', 'duplicate-block', 100);
  const { exitCode, advisory, blocking, accepted } = decide({
    sourceFindings: [finding],
    trdResult: CLEAN_TRD,
  });
  assert.equal(advisory.length, 1, 'advisory must be classified as advisory regardless of file');
  assert.equal(blocking.length, 0);
  assert.equal(accepted.length, 0, 'advisory must NOT go to accepted — it bypasses the allowlist check');
  assert.equal(exitCode, 0);
});

test('UV-4c advisory + error allowlisted → exit 0 with both correctly classified', () => {
  const findings = [
    advisoryFinding('scripts/design-lint.mjs', 'duplicate-block', 10),
    errorFinding('scripts/verdict-lint.mjs', 'file-length', 1),
  ];
  const { exitCode, advisory, accepted, blocking } = decide({
    sourceFindings: findings,
    trdResult: CLEAN_TRD,
  });
  assert.equal(advisory.length, 1);
  assert.equal(accepted.length, 1);
  assert.equal(blocking.length, 0);
  assert.equal(exitCode, 0);
});

test('UV-4d advisory + error NOT allowlisted → exit 1 (error blocks, advisory does not)', () => {
  const findings = [
    advisoryFinding('scripts/anything.mjs', 'duplicate-block', 1),
    errorFinding('scripts/brand-new.mjs', 'param-count', 20),
  ];
  const { exitCode, advisory, blocking } = decide({
    sourceFindings: findings,
    trdResult: CLEAN_TRD,
  });
  assert.equal(advisory.length, 1, 'advisory still advisory');
  assert.equal(blocking.length, 1, 'non-allowlisted error still blocks');
  assert.equal(exitCode, 1, 'exit 1 because of the blocking error');
});

// ===========================================================================
// UV-5 — TRD FAILURE ALWAYS BLOCKS
// ===========================================================================

test('UV-5a TRD failure blocks even with empty sourceFindings', () => {
  const { exitCode, blocking } = decide({
    sourceFindings: [],
    trdResult: BROKEN_TRD,
  });
  // blocking array is for SOURCE findings; TRD failure is tracked separately.
  // The invariant: exitCode must be 1.
  assert.equal(exitCode, 1,
    'TRD failure MUST cause exit 1 even with zero source findings — no allowlist can waive TRD');
});

test('UV-5b TRD failure blocks even when all source findings are allowlisted', () => {
  const sourceFindings = [
    errorFinding('scripts/verdict-lint.mjs', 'file-length', 100),
    errorFinding('scripts/design-lint.mjs', 'todo-marker', 5),
  ];
  const { exitCode, accepted, blocking } = decide({
    sourceFindings,
    trdResult: BROKEN_TRD,
  });
  assert.equal(accepted.length, 2, 'both source findings should be accepted by tier-1');
  assert.equal(blocking.length, 0, 'no source-finding blocks');
  assert.equal(exitCode, 1,
    'exitCode must still be 1 because TRD failed — no allowlist for TRD');
});

test('UV-5c TRD ok=true + zero source findings → exit 0', () => {
  const { exitCode } = decide({ sourceFindings: [], trdResult: CLEAN_TRD });
  assert.equal(exitCode, 0, 'clean state must exit 0');
});

test('UV-5d live fixture: lintTrd on the canonical fixture returns ok=true (no stub)', () => {
  const fixtureText = readFileSync(FIXTURE_PATH, 'utf8');
  const result = lintTrd(fixtureText);
  assert.equal(result.ok, true,
    `canonical TRD fixture must pass lintTrd; findings: ${result.findings.join('; ')}`);
  assert.equal(result.findings.length, 0, 'zero findings on canonical fixture');
});

// ===========================================================================
// UV-6 — STRUCTURAL: EVERY TIER-2 ENTRY HAS A NON-EMPTY techDebt ID
// and a non-empty reason.
// ===========================================================================

test('UV-6a every tier-2 entry has a non-empty techDebt field', () => {
  const tier2 = ACCEPTED_FINDINGS.filter(e => e.fnLine !== undefined);
  assert.ok(tier2.length > 0, 'there must be at least one tier-2 entry');
  for (const entry of tier2) {
    assert.ok(
      typeof entry.techDebt === 'string' && entry.techDebt.trim().length > 0,
      `tier-2 entry (${entry.path}, ${entry.smell}, fnLine=${entry.fnLine}) must have non-empty techDebt; got: ${JSON.stringify(entry.techDebt)}`
    );
  }
});

test('UV-6b every tier-2 entry has a non-empty reason field', () => {
  const tier2 = ACCEPTED_FINDINGS.filter(e => e.fnLine !== undefined);
  for (const entry of tier2) {
    assert.ok(
      typeof entry.reason === 'string' && entry.reason.trim().length > 0,
      `tier-2 entry (${entry.path}, fnLine=${entry.fnLine}) must have non-empty reason`
    );
  }
});

test('UV-6c every tier-1 entry has a non-empty reason field', () => {
  const tier1 = ACCEPTED_FINDINGS.filter(e => e.fnLine === undefined);
  for (const entry of tier1) {
    assert.ok(
      typeof entry.reason === 'string' && entry.reason.trim().length > 0,
      `tier-1 entry (${entry.path}, ${entry.smell}) must have non-empty reason`
    );
  }
});

test('UV-6d every tier-2 entry has a non-empty fn (human-readable name) field', () => {
  const tier2 = ACCEPTED_FINDINGS.filter(e => e.fnLine !== undefined);
  for (const entry of tier2) {
    assert.ok(
      typeof entry.fn === 'string' && entry.fn.trim().length > 0,
      `tier-2 entry (${entry.path}, fnLine=${entry.fnLine}) must have non-empty fn field; got: ${JSON.stringify(entry.fn)}`
    );
  }
});

// ===========================================================================
// UV-7 — STRUCTURAL HONESTY: EXACTLY 7 TIER-2 ENTRIES, DISTINCT TD IDs
// ===========================================================================

test('UV-7a exactly 7 tier-2 entries (fnLine defined)', () => {
  const tier2 = ACCEPTED_FINDINGS.filter(e => e.fnLine !== undefined);
  assert.equal(tier2.length, 7,
    `must have exactly 7 tier-2 entries; got ${tier2.length}`);
});

test('UV-7b tier-2 techDebt IDs are distinct (no duplicates)', () => {
  const tier2 = ACCEPTED_FINDINGS.filter(e => e.fnLine !== undefined);
  const ids = tier2.map(e => e.techDebt);
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, tier2.length,
    `all tier-2 techDebt IDs must be distinct; found duplicates in: ${JSON.stringify(ids)}`);
});

test('UV-7c tier-2 techDebt IDs all match TD-2026-07-18-0x pattern', () => {
  const tier2 = ACCEPTED_FINDINGS.filter(e => e.fnLine !== undefined);
  const tdPattern = /^TD-2026-07-18-0[1-9]$/;
  for (const entry of tier2) {
    assert.match(
      entry.techDebt,
      tdPattern,
      `techDebt id "${entry.techDebt}" on (${entry.path}, fnLine=${entry.fnLine}) must match TD-2026-07-18-0x`
    );
  }
});

test('UV-7d tier-2 covers exactly 3 distinct files (invalidation, output-cap, verdict-lint)', () => {
  const tier2 = ACCEPTED_FINDINGS.filter(e => e.fnLine !== undefined);
  const files = new Set(tier2.map(e => e.path));
  const expected = new Set(['invalidation.mjs', 'output-cap.mjs', 'verdict-lint.mjs']);
  assert.deepEqual(files, expected,
    `tier-2 files must be exactly {invalidation.mjs, output-cap.mjs, verdict-lint.mjs}; got: ${JSON.stringify([...files])}`);
});

test('UV-7e tier-2 fnLine values are unique within each file', () => {
  const tier2 = ACCEPTED_FINDINGS.filter(e => e.fnLine !== undefined);
  const byFile = {};
  for (const entry of tier2) {
    if (!byFile[entry.path]) byFile[entry.path] = [];
    byFile[entry.path].push(entry.fnLine);
  }
  for (const [file, lines] of Object.entries(byFile)) {
    const unique = new Set(lines);
    assert.equal(unique.size, lines.length,
      `duplicate fnLine in tier-2 for file ${file}: ${JSON.stringify(lines)}`);
  }
});

test('UV-7f tier-1 entry count is exactly 14', () => {
  const tier1 = ACCEPTED_FINDINGS.filter(e => e.fnLine === undefined);
  assert.equal(tier1.length, 14,
    `must have exactly 14 tier-1 entries; got ${tier1.length}. Doc comment at line 75 says "11 entries" — this is a doc-drift (non-gating)`);
});

// ===========================================================================
// UV-8 — NO MACHINE-ABSOLUTE PATH LITERALS IN self-check.mjs SOURCE
// ===========================================================================

test('UV-8a self-check.mjs source contains no /Users/ literal', () => {
  const src = readFileSync(SELF_CHECK_SRC_PATH, 'utf8');
  assert.ok(!src.includes('/Users/'),
    'self-check.mjs must not contain /Users/ — MISTAKES 2026-07-10 no-machine-absolute-path');
});

test('UV-8b self-check.mjs source contains no /home/ literal', () => {
  const src = readFileSync(SELF_CHECK_SRC_PATH, 'utf8');
  assert.ok(!src.includes('/home/'),
    'self-check.mjs must not contain /home/ — MISTAKES 2026-07-10 no-machine-absolute-path');
});

test('UV-8c self-check.mjs source contains no C:\\Users\\ literal', () => {
  const src = readFileSync(SELF_CHECK_SRC_PATH, 'utf8');
  assert.ok(!src.includes('C:\\Users\\'),
    'self-check.mjs must not contain C:\\Users\\ — MISTAKES 2026-07-10 no-machine-absolute-path');
});

// ===========================================================================
// UV-9 — TOP-LEVEL IMPORTS ARE node:* STDLIB ONLY (no npm deps)
// ===========================================================================

test('UV-9 top-level imports in self-check.mjs are node:* or relative (./) only — no npm packages', () => {
  const src = readFileSync(SELF_CHECK_SRC_PATH, 'utf8');

  // Extract all static import declarations
  const importLines = src.split('\n').filter(line => /^import\s/.test(line));

  for (const line of importLines) {
    // Must import from 'node:*' or from './' (relative sibling)
    const isNodeBuiltin = /from\s+'node:/.test(line);
    const isRelative = /from\s+'\.\//.test(line);
    assert.ok(
      isNodeBuiltin || isRelative,
      `Top-level import must be node:* or relative; found: ${line.trim()}`
    );
  }

  // Sanity: there should be at least some imports
  assert.ok(importLines.length > 0, 'self-check.mjs must have at least one import');
});

// ===========================================================================
// UV-10 — MAIN-GUARD: importing self-check.mjs as a module does NOT trigger main()
// (this is satisfied by the argv[1] guard; verifiable by the fact that importing
// it above did not call exit() and these tests are still running)
// ===========================================================================

test('UV-10 importing self-check.mjs as a module does not trigger main() (process is still alive)', () => {
  // If main() had been called on import, exit() would have been called and we
  // would not reach this assertion. The fact that previous tests ran means the
  // argv[1] === fileURLToPath(import.meta.url) guard is working.
  const src = readFileSync(SELF_CHECK_SRC_PATH, 'utf8');
  // Verify the guard line is present in source
  assert.ok(
    src.includes('argv[1] === fileURLToPath(import.meta.url)'),
    'self-check.mjs must contain the argv[1] main-guard to prevent main() on import'
  );
  // And we are alive (trivially true if we got here, but makes the intent explicit)
  assert.ok(true, 'process is alive after import — main-guard is effective');
});

// ===========================================================================
// UV-11 — DECIDE() RETURN SHAPE IS ALWAYS {exitCode, blocking, accepted, advisory}
// ===========================================================================

test('UV-11a decide() always returns all four fields with correct types', () => {
  const result = decide({ sourceFindings: [], trdResult: CLEAN_TRD });
  assert.ok('exitCode' in result, 'result must have exitCode');
  assert.ok('blocking' in result, 'result must have blocking');
  assert.ok('accepted' in result, 'result must have accepted');
  assert.ok('advisory' in result, 'result must have advisory');
  assert.ok(Array.isArray(result.blocking), 'blocking must be array');
  assert.ok(Array.isArray(result.accepted), 'accepted must be array');
  assert.ok(Array.isArray(result.advisory), 'advisory must be array');
  assert.ok(result.exitCode === 0 || result.exitCode === 1, 'exitCode must be 0 or 1');
});

test('UV-11b decide() exitCode is ONLY 0 or 1 (never 2 from the pure function)', () => {
  // exit code 2 is reserved for IO errors in the CLI shell, not from decide()
  const scenarios = [
    { sourceFindings: [], trdResult: CLEAN_TRD },
    { sourceFindings: [], trdResult: BROKEN_TRD },
    { sourceFindings: [errorFinding('foo.mjs', 'file-length', 1)], trdResult: CLEAN_TRD },
    { sourceFindings: [advisoryFinding('foo.mjs', 'duplicate-block')], trdResult: CLEAN_TRD },
  ];
  for (const input of scenarios) {
    const { exitCode } = decide(input);
    assert.ok(exitCode === 0 || exitCode === 1,
      `decide() must only return 0 or 1; got ${exitCode} for input ${JSON.stringify(input)}`);
  }
});

// ===========================================================================
// UV-12 — PATH NORMALIZATION: basename() is applied to finding.path
// A finding with a full path like /some/dir/file.mjs should match the same
// as one with just file.mjs
// ===========================================================================

test('UV-12 path normalization: full-path and basename both match tier-1 entry', () => {
  // The decide() function calls basename(finding.path) internally.
  const longPath = '/some/absolute/nested/scripts/verdict-lint.mjs';
  const shortPath = 'verdict-lint.mjs';

  const r1 = decide({
    sourceFindings: [errorFinding(longPath, 'file-length', 100)],
    trdResult: CLEAN_TRD,
  });
  const r2 = decide({
    sourceFindings: [errorFinding(shortPath, 'file-length', 100)],
    trdResult: CLEAN_TRD,
  });

  assert.equal(r1.accepted.length, 1, 'full path must be accepted after basename normalization');
  assert.equal(r2.accepted.length, 1, 'bare basename must be accepted');
  assert.equal(r1.exitCode, 0);
  assert.equal(r2.exitCode, 0);
});

test('UV-12b path normalization for tier-2: full path with fnLine match', () => {
  const fullPath = '/deep/nested/dir/invalidation.mjs';
  const finding = errorFinding(fullPath, 'function-length', 228);
  const { accepted, exitCode } = decide({ sourceFindings: [finding], trdResult: CLEAN_TRD });
  assert.equal(accepted.length, 1,
    'tier-2 match must work for full paths via basename normalization');
  assert.equal(exitCode, 0);
});

// ===========================================================================
// UV-13 — EMPTY SOURCEFINDINGS + CLEAN TRD = exit 0 (clean-slate check)
// ===========================================================================

test('UV-13 empty sourceFindings + clean TRD → exit 0 with all arrays empty', () => {
  const { exitCode, blocking, accepted, advisory } = decide({
    sourceFindings: [],
    trdResult: CLEAN_TRD,
  });
  assert.equal(exitCode, 0);
  assert.equal(blocking.length, 0);
  assert.equal(accepted.length, 0);
  assert.equal(advisory.length, 0);
});

// ===========================================================================
// UV-14 — MIXED SCENARIO: allowlisted + non-allowlisted + advisory + broken TRD
// The non-allowlisted error AND the broken TRD both independently trigger exit 1.
// ===========================================================================

test('UV-14 mixed scenario: allowlisted + blocking + advisory + broken TRD → exit 1', () => {
  const findings = [
    errorFinding('scripts/verdict-lint.mjs', 'file-length', 1),    // tier-1 accepted
    errorFinding('scripts/invalidation.mjs', 'function-length', 228), // tier-2 accepted
    errorFinding('scripts/brand-new.mjs', 'param-count', 10),        // blocking
    advisoryFinding('scripts/anything.mjs', 'duplicate-block'),       // advisory
  ];

  const { exitCode, blocking, accepted, advisory } = decide({
    sourceFindings: findings,
    trdResult: BROKEN_TRD,
  });

  assert.equal(accepted.length, 2, 'two accepted findings (tier-1 + tier-2)');
  assert.equal(blocking.length, 1, 'one blocking finding');
  assert.equal(advisory.length, 1, 'one advisory finding');
  assert.equal(exitCode, 1, 'exit 1 because of blocking source finding AND broken TRD');
});

test('UV-14b mixed: all allowlisted + advisory + broken TRD → exit 1 (TRD alone blocks)', () => {
  const findings = [
    errorFinding('scripts/verdict-lint.mjs', 'file-length', 1),
    advisoryFinding('scripts/x.mjs', 'duplicate-block'),
  ];
  const { exitCode, blocking } = decide({
    sourceFindings: findings,
    trdResult: BROKEN_TRD,
  });
  assert.equal(blocking.length, 0, 'no blocking source findings');
  assert.equal(exitCode, 1, 'broken TRD alone forces exit 1');
});
