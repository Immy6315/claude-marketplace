---
name: report-diet
description: Canonical reference for the verdict-report diet contract and the context-pack-first protocol. Referenced by other agent files by path; not a standalone invocable agent.
---

# Report diet contract (v2) — canonical reference

> This document is the single canonical source for the verdict-report diet contract
> and the context-pack-first protocol. All agent files reference it by path.
> Do NOT inline these sections into individual agent files — drift is guaranteed
> when the same 50+ line block lives in 11+ places. (GR finding F1/F2/F12.)

---

## A. Context-pack-first protocol

### A.1 Standard variant (reviewer and non-reviewer dev/test agents)

Read `governance/requirements/REQ-<id>/context-pack.md` before any raw
governance doc. If the pack is insufficient (a needed passage is in the
exclusion manifest or pack does not exist), read the raw doc AND log it in
your report's `raw_doc_reads:` frontmatter list.

### A.2 Reviewer canary variant

If you are the rotating canary reviewer for this REQ, read raw docs instead
of the pack and set `pack_audit:` in frontmatter per the canary protocol in
`commands/run-reviews.md`.

### A.3 Always-raw exemptions

The following agents and surfaces are EXEMPT from the context-pack-first rule:

- `test-regression` — always reads MISTAKES.md raw and in full; a pack slice
  would cause misses.
- GR deep-review — reads raw diffs and raw docs as an independent second engine.
- The architect brief — it is a project-specific input, not a governance doc.

---

## B. Mandatory report frontmatter

### B.1 Reviewer reports (`TASK-<n>-review-<type>.md`)

```yaml
---
verdict: APPROVE | NEEDS-CHANGES | BLOCK
verdict_derived: true                # MUST be true — the verdict is DERIVED from max confirmed finding severity per §G.1.
                                     # false or missing = template-validation failure (verdict-lint hard-fails).
verdict_derivation: "<one-line>"     # MUST be present. Example values:
                                     #   "1× confirmed high (P1) at auth.ts:42, missing ownership check"
                                     #   "0 confirmed findings"
                                     #   "3× confirmed low (P3) only — nits-only"
                                     # Informational — the lint (verdict-lint.mjs) computes the derived
                                     # verdict from the findings array; this string is not trusted for logic,
                                     # only for human-audit readability.
severity_verdict_policy_ack: true    # MUST be true — see §G. false or missing = template-validation failure.
files_reviewed:
  - <path>:<line-range>
  - ...
findings_count:
  blocker: <n>
  concern: <n>
  nit: <n>
findings:
  # Every finding row MUST cite the §H rubric bullet applied.
  # rubric_bullet grammar (v1, machine-parseable):
  #   rubric_bullet: "<level>: <verbatim opening clause of the matching §H bullet>"
  #   where <level> ∈ critical | high | medium | low.
  #   MACHINE CHECK: the quoted value MUST start with one of the four level
  #   tokens followed by `: ` — i.e. it matches ^(critical|high|medium|low): .
  #   Any other shape fails template validation.
  # Example row:
  #   - file: path/to/file.ts:123
  #     severity: medium                     # one of: critical | high | medium | low
  #     rubric_bullet: "medium: non-blocking correctness or maintainability concern"
  #     verdict_hint: warn                   # per §G mapping: critical|high→block, medium→warn, low→warn|note
  #     text: "one-sentence what"
  - file: <path>:<line>
    severity: <critical|high|medium|low>
    rubric_bullet: "<level>: <verbatim opening clause of the matching §H bullet>"
    verdict_hint: <block|warn|note>
    text: "<one-sentence what>"
raw_doc_reads: []           # fill in yourself: list every governance doc you read raw
                             # instead of from the context pack.
pack_audit: null            # set by the rotating canary reviewer; null for all others
---
```

**Mandatory body derivation line (v1.1).** In addition to the frontmatter above, every review file body MUST contain EXACTLY ONE line matching the regex
`^Verdict: (BLOCK|NEEDS-CHANGES|APPROVE) \(derived — .+\)$`.
Example: `Verdict: BLOCK (derived — 1× confirmed high at auth.ts:42, missing ownership check)`. Zero matches → NOT-READY (missing derivation line); more than one → NOT-READY (ambiguous verdict). The mechanical verdict-lint (`plugins/eng-org/scripts/verdict-lint.mjs`, wired into `commands/run-reviews.md` Step 3d and `commands/merge-readiness.md` Step 2e items 5 and 6) hard-errors on mismatch between the frontmatter `verdict:` and this body line.

### B.2 Test reports (`TASK-<n>-test-<type>-report.md`)

```yaml
---
verdict: GREEN | RED | BLOCKED
coverage:
  line: <pct>
  branch: <pct>
evidence:
  - <repo-relative path>:<line-range>
  - ...
  # (repo-relative paths only — no machine-absolute paths; cross-ref MISTAKES 2026-07-10)
raw_doc_reads: []           # fill in yourself: list every governance doc you read raw
                             # instead of from the context pack.
---
```

`test-regression` reports additionally carry:

```yaml
mistakes_sha256: <hex>      # SHA-256 of MISTAKES.md content at verdict time
                             # If MISTAKES.md content changes between iterations, re-run is forced
```

---

## C. Diet contract — when verdict is GREEN / APPROVE / NIT-only

- **Frontmatter (MANDATORY):** verdict, coverage numbers, evidence paths
  (repo-relative paths to test files / to specific file:line ranges reviewed).
- **Findings table:** `file:line` per finding, one row each; no prose per
  row beyond a one-sentence what.
- **Reasoning section:** capped at **~40 lines** of prose.

## D. Cap LIFTED — unbounded prose required when

Verdict is `RED`, `BLOCK`, `NEEDS-CHANGES`, or `FAIL`. Full-prose reasoning
is required so the receiving Dev / TL can act.

## E. EXEMPT from diet (never dieted, even at GREEN)

- Dev diffs (`implementation/TASK-<n>-diff.md`) — they are the contract test agents verify.
- Any "what I did not cover" / "known gaps" sections in test reports.
- `gr-review.md` (GR deep-review artifact from 0.13.0).
- `em-summary.md` (Imran-facing, 1-page format governed by ROLES §2.1).
- `retro-M<n>.md` (autopilot per-milestone retros).
- `merge-readiness.md` (TL composite verdict).

---

## F. Mechanical diet-compliance sweep (merge-readiness Step 2e)

The caller (merge-readiness agent) verifies that:

1. No dev-diff file was accidentally dieted:
   ```bash
   grep -l 'coverage:' governance/requirements/REQ-<id>/implementation/TASK-*-diff.md
   ```
   Must return empty. Any file printed was incorrectly dieted; remand to the Dev.

2. Every verdict-carrying report (`TASK-*-review-*.md` and `TASK-*-test-*.md`)
   that claims GREEN / APPROVE has a reasoning section no longer than ~40 lines.

3. Drift-guard sentinel: no agent file (other than this canonical doc) contains
   the phrase "Cap LIFTED — unbounded prose required when" inlined — that phrase
   is the exact §D heading and belongs ONLY in this canonical doc. Presence in
   any non-canonical agent file = NOT-READY.
   ```bash
   grep -rl "Cap LIFTED — unbounded prose required when" \
     plugins/eng-org/agents/*.md \
     | grep -v REPORT_DIET.md
   ```
   Must return empty (zero non-canonical agent files).

4. §G/§H/§I drift sentinel — cross-file BYTE-IDENTITY check (NOT a phrase
   grep: the reviewer pointer blocks are sanctioned bounded restatements, so
   a phrase-sentinel would false-positive on them). Extract the pointer block
   — from the line `### Severity → verdict policy contract (v1)` to its end
   (the line before the next `## ` heading) — from each of the 6
   `reviewer-*.md` files; all 6 md5 hashes MUST be identical:
   ```bash
   for f in plugins/eng-org/agents/reviewer-*.md; do
     awk '/^### Severity → verdict policy contract \(v1\)$/{flag=1}
          flag && /^## /{flag=0} flag{print}' "$f" | md5
   done | sort -u
   ```
   Must yield exactly ONE hash. Any mismatch = drift; restore the block from
   the newest-intent version across all 6 files and re-verify until exactly
   one hash remains.

5. **Derivation-line format sentinel (v1.1, new — REQ-20260713-d904-03).** Grep every `TASK-*-review-*.md` for a line matching the mandatory derivation-line regex:
   ```bash
   grep -LE '^Verdict: (BLOCK|NEEDS-CHANGES|APPROVE) \(derived — .+\)$' \
     governance/requirements/REQ-<id>/tasks/TASK-*-review-*.md
   ```
   Must return empty. Zero matches on a review file → NOT-READY (missing derivation line); more than one match on the same file → NOT-READY (ambiguous verdict). This is the readable companion to the mechanical `verdict-lint.mjs` sweep (Step 2e item 5 of `commands/merge-readiness.md`) — the two together ensure the verdict is BOTH derived and human-auditable.

---

## G. Severity → verdict policy (canonical, v1)

> This section is the single source referenced by every `reviewer-*.md` agent
> file in this plugin. Per-agent files carry a pointer block with a BOUNDED
> restatement (the `(v1)` pointer block) — never a verbatim copy of §G–§I in
> full. The canonical text lives ONLY here; pinned policy sentences must not
> be copied, and on any drift the canonical file wins. Unbounded inlining
> across N files reintroduces the drift trap that MISTAKES.md GR F1/F2/F12
> already fixed for the diet contract.

**Policy (mandatory, applies to every reviewer agent AND to the GR-review
disposition table written by the assigned TL):**

- Findings of severity `critical` or `high` ⇒ per-finding `verdict_hint` may be `block`.
- Findings of severity `medium` ⇒ per-finding `verdict_hint` is `warn` (NEVER `block` on medium alone).
- Findings of severity `low` ⇒ per-finding `verdict_hint` is `warn` or `note` (NEVER `block`).
- A verdict of `block` is only permitted when at least one finding is `critical` or `high`.
- Mapping: the top-level report `verdict:` (APPROVE|NEEDS-CHANGES|BLOCK) is
  derived from the findings set and is distinct from per-finding
  `verdict_hint` (`block`/`warn`/`note`) — `warn`/`note` are hint values
  only, never a top-level verdict.
- The `verdict_hint` field on each finding must obey the same mapping (so
  downstream verdict-derivation — including the eng-org-bench judge fallback
  path — stops mis-classifying medium/low findings as block-worthy).

**Mechanical restatement (for graders / grep audits):**

- `severity=critical` → `verdict_hint ∈ {block}`
- `severity=high`     → `verdict_hint ∈ {block, warn}`
- `severity=medium`   → `verdict_hint ∈ {warn}`               ← NEVER block on medium alone
- `severity=low`      → `verdict_hint ∈ {warn, note}`         ← NEVER block

A reviewer report whose top-level `verdict:` is `BLOCK` but whose
`findings:` list contains zero `severity: critical` OR `severity: high` rows
fails template validation and MUST be re-issued.

### G.1 Derivation rule (mandatory, enforced by verdict-lint) — v1.1

> This is the enforcement successor to the guidance in §G above. The verdict is
> DERIVED, not decided. The `plugins/eng-org/scripts/verdict-lint.mjs` script
> hard-errors on any mismatch between the derived verdict and the declared
> `verdict:` field. Softening is BANNED — see the last paragraph of this section.

**Canonical derivation mapping.** Given the set S of severities appearing in confirmed findings (severity vocabulary normalized per the alignment table in §H below):

- `max(confirmed severity) ∈ {P0, critical, blocker}` → `Verdict: BLOCK`
- `max(confirmed severity) ∈ {P1, high}` → `Verdict: BLOCK`
- `max(confirmed severity) ∈ {P2, medium, concern}` → `Verdict: NEEDS-CHANGES`
- `max(confirmed severity) ∈ {P3, low, nit}` alone (no P2/higher present) → `Verdict: APPROVE`
- `max(confirmed severity) ∈ {P3, low, nit}` alongside any P2 → `Verdict: NEEDS-CHANGES` (P2 dominates)
- Zero confirmed findings → `Verdict: APPROVE`

**Reviewer output line directive.** Every review file body MUST contain exactly one line matching `Verdict: (BLOCK|NEEDS-CHANGES|APPROVE) (derived — <reasoning>)`. Example: `Verdict: BLOCK (derived — 1× confirmed high at backend/src/trpc/routers/auth.ts:42, missing ownership check)`. The §B.1 frontmatter's `verdict:` field is the authoritative value the lint compares against; the body line is the human-audit companion.

**Softening is banned (verbatim clause).** The verdict is a mechanical function of confirmed findings, not a judgment call. You do not soften BLOCK to NEEDS-CHANGES because most findings are nits. You do not soften NEEDS-CHANGES to APPROVE because the P2 finding "feels minor". If you disagree with the severity assigned to a finding, either downgrade the severity in the findings array (with justification in the finding's `text` field) or preserve it; either way the verdict is DERIVED from the final severity set.

### G.1.a Category-ceiling table (mandatory, enforced by verdict-lint) — v1.4

> Added REQ-20260715-d904-02 (cand-8). v1.4 REQ-20260715-d904-03 (cand-9): §G.1.a anchor
> shrunk ≥ 30% (prose examples collapsed; historical marker-regex prose removed; frozen-set
> rows merged). `blast_radius: true` frontmatter is the SOLE escape. Enforcement:
> `verdict-lint.mjs` `computeDerivedVerdict`; this anchor and the lint ship in ONE commit
> (ADR-003 R-20). Drift between rows below and lint = contract violation.

**Ceiling rule (hard enforcement, not a signal or cap):** A finding is WARN-capped when its
category belongs to the ceiling set AND its frontmatter does NOT carry `blast_radius: true` — in
which case the lint script downgrades a P0/P1 severity to P2 before the max-severity aggregation.
A finding in a ceiling category whose frontmatter carries `blast_radius: true` is NOT capped —
its full P0/P1 severity feeds the §G.1 max-severity rule and may yield BLOCK. Evidence text does
NOT affect the ceiling; only the explicit `blast_radius: true` frontmatter flag does.

**Category-ceiling table:**

| Category token(s) | Ceiling verdict | Escape-hatch condition |
|---|---|---|
| All `CEILING_CATEGORIES` tokens: `perf`, `memory-leak`, `leak`, `broken-pagination`, `pagination`, `n+1`, `missing-index` | NEEDS-CHANGES (WARN) | `blast_radius: true` frontmatter on the finding row |
| `security`, `sql-injection`, `idor`, `missing-auth`, `race-condition`, `secret-in-logs` | No ceiling — security-category findings ALWAYS derive by max-severity (§G.1 unchanged) | — |
| Any other category / `null` / unknown | No ceiling — §G.1 max-severity rule unchanged | — |

**Blast-radius escape-hatch — ONE channel (frontmatter only):**

Frontmatter `blast_radius: true` on the finding row is the SOLE escape from the ceiling. A
reviewer who has genuine blast-radius evidence (measured heap dump, cited P0 trace, confirmed
hot-path profiling, etc.) MUST declare it explicitly by setting `blast_radius: true` in the
finding's frontmatter — evidence text content is NOT consulted by the lint engine and does NOT
affect the derived verdict. This makes the escape deterministic and non-gameable: defect
descriptions inherently contain blast-radius-sounding vocabulary ("unbounded", "full table scan",
"hot-path") that would collide with any free-text pattern set.

### G.2 Few-shot examples (mandatory) — v1.1

**Example 1 — one confirmed high + 5 nits ⇒ BLOCK (NOT NEEDS-CHANGES).**

> Findings: 1× high (auth.ts:42, missing ownership check), 5× low (naming, comments).
> Derived: `max = high` ⇒ `Verdict: BLOCK (derived — 1× confirmed high at auth.ts:42, missing ownership check)`.
> Trap: do NOT soften to NEEDS-CHANGES because most findings are nits — the P1 dominates.

**Example 2 — three P3 nits alone ⇒ APPROVE (NOT NEEDS-CHANGES).**

> Findings: 3× low (comment typos, unused import, magic number).
> Derived: `max = low` and no P2+ present ⇒ `Verdict: APPROVE (derived — 3× confirmed low, nits-only)`.
> Trap: do NOT emit NEEDS-CHANGES for style-only findings.

**Example 3 — mixed P2 + P3 ⇒ NEEDS-CHANGES.**

> Findings: 1× medium (query without index on warm path), 2× low (naming).
> Derived: `max = medium` (P2) ⇒ `Verdict: NEEDS-CHANGES (derived — 1× confirmed medium at pets.ts:88, missing index on warm path)`.

---

## H. Severity calibration rubric (canonical, v1)

> This section is the single source referenced by every `reviewer-*.md` agent
> file. Every finding row in every review report MUST cite the specific bullet
> applied, using the §B.1 grammar
> `rubric_bullet: "<level>: <verbatim opening clause of the matching §H bullet>"`
> — the value MUST start with one of critical|high|medium|low followed by `: `.
> Findings without a cited bullet fail template validation.

**Vocabulary alignment table (v1.1 — anchoring the P0/P1/P2/P3 tokens onto the critical|high|medium|low severity tokens and the blocker|concern|nit finding-vocab tokens).** All three vocabularies map onto the same 4 severity levels; the verdict-lint script and the derivation rule in §G.1 accept any of them:

| §H severity | P-level | Blocker vocab | Derives verdict |
|---|---|---|---|
| critical | P0 | blocker | BLOCK |
| high | P1 | blocker | BLOCK |
| medium | P2 | concern | NEEDS-CHANGES |
| low | P3 | nit | APPROVE (only-P3, i.e., no P2 present) or NEEDS-CHANGES (P2+P3 mix) |

- **critical (P0, blocker)** — production outage risk, data loss risk, security breach with no mitigation, or violation of a CONSTITUTION §H iron rule. Anchored code examples:
  - Example (blocker): hardcoded production DB password in `backend/src/db/config.ts` — `const DB_PASSWORD = "hunter2prod";`.
  - Example (blocker): unauthenticated endpoint returning all-user PII — `publicProcedure.query(() => db.select().from(users))` where `users` contains email + phone.
  - Example (blocker): migration DROPS a production table without a data-preservation step — `await db.execute(sql\`DROP TABLE user_settings\`)` inside a Drizzle migration.

- **high (P1, blocker)** — CONSTITUTION BLOCKER-list rule violation (missing `protectedProcedure`, missing ownership check, raw SQL, secrets in code/logs, missing rate limit on auth endpoints, N+1 on hot path, layering violation such as `db` in `domain/`, XP-ledger UPDATE/DELETE, MISTAKES.md regression on a tagged pattern). Anchored code examples:
  - Example (blocker): missing ownership check on `pets.update` — `.update(pets).set(...).where(eq(pets.id, input.id))` without also `and(eq(pets.userId, ctx.user.id))`.
  - Example (blocker): raw SQL with unescaped user input outside Drizzle `sql\`\`` — `db.execute(\`SELECT * FROM users WHERE email='\${email}'\`)`.
  - Example (blocker): N+1 on a hot-path — `for (const pet of pets) { await db.select().from(vitals).where(eq(vitals.petId, pet.id)); }` inside a list-pets route.

- **medium (P2, concern)** — non-blocking correctness or maintainability concern with a concrete file:line (e.g., a new N+1 query on a non-hot endpoint, a missing index on a warm path, a swallowed catch on a non-hot path, a documented code-drift). Anchored code examples:
  - Example (concern): missing index on a warm-path WHERE column — `ordersByStatus` query hits `orders.status` on a 5k-row table without a matching index in `schema.ts`.
  - Example (concern): swallowed catch on a non-hot recovery path — `try { await refreshCache(); } catch {}` in a background sync worker (should log at minimum).
  - Example (concern): documentation drift — README claims endpoint `/api/x` returns `{count, items}` but the handler returns `{total, results}` (users rely on shape).

- **low (P3, nit)** — style, naming, comment quality, minor duplication, nit-level readability. Anchored code examples:
  - Example (nit): inconsistent naming — `getPetById` in one file, `pet_by_id` in a sibling.
  - Example (nit): unused import — `import { unused } from 'lodash'` at top of `foo.ts` with zero references below.
  - Example (nit): magic number without a named constant — `if (retries > 3)` in a retry loop (no `const MAX_RETRIES = 3` binding).

---

## I. Findings discipline (canonical, v1)

> This section is the single source referenced by every `reviewer-*.md` agent
> file. All rules apply per-review-report and per-finding.

- **Only report findings with concrete `file:line` evidence.** No speculative
  findings. Prose containing "consider" / "might" / "could" MUST NOT be
  promoted to a finding row; belongs in the reasoning section only.
- **De-duplicate before reporting.** If the same defect appears at two
  file:lines, report ONCE and list the additional file:lines in the same
  row's evidence field, not as separate findings.
- **Cap-signal:** if a reviewer is tempted to report more than **3 findings on
  a diff smaller than 200 LOC**, that is a signal to consolidate the
  **medium and low** findings ONLY — report the 3 most material of those and
  mention the rest in the reasoning section, not as separate finding rows.
  Critical/high findings are NEVER consolidated away and are always emitted
  as individual finding rows, regardless of count. This is a signal, not a
  hard cap.

### I.1 Evidence gate (mandatory, v1.1 — REQ-20260713-d904-03)

- **Evidence gate (mandatory).** A finding may only be reported when BOTH of the following hold: (a) a concrete `file:line` citation exists in the source repo; (b) a concrete failure/exploit path is described in the finding's `text` field — the sentence must explain WHY it fails and HOW it manifests, not merely "consider" or "might".
- **Banned phrases in finding rows:** `"could potentially"`, `"might be"`, `"consider whether"`, `"it may be that"`. These belong in the reasoning section prose, NEVER as a finding row promoted to the `findings:` array.
- **Duplicate collapse (strengthened).** If the same defect appears at multiple `file:line`s across the diff, ONE finding row with multiple evidence entries — not multiple rows.

> **Recall-protection clause (LOAD-BEARING — verbatim, do not paraphrase):**
>
> This gate applies to EVIDENCE QUALITY. It does NOT reduce the surface area you inspect. If you see a real defect, report it — `file:line` + failure path is the requirement; don't skip real findings for lack of certainty about severity. If you're uncertain WHICH severity applies, choose the lower level and document your reasoning in the finding's `text` field — but STILL report the finding. Under-reporting real defects to appear "precise" is the failure mode this gate does NOT sanction.

## J. Test-report diet — extend Report Diet v2 to `TASK-<n>-test-<type>-report.md`

Report Diet v2 landed on `TASK-<n>-dev-report.md` in 0.14.0 (−42% payload).
REQ-20260713-d904-03 Change 8a extends the same discipline to test reports.

### J.1 When to diet a test report

Apply the diet contract §C when ALL of:
- Verdict is `GREEN` (not `RED`, not `BLOCKED`).
- Coverage number reported meets the threshold (per COVERAGE_THRESHOLDS.md).
- Zero flakes on the reported run (or documented flake with retry-passed).
- No new dependencies added by the tests themselves.

### J.2 Test-report diet shape

Dieted test-report retains:
- Frontmatter (all fields per §B.2, unchanged).
- One-paragraph "What I did" section (≤ 8 lines).
- Coverage / latency / flake summary table.
- "What I did NOT cover" section (never dieted — this is the RED-flag surface).

Removed under diet:
- Play-by-play test enumeration ("test 1 asserted X, test 2 asserted Y, ...")
  — the coverage table and the frontmatter's `tests_added:` list already carry this.
- Per-assertion prose explanation — the test file itself IS the spec.
- Screenshots / logs of GREEN test runs (evidence paths in frontmatter suffice).

### J.3 Cap lifted (Report Diet §D applies to test reports too)

The cap lifts under the same conditions as §D:
- Verdict is `RED` / `BLOCKED` — reasoning is unbounded.
- Coverage number fell below threshold — reasoning is unbounded (must explain
  the untestable surface).
- Any NEW MISTAKES entry authored by this test run — the RED→GREEN fix
  iteration distill template from `commands/run-tests.md §4c` (TASK-8) applies
  and is unbounded.

### J.4 Diet-compliance sweep (merge-readiness Step 2e extension)

The existing Step 2e diet-compliance sweep (from TASK-1 / prior REQs) checks
`TASK-*-review-*.md` and `TASK-*-test-*-report.md` for cap compliance under
GREEN/APPROVE verdicts. §J.2 formalises the test-report side of the sweep — no
new grep is added; the existing "~40-line reasoning cap" (Step 2e item 2)
already catches over-verbose GREEN test reports.

## K. Review-report diet — extend Report Diet v2 to `TASK-<n>-review-<type>.md`

### K.1 When to diet a review report

Apply the diet contract §C when ALL of:
- Verdict is `APPROVE` (under §G.1 a nits-only / P3-only findings set always derives `APPROVE`; a `NEEDS-CHANGES` verdict implies a confirmed P2 and is never dieted).
- No `UNRESOLVED` re-verdicts on prior findings (per TASK-9 §Fix-iteration wave inventory).
- No `pack_audit: DIVERGENT` — divergence is unbounded per §D.
- No CONSTITUTION §H iron-rule violation flagged (BLOCKER — never dieted).

### K.2 Review-report diet shape

Dieted review-report retains:
- Frontmatter (all fields per §B.1, unchanged — including `verdict:`,
  `severity_verdict_policy_ack:`, `rubric_bullet:`, `pack_audit:`,
  `raw_doc_reads:`, and the new (Change 7) `wave:` field).
- The mandatory derivation line `Verdict: <BLOCK|NEEDS-CHANGES|APPROVE> (derived — <reasoning>)`.
- One-paragraph "What I checked" section (≤ 8 lines).
- Findings block (NEVER dieted — that IS the review's value; per §I discipline
  every finding still requires file:line + concrete failure path).
- Focused-wave reports keep `## §Prior-finding re-verdicts` and (if present)
  `## §Deferred-out-of-scope findings` sections verbatim per TASK-9.

Removed under diet:
- Per-file walkthrough prose ("I opened src/foo.ts and observed ..." with no
  finding attached) — the review is not a diary.
- Restatement of the TL's blast-radius analysis — the reviewer references
  `tl-analysis.md` by path, does not re-quote it.
- "Recommendation" paragraph beyond one sentence — verdict + derivation line +
  findings ARE the recommendation.

### K.3 Cap lifted (Report Diet §D applies to review reports too)

The cap lifts under the same conditions as §D:
- Verdict is `BLOCK` — reasoning is unbounded.
- Any `UNRESOLVED` P0/P1 finding in focused-wave `§Prior-finding re-verdicts` —
  unbounded (evidence for why the fix did not resolve the finding).
- `pack_audit: DIVERGENT` — the divergence sentence itself is bounded but the
  reviewer's expanded reasoning explaining WHY the pack under-served the review
  is unbounded.
- Any MISTAKES-tagged regression re-detected — unbounded (the regression
  discovery is a first-class output).

### K.4 Diet-compliance sweep (merge-readiness Step 2e extension)

Same sweep as §J.4; no new grep. Reviewer-standards (as an axis) additionally
verifies at review time that dieted review reports still carry the derivation
line (per REPORT_DIET §G) — the diet MUST NOT strip the derivation line, only
the surrounding prose. Any review report missing the derivation line is
INVALID regardless of diet status.

---

## L. Dev-report design-principle self-checklist

> **Canonical body — do NOT inline this section into individual `dev-*.md` agent files.**
> Per the founding rule of this document (header, line 4–6), inlining across 5+ files
> guarantees drift. The 5 dev agents reference this section by pointer only.
> Reference doc: `governance/DESIGN_PRINCIPLES.md` (and its byte-identical shipped copy
> at `claude-marketplace/plugins/eng-org/templates/governance/DESIGN_PRINCIPLES.md`).

### L.1 Purpose

Every Dev completes this checklist in their `TASK-<n>-dev-report.md`. It records:

1. Which of the 15 design principles in `governance/DESIGN_PRINCIPLES.md` apply to this
   change (even if trivially — "not applicable" is a valid answer per-principle when the
   diff genuinely does not touch that concern).
2. Any deliberate **when-NOT trade-off** taken — i.e., a case where the Dev consciously
   chose NOT to apply a principle because a competing force outweighed it. Each such
   trade-off must cite the principle by name and state the competing force in one sentence.

### L.2 Checklist template (paste into TASK-<n>-dev-report.md)

```markdown
## Design-principle self-checklist (REPORT_DIET §L)

Reference: `governance/DESIGN_PRINCIPLES.md`

| Principle | Applied? | Notes / when-NOT trade-off taken |
|---|---|---|
| Single Responsibility (SRP) | yes / no / n/a | |
| Open-Closed (OCP) | yes / no / n/a | |
| Liskov Substitution (LSP) | yes / no / n/a | |
| Interface Segregation (ISP) | yes / no / n/a | |
| Dependency Inversion (DIP) | yes / no / n/a | |
| DRY (+ Rule of Three) | yes / no / n/a | |
| KISS | yes / no / n/a | |
| YAGNI | yes / no / n/a | |
| Law of Demeter | yes / no / n/a | |
| Composition Over Inheritance | yes / no / n/a | |
| Pure Core / Imperative Shell | yes / no / n/a | |
| Separation of Concerns (SoC) | yes / no / n/a | |
| Fail Fast | yes / no / n/a | |
| Make Illegal States Unrepresentable | yes / no / n/a | |
| Least Astonishment | yes / no / n/a | |

### When-NOT trade-offs declared

<!-- For each "no" row where a when-NOT trade-off applies, add one line:
     - **<PrincipalName>:** <competing force in one sentence, citing DESIGN_PRINCIPLES.md §N>. -->

_(none — or list below)_
```

### L.3 Reviewer axis

The `reviewer-architecture` agent checks this checklist as part of its design-principle
axis (see `plugins/eng-org/agents/reviewer-architecture.md` §"What you check"):

- A principle marked **no** without a declared when-NOT trade-off is a finding
  (the Dev may have violated the principle unknowingly).
- A principle marked **no** WITH a declared when-NOT trade-off is accepted as a
  conscious decision (the reviewer still reads the trade-off statement and may flag
  it if the stated competing force is implausible or inapplicable).
- A principle marked **n/a** with no note is accepted if the diff genuinely does
  not touch that concern; the reviewer may challenge a blanket n/a on a diff that
  visibly implicates the principle.
