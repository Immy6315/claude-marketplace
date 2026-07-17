#!/usr/bin/env node
/**
 * verdict-lint.mjs — mechanical enforcement of the derived-verdict rule
 * (REPORT_DIET.md §G.1) for eng-org reviewer reports.
 *
 * REQ-20260713-d904-03 TASK-2. Enforcement successor to REQ-20260712-d904-03's
 * §G guidance-only mapping.
 *
 * REQ-20260715-d904-02 TASK-1 (cand-8). Patched `computeDerivedVerdict` with
 * category-aware WARN-ceiling pass (REPORT_DIET.md §G.1.a). Extended
 * `parseFrontmatter` to read `category` and `blast_radius` per-finding fields.
 * Extended `parseReviewFile` and `parseGrReview` to plumb categories + evidence
 * into `computeDerivedVerdict`. Both files ship together per ADR-003 R-20.
 *
 * REQ-20260715-d904-02 fix-iteration-1 (cand-8 / fresh dev §H.43). Removed
 * free-text BLAST_RADIUS_MARKERS escape channel; ceiling escape is now ONLY
 * `blast_radius: true` frontmatter (blastRadiusFlags[i] === true). Evidence
 * param retained for signature stability (zero call-site changes). REPORT_DIET.md
 * §G.1.a updated in same commit per ADR-003 R-20.
 *
 * CLI usage:
 *   node scripts/verdict-lint.mjs --req-dir <path> [--include-gr] [--format text|json]
 *   node scripts/verdict-lint.mjs --single-file <path> [--format text|json]
 *
 * Exit codes:
 *   0 — all reviewed files PASS (derived == declared) or SKIP-with-warning.
 *   1 — one or more POLICY VIOLATIONS (declared verdict disagrees with derived).
 *   2 — CLI-usage error (missing/invalid flags, unreadable path).
 *
 * Pure core: computeDerivedVerdict, normalizeSeverity, parseReviewFile,
 * lintFile, lintDir are pure functions (or IO-boundary functions that thread
 * state through parameters). No mutable module state.
 *
 * Constraints (MISTAKES-informed):
 *   - JSDoc typedef for closed-set fields (Verdict, Severity, LintStatus).
 *   - No `any` inference; JSDoc @typedef and @returns everywhere.
 *   - Redaction: never emit raw finding `text` fields (CONSTITUTION §A).
 *   - Parse-fail is SKIP-not-FAIL (never over-fires on legacy formats).
 *   - No import outside node stdlib.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// JSDoc typedefs (MISTAKES 2026-07-11 code-quality closed-set-string regression)
// ---------------------------------------------------------------------------

/** @typedef {'BLOCK'|'NEEDS-CHANGES'|'APPROVE'} Verdict */
/** @typedef {'P0'|'P1'|'P2'|'P3'} Severity */
/** @typedef {'PASS'|'FAIL'|'SKIP'} LintStatus */

/**
 * Canonical severity vocabulary mapping — mirrors REPORT_DIET.md §H
 * vocabulary alignment table. Case-insensitive lookup by callers.
 *
 * @type {Readonly<Record<string, Severity>>}
 */
const SEVERITY_MAP = Object.freeze({
  'critical': 'P0',
  'p0':       'P0',
  'blocker':  'P0',
  'high':     'P1',
  'p1':       'P1',
  'medium':   'P2',
  'p2':       'P2',
  'concern':  'P2',
  'low':      'P3',
  'p3':       'P3',
  'nit':      'P3',
});

// ---------------------------------------------------------------------------
// Category-ceiling constants (REQ-20260715-d904-02 TASK-1, cand-8)
// REPORT_DIET.md §G.1.a Category-ceiling table — category → ceiling verdict.
// ---------------------------------------------------------------------------

/**
 * Categories that receive a WARN ceiling (P0/P1 → P2 unless blast-radius fires).
 * A finding is WARN-capped when its category is in this set AND its frontmatter
 * does NOT carry `blast_radius: true` (REPORT_DIET.md §G.1.a, enforced here).
 * Evidence text is NOT consulted — the sole escape is blastRadiusFlags[i] === true
 * (fix-iteration-1, REQ-20260715-d904-02).
 *
 * @type {ReadonlySet<string>}
 */
export const CEILING_CATEGORIES = Object.freeze(new Set([
  'perf',
  'memory-leak',
  'leak',
  'broken-pagination',
  'pagination',
  'n+1',
  'missing-index',
]));

/**
 * Categories that BYPASS the ceiling entirely — no ceiling applied regardless
 * of severity. Security-category findings always derive by max-severity
 * (REPORT_DIET.md §G.1.a explicit bypass row).
 *
 * @type {ReadonlySet<string>}
 */
export const BYPASS_CATEGORIES = Object.freeze(new Set([
  'security',
  'sql-injection',
  'idor',
  'missing-auth',
  'race-condition',
  'secret-in-logs',
]));

/**
 * SENTINEL_SET (fix-iter-5, REQ-20260715-d904-03) — run-level security sentinel.
 * The union of the frontmatter BYPASS_CATEGORIES set and the deriver's own
 * security-adjacent output vocabulary (from CATEGORY_KEYWORDS security rows
 * 0, 3, 4, 5, 6, 7). When ANY finding in a run has a derived category in this
 * set (OR a claim/fileLine text that POSITIVELY matches BYPASS_CATEGORIES_TEXT),
 * the companion-cap pass is skipped for the ENTIRE run — the run is treated
 * as security-relevant and no null-cat P0/P1 findings are downgraded.
 *
 * This closes the fix-3/fix-4 dilemma: fix-3's per-finding negative-veto approach
 * missed novel security vocabulary; fix-4's per-finding positive-CEILING gate blocked
 * documentation-vocab FIX-cell companions. The run-level sentinel identifies the
 * security context ONCE and skips the whole cap — orthogonal to per-finding vocab.
 *
 * DO NOT add novel security vocab (CSRF/XSS/etc.) here — the correct long-term fix
 * is D-13 Option A (findings.json explicit category column). See TL-fix5-decision.md.
 *
 * @type {ReadonlySet<string>}
 */
const SENTINEL_SET = Object.freeze(new Set([
  ...BYPASS_CATEGORIES,
  'injection', 'ownership', 'authz', 'secrets', 'race-condition',
]));

/**
 * Compiled regex over all CEILING_CATEGORIES vocabulary — RETAINED for documentation
 * of the deriver's CEILING vocabulary and as a reference for BYPASS_CATEGORIES_TEXT
 * construction. No longer used as the load-bearing companion-cap gate (fix-iter-4
 * positive-match gate was superseded by the run-level sentinel in fix-iter-5,
 * REQ-20260715-d904-03). Kept in place to avoid touching REPORT_DIET.md §G.1.a
 * byte-count (R-20 anchor-table byte-agreement preserved).
 *
 * Patterns are taken verbatim from the CEILING-class rows of CATEGORY_KEYWORDS (rows 1, 2, 8,
 * 9, 10 of the bench prefix and rows 11, 12 of the plugin extension), so R-21 parity is
 * preserved by construction.
 *
 * Covers: n+1 | missing-index (bench+plugin) | memory-leak | broken-pagination | perf (bench+plugin).
 * NOTE: text-signal only; NEVER classifies the finding; NEVER emitted to output (CONSTITUTION §A).
 */
const CEILING_CATEGORIES_TEXT = /n\+1|per-row (?:lookup|quer)|missing index|memory leak|unbounded (?:cache|growth|listener)|listener leak|never (?:removed|evicted)|paginat|off-by-one (?:page|offset)|\boffset\b.{0,40}\blimit\b|duplicate (?:rows|page)|performance|\bperf\b|quadratic|slow quer|\bunindexed\b|full table scan|hottest endpoint/i;

/**
 * Compiled regex over all BYPASS_CATEGORIES vocabulary — kept as a SECONDARY VETO (belt-and-
 * braces) in computeDerivedVerdictWithMeta (fix-iter-3, REQ-20260715-d904-03; retained in
 * fix-iter-4 as defence-in-depth only).
 * Mirrors the union of CATEGORY_KEYWORDS security-adjacent rows (rows 0, 3, 4, 5, 6, 7) VERBATIM.
 * NOTE: this veto is NOT the load-bearing gate in fix-iter-4 (positive CEILING match is).
 * NEVER emitted to output (CONSTITUTION §A).
 */
const BYPASS_CATEGORIES_TEXT = /sql injection|sqli|unparameteri[sz]ed|injection|ownership|owner check|\bidor\b|insecure direct object|object-level authori[sz]|authori[sz]|auth check|missing auth|\bauthz\b|secret|api key|credential|token leak|race condition|race-condition|non-atomic|read-modify-write|check-then-act|\btoctou\b|unauthenticated|unauthorized|privilege escalation/i;

// BLAST_RADIUS_MARKERS removed (REQ-20260715-d904-02 fix-iteration-1).
// Free-text evidence scanning is no longer an escape channel. The ONLY
// blast-radius escape is explicit `blast_radius: true` frontmatter on the
// finding row (blastRadiusFlags[i] === true). See REPORT_DIET.md §G.1.a
// and ADR-003 §D-11. Rationale: defect descriptions inherently contain
// blast-radius-sounding vocabulary ("unbounded", "full table scan", "hot-path"),
// causing the old marker set to collide with the very FIX-cell evidence text
// the ceiling was designed to cap — confirmed by §D-12 pre-gate FAIL (1/3 flips).

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Normalize a severity token to the canonical P-level.
 *
 * @param {string} token
 * @returns {Severity|null} — null when the token is not in the map.
 */
export function normalizeSeverity(token) {
  if (typeof token !== 'string') return null;
  const t = token.trim().toLowerCase();
  return /** @type {Severity|null} */ (SEVERITY_MAP[t] ?? null);
}

/**
 * Test whether blast-radius escape fires for a finding.
 * Returns true ONLY when frontmatter `blast_radius: true` is explicitly set.
 * Evidence text NO LONGER affects this result (fix-iteration-1,
 * REQ-20260715-d904-02): the free-text marker channel has been removed because
 * defect-description vocabulary ("unbounded", "full table scan", "hot-path")
 * collides with the FIX-cell evidence the ceiling is designed to cap.
 * A reviewer with genuine blast-radius justification must declare it explicitly
 * via `blast_radius: true` frontmatter (documented in REPORT_DIET.md §G.1.a).
 *
 * The `evidence` parameter is accepted for signature stability (callers
 * continue to pass it; no call-site changes required) but is IGNORED.
 *
 * @param {string|null|undefined} _evidence — IGNORED (kept for signature stability; renamed to _evidence per GR P3 #5/#6).
 * @param {boolean} blastRadiusFrontmatter — value of finding `blast_radius:` field.
 * @returns {boolean}
 */
function blastRadiusFires(_evidence, blastRadiusFrontmatter) {
  // _evidence param intentionally unused — free-text channel removed (fix-iteration-1,
  // REQ-20260715-d904-02). Renamed _evidence per GR carry-forward P3 #5/#6.
  return blastRadiusFrontmatter === true;
}

/**
 * Compute the derived verdict from a set of severity tokens, with optional
 * category-aware WARN-ceiling pass applied BEFORE max-severity aggregation.
 *
 * Category-resolution order (deterministic, per REPORT_DIET.md §G.1.a):
 *   1. Explicit `category:` field on the finding row (caller-supplied via
 *      `categories[i]`). WINS over path-derived.
 *   2. null fall-through — no ceiling applied; existing max-severity rule
 *      preserves current behavior byte-for-byte (AC-10 backward compat).
 *
 * Path-derived heuristic (for corpus/<slug>/ findings) and fixture-context
 * channel (for runs/<id>/findings.json where frontmatter category is null)
 * are the CALLER'S responsibility — the pre-gate script (TASK-4) plumbs this
 * by supplying the correct categories array. This function is pure and does
 * not perform I/O or category lookup.
 *
 * Category-ceiling pass (REPORT_DIET.md §G.1.a, enforced here):
 *   - categories[i] ∈ CEILING_CATEGORIES AND severities[i] ∈ {P0,P1} AND
 *     blast-radius does NOT fire → downgrade to P2.
 *   - categories[i] ∈ CEILING_CATEGORIES AND severities[i] === P2 → no-op
 *     (already at ceiling).
 *   - categories[i] ∈ CEILING_CATEGORIES AND blast-radius FIRES (i.e.
 *     blastRadiusFlags[i] === true) → severity stays unchanged (legitimate
 *     high-severity perf/leak/pagination BLOCK is preserved).
 *   - categories[i] ∈ BYPASS_CATEGORIES → no ceiling (security always bypasses).
 *   - categories[i] === null or unknown → no ceiling (fall-through, current
 *     behavior preserved).
 *
 * After ceiling pass, max-severity aggregation runs unchanged:
 *   - P0 ∈ S OR P1 ∈ S → BLOCK
 *   - else P2 ∈ S      → NEEDS-CHANGES
 *   - else S = {P3}    → APPROVE
 *   - else S = {}      → APPROVE
 *
 * Backward-compatibility guarantee: `computeDerivedVerdict(severities)` with
 * no `categories` or `evidence` argument behaves IDENTICALLY to the pre-patch
 * 1-arg form. categories === undefined or evidence === undefined → treated as
 * all-null → fall-through → max-severity rule only.
 *
 * CONSTITUTION §A: evidence array is NEVER logged, NEVER added to any return
 * object, NEVER emitted to formatText output. As of fix-iter-1, it is also
 * NEVER used for derivation logic — the `blast_radius: true` frontmatter flag
 * (blastRadiusFlags[i]) is the SOLE escape from the ceiling.
 *
 * @param {ReadonlyArray<Severity>} severities — normalized P-level severity per finding.
 * @param {ReadonlyArray<string|null>|undefined} [categories] — category per finding (same length); null = no ceiling.
 * @param {ReadonlyArray<string|null>|undefined} [evidence] — IGNORED (kept for signature stability; free-text blast-radius channel removed in fix-iter-1).
 * @param {ReadonlyArray<boolean>|undefined} [blastRadiusFlags] — per-finding `blast_radius: true` frontmatter boolean (same length).
 * @returns {Verdict|null} — null on unreachable-branch (should not happen given normalization).
 */
export function computeDerivedVerdict(severities, categories, evidence, blastRadiusFlags) {
  return computeDerivedVerdictWithMeta(severities, categories, evidence, blastRadiusFlags).verdict;
}

/**
 * Internal variant of computeDerivedVerdict that also returns observability metadata.
 * Used by parseReviewFile to thread ceiling-cap, pcc-companion-cap, and escape-hatch
 * counts into the lintFile result for formatText annotation (OBS-1, OBS-2, OBS-3).
 *
 * Compute the derived verdict from a set of severity tokens, with optional
 * category-aware WARN-ceiling pass applied BEFORE max-severity aggregation.
 * Also applies the run-scoped null-category companion cap (Fix-A,
 * REQ-20260715-d904-03 fix-iter-1, Sub-cause A companion-cap) with the
 * run-level security sentinel introduced in fix-iter-5.
 *
 * PCC (run-primary-ceiling-category) gate:
 *   pcc = true  iff ANY finding[i] has catLower !== null && catLower ∈ CEILING_CATEGORIES.
 *   When pcc === true AND sentinelFired === false, a null-category finding with
 *   sev ∈ {P0, P1} is downgraded to P2. The per-finding BYPASS_CATEGORIES_TEXT
 *   veto (belt-and-braces) is also applied.
 *   When pcc === false → companion-cap pass is a strict no-op.
 *   When sentinelFired === true → companion-cap pass is skipped for the ENTIRE run.
 *
 * SENTINEL (run-level, fix-iter-5):
 *   sentinelFired = true  iff ANY finding[i] has catLower ∈ SENTINEL_SET  OR
 *                              its claim/fileLine text POSITIVELY matches BYPASS_CATEGORIES_TEXT.
 *   SENTINEL_SET = BYPASS_CATEGORIES ∪ {injection, ownership, authz, secrets, race-condition}
 *   (the deriver's own security-adjacent output vocabulary from CATEGORY_KEYWORDS rows 0/3/4/5/6/7).
 *   When sentinelFired === true, the companion-cap is skipped for the ENTIRE run — the run is
 *   treated as security-relevant and no null-cat P0/P1 finding may be downgraded.
 *
 * // SECURITY INVARIANT (REQ-20260715-d904-03 fix-iter-5 — run-level sentinel):
 * // The null-category companion cap fires ONLY when:
 * //   (1) at least one finding in THIS invocation carries a category ∈ CEILING_CATEGORIES (pcc === true), AND
 * //   (2) the sentinel did NOT fire (no finding has catLower ∈ SENTINEL_SET AND no finding text
 * //       matches BYPASS_CATEGORIES_TEXT).
 * // When the sentinel fires, the ENTIRE companion-cap pass is skipped — no individual finding
 * // in the run is downgraded regardless of its own category or text.
 * // This closes fix-4's criterion-(a) regression: documentation/standards null-cat P1 companions
 * // in FIX cells are now capped (pcc=true, sentinel=false), while security runs are protected
 * // by the sentinel firing on the enumerated security findings they always contain.
 * // KNOWN LIMITATION: a run whose ONLY security finding uses NOVEL vocabulary (CSRF/XSS/SSRF/
 * // session-fixation etc.) AND that run ALSO contains a CEILING companion will see the sentinel
 * // NOT fire (novel vocab not in SENTINEL_SET and text may not match BYPASS_CATEGORIES_TEXT) →
 * // companion-cap fires → the novel security finding may be downgraded. Empirical exposure in
 * // cand-5..8 corpus: 0 occurrences. Correct long-term fix: D-13 Option A (findings.json
 * // explicit category column). See TL-fix5-decision.md.
 * // DO NOT relax the pcc gate or the sentinel without re-running
 * // pregate-cand9-harness.mjs and confirming 0/47 CEILING hits on security fixtures.
 *
 * @param {ReadonlyArray<Severity>} severities
 * @param {ReadonlyArray<string|null>|undefined} [categories]
 * @param {ReadonlyArray<string|null>|undefined} [evidence]
 * @param {ReadonlyArray<boolean>|undefined} [blastRadiusFlags]
 * @returns {{verdict: Verdict|null, cappedCount: number, companionCappedCount: number, escapedCount: number, pccFired: boolean, unknownCatCount: number}}
 */
function computeDerivedVerdictWithMeta(severities, categories, evidence, blastRadiusFlags) {
  if (!Array.isArray(severities)) return { verdict: null, cappedCount: 0, companionCappedCount: 0, escapedCount: 0, pccFired: false, unknownCatCount: 0 };

  const hasCats = Array.isArray(categories) && categories.length > 0;
  const hasEvidence = Array.isArray(evidence);
  const hasBlastFlags = Array.isArray(blastRadiusFlags);

  // OBS-1: separate ceiling-cap count from companion-cap count.
  let cappedCount = 0;           // findings downgraded by explicit CEILING category
  let companionCappedCount = 0;  // null-category findings downgraded by pcc companion-cap
  let escapedCount = 0;
  // OBS-3: count of null/unknown-category findings (useful for corpus health signal).
  let unknownCatCount = 0;

  // Preliminary walk: pcc AND sentinelFired — O(n).
  // pcc = "run has a P0/P1 CEILING-classified finding" (fix-iter-5: restricted to P0/P1 severity so
  //   that a P2 CEILING finding in a companion role does not trigger companion-capping of unrelated
  //   null-cat findings — a P2 companion is already within the WARN ceiling and is not a primary
  //   ceiling driver).
  // sentinelFired (fix-iter-5) = "run has a known SECURITY-classified finding, either
  //   by derived-cat ∈ SENTINEL_SET OR by claim/fileLine text matching BYPASS_CATEGORIES_TEXT".
  // When sentinelFired, skip the null-cat companion-cap for the WHOLE run.
  // Cannot break early: must walk full array to correctly determine BOTH pcc and sentinelFired.
  let pcc = false;
  let sentinelFired = false;
  if (hasCats) {
    for (let i = 0; i < severities.length; i++) {
      const cat = (categories[i] !== undefined ? categories[i] : null);
      const catLower = typeof cat === 'string' ? cat.toLowerCase() : null;
      // pcc restricted to P0/P1 CEILING findings (fix-iter-5): a P2 perf/leak companion is already
      // below the WARN ceiling and must NOT trigger companion-capping of unrelated null-cat findings.
      if (catLower !== null && CEILING_CATEGORIES.has(catLower) && (severities[i] === 'P0' || severities[i] === 'P1')) pcc = true;
      if (catLower !== null && SENTINEL_SET.has(catLower)) sentinelFired = true;
      if (!sentinelFired && hasEvidence) {
        const evText = (evidence[i] !== undefined && evidence[i] !== null) ? String(evidence[i]) : '';
        if (evText !== '' && BYPASS_CATEGORIES_TEXT.test(evText)) sentinelFired = true;
      }
      // Cannot break early: must walk full array to correctly determine BOTH pcc and sentinelFired.
    }
  }

  // First pass: compute per-index post-cap severity into postCap[].
  // Cannot mutate a Set entry after insertion, so we compute a postCap array
  // first (Fix-iteration chunk-first two-pass strategy per MISTAKES F2).
  /** @type {Array<Severity>} */
  const postCap = [];

  for (let i = 0; i < severities.length; i++) {
    const sev = severities[i];
    if (sev !== 'P0' && sev !== 'P1' && sev !== 'P2' && sev !== 'P3') continue;

    // Category-ceiling pass (§G.1.a): only runs when categories are supplied.
    if (hasCats) {
      const cat = (categories[i] !== undefined ? categories[i] : null);
      const catLower = typeof cat === 'string' ? cat.toLowerCase() : null;

      // Bypass categories: security-class always passes through unchanged.
      if (catLower !== null && BYPASS_CATEGORIES.has(catLower)) {
        postCap.push(sev);
        continue;
      }

      // Ceiling categories: apply WARN cap unless blast-radius fires.
      if (catLower !== null && CEILING_CATEGORIES.has(catLower)) {
        // Only P0/P1 need downgrading; P2/P3 are already at or below ceiling.
        if (sev === 'P0' || sev === 'P1') {
          const brf = hasBlastFlags ? (blastRadiusFlags[i] === true) : false;
          if (blastRadiusFires(undefined, brf)) {
            // Blast-radius fires: legitimate high-severity; preserve original sev.
            escapedCount++;
            postCap.push(sev);
          } else {
            // Ceiling applies: downgrade P0/P1 to P2. OBS-1: ceiling cap.
            cappedCount++;
            postCap.push('P2');
          }
          continue;
        }
        // P2 or P3 in a ceiling category: no-op (already at or below ceiling).
        postCap.push(sev);
        continue;
      }

      // null or unknown category.
      if (catLower === null) {
        unknownCatCount++; // OBS-3: count unknown/unclassified categories.

        // Companion-cap (fix-iter-5): fire when pcc=true AND sentinel did NOT fire on this run.
        // Removed fix-4's CEILING_CATEGORIES_TEXT positive-match requirement — that gate
        // blocked FIX-cell documentation-vocab companions (criterion (a) fail).
        // Retained BYPASS_CATEGORIES_TEXT per-finding veto as belt-and-braces on the tiny
        // residual (per-finding secondary defense — see TL-fix5-decision.md residual analysis).
        if (pcc && !sentinelFired && (sev === 'P0' || sev === 'P1')) {
          const evText = hasEvidence
            ? (evidence[i] !== undefined && evidence[i] !== null ? String(evidence[i]) : '')
            : '';
          const textSignalsSecurity = evText !== '' && BYPASS_CATEGORIES_TEXT.test(evText);
          if (!textSignalsSecurity) {
            // OBS-1: companion-cap fires; tracked separately from ceiling caps.
            companionCappedCount++;
            postCap.push('P2');
            continue;
          }
          // Per-finding security-vocab veto fired: preserve original severity.
        }
      }

      // null/unknown category with pcc===false OR sentinelFired OR sev already P2/P3 OR text signals security:
      // fall-through to current max-severity rule.
      postCap.push(sev);
      continue;
    }

    // No categories supplied (backward-compat 1-arg form): current max-severity rule.
    postCap.push(sev);
  }

  // Second pass: build severity Set from postCap[].
  /** @type {Set<Severity>} */
  const s = new Set();
  for (const sv of postCap) s.add(sv);

  let verdict = /** @type {Verdict|null} */ (null);
  if (s.has('P0') || s.has('P1')) verdict = 'BLOCK';
  else if (s.has('P2')) verdict = 'NEEDS-CHANGES';
  else verdict = 'APPROVE';

  return { verdict, cappedCount, companionCappedCount, escapedCount, pccFired: pcc, unknownCatCount };
}

// ---------------------------------------------------------------------------
// Minimal frontmatter parser (hand-rolled — no YAML dep)
// ---------------------------------------------------------------------------

/**
 * Extract the YAML frontmatter block (between first two `---` lines) from a
 * markdown file's content string. Returns the raw frontmatter body without
 * the fence lines.
 *
 * @param {string} content
 * @returns {string|null} — null when no frontmatter found.
 */
function extractFrontmatter(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { end = i; break; }
  }
  if (end < 0) return null;
  return lines.slice(1, end).join('\n');
}

/**
 * Parse a minimal subset of YAML sufficient for REPORT_DIET.md §B.1:
 *   - top-level `key: value` scalars (string, number, boolean).
 *   - top-level `findings:` array whose items are mappings of `field: value`.
 * Reads per-finding fields: `severity`, `category`, `blast_radius`, `text`.
 * Ignores indented comments, unknown top-level keys, and anything more
 * complex. Returns { verdict, verdictDerived, findings, parseOk, skipReason }.
 *
 * REQ-20260715-d904-02 TASK-1 (cand-8): extended to read `category` (string)
 * and `blast_radius` (boolean) per-finding continuation fields, following the
 * existing `severity` continuation-field pattern at `contField` regex. The
 * `text` field is accepted for signature stability with the removed regex
 * channel (fix-iteration-1; REQ-20260715-d904-02) and is IGNORED by derivation
 * logic; it MUST NOT be emitted to any output (CONSTITUTION §A redaction).
 *
 * @param {string} frontmatter
 * @returns {{verdict: string|null, verdictDerived: boolean|null, findings: Array<{severity: string|null, category: string|null, blastRadius: boolean, text: string|null}>, parseOk: boolean, skipReason?: string}}
 */
function parseFrontmatter(frontmatter) {
  const lines = frontmatter.split(/\r?\n/);
  /** @type {string|null} */ let verdict = null;
  /** @type {boolean|null} */ let verdictDerived = null;
  /** @type {Array<{severity: string|null, category: string|null, blastRadius: boolean, text: string|null}>} */ const findings = [];

  let inFindings = false;
  /** @type {{severity: string|null, category: string|null, blastRadius: boolean, text: string|null}|null} */ let currentFinding = null;

  for (const raw of lines) {
    // Strip comments (# to end of line) — but only when the `#` is NOT inside a
    // quote pair. Quote-aware guard: if the raw line contains a quote-enclosed value
    // (single or double), do not strip `#` characters that appear inside the quotes.
    // Implementation: check whether the match position lies inside a quoted token;
    // if so, skip stripping. Simple heuristic: count open-quote chars before the `#`.
    // This resolves cand-8 GR P3 #4/#8 carry-forward (comment/implementation mismatch).
    const line = raw.replace(/(\s+#.*)$/, (match, _, offset) => {
      // Count unescaped quote characters before the `#` position in the raw string.
      const before = raw.slice(0, offset);
      const singleQuotes = (before.match(/'/g) || []).length;
      const doubleQuotes = (before.match(/"/g) || []).length;
      // If inside a quote pair (odd count of either), the `#` is a value character — preserve it.
      if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) return match;
      // Outside quotes: strip the comment (original behaviour).
      return '';
    });

    if (/^findings:\s*$/.test(line)) {
      inFindings = true;
      currentFinding = null;
      continue;
    }

    // Top-level key (no leading whitespace).
    const topLevel = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (topLevel) {
      // Only exit findings mode when we see a NEW top-level (unindented) key.
      inFindings = false;
      currentFinding = null;
      const key = topLevel[1];
      const val = topLevel[2].trim();
      if (key === 'verdict') {
        // Strip quotes if any.
        verdict = val.replace(/^['"]|['"]$/g, '') || null;
      } else if (key === 'verdict_derived') {
        if (val === 'true') verdictDerived = true;
        else if (val === 'false') verdictDerived = false;
      }
      continue;
    }

    if (inFindings) {
      // Item start: `  - field: value` or `- field: value`
      const itemStart = line.match(/^\s*-\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
      if (itemStart) {
        currentFinding = { severity: null, category: null, blastRadius: false, text: null };
        findings.push(currentFinding);
        const fieldName = itemStart[1];
        const fieldVal = itemStart[2].trim().replace(/^['"]|['"]$/g, '') || null;
        if (fieldName === 'severity') {
          currentFinding.severity = fieldVal;
        } else if (fieldName === 'category') {
          currentFinding.category = fieldVal === 'null' ? null : fieldVal;
        } else if (fieldName === 'blast_radius') {
          currentFinding.blastRadius = fieldVal === 'true';
        } else if (fieldName === 'text') {
          // text field: accepted for signature stability with the removed regex channel
          // (fix-iteration-1); IGNORED by derivation logic; NEVER emitted (CONSTITUTION §A).
          currentFinding.text = fieldVal;
        }
        continue;
      }
      // Continuation field of current item: `    field: value`
      const contField = line.match(/^\s{4,}([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
      if (contField && currentFinding) {
        const fieldName = contField[1];
        const fieldVal = contField[2].trim().replace(/^['"]|['"]$/g, '') || null;
        if (fieldName === 'severity') {
          currentFinding.severity = fieldVal;
        } else if (fieldName === 'category') {
          currentFinding.category = fieldVal === 'null' ? null : fieldVal;
        } else if (fieldName === 'blast_radius') {
          currentFinding.blastRadius = fieldVal === 'true';
        } else if (fieldName === 'text') {
          // text field: accepted for signature stability with the removed regex channel
          // (fix-iteration-1); IGNORED by derivation logic; NEVER emitted (CONSTITUTION §A).
          currentFinding.text = fieldVal;
        }
        continue;
      }
    }
  }

  const parseOk = verdict !== null;
  const skipReason = parseOk ? undefined : 'no `verdict:` field';
  return { verdict, verdictDerived, findings, parseOk, skipReason };
}

/**
 * Read a review file and derive its verdict + parse status.
 *
 * REQ-20260715-d904-02 TASK-1 (cand-8): plumbs `categories`, `evidence`, and
 * `blastRadiusFlags` from parsed findings into `computeDerivedVerdict`.
 * As of fix-iteration-1, the `evidence` array is passed for signature stability
 * but is NOT used for derivation logic. It is NEVER exposed in the return object
 * (CONSTITUTION §A redaction).
 *
 * @param {string} filePath — repo-relative or absolute; used only for the report.
 * @param {{content?: string}} [opts] — for testing: pass content directly to skip fs.
 * @returns {{declared: string|null, derived: Verdict|null, severities: Array<Severity>, unknownSeverities: Array<string>, verdictDerived: boolean|null, ok: boolean, skipReason?: string}}
 */
export function parseReviewFile(filePath, opts) {
  let content;
  if (opts && typeof opts.content === 'string') {
    content = opts.content;
  } else {
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      return {
        declared: null, derived: null, severities: [], unknownSeverities: [],
        verdictDerived: null, ok: false, skipReason: `read fail: ${e.code || 'unknown'}`,
      };
    }
  }
  const fm = extractFrontmatter(content);
  if (fm === null) {
    return {
      declared: null, derived: null, severities: [], unknownSeverities: [],
      verdictDerived: null, ok: false, skipReason: 'no frontmatter block',
    };
  }
  const parsed = parseFrontmatter(fm);
  if (!parsed.parseOk) {
    return {
      declared: null, derived: null, severities: [], unknownSeverities: [],
      verdictDerived: null, ok: false, skipReason: parsed.skipReason || 'parseFail',
    };
  }

  /** @type {Array<Severity>} */ const known = [];
  /** @type {Array<string>} */ const unknown = [];
  /** @type {Array<string|null>} */ const categories = [];
  /** @type {Array<string|null>} */ const evidenceTexts = [];
  /** @type {Array<boolean>} */ const blastRadiusFlags = [];

  for (const f of parsed.findings) {
    if (!f.severity) continue;
    const norm = normalizeSeverity(f.severity);
    if (norm) {
      known.push(norm);
      categories.push(f.category !== undefined ? f.category : null);
      // evidence text: passed for signature stability; IGNORED by derivation as of fix-iter-1; NEVER returned.
      evidenceTexts.push(f.text !== undefined ? f.text : null);
      blastRadiusFlags.push(f.blastRadius === true);
    } else {
      unknown.push(f.severity);
    }
  }

  // OBS-3: Emit a loud warning when categories or blastRadiusFlags length diverges from
  // severities length — a caller plumbing bug (parser mis-mapping) would otherwise produce
  // wrong verdicts silently (MISTAKES 2026-07-15 GR F3 / OBS-3).
  if (categories.length !== known.length || blastRadiusFlags.length !== known.length) {
    process.stderr.write(
      `verdict-lint WARNING: array-length mismatch at ${filePath}` +
      ` severities=${known.length} categories=${categories.length}` +
      ` blastRadiusFlags=${blastRadiusFlags.length}` +
      ` — ceiling pass may be incorrect; check parser plumbing\n`,
    );
  }

  const meta = computeDerivedVerdictWithMeta(known, categories, evidenceTexts, blastRadiusFlags);
  // Return shape: verdictDerived propagated for §B.1 contract enforcement in lintFile.
  // cappedCount (OBS-1 ceiling caps) / companionCappedCount (OBS-1 pcc-companion caps) /
  // escapedCount (OBS-2 blast-radius escapes) / pccFired (OBS-2 pcc state) /
  // unknownCatCount (OBS-3 unclassified findings) propagated for formatText annotation.
  // No evidence/category arrays exposed (CONSTITUTION §A redaction).
  return {
    declared: parsed.verdict, derived: meta.verdict, severities: known,
    unknownSeverities: unknown, verdictDerived: parsed.verdictDerived,
    cappedCount: meta.cappedCount, companionCappedCount: meta.companionCappedCount,
    escapedCount: meta.escapedCount, pccFired: meta.pccFired,
    unknownCatCount: meta.unknownCatCount, ok: true,
  };
}

/**
 * Lint a single review file. Returns a per-file result.
 *
 * cappedCount (OBS-1): findings downgraded by explicit CEILING category (separate from companion).
 * companionCappedCount (OBS-1): null-category findings downgraded by pcc companion-cap.
 * escapedCount (OBS-2): findings where blast_radius: true frontmatter fired (ceiling bypassed).
 * pccFired (OBS-2): whether run-primary-ceiling-category gate was true for this invocation.
 * unknownCatCount (OBS-3): count of null/unknown-category findings in the invocation.
 *
 * @param {string} filePath
 * @param {{content?: string}} [opts]
 * @returns {{status: LintStatus, path: string, declared: string|null, derived: Verdict|null, severities: Array<Severity>, reason: string, cappedCount: number, companionCappedCount: number, escapedCount: number, pccFired: boolean, unknownCatCount: number}}
 */
export function lintFile(filePath, opts) {
  const p = parseReviewFile(filePath, opts);
  if (!p.ok) {
    return {
      status: 'SKIP', path: filePath, declared: null, derived: null,
      severities: [], reason: `parseFail: ${p.skipReason || 'unknown'}`,
      cappedCount: 0, companionCappedCount: 0, escapedCount: 0, pccFired: false, unknownCatCount: 0,
    };
  }
  // §B.1 hard-fail: verdict_derived MUST be true (REPORT_DIET §B.1 contract).
  // false or missing = template-validation failure → FAIL (not SKIP).
  if (p.verdictDerived !== true) {
    return {
      status: 'FAIL', path: filePath, declared: p.declared, derived: null,
      severities: [],
      reason: 'verdict_derived must be true (§B.1)',
      cappedCount: 0, companionCappedCount: 0, escapedCount: 0, pccFired: false, unknownCatCount: 0,
    };
  }
  if (p.declared === 'SKIP') {
    // REQ-20260713-d904-03 Change 8b (nit-fix-1): skip-with-note stubs
    // (docs-only / config-only rows, run-reviews.md §Step 2b) are sanctioned
    // signals, not verdicts — SKIP is outside the §G.1 derivation domain.
    // Valid ONLY with zero findings: a SKIP report carrying findings is a
    // softening attempt and FAILs.
    if (p.severities.length === 0 && p.unknownSeverities.length === 0) {
      return {
        status: 'SKIP', path: filePath, declared: p.declared, derived: null,
        severities: [], reason: 'skip-with-note per run-reviews.md §Step 2b',
        cappedCount: 0, companionCappedCount: 0, escapedCount: 0, pccFired: false, unknownCatCount: 0,
      };
    }
    return {
      status: 'FAIL', path: filePath, declared: p.declared, derived: p.derived,
      severities: p.severities,
      reason: 'verdict SKIP with non-empty findings — skip stubs must carry zero findings',
      cappedCount: 0, companionCappedCount: 0, escapedCount: 0, pccFired: false, unknownCatCount: 0,
    };
  }
  if (p.unknownSeverities.length > 0) {
    // Unknown vocab is a warning per REPORT_DIET §H alignment table — SKIP not FAIL.
    return {
      status: 'SKIP', path: filePath, declared: p.declared, derived: p.derived,
      severities: p.severities,
      reason: `unknown severity vocabulary: ${p.unknownSeverities.slice(0, 3).join(',')}`,
      cappedCount: 0, companionCappedCount: 0, escapedCount: 0, pccFired: false, unknownCatCount: 0,
    };
  }
  const cappedCount = typeof p.cappedCount === 'number' ? p.cappedCount : 0;
  const companionCappedCount = typeof p.companionCappedCount === 'number' ? p.companionCappedCount : 0;
  const escapedCount = typeof p.escapedCount === 'number' ? p.escapedCount : 0;
  const pccFired = p.pccFired === true;
  const unknownCatCount = typeof p.unknownCatCount === 'number' ? p.unknownCatCount : 0;
  if (p.declared === p.derived) {
    return {
      status: 'PASS', path: filePath, declared: p.declared, derived: p.derived,
      severities: p.severities, reason: '',
      cappedCount, companionCappedCount, escapedCount, pccFired, unknownCatCount,
    };
  }
  return {
    status: 'FAIL', path: filePath, declared: p.declared, derived: p.derived,
    severities: p.severities,
    reason: `expected ${p.derived}`,
    cappedCount, companionCappedCount, escapedCount, pccFired, unknownCatCount,
  };
}

/**
 * Parse gr-review.md — the disposition table body. Returns a synthetic
 * "findings" set built from CONFIRMED rows only, per REPORT_DIET §G handling.
 *
 * REQ-20260715-d904-02 TASK-1 (cand-8): extended to parse `Category:` or
 * `category:` column from the disposition table (if present) and finding `text`
 * cell. Both are plumbed to `computeDerivedVerdict` categories + evidence arrays.
 * As of fix-iteration-1, evidence text is IGNORED by the ceiling logic; the
 * `text` column is passed for signature stability only (NEVER emitted — CONSTITUTION §A).
 *
 * REQ-20260715-d904-03 TASK-1 (cand-9): when no explicit Category column is
 * present (catIdx < 0) OR the column value normalises to null/empty, calls
 * `deriveCategoryFromText(claimText, fileLineText)` to derive the category from
 * the claim text using the ported bench extractor regex battery. Explicit column
 * value WINS when present and non-empty (forward-compat). Block-layout branch now
 * applies the same helper per-chunk (OQ-7 symmetric fix; chunk-first split preserved
 * per MISTAKES 2026-07-15 GR F2).
 *
 * @param {string} filePath
 * @param {{content?: string}} [opts]
 * @returns {{declared: string|null, derived: Verdict|null, severities: Array<Severity>, ok: boolean, skipReason?: string}}
 */
export function parseGrReview(filePath, opts) {
  let content;
  if (opts && typeof opts.content === 'string') {
    content = opts.content;
  } else {
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      return { declared: null, derived: null, severities: [], ok: false, skipReason: `read fail: ${e.code || 'unknown'}` };
    }
  }
  // Grep for the derivation line in the body.
  const bodyLineRe = /^Verdict: (BLOCK|NEEDS-CHANGES|APPROVE) \(derived — .+\)$/m;
  const m = content.match(bodyLineRe);
  const declared = m ? m[1] : null;

  // Parse table rows: look for markdown tables with a `Disposition` column.
  // Very small parser — walk lines, detect table header, extract severity+disposition+category+text columns.
  /** @type {Array<Severity>} */ const severities = [];
  /** @type {Array<string|null>} */ const categories = [];
  /** @type {Array<string|null>} */ const evidenceTexts = [];
  /** @type {Array<boolean>} */ const blastRadiusFlags = [];

  const lines = content.split(/\r?\n/);
  let headerCols = null;
  let sepPassed = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('|')) { headerCols = null; sepPassed = false; continue; }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (!headerCols) {
      // Look for a Disposition column (case-insensitive) in the header row.
      const lower = cells.map((c) => c.toLowerCase());
      if (lower.some((c) => c === 'disposition' || c.includes('disposition'))) {
        headerCols = lower;
        sepPassed = false;
      }
      continue;
    }
    if (!sepPassed) {
      // The line after a header row is the separator (---|---).
      if (cells.every((c) => /^:?-+:?$/.test(c))) { sepPassed = true; continue; }
      // Not a separator — header was a false positive.
      headerCols = null;
      continue;
    }
    // Data row.
    const dispIdx = headerCols.findIndex((c) => c === 'disposition' || c.includes('disposition'));
    const sevIdx  = headerCols.findIndex((c) => c === 'severity' || c.includes('severity'));
    const catIdx  = headerCols.findIndex((c) => c === 'category' || c.includes('category'));
    const textIdx = headerCols.findIndex((c) => c === 'text' || c === 'evidence' || c.includes('text') || c.includes('evidence'));
    if (dispIdx < 0) continue;
    const dispRaw = (cells[dispIdx] || '').replace(/\*\*/g, '').trim();
    if (!/^CONFIRMED\b/i.test(dispRaw)) continue;
    if (sevIdx < 0) continue;
    const sevRaw = (cells[sevIdx] || '').replace(/\*\*/g, '').trim();
    const norm = normalizeSeverity(sevRaw);
    if (norm) {
      severities.push(norm);
      // Category: explicit column WINS when present and non-empty (forward-compat).
      // When absent or null/empty, derive from claim+fileline text (cand-9 D-13-C).
      const catRaw = catIdx >= 0 ? (cells[catIdx] || '').replace(/\*\*/g, '').trim() : null;
      const explicitCat = catRaw && catRaw !== '' && catRaw.toLowerCase() !== 'null' ? catRaw : null;
      // claimIdx: look for a Claim or similar column for the category derivation source.
      const claimIdx = headerCols.findIndex((c) => c === 'claim' || c.includes('claim') || c === 'finding' || c.includes('finding'));
      const fileLineIdx = headerCols.findIndex((c) => c === 'file' || c.includes('file') || c === 'line' || c.includes('line') || c.includes('file:line'));
      const claimText = claimIdx >= 0 ? (cells[claimIdx] || '').replace(/\*\*/g, '').trim() : '';
      const fileLineText = fileLineIdx >= 0 ? (cells[fileLineIdx] || '').replace(/\*\*/g, '').trim() : '';
      const derivedCat = explicitCat !== null ? explicitCat : deriveCategoryFromText(claimText, fileLineText);
      categories.push(derivedCat);
      // Evidence text for companion-cap security bypass (F1, GR P1 #1, fix-iter-3):
      // Use the claim text (finding description) as the evidence signal for security detection.
      // If a dedicated text/evidence column is present, prefer that; else use claimText.
      // This is the ONLY place evidence is used — for BYPASS_CATEGORIES_TEXT pattern match
      // in the companion-cap. It is NEVER emitted to output (CONSTITUTION §A redaction).
      const textRaw = textIdx >= 0 ? (cells[textIdx] || '').replace(/\*\*/g, '').trim() : null;
      const evidenceForBypass = (textRaw && textRaw !== '') ? textRaw : (claimText || null);
      evidenceTexts.push(evidenceForBypass);
      // blast_radius frontmatter not available from gr-review table rows; default false.
      blastRadiusFlags.push(false);
    }
  }
  // Also tolerate per-finding block layout: lines like `Disposition: CONFIRMED` + nearby `Severity: high`.
  // IMPORTANT: chunk by blank lines FIRST to prevent cross-finding pair-up (MISTAKES 2026-07-15 GR F2).
  // A single lazy [\s\S]*? regex without a block boundary would pair field-A from block N with
  // field-B from block N+1 when block N has no CONFIRMED, producing phantom severity inflation.
  if (severities.length === 0) {
    const blockRe = /Severity:\s*([a-zA-Z0-9]+)[^\n]*(?:\n(?!\n)[^\n]*)*?Disposition:\s*(\*\*)?CONFIRMED/gi;
    // Pre-chunk content by blank lines; run regex per chunk to bound cross-finding span.
    const chunks = content.split(/\n\n+/);
    for (const chunk of chunks) {
      blockRe.lastIndex = 0;
      let bm;
      while ((bm = blockRe.exec(chunk)) !== null) {
        const norm = normalizeSeverity(bm[1]);
        if (norm) {
          severities.push(norm);
          // Derive category from the chunk text (cand-9 D-13-C OQ-7 symmetric fix).
          // Helper runs per-chunk (not across chunks) — chunk-first split preserved (F2 guard).
          categories.push(deriveCategoryFromText(chunk, ''));
          // Pass chunk text as evidence for security bypass check (F1, fix-iter-3; NEVER emitted).
          evidenceTexts.push(chunk);
          blastRadiusFlags.push(false);
        }
      }
    }
  }

  const derived = computeDerivedVerdict(severities, categories, evidenceTexts, blastRadiusFlags);
  // Return shape is UNCHANGED from pre-patch — no category/evidence arrays exposed.
  return { declared, derived, severities, ok: true };
}

// ---------------------------------------------------------------------------
// deriveCategoryFromText — VERBATIM port of bench extractor detectCategory
// Source: eng-org-bench/packages/extractor/src/normalize.ts L100-131
// REQ-20260715-d904-03 TASK-1 (cand-9 D-13-C). Row ORDER is LOAD-BEARING:
// security-adjacent rows (injection/ownership/idor/authz/secrets/race-condition)
// come BEFORE ceiling rows (n+1/missing-index/memory-leak/broken-pagination/perf)
// so a security claim cannot silently match a ceiling row first (R-22 defence-in-depth).
// R-21 contract test in verdict-lint.test.mjs asserts byte-identity with the
// bench extractor at REQ HEAD; any drift = test RED.
// ---------------------------------------------------------------------------

/**
 * VERBATIM port of bench extractor CATEGORY_KEYWORDS (normalize.ts L100-121).
 * Row order is load-bearing — DO NOT reorder without updating the bench source in sync.
 * @type {ReadonlyArray<readonly [RegExp, string]>}
 */
export const CATEGORY_KEYWORDS = Object.freeze([
  [/sql injection|sqli|unparameteri[sz]ed|injection/i, 'injection'],
  [/n\+1|per-row (?:lookup|quer)/i, 'n+1'],
  [/missing index/i, 'missing-index'],
  [/ownership|owner check/i, 'ownership'],
  [/\bidor\b|insecure direct object|object-level authori[sz]/i, 'ownership'],
  [/authori[sz]|auth check|missing auth|\bauthz\b/i, 'authz'],
  [/secret|api key|credential|token leak/i, 'secrets'],
  [
    /race condition|race-condition|non-atomic|read-modify-write|check-then-act|\btoctou\b/i,
    'race-condition',
  ],
  [
    /memory leak|unbounded (?:cache|growth|listener)|listener leak|never (?:removed|evicted)/i,
    'memory-leak',
  ],
  [
    /paginat|off-by-one (?:page|offset)|\boffset\b.{0,40}\blimit\b|duplicate (?:rows|page)/i,
    'broken-pagination',
  ],
  [/performance|\bperf\b|quadratic|slow quer/i, 'perf'],
  // -------------------------------------------------------------------------
  // PLUGIN-SIDE EXTENSION (post-bench prefix) — REQ-20260715-d904-03 fix-iter-1.
  // Rows below this comment are NOT in the bench normalize.ts battery.
  // They exist to cover vocabulary observed in real cand-5..8 gr-review.md
  // claim text that the verbatim bench rows miss. R-21 parity test asserts
  // the FIRST 11 rows remain byte-identical to bench L100-121; additive rows
  // below are validated by their own unit tests and by the pre-gate harness.
  // Order-invariant preserved: security-adjacent rows 0/3/4/5/6/7 remain
  // BEFORE these additions (R-22 defence-in-depth).
  // -------------------------------------------------------------------------
  [/\bunindexed\b|full table scan/i, 'missing-index'],
  [/hottest endpoint/i, 'perf'],
]);

/**
 * VERBATIM port of bench extractor detectCategory (normalize.ts L124-131).
 * Best-effort category detection over finding text; unparseable → null.
 * First-match-wins; row ORDER is load-bearing (see CATEGORY_KEYWORDS above).
 * Unknown/unmatched → null (NEVER defaults to a WARN category — AC-1.3 hard constraint).
 *
 * @param {string} claim — claim/finding text from the gr-review row.
 * @param {string} fileLine — file:line cell text (optional, can be '').
 * @returns {string|null}
 */
export function deriveCategoryFromText(claim, fileLine) {
  const text = (typeof claim === 'string' ? claim : '') +
               (typeof fileLine === 'string' && fileLine !== '' ? ' ' + fileLine : '');
  for (const [pattern, category] of CATEGORY_KEYWORDS) {
    if (pattern.test(text)) {
      return category;
    }
  }
  return null;
}

/**
 * Lint a directory: glob TASK-*-review-*.md; optionally include gr-review.md.
 *
 * @param {string} reqDir
 * @param {{includeGr?: boolean}} [opts]
 * @returns {{pass: Array<object>, fail: Array<object>, skip: Array<object>}}
 */
export function lintDir(reqDir, opts) {
  const includeGr = !!(opts && opts.includeGr);
  const tasksDir = path.join(reqDir, 'tasks');
  /** @type {Array<string>} */ const files = [];
  try {
    const entries = fs.readdirSync(tasksDir);
    for (const e of entries) {
      if (/^TASK-.*-review-.*\.md$/.test(e)) files.push(path.join(tasksDir, e));
    }
  } catch (e) {
    // Only ENOENT is tolerated — tasks dir may not exist yet; that is not a lint failure.
    // Any other error (EACCES, EMFILE, etc.) is unexpected and must surface loudly
    // rather than producing a false-clean empty result (MISTAKES 2026-07-15 GR F1).
    if (e.code !== 'ENOENT') throw e;
  }
  const results = { pass: [], fail: [], skip: [] };
  for (const f of files) {
    const r = lintFile(f);
    if (r.status === 'PASS') results.pass.push(r);
    else if (r.status === 'FAIL') results.fail.push(r);
    else results.skip.push(r);
  }
  if (includeGr) {
    const grPath = path.join(reqDir, 'gr-review.md');
    if (fs.existsSync(grPath)) {
      const gr = parseGrReview(grPath);
      let status = /** @type {LintStatus} */ ('SKIP');
      let reason = '';
      if (!gr.ok) {
        reason = `parseFail: ${gr.skipReason || 'gr-review unparseable'}`;
      } else if (gr.declared === null) {
        reason = 'gr-review missing body derivation line';
      } else if (gr.declared === gr.derived) {
        status = 'PASS';
      } else {
        status = 'FAIL';
        reason = `expected ${gr.derived}`;
      }
      const entry = {
        status, path: grPath, declared: gr.declared, derived: gr.derived,
        severities: gr.severities, reason,
      };
      if (status === 'PASS') results.pass.push(entry);
      else if (status === 'FAIL') results.fail.push(entry);
      else results.skip.push(entry);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Output formatting (redaction: no raw finding text)
// ---------------------------------------------------------------------------

/**
 * Format a per-file result as a single text line (redacted — no finding text).
 *
 * OBS-1 annotation: when cappedCount > 0, appends `(capped: N finding(s) by category ceiling)`
 * so operators can distinguish "reviewer declared BLOCK on a P2 they legitimately intended"
 * from "reviewer declared BLOCK on a P1 that the ceiling downgraded to P2".
 *
 * OBS-1 annotation (split, GR fix-iter-3): separate ceiling-cap from companion-cap.
 *   cappedCount > 0 → `(ceiling-capped: N finding(s) by explicit category)`
 *   companionCappedCount > 0 → `(companion-capped: N null-cat finding(s) by pcc)`
 * OBS-2 annotation: escapedCount > 0 → `(escaped: N blast-radius finding(s))`;
 *   pccFired → `(pcc: active)` flag in output.
 * OBS-3 annotation: unknownCatCount > 0 → `(unknown-cat: N finding(s))` counter.
 *
 * The machine-readable verdict enum {BLOCK, NEEDS-CHANGES, APPROVE} is UNCHANGED.
 * Annotations are informational suffixes only. No evidence text emitted (CONSTITUTION §A held).
 *
 * @param {{status: LintStatus, path: string, declared: string|null, derived: Verdict|null, severities: Array<Severity>, reason: string, cappedCount?: number, companionCappedCount?: number, escapedCount?: number, pccFired?: boolean, unknownCatCount?: number}} r
 * @returns {string}
 */
function formatText(r) {
  const sev = r.severities.length ? r.severities.join(',') : 'none';
  const reasonPart = r.reason ? ` reason="${r.reason.slice(0, 60)}"` : '';
  // OBS-1: split ceiling-cap vs companion-cap annotation (GR fix-iter-3, O-1).
  const cappedPart = (typeof r.cappedCount === 'number' && r.cappedCount > 0)
    ? ` (ceiling-capped: ${r.cappedCount} finding(s) by explicit category)`
    : '';
  const companionPart = (typeof r.companionCappedCount === 'number' && r.companionCappedCount > 0)
    ? ` (companion-capped: ${r.companionCappedCount} null-cat finding(s) by pcc)`
    : '';
  // OBS-2: blast-radius escape + pcc state annotation (GR fix-iter-3, O-2).
  const escapedPart = (typeof r.escapedCount === 'number' && r.escapedCount > 0)
    ? ` (escaped: ${r.escapedCount} blast-radius finding(s))`
    : '';
  const pccPart = r.pccFired === true ? ` (pcc: active)` : '';
  // OBS-3: unknown-category counter (GR fix-iter-3, O-3).
  const unknownCatPart = (typeof r.unknownCatCount === 'number' && r.unknownCatCount > 0)
    ? ` (unknown-cat: ${r.unknownCatCount} finding(s))`
    : '';
  return `${r.status} ${r.path} declared=${r.declared ?? 'null'} derived=${r.derived ?? 'null'} severities=[${sev}]${reasonPart}${cappedPart}${companionPart}${escapedPart}${pccPart}${unknownCatPart}`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function usage() {
  return [
    'Usage:',
    '  node verdict-lint.mjs --req-dir <path> [--include-gr] [--format text|json]',
    '  node verdict-lint.mjs --single-file <path> [--format text|json]',
    '',
    'Exit codes: 0 pass; 1 policy violation; 2 CLI-usage error.',
  ].join('\n');
}

function main() {
  let args;
  try {
    args = parseArgs({
      options: {
        'req-dir':     { type: 'string' },
        'single-file': { type: 'string' },
        'include-gr':  { type: 'boolean', default: false },
        'format':      { type: 'string',  default: 'text' },
        'help':        { type: 'boolean', default: false },
      },
      strict: true,
    }).values;
  } catch (e) {
    process.stderr.write(`verdict-lint: ${e.message}\n${usage()}\n`);
    process.exit(2);
  }
  if (args.help) {
    process.stdout.write(usage() + '\n');
    process.exit(0);
  }
  if (args.format !== 'text' && args.format !== 'json') {
    process.stderr.write(`verdict-lint: invalid --format: ${args.format}\n`);
    process.exit(2);
  }
  const hasReqDir = typeof args['req-dir'] === 'string';
  const hasSingle = typeof args['single-file'] === 'string';
  if (hasReqDir === hasSingle) {
    process.stderr.write(`verdict-lint: exactly one of --req-dir or --single-file is required\n${usage()}\n`);
    process.exit(2);
  }

  if (hasSingle) {
    const r = lintFile(args['single-file']);
    if (args.format === 'json') {
      process.stdout.write(JSON.stringify({ single: r }) + '\n');
    } else {
      process.stdout.write(formatText(r) + '\n');
    }
    process.exit(r.status === 'FAIL' ? 1 : 0);
  }

  const res = lintDir(args['req-dir'], { includeGr: args['include-gr'] });
  if (args.format === 'json') {
    process.stdout.write(JSON.stringify(res) + '\n');
  } else {
    for (const r of [...res.fail, ...res.skip, ...res.pass]) {
      process.stdout.write(formatText(r) + '\n');
    }
  }
  process.exit(res.fail.length > 0 ? 1 : 0);
}

// Only run main when invoked as a script (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
