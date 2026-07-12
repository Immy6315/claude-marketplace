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

---

## G. Severity → verdict policy (canonical, v1)

> This section is the single source referenced by every `reviewer-*.md` agent
> file in this plugin. Per-agent files carry a POINTER to this section, never
> a copy — inlining across N files reintroduces the drift trap that
> MISTAKES.md GR F1/F2/F12 already fixed for the diet contract.

**Policy (mandatory, applies to every reviewer agent AND to the GR-review
disposition table written by the assigned TL):**

- Findings of severity `critical` or `high` ⇒ verdict may be `block`.
- Findings of severity `medium` ⇒ verdict is `warn` (NEVER `block` on medium alone).
- Findings of severity `low` ⇒ verdict is `warn` or `note` (NEVER `block`).
- A verdict of `block` is only permitted when at least one finding is `critical` or `high`.
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

---

## H. Severity calibration rubric (canonical, v1)

> This section is the single source referenced by every `reviewer-*.md` agent
> file. Every finding row in every review report MUST cite the specific bullet
> applied, using the §B.1 grammar
> `rubric_bullet: "<level>: <verbatim opening clause of the matching §H bullet>"`
> — the value MUST start with one of critical|high|medium|low followed by `: `.
> Findings without a cited bullet fail template validation.

- **critical** — production outage risk, data loss risk, security breach with
  no mitigation, or violation of a CONSTITUTION §H iron rule.
- **high** — CONSTITUTION BLOCKER-list rule violation (missing
  `protectedProcedure`, missing ownership check, raw SQL, secrets in code/logs,
  missing rate limit on auth endpoints, N+1 on hot path, layering violation
  such as `db` in `domain/`, XP-ledger UPDATE/DELETE, MISTAKES.md regression
  on a tagged pattern).
- **medium** — non-blocking correctness or maintainability concern with a
  concrete file:line (e.g., a new N+1 query on a non-hot endpoint, a missing
  index on a warm path, a swallowed catch on a non-hot path, a documented
  code-drift).
- **low** — style, naming, comment quality, minor duplication, nit-level
  readability.

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
  a diff smaller than 200 LOC**, that is a signal to consolidate — report the
  3 most material and mention the rest in the reasoning section, not as
  separate finding rows. This is a signal, not a hard cap; a reviewer with 5
  concrete critical/high findings on a small diff should still emit all 5.
