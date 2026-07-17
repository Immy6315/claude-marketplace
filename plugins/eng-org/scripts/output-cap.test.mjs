/**
 * output-cap.test.mjs — unit tests for output-cap.mjs
 *
 * REQ-20260716-d904-04 TASK-4 (cand-11, REQ-μ). Covers ALL 10 hard
 * invariants from TASK-4-new-output-cap-script.md §Hard invariants,
 * adapted per A-μ1 to the PER-MODE cap schema
 * (tests/output-cap-parameter.json — schema_version 1, granularity
 * "per-mode", cap_by_mode {A,B,C,L}):
 *
 *   1. Primary planted finding ALWAYS retained (50-finding cull, X at P3).
 *   2. Recall = 1.000 preserved (planted findings retained post-cap).
 *   3. Guardrail_completeness = 1.000 preserved.
 *   4. Verdict byte-identical post-cap (never recomputed).
 *   5. Deterministic (double invocation → byte-identical output).
 *   6. Cap sourced from JSON — missing/malformed artifact throws typed
 *      CapParameterError (per-mode adaptation: schema_version, granularity,
 *      missing mode, non-integer caps all throw). PLUS null-signal rule:
 *      unknown cellContext.mode → typed OutputCapContextError, never a
 *      silent default.
 *   7. Fail-loud on malformed report (missing findings / verdict / body).
 *   8. Source-invariant grep: zero bare catch in output-cap.mjs.
 *   9. Marker present on truncation, absent on no-truncation.
 *  10. cellContext = null → severity-desc-only fallback + warning, no error.
 *
 * MISTAKES-informed discipline:
 *   - One assertion per test() (2026-07-11 REQ-08).
 *   - Test title NAMES the outcome the body asserts.
 *   - Zero non-stdlib imports; fixtures in os.tmpdir(), cleaned in afterEach
 *     via module-level tmpFiles/fixtureCounter (intentional shared state for
 *     cleanup coordination — not application state).
 *   - TRUNCATION_MARKER_PREFIX is IMPORTED, never inlined
 *     (gate-inlines-production-copy).
 *   - Fixture cap numbers are synthetic; the live A-μ1 artifact is
 *     schema-validated without pinning its numeric values as oracles
 *     (hardcoded-oracle-instead-of-runtime-measurement).
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CapParameterError,
  OutputCapReportError,
  OutputCapContextError,
  REQUIRED_MODES,
  DEFAULT_CAP_PARAMETER_PATH,
  TRUNCATION_MARKER_PREFIX,
  NULL_CONTEXT_MODE_LABEL,
  resolveCapParameterPath,
  loadCapParameter,
  estimateTokens,
  enforceOutputCap,
} from './output-cap.mjs';

// Path to THIS module's source (for source-invariant greps).
const OUTPUT_CAP_SOURCE_PATH = fileURLToPath(new URL('./output-cap.mjs', import.meta.url));

// Shipped config copy (module-relative — works on any clean checkout of
// claude-marketplace without the governance sub-tree).
const LIVE_CAP_ARTIFACT_PATH = fileURLToPath(
  new URL('../config/output-cap-parameter.json', import.meta.url),
);

// Governance derivation record (authoritative provenance; READ-ONLY).
// May be absent on a clean checkout of claude-marketplace alone — tests that
// reference this path must skip gracefully when it is missing.
const GOVERNANCE_ARTIFACT_PATH = fileURLToPath(new URL(
  '../../../../governance/requirements/REQ-20260716-d904-04/tests/output-cap-parameter.json',
  import.meta.url,
));

// ---------------------------------------------------------------------------
// Fixture helpers (tmpdir; cleaned in afterEach)
// ---------------------------------------------------------------------------

const tmpFiles = [];
let fixtureCounter = 0;

afterEach(() => {
  while (tmpFiles.length > 0) {
    const f = tmpFiles.pop();
    fs.rmSync(f, { force: true });
  }
});

/**
 * Write a per-mode cap fixture JSON (A-μ1 schema) and return its path.
 * @param {Record<string, number>} caps
 * @param {object} overrides — shallow-merged over the base document.
 * @returns {string}
 */
function writeCapFixture(caps, overrides = {}) {
  fixtureCounter += 1;
  const file = path.join(os.tmpdir(), `output-cap-fixture-${process.pid}-${fixtureCounter}.json`);
  const doc = {
    schema_version: 1,
    req: 'REQ-20260716-d904-04',
    granularity: 'per-mode',
    multiplier: 1.05,
    cap_by_mode: caps,
    mean_by_mode: {},
    n_by_mode: {},
    source: { version_id: 21 },
    ...overrides,
  };
  fs.writeFileSync(file, JSON.stringify(doc));
  tmpFiles.push(file);
  return file;
}

/** @param {Record<string, number>} caps @returns {object} loaded cap parameter */
function makeParam(caps) {
  return loadCapParameter(writeCapFixture(caps));
}

/** Small caps for truncation tests (tokens ≈ chars/4). */
const SMALL_CAPS = { A: 90, B: 120, C: 110, L: 80 };
/** Large caps so nothing truncates. */
const LARGE_CAPS = { A: 100000, B: 100000, C: 100000, L: 100000 };

/**
 * @param {string} id @param {string} severity @param {object} extra
 * @returns {object} synthetic finding
 */
function makeFinding(id, severity, extra = {}) {
  return { id, severity, text: `finding ${id} text`, ...extra };
}

/** 50-finding report: 49 P0/P1/P2 noise + primary planted 'planted-x' at P3 (worst position). */
function makeFiftyFindingReport() {
  const findings = [];
  for (let i = 0; i < 49; i += 1) {
    const sev = ['P0', 'P1', 'P2'][i % 3];
    findings.push(makeFinding(`noise-${String(i).padStart(2, '0')}`, sev));
  }
  findings.push(makeFinding('planted-x', 'P3', { planted: true }));
  return { verdict: 'BLOCK', findings, body: '' };
}

// ---------------------------------------------------------------------------
// Invariant 6 (per-mode adapted) — cap parameter sourced from JSON, typed errors
// ---------------------------------------------------------------------------

test('inv6: loadCapParameter of nonexistent path throws CapParameterError, not a silent default', () => {
  assert.throws(
    () => loadCapParameter(path.join(os.tmpdir(), 'output-cap-definitely-nonexistent.json')),
    CapParameterError,
  );
});

test('inv6: loadCapParameter of invalid JSON throws CapParameterError', () => {
  fixtureCounter += 1;
  const file = path.join(os.tmpdir(), `output-cap-fixture-${process.pid}-${fixtureCounter}.json`);
  fs.writeFileSync(file, '{not json');
  tmpFiles.push(file);
  assert.throws(() => loadCapParameter(file), CapParameterError);
});

test('inv6: loadCapParameter rejects schema_version !== 1 with CapParameterError', () => {
  const file = writeCapFixture(SMALL_CAPS, { schema_version: 2 });
  assert.throws(() => loadCapParameter(file), CapParameterError);
});

test('inv6: loadCapParameter rejects granularity !== per-mode with CapParameterError', () => {
  const file = writeCapFixture(SMALL_CAPS, { granularity: 'per-cell' });
  assert.throws(() => loadCapParameter(file), CapParameterError);
});

test('inv6: loadCapParameter rejects cap_by_mode missing mode L with CapParameterError', () => {
  const file = writeCapFixture({ A: 10, B: 10, C: 10 });
  assert.throws(() => loadCapParameter(file), CapParameterError);
});

test('inv6: loadCapParameter rejects non-integer cap with CapParameterError', () => {
  const file = writeCapFixture({ A: 10.5, B: 10, C: 10, L: 10 });
  assert.throws(() => loadCapParameter(file), CapParameterError);
});

test('inv6: loadCapParameter rejects non-positive cap with CapParameterError', () => {
  const file = writeCapFixture({ A: 0, B: 10, C: 10, L: 10 });
  assert.throws(() => loadCapParameter(file), CapParameterError);
});

test('inv6: loadCapParameter of a valid per-mode fixture returns frozen capByMode with all 4 modes', () => {
  const param = makeParam({ A: 1, B: 2, C: 3, L: 4 });
  assert.deepEqual(param.capByMode, { A: 1, B: 2, C: 3, L: 4 });
});

test('inv6: shipped config/output-cap-parameter.json loads and schema-validates (module-relative default)', () => {
  const param = loadCapParameter(LIVE_CAP_ARTIFACT_PATH);
  assert.equal(
    REQUIRED_MODES.every((m) => Number.isInteger(param.capByMode[m]) && param.capByMode[m] > 0),
    true,
  );
});

test('inv6: resolveCapParameterPath honors CAP_PARAMETER_PATH env override', () => {
  const resolved = resolveCapParameterPath({ CAP_PARAMETER_PATH: '/tmp/custom-cap.json' });
  assert.equal(resolved, path.resolve('/tmp/custom-cap.json'));
});

test('inv6: resolveCapParameterPath default equals DEFAULT_CAP_PARAMETER_PATH (module-relative shipped config)', () => {
  const resolved = resolveCapParameterPath({});
  assert.equal(resolved, DEFAULT_CAP_PARAMETER_PATH);
});

test('inv6 (null-signal): unknown cellContext.mode Z throws OutputCapContextError, not silent default', () => {
  const param = makeParam(LARGE_CAPS);
  const report = { verdict: 'APPROVE', findings: [], body: 'x' };
  assert.throws(
    () => enforceOutputCap(report, { cellId: 'c1', mode: 'Z' }, param),
    OutputCapContextError,
  );
});

test('inv6 (null-signal): cellContext without mode field throws OutputCapContextError', () => {
  const param = makeParam(LARGE_CAPS);
  const report = { verdict: 'APPROVE', findings: [], body: 'x' };
  assert.throws(() => enforceOutputCap(report, { cellId: 'c1' }, param), OutputCapContextError);
});

// ---------------------------------------------------------------------------
// Invariant 7 — fail-loud on malformed report
// ---------------------------------------------------------------------------

test('inv7: report missing findings array throws OutputCapReportError', () => {
  const param = makeParam(LARGE_CAPS);
  assert.throws(
    () => enforceOutputCap({ verdict: 'APPROVE', body: 'x' }, { mode: 'A' }, param),
    OutputCapReportError,
  );
});

test('inv7: report missing verdict throws OutputCapReportError', () => {
  const param = makeParam(LARGE_CAPS);
  assert.throws(
    () => enforceOutputCap({ findings: [], body: 'x' }, { mode: 'A' }, param),
    OutputCapReportError,
  );
});

test('inv7: report missing body throws OutputCapReportError', () => {
  const param = makeParam(LARGE_CAPS);
  assert.throws(
    () => enforceOutputCap({ verdict: 'APPROVE', findings: [] }, { mode: 'A' }, param),
    OutputCapReportError,
  );
});

test('inv7: findings as non-array object throws OutputCapReportError', () => {
  const param = makeParam(LARGE_CAPS);
  assert.throws(
    () => enforceOutputCap({ verdict: 'APPROVE', findings: {}, body: 'x' }, { mode: 'A' }, param),
    OutputCapReportError,
  );
});

// ---------------------------------------------------------------------------
// Invariant 9 — marker present on truncation, absent on no-truncation
// ---------------------------------------------------------------------------

test('inv9: report under cap → truncated is false', () => {
  const param = makeParam(LARGE_CAPS);
  const report = { verdict: 'APPROVE', findings: [makeFinding('f-1', 'P2')], body: 'short body' };
  const result = enforceOutputCap(report, { mode: 'A', primaryPlantedFindingId: 'f-1' }, param);
  assert.equal(result.truncated, false);
});

test('inv9: report under cap → marker is null', () => {
  const param = makeParam(LARGE_CAPS);
  const report = { verdict: 'APPROVE', findings: [makeFinding('f-1', 'P2')], body: 'short body' };
  const result = enforceOutputCap(report, { mode: 'A', primaryPlantedFindingId: 'f-1' }, param);
  assert.equal(result.marker, null);
});

test('inv9: report under cap → body contains no truncation-marker prefix', () => {
  const param = makeParam(LARGE_CAPS);
  const report = { verdict: 'APPROVE', findings: [makeFinding('f-1', 'P2')], body: 'short body' };
  const result = enforceOutputCap(report, { mode: 'A', primaryPlantedFindingId: 'f-1' }, param);
  assert.equal(result.report.body.includes(TRUNCATION_MARKER_PREFIX), false);
});

test('inv9: report over cap → marker string contains truncation-marker prefix', () => {
  const param = makeParam(SMALL_CAPS);
  const result = enforceOutputCap(
    makeFiftyFindingReport(), { mode: 'A', primaryPlantedFindingId: 'planted-x' }, param,
  );
  assert.equal(result.marker.includes(TRUNCATION_MARKER_PREFIX), true);
});

test('inv9: report over cap → returned body ends with the marker', () => {
  const param = makeParam(SMALL_CAPS);
  const result = enforceOutputCap(
    makeFiftyFindingReport(), { mode: 'A', primaryPlantedFindingId: 'planted-x' }, param,
  );
  assert.equal(result.report.body.endsWith(result.marker), true);
});

// ---------------------------------------------------------------------------
// Invariant 1 — primary planted finding ALWAYS retained (50-finding cull, X at P3)
// ---------------------------------------------------------------------------

test('inv1: primary planted P3 finding survives a 50-finding cull under tight cap', () => {
  const param = makeParam(SMALL_CAPS);
  const result = enforceOutputCap(
    makeFiftyFindingReport(), { mode: 'A', primaryPlantedFindingId: 'planted-x' }, param,
  );
  assert.equal(result.report.findings.some((f) => f.id === 'planted-x'), true);
});

test('inv1: tight cap actually forces a mass cull (≥ 44 of 50 findings removed)', () => {
  const param = makeParam(SMALL_CAPS);
  const result = enforceOutputCap(
    makeFiftyFindingReport(), { mode: 'A', primaryPlantedFindingId: 'planted-x' }, param,
  );
  assert.equal(result.report.findings.length <= 6, true);
});

test('inv1: capped projection (verdict+findings+body) fits within capApplied', () => {
  const param = makeParam(SMALL_CAPS);
  const result = enforceOutputCap(
    makeFiftyFindingReport(), { mode: 'A', primaryPlantedFindingId: 'planted-x' }, param,
  );
  const projected = estimateTokens(JSON.stringify({
    verdict: result.report.verdict,
    findings: result.report.findings,
    body: result.report.body,
  }));
  assert.equal(projected <= result.capApplied, true);
});

test('estimateTokens throws TypeError for non-string input', () => {
  assert.throws(() => estimateTokens(42), TypeError);
});

test('inv1: body-only truncation path retains the sole primary planted finding', () => {
  const param = makeParam(SMALL_CAPS);
  const report = {
    verdict: 'BLOCK',
    findings: [makeFinding('planted-x', 'P0', { planted: true })],
    body: 'z'.repeat(5000),
  };
  const result = enforceOutputCap(report, { mode: 'L', primaryPlantedFindingId: 'planted-x' }, param);
  assert.equal(result.report.findings.some((f) => f.id === 'planted-x'), true);
});

// ---------------------------------------------------------------------------
// Invariant 2 — recall = 1.000 preserved
// ---------------------------------------------------------------------------

test('inv2: recall 1.000 pre-cap stays 1.000 post-cap (all planted findings retained)', () => {
  // Shape mirrors a cand-10 ok-run cell: planted defects at high severity,
  // primary planted pinned via cellContext, low-severity noise culled.
  // Cap sits above the planted-findings+body floor (severity-desc culling
  // removes the 30 P3 noise findings first), mirroring realistic per-mode
  // caps that are far above any planted-finding floor.
  const param = makeParam({ A: 90, B: 170, C: 110, L: 80 });
  const findings = [
    makeFinding('planted-x', 'P0', { planted: true }),
    makeFinding('planted-y', 'P1', { planted: true }),
  ];
  for (let i = 0; i < 30; i += 1) findings.push(makeFinding(`noise-${i}`, 'P3'));
  const report = { verdict: 'BLOCK', findings, body: 'analysis body '.repeat(20) };
  const result = enforceOutputCap(report, { mode: 'B', primaryPlantedFindingId: 'planted-x' }, param);
  const plantedTotal = findings.filter((f) => f.planted === true).length;
  const plantedKept = result.report.findings.filter((f) => f.planted === true).length;
  assert.equal(plantedKept / plantedTotal, 1.0);
});

// ---------------------------------------------------------------------------
// Invariant 3 — guardrail_completeness = 1.000 preserved
// ---------------------------------------------------------------------------

test('inv3: guardrail_completeness 1.000 pre-cap stays 1.000 post-cap', () => {
  // Same floor rationale as inv2: cap above the guardrail-findings+body floor.
  const param = makeParam({ A: 90, B: 120, C: 170, L: 80 });
  const findings = [
    makeFinding('guard-1', 'P0', { guardrail: true }),
    makeFinding('guard-2', 'P1', { guardrail: true }),
  ];
  for (let i = 0; i < 30; i += 1) findings.push(makeFinding(`noise-${i}`, 'P3'));
  const report = { verdict: 'BLOCK', findings, body: 'guardrail section '.repeat(15) };
  const result = enforceOutputCap(report, { mode: 'C', primaryPlantedFindingId: 'guard-1' }, param);
  const guardTotal = findings.filter((f) => f.guardrail === true).length;
  const guardKept = result.report.findings.filter((f) => f.guardrail === true).length;
  assert.equal(guardKept / guardTotal, 1.0);
});

// ---------------------------------------------------------------------------
// Invariant 4 — verdict byte-identical post-cap (never recomputed)
// ---------------------------------------------------------------------------

test('inv4: verdict byte-identical post-cap on the truncation path', () => {
  const param = makeParam(SMALL_CAPS);
  const report = makeFiftyFindingReport();
  const result = enforceOutputCap(report, { mode: 'A', primaryPlantedFindingId: 'planted-x' }, param);
  assert.equal(result.report.verdict, 'BLOCK');
});

test('inv4: verdict byte-identical on the no-truncation path', () => {
  const param = makeParam(LARGE_CAPS);
  const report = { verdict: 'NEEDS-CHANGES', findings: [makeFinding('f-1', 'P2')], body: 'ok' };
  const result = enforceOutputCap(report, { mode: 'A', primaryPlantedFindingId: 'f-1' }, param);
  assert.equal(result.report.verdict, 'NEEDS-CHANGES');
});

test('inv4: verdict NOT recomputed even when every P0 driving it is culled', () => {
  // All P0 noise culled, only the P3 primary survives — a recomputation
  // would downgrade BLOCK; preservation-verbatim keeps it.
  const param = makeParam(SMALL_CAPS);
  const result = enforceOutputCap(
    makeFiftyFindingReport(), { mode: 'L', primaryPlantedFindingId: 'planted-x' }, param,
  );
  assert.equal(result.report.verdict, 'BLOCK');
});

// ---------------------------------------------------------------------------
// Invariant 5 — deterministic
// ---------------------------------------------------------------------------

test('inv5: two invocations with identical input produce byte-identical output', () => {
  const param = makeParam(SMALL_CAPS);
  const ctx = { mode: 'A', primaryPlantedFindingId: 'planted-x' };
  const r1 = enforceOutputCap(makeFiftyFindingReport(), ctx, param);
  const r2 = enforceOutputCap(makeFiftyFindingReport(), ctx, param);
  assert.equal(JSON.stringify(r1), JSON.stringify(r2));
});

// ---------------------------------------------------------------------------
// Invariant 10 — cellContext null → severity-desc-only fallback + warning
// ---------------------------------------------------------------------------

test('inv10: cellContext null does not throw and returns the contract shape', () => {
  const param = makeParam(LARGE_CAPS);
  const report = { verdict: 'APPROVE', findings: [makeFinding('f-1', 'P2')], body: 'x' };
  const originalWarn = console.warn;
  console.warn = () => {};
  let result;
  try {
    result = enforceOutputCap(report, null, param);
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(Object.keys(result).sort(), ['capApplied', 'marker', 'report', 'truncated']);
});

test('inv10: cellContext null logs a warning', () => {
  const param = makeParam(LARGE_CAPS);
  const report = { verdict: 'APPROVE', findings: [], body: 'x' };
  const warned = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warned.push(args.join(' ')); };
  try {
    enforceOutputCap(report, null, param);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warned.some((w) => w.includes('[output-cap] WARN')), true);
});

test('inv10 (null-signal): cellContext null applies the LEAST-aggressive cap (max across modes)', () => {
  const param = makeParam({ A: 90, B: 120, C: 110, L: 80 });
  const report = { verdict: 'APPROVE', findings: [], body: 'x' };
  const originalWarn = console.warn;
  console.warn = () => {};
  let result;
  try {
    result = enforceOutputCap(report, null, param);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(result.capApplied, 120);
});

test('inv10: cellContext null still orders and culls severity-desc under a tight cap', () => {
  const param = makeParam(SMALL_CAPS);
  const findings = [
    makeFinding('low-1', 'P3'), makeFinding('crit-1', 'P0'),
    makeFinding('low-2', 'P3'), makeFinding('crit-2', 'P0'),
    makeFinding('low-3', 'P3'), makeFinding('low-4', 'P3'),
    makeFinding('low-5', 'P3'), makeFinding('low-6', 'P3'),
  ];
  const report = { verdict: 'BLOCK', findings, body: 'b'.repeat(100) };
  const originalWarn = console.warn;
  console.warn = () => {};
  let result;
  try {
    result = enforceOutputCap(report, null, param);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(result.report.findings.some((f) => f.id === 'crit-1'), true);
});

test('truncation marker embeds NULL_CONTEXT_MODE_LABEL for null-context reports', () => {
  const param = makeParam(SMALL_CAPS);
  const originalWarn = console.warn;
  console.warn = () => {};
  let result;
  try {
    result = enforceOutputCap(makeFiftyFindingReport(), null, param);
  } finally {
    console.warn = originalWarn;
  }
  assert.ok(result.marker.includes(NULL_CONTEXT_MODE_LABEL));
});

// ---------------------------------------------------------------------------
// Null-signal severity ordering — unclassified severity is NOT first-culled
// ---------------------------------------------------------------------------

test('null-signal: unknown-severity finding outlives P3 findings under a tight cap', () => {
  const param = makeParam(SMALL_CAPS);
  const findings = [
    makeFinding('crit-1', 'P0'),
    makeFinding('unclassified-1', 'made-up-severity'),
  ];
  for (let i = 0; i < 20; i += 1) findings.push(makeFinding(`low-${i}`, 'P3'));
  const report = { verdict: 'BLOCK', findings, body: '' };
  const result = enforceOutputCap(report, { mode: 'A', primaryPlantedFindingId: 'crit-1' }, param);
  assert.equal(result.report.findings.some((f) => f.id === 'unclassified-1'), true);
});

// ---------------------------------------------------------------------------
// H-1 frozen shape / purity
// ---------------------------------------------------------------------------

test('H-1: input reviewerReport.findings is never mutated (length unchanged after cull)', () => {
  const param = makeParam(SMALL_CAPS);
  const report = makeFiftyFindingReport();
  enforceOutputCap(report, { mode: 'A', primaryPlantedFindingId: 'planted-x' }, param);
  assert.equal(report.findings.length, 50);
});

test('H-1: extra report fields are carried through unmodified (no shape mutation)', () => {
  const param = makeParam(LARGE_CAPS);
  const report = {
    verdict: 'APPROVE', findings: [], body: 'x', reviewer: 'reviewer-security', cell: 'C-07',
  };
  const result = enforceOutputCap(report, { mode: 'C' }, param);
  assert.equal(result.report.reviewer, 'reviewer-security');
});

// ---------------------------------------------------------------------------
// Invariant 8 + immutable-zone — source-invariant greps
// ---------------------------------------------------------------------------

test('inv8: zero bare catch() in output-cap.mjs source', () => {
  const src = fs.readFileSync(OUTPUT_CAP_SOURCE_PATH, 'utf8');
  assert.equal(/catch\s*\(\s*\)/.test(src), false);
});

test('inv8: zero binding-less catch{ in output-cap.mjs source', () => {
  const src = fs.readFileSync(OUTPUT_CAP_SOURCE_PATH, 'utf8');
  assert.equal(/catch\s*\{/.test(src), false);
});

test('immutable-zone: output-cap.mjs references none of modeGate/deriveOverallVerdict/severityToVerdictHint/grSeverityToVerdictHint', () => {
  const src = fs.readFileSync(OUTPUT_CAP_SOURCE_PATH, 'utf8');
  assert.equal(
    /modeGate|deriveOverallVerdict|severityToVerdictHint|grSeverityToVerdictHint/.test(src),
    false,
  );
});

// ---------------------------------------------------------------------------
// M14/M15 — shipped config parity: governance derivation record == bundled copy
// (skipped on clean checkout without governance sub-tree)
// ---------------------------------------------------------------------------

test('parity: shipped config/output-cap-parameter.json is byte-identical to governance derivation record (skipped if governance file absent)', (t) => {
  let govExists;
  try {
    fs.accessSync(GOVERNANCE_ARTIFACT_PATH, fs.constants.R_OK);
    govExists = true;
  } catch (_) {
    govExists = false;
  }
  if (!govExists) {
    // Governance sub-tree absent on this checkout — parity cannot be checked.
    // This is expected on a clean clone of claude-marketplace alone; not a failure.
    t.skip('governance sub-tree absent on this checkout — parity unverifiable here');
    return;
  }
  const govBytes = fs.readFileSync(GOVERNANCE_ARTIFACT_PATH);
  const shippedBytes = fs.readFileSync(LIVE_CAP_ARTIFACT_PATH);
  assert.equal(
    Buffer.compare(govBytes, shippedBytes),
    0,
  );
});

// ---------------------------------------------------------------------------
// M39 — behavioral tests for CapParameterError parse-fail modes
// ---------------------------------------------------------------------------

test('M39: loadCapParameter of malformed JSON (truncated object) throws CapParameterError with descriptive message', () => {
  fixtureCounter += 1;
  const file = path.join(os.tmpdir(), `output-cap-fixture-${process.pid}-${fixtureCounter}.json`);
  fs.writeFileSync(file, '{"schema_version":1,"granularity":"per-mode","cap_by_mode":{"A":1');
  tmpFiles.push(file);
  let err;
  try {
    loadCapParameter(file);
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof CapParameterError);
  assert.ok(err.message.includes(file));
});

test('M39: loadCapParameter of JSON missing cap_by_mode key entirely throws CapParameterError', () => {
  fixtureCounter += 1;
  const file = path.join(os.tmpdir(), `output-cap-fixture-${process.pid}-${fixtureCounter}.json`);
  fs.writeFileSync(file, JSON.stringify({ schema_version: 1, granularity: 'per-mode', multiplier: 1.05 }));
  tmpFiles.push(file);
  let err;
  try {
    loadCapParameter(file);
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof CapParameterError);
});

test('M39: loadCapParameter of JSON where cap_by_mode is an array (not object) throws CapParameterError', () => {
  fixtureCounter += 1;
  const file = path.join(os.tmpdir(), `output-cap-fixture-${process.pid}-${fixtureCounter}.json`);
  fs.writeFileSync(file, JSON.stringify({
    schema_version: 1, granularity: 'per-mode', multiplier: 1.05, cap_by_mode: [1, 2, 3, 4],
  }));
  tmpFiles.push(file);
  let err;
  try {
    loadCapParameter(file);
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof CapParameterError);
});

test('M39: loadCapParameter CapParameterError message includes the artifact path', () => {
  const badPath = path.join(os.tmpdir(), 'output-cap-definitely-nonexistent-m39.json');
  let err;
  try {
    loadCapParameter(badPath);
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof CapParameterError && err.message.includes(badPath));
});

// ---------------------------------------------------------------------------
// M40 — unknown primaryPlantedFindingId: warn + continue (no throw)
// ---------------------------------------------------------------------------

test('M40: primaryPlantedFindingId matching no finding does not throw', () => {
  const param = makeParam(LARGE_CAPS);
  const report = {
    verdict: 'BLOCK',
    findings: [makeFinding('actual-finding', 'P1')],
    body: 'x',
  };
  const warned = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warned.push(args.join(' ')); };
  let err;
  try {
    enforceOutputCap(report, { mode: 'A', primaryPlantedFindingId: 'nonexistent-id' }, param);
  } catch (e) {
    err = e;
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(err, undefined);
});

test('M40: primaryPlantedFindingId matching no finding emits a console.warn', () => {
  const param = makeParam(LARGE_CAPS);
  const report = {
    verdict: 'BLOCK',
    findings: [makeFinding('actual-finding', 'P1')],
    body: 'x',
  };
  const warned = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warned.push(args.join(' ')); };
  try {
    enforceOutputCap(report, { mode: 'A', primaryPlantedFindingId: 'nonexistent-id' }, param);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warned.some((w) => w.includes('[output-cap] WARN')), true);
});

test('M40: primaryPlantedFindingId matching no finding preserves findings per normal cap rules', () => {
  const param = makeParam(LARGE_CAPS);
  const report = {
    verdict: 'BLOCK',
    findings: [makeFinding('actual-finding', 'P1'), makeFinding('other', 'P2')],
    body: 'x',
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  let result;
  try {
    result = enforceOutputCap(report, { mode: 'A', primaryPlantedFindingId: 'nonexistent-id' }, param);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(result.report.findings.length, 2);
});

// ---------------------------------------------------------------------------
// F2 — multiplier validation: missing and non-finite throw CapParameterError
// ---------------------------------------------------------------------------

test('F2: loadCapParameter throws CapParameterError when multiplier field is absent', () => {
  fixtureCounter += 1;
  const file = path.join(os.tmpdir(), `output-cap-fixture-${process.pid}-${fixtureCounter}.json`);
  fs.writeFileSync(file, JSON.stringify({
    schema_version: 1, granularity: 'per-mode', cap_by_mode: { A: 10, B: 10, C: 10, L: 10 },
  }));
  tmpFiles.push(file);
  assert.throws(() => loadCapParameter(file), CapParameterError);
});

test('F2: loadCapParameter throws CapParameterError when multiplier is null (JSON cannot represent Infinity)', () => {
  fixtureCounter += 1;
  const file = path.join(os.tmpdir(), `output-cap-fixture-${process.pid}-${fixtureCounter}.json`);
  // JSON.stringify drops Infinity → null; manually write the fixture
  fs.writeFileSync(file, '{"schema_version":1,"granularity":"per-mode","multiplier":null,"cap_by_mode":{"A":10,"B":10,"C":10,"L":10}}');
  tmpFiles.push(file);
  assert.throws(() => loadCapParameter(file), CapParameterError);
});

// ---------------------------------------------------------------------------
// F4 — file size bound: >1 MiB throws CapParameterError
// ---------------------------------------------------------------------------

test('F4: loadCapParameter throws CapParameterError when file exceeds 1 MiB', () => {
  fixtureCounter += 1;
  const file = path.join(os.tmpdir(), `output-cap-fixture-${process.pid}-${fixtureCounter}.json`);
  // Write >1 MiB of junk (not valid JSON — but the size check comes first)
  fs.writeFileSync(file, 'x'.repeat(1024 * 1024 + 1));
  tmpFiles.push(file);
  let err;
  try {
    loadCapParameter(file);
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof CapParameterError);
  assert.ok(err.message.includes('1 MiB'));
});

// ---------------------------------------------------------------------------
// G9 — statSync pre-check: directory path throws CapParameterError
// ---------------------------------------------------------------------------

test('G9: loadCapParameter on a directory path throws CapParameterError with "not a regular file"', () => {
  let err;
  try {
    loadCapParameter(os.tmpdir());
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof CapParameterError);
  assert.ok(err.message.includes('not a regular file'));
});
