#!/usr/bin/env node
/**
 * output-cap.mjs — REQ-20260716-d904-04 (cand-11, REQ-μ)
 *
 * Derivation-layer emit-time per-cell output cap. Sibling to
 * verdict-lint.mjs. Invoked in the same pipeline that runs
 * computeDerivedVerdict, AFTER verdict derivation (verdict = f(findings)
 * is computed pre-cap so the +.209 verdict gain from ADR-006 §D-21 is
 * preserved by construction). Per A-μ2 the emission-time invocation is
 * bench-side (eng-org-bench harness, TASK-B2); this module publishes the
 * hook — see TASK-4-dev-report.md §WIRING HOOK.
 *
 * Class-fingerprint: derivation-layer emit-time enforcement.
 * DIFFERENT from cand-8 verdict-ceiling (verdict-lint.mjs) and
 * cand-9 extraction-layer category normalization (verdict-lint.mjs
 * parseGrReview / CATEGORY_KEYWORDS). ADR-006 §D-23 strict-reading
 * commitment; broad-reading REJECT triggers cand-11 rescope per OQ-13.
 *
 * Delta from verdict-lint.mjs patterns (docstring-parity rule):
 *   - Operates on the FULL reviewer report AFTER verdict derivation;
 *     verdict-lint derives verdicts, this module NEVER derives or
 *     recomputes one — reviewerReport.verdict is preserved verbatim.
 *   - Parse-fail here is FAIL-LOUD (typed error), NOT verdict-lint's
 *     SKIP-not-FAIL: a malformed report at emit time is a pipeline bug,
 *     not a legacy-format file being linted.
 *   - Consumes a cross-TL runtime artifact (per-mode cap JSON, A-μ1)
 *     instead of module-local constants; verdict-lint carries its
 *     vocabulary tables in-module.
 *   - No CLI surface (pure library module); verdict-lint ships a CLI.
 *   - Severity vocabulary is IMPORTED from verdict-lint.mjs
 *     (normalizeSeverity, a read-only exported symbol) — never inlined
 *     (MISTAKES 2026-07-15 gate-inlines-production-copy).
 *
 * Cap parameter (A-μ1 reconciliation): the derivation record (authoritative
 * provenance artifact) lives at:
 *   governance/requirements/REQ-20260716-d904-04/tests/output-cap-parameter.json
 * The shipped default copy bundled with this module is at:
 *   plugins/eng-org/config/output-cap-parameter.json  (byte-identical to the
 *   derivation record at publish time; module-relative so it works on any
 *   clean checkout of claude-marketplace without the governance sub-tree).
 * Both share PER-MODE schema { schema_version: 1, granularity: "per-mode",
 * multiplier, cap_by_mode: {A,B,C,L}, mean_by_mode, n_by_mode, source }.
 * Produced by tl-bench (TASK-B1) from bench.db version_id 21 per-mode
 * output_tokens mean × multiplier (shipped artifact: multiplier=1.00,
 * re-tuned from 1.05 in cap re-tune round 1 per granularity_rationale;
 * multiplier is read from the JSON artifact at runtime — never hardcoded).
 * NEVER hardcoded here (MISTAKES 2026-07-15
 * hardcoded-oracle-instead-of-runtime-measurement).
 *
 * Preservation rule (HARD invariant): order findings severity-desc
 * (P0 > P1 > P2 > P3; UNCLASSIFIED severity ranks ABOVE P3 — null signal
 * is never "safest to drop", per MISTAKES 2026-07-15
 * null-signal-treated-as-safe-default); the finding whose id equals
 * cellContext.primaryPlantedFindingId is ALWAYS retained; truncate from
 * the tail until token projection ≤ cap; truncation marker appended to
 * the returned body.
 *
 * Null-signal discipline (applied twice):
 *   - cellContext === null → severity-desc-only fallback WITH warning,
 *     least-aggressive cap (max across modes) — unclassified is not
 *     safe-to-cap aggressively.
 *   - cellContext.mode unknown → typed OutputCapContextError, never a
 *     silent default cap.
 *
 * Contracts (unit-tested in output-cap.test.mjs):
 *   - guardrail_completeness=1.000 preserved (never regresses)
 *   - recall=1.000 preserved (primary planted finding retained)
 *   - verdict field unchanged (verdict is pre-cap; byte-identical)
 *   - deterministic (same input → same output; no wall-clock, no rng)
 *   - fail-loud (every fs/parse/validate has explicit typed error dispatch)
 *   - no bare / binding-less catch blocks (source-invariant grep in test suite)
 *   - H-1 frozen Report shape: verdict/findings never shape-mutated;
 *     only findings ENTRIES are removable under cap; input never mutated.
 *
 * @module output-cap
 */

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSeverity } from './verdict-lint.mjs';

// ---------------------------------------------------------------------------
// Typed errors (fail-loud dispatch; no bare catch anywhere in this module)
// ---------------------------------------------------------------------------

/** Cap-parameter artifact missing / unreadable / schema-invalid. */
export class CapParameterError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'CapParameterError';
  }
}

/** Reviewer report malformed at emit time (H-1 frozen shape violated). */
export class OutputCapReportError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'OutputCapReportError';
  }
}

/** cellContext malformed (unknown mode, wrong type). */
export class OutputCapContextError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'OutputCapContextError';
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Modes required by the per-mode cap schema (A-μ1). @type {ReadonlyArray<string>} */
export const REQUIRED_MODES = Object.freeze(['A', 'B', 'C', 'L']);

/** 1 MiB — pre-read (stat) and post-read guards must share this bound. */
const MAX_CAP_PARAMETER_BYTES = 1024 * 1024;

/**
 * Default cap-parameter artifact path — resolved module-relative so that
 * the shipped config/output-cap-parameter.json bundled with this plugin
 * works on any clean checkout of claude-marketplace without requiring the
 * governance sub-tree to be present.
 *
 * The governance derivation record (authoritative provenance) lives at
 * governance/requirements/REQ-20260716-d904-04/tests/output-cap-parameter.json
 * and is byte-identical to this shipped copy at publish time.
 *
 * Override via env CAP_PARAMETER_PATH — see resolveCapParameterPath.
 */
export const DEFAULT_CAP_PARAMETER_PATH = fileURLToPath(
  new URL('../config/output-cap-parameter.json', import.meta.url),
);

/**
 * Truncation-marker prefix. Exported so tests/consumers IMPORT it rather
 * than inlining a copy (MISTAKES 2026-07-15 gate-inlines-production-copy).
 */
export const TRUNCATION_MARKER_PREFIX = '[OUTPUT-CAP TRUNCATED';

/**
 * Mode label used when cellContext is null (least-aggressive cap; null-signal
 * rule). Exported so consumers/tests import it rather than hardcoding the string.
 */
export const NULL_CONTEXT_MODE_LABEL = 'null-context-max';

/**
 * Severity → rank for severity-desc ordering (lower rank = kept longer).
 * UNCLASSIFIED_RANK sits ABOVE P3: null/unknown severity is "unclassified,
 * not safest-to-drop" (null-signal rule).
 * @type {Readonly<Record<string, number>>}
 */
const SEVERITY_RANK = Object.freeze({ P0: 0, P1: 1, P2: 2, P3: 4 });
const UNCLASSIFIED_RANK = 3;

// ---------------------------------------------------------------------------
// Cap-parameter loading (A-μ1 per-mode schema)
// ---------------------------------------------------------------------------

/**
 * Resolve the cap-parameter artifact path: env CAP_PARAMETER_PATH override
 * → module-relative shipped config plugins/eng-org/config/output-cap-parameter.json
 * (absolute path; independent of CWD, works on any clean checkout of
 * claude-marketplace without the governance sub-tree).
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {string} absolute path
 */
export function resolveCapParameterPath(env = process.env) {
  const override = env.CAP_PARAMETER_PATH;
  if (typeof override === 'string' && override.trim() !== '') {
    return path.resolve(override);
  }
  return DEFAULT_CAP_PARAMETER_PATH;
}

/**
 * Load + validate the tl-bench per-mode cap-parameter artifact (A-μ1).
 * Fail-loud: missing file, invalid JSON, or schema violation each throw
 * CapParameterError. NEVER falls back to a hardcoded literal.
 *
 * @param {string} capParameterPath
 * @returns {Readonly<{schemaVersion: 1, granularity: 'per-mode',
 *   multiplier: number, capByMode: Readonly<Record<string, number>>,
 *   source: object|null}>}
 */
export function loadCapParameter(capParameterPath) {
  if (typeof capParameterPath !== 'string' || capParameterPath.trim() === '') {
    throw new CapParameterError('capParameterPath must be a non-empty string');
  }
  let st;
  try {
    st = statSync(capParameterPath);
  } catch (err) {
    throw new CapParameterError(
      `cap-parameter artifact missing or unreadable: ${capParameterPath} (${err.code ?? err.message})`,
    );
  }
  if (!st.isFile()) {
    throw new CapParameterError(
      `cap-parameter path is not a regular file: ${capParameterPath}`,
    );
  }
  if (st.size > MAX_CAP_PARAMETER_BYTES) {
    throw new CapParameterError(
      `cap-parameter file exceeds 1 MiB sanity bound (${st.size} bytes): ${capParameterPath}`,
    );
  }
  let raw;
  try {
    raw = readFileSync(capParameterPath, 'utf8');
  } catch (err) {
    throw new CapParameterError(
      `cap-parameter artifact missing or unreadable: ${capParameterPath} (${err.code ?? err.message})`,
    );
  }
  if (raw.length > MAX_CAP_PARAMETER_BYTES) {
    // Defense-in-depth: post-read length guard (statSync size is pre-read; keep both).
    throw new CapParameterError(
      `cap-parameter file exceeds 1 MiB sanity bound (${raw.length} bytes): ${capParameterPath}`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new CapParameterError(
      `cap-parameter artifact is not valid JSON: ${capParameterPath} (${err.message})`,
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CapParameterError(`cap-parameter artifact must be a JSON object: ${capParameterPath}`);
  }
  if (parsed.schema_version !== 1) {
    throw new CapParameterError(
      `cap-parameter schema_version must be 1, got ${JSON.stringify(parsed.schema_version)}: ${capParameterPath}`,
    );
  }
  if (parsed.granularity !== 'per-mode') {
    throw new CapParameterError(
      `cap-parameter granularity must be "per-mode", got ${JSON.stringify(parsed.granularity)}: ${capParameterPath}`,
    );
  }
  const capByMode = parsed.cap_by_mode;
  if (capByMode === null || typeof capByMode !== 'object' || Array.isArray(capByMode)) {
    throw new CapParameterError(`cap-parameter cap_by_mode must be an object: ${capParameterPath}`);
  }
  const frozen = {};
  for (const mode of REQUIRED_MODES) {
    const v = capByMode[mode];
    if (!Number.isInteger(v) || v <= 0) {
      throw new CapParameterError(
        `cap-parameter cap_by_mode.${mode} must be a positive integer, got ${JSON.stringify(v)}: ${capParameterPath}`,
      );
    }
    frozen[mode] = v;
  }
  if (
    typeof parsed.multiplier !== 'number'
    || !Number.isFinite(parsed.multiplier)
    || parsed.multiplier <= 0
  ) {
    throw new CapParameterError(
      `cap-parameter multiplier must be a positive finite number, got ${JSON.stringify(parsed.multiplier)}: ${capParameterPath}`,
    );
  }
  return Object.freeze({
    schemaVersion: 1,
    granularity: 'per-mode',
    multiplier: parsed.multiplier, // provenance-only metadata; caps in capByMode are pre-computed at derivation time — multiplier is NOT consumed in cap math here.
    capByMode: Object.freeze(frozen),
    source: parsed.source ?? null,
  });
}

// ---------------------------------------------------------------------------
// Token projection (deterministic heuristic — no tokenizer dependency)
// ---------------------------------------------------------------------------

/**
 * Deterministic token projection: ceil(chars / 4). A projection heuristic
 * over the serialized report — NOT a claim of tokenizer parity. Chosen so
 * the cap is enforceable with zero non-stdlib imports and byte-identical
 * results across runs/machines.
 *
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (typeof text !== 'string') {
    throw new TypeError(`estimateTokens expects a string, got ${typeof text}`);
  }
  return Math.ceil(text.length / 4);
}

/**
 * Project the emit-size of a report in tokens (verdict + findings + body,
 * serialized deterministically — JSON.stringify preserves insertion order).
 *
 * @param {string} verdict
 * @param {Array<object>} findings
 * @param {string} body
 * @returns {number}
 */
function projectTokens(verdict, findings, body) {
  return estimateTokens(JSON.stringify({ verdict, findings, body }));
}

/**
 * @param {object} finding
 * @returns {number} severity-desc rank (lower = retained longer).
 */
function severityRank(finding) {
  const norm = normalizeSeverity(finding === null || finding === undefined ? null : finding.severity);
  return norm === null ? UNCLASSIFIED_RANK : SEVERITY_RANK[norm];
}

// ---------------------------------------------------------------------------
// enforceOutputCap
// ---------------------------------------------------------------------------

/**
 * enforceOutputCap(reviewerReport, cellContext[, capParameter])
 *
 * @param {object} reviewerReport - post-derivation report
 *   { verdict, findings: [{id?, severity, category?, planted?, text?, ...}], body: string }
 * @param {object|null} cellContext - { cellId, primaryPlantedFindingId, mode } | null
 * @param {object} [capParameter] - result of loadCapParameter(). When omitted,
 *   loaded from resolveCapParameterPath() (env CAP_PARAMETER_PATH override →
 *   default repo-relative path). Pass explicitly for purity in harnesses/tests.
 * @returns {{report: object, truncated: boolean, capApplied: number, marker: string|null}}
 *
 * Preservation rule: order findings by severity-desc (P0>P1>P2>P3;
 * unclassified above P3); always retain the finding whose
 * id === cellContext.primaryPlantedFindingId (if present — HARD invariant);
 * truncate from the tail until token projection ≤ cap. Emit truncation
 * marker in the returned report.body.
 *
 * Verdict semantics: verdict is NOT recomputed here. reviewerReport.verdict
 * is preserved verbatim (pre-cap derivation, ADR-006 §D-21 gain preserved
 * by construction).
 */
export function enforceOutputCap(reviewerReport, cellContext, capParameter = undefined) {
  // --- H-1 frozen-shape validation (fail-loud, typed) ---
  if (reviewerReport === null || typeof reviewerReport !== 'object' || Array.isArray(reviewerReport)) {
    throw new OutputCapReportError('reviewerReport must be an object');
  }
  if (!Array.isArray(reviewerReport.findings)) {
    throw new OutputCapReportError('reviewerReport.findings must be an array (H-1 frozen Report shape)');
  }
  if (typeof reviewerReport.verdict !== 'string' || reviewerReport.verdict.trim() === '') {
    throw new OutputCapReportError('reviewerReport.verdict must be a non-empty string (H-1 frozen Report shape)');
  }
  if (typeof reviewerReport.body !== 'string') {
    throw new OutputCapReportError('reviewerReport.body must be a string (H-1 frozen Report shape)');
  }
  if (cellContext !== null && (typeof cellContext !== 'object' || Array.isArray(cellContext))) {
    throw new OutputCapContextError('cellContext must be an object or null');
  }

  // --- cap parameter (A-μ1 artifact; never a hardcoded literal) ---
  const param = capParameter ?? loadCapParameter(resolveCapParameterPath());
  if (param === null || typeof param !== 'object' || param.capByMode === null
      || typeof param.capByMode !== 'object') {
    throw new CapParameterError('capParameter must be the result of loadCapParameter() (missing capByMode)');
  }
  for (const mode of REQUIRED_MODES) {
    if (!Number.isInteger(param.capByMode[mode]) || param.capByMode[mode] <= 0) {
      throw new CapParameterError(`capParameter.capByMode.${mode} must be a positive integer`);
    }
  }

  // --- cap resolution via mode (null-signal discipline) ---
  let cap;
  let modeLabel;
  if (cellContext === null) {
    // Unclassified cell: least-aggressive cap (max across modes), warn.
    cap = Math.max(...REQUIRED_MODES.map((m) => param.capByMode[m]));
    modeLabel = NULL_CONTEXT_MODE_LABEL;
    console.warn(
      '[output-cap] WARN: cellContext is null — severity-desc-only ordering; '
      + 'least-aggressive cap (max across modes) applied per null-signal rule '
      + '(MISTAKES 2026-07-15 null-signal-treated-as-safe-default).',
    );
  } else {
    const mode = cellContext.mode;
    if (typeof mode !== 'string'
        || !Object.prototype.hasOwnProperty.call(param.capByMode, mode)) {
      throw new OutputCapContextError(
        `cellContext.mode ${JSON.stringify(mode)} is not a known mode (${REQUIRED_MODES.join('/')}) — `
        + 'unknown mode is never silently defaulted (null-signal rule)',
      );
    }
    cap = param.capByMode[mode];
    modeLabel = mode;
  }
  const primaryId = cellContext === null
    ? null
    : (cellContext.primaryPlantedFindingId ?? null);

  // --- severity-desc stable ordering (input never mutated) ---
  const indexed = reviewerReport.findings.map((f, i) => ({ f, i, rank: severityRank(f) }));
  indexed.sort((a, b) => (a.rank - b.rank) || (a.i - b.i));
  let kept = indexed.map((e) => e.f);

  // M40: warn (do not throw) when primaryPlantedFindingId matches no finding.
  // Findings are still processed normally per severity-desc cap rules.
  if (primaryId !== null && !kept.some(
    (f) => f !== null && typeof f === 'object' && f.id === primaryId,
  )) {
    console.warn(
      `[output-cap] WARN: primaryPlantedFindingId ${JSON.stringify(primaryId)} matches no finding `
      + 'in reviewerReport.findings — recall invariant cannot be enforced; '
      + 'cap applied per severity-desc order (no throw per M40 contract).',
    );
  }

  const verdict = reviewerReport.verdict; // NEVER recomputed (pre-cap derivation)
  const body = reviewerReport.body;

  if (projectTokens(verdict, kept, body) <= cap) {
    return Object.freeze({
      report: { ...reviewerReport, findings: kept, body },
      truncated: false,
      capApplied: cap,
      marker: null,
    });
  }

  // --- truncation marker builder (deterministic; no wall-clock) ---
  const mkMarker = (removedCount) => `\n\n${TRUNCATION_MARKER_PREFIX} — cap=${cap} tokens, `
    + `mode=${modeLabel}, findingsRemoved=${removedCount}. Verdict computed pre-cap and `
    + 'preserved verbatim (output-cap.mjs, REQ-20260716-d904-04).]';

  // --- cull findings from the tail; primary planted ALWAYS retained ---
  // Marker is accounted for during culling (it is mandatory on this branch),
  // so the final projection is ≤ cap except for the irreducible floor:
  // when only unremovable findings remain (primary planted — HARD retention
  // invariant outranks the cap) and floor + marker still exceeds cap, the
  // result stays at that floor.
  let removed = 0;
  while (projectTokens(verdict, kept, body + mkMarker(removed)) > cap) {
    let idx = -1;
    for (let j = kept.length - 1; j >= 0; j -= 1) {
      const candidate = kept[j];
      if (primaryId !== null && candidate !== null && typeof candidate === 'object'
          && candidate.id === primaryId) {
        continue; // HARD invariant: primary planted finding never culled.
      }
      idx = j;
      break;
    }
    if (idx === -1) break; // only unremovable findings left → body truncation next.
    kept = kept.slice(0, idx).concat(kept.slice(idx + 1));
    removed += 1;
  }
  const marker = mkMarker(removed);

  // --- body truncation until projection fits (converges: keepChars strictly decreases) ---
  let keepChars = body.length;
  while (keepChars > 0) {
    const proj = projectTokens(verdict, kept, body.slice(0, keepChars) + marker);
    if (proj <= cap) break;
    keepChars = Math.max(0, keepChars - Math.max(1, (proj - cap) * 4));
  }
  const finalBody = body.slice(0, keepChars) + marker;

  return Object.freeze({
    report: { ...reviewerReport, findings: kept, body: finalBody },
    truncated: true,
    capApplied: cap,
    marker,
  });
}
