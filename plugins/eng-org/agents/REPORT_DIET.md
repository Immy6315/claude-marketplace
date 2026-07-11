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
files_reviewed:
  - <path>:<line-range>
  - ...
findings_count:
  blocker: <n>
  concern: <n>
  nit: <n>
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
  - <absolute path or repo-relative path>:<line-range>
  - ...
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
  (absolute paths to test files / to specific file:line ranges reviewed).
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
   the phrase "Cap LIFTED (unbounded prose required) when:" inlined — that phrase
   belongs ONLY in this canonical doc. Presence in any non-canonical agent file = NOT-READY.
   ```bash
   grep -rl "Cap LIFTED (unbounded prose required) when:" \
     plugins/eng-org/agents/*.md \
     | grep -v REPORT_DIET.md
   ```
   Must return empty (zero non-canonical agent files).
