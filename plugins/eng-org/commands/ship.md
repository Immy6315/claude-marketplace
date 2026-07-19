---
description: One-shot Mode B pipeline orchestrator — runs all 8 pipeline commands in order, halts on the first red gate, never swallows errors, and stops at READY-FOR-MERGE (human merge is §H.47-gated).
---

You are orchestrating the full Mode B pipeline for one requirement. This command
INVOKES the 8 existing pipeline commands in order. It does NOT reimplement any of
their logic.

<!-- 8e-restructure marker: static-prefix ends here, variable body begins -->

The requirement id is: $ARGUMENTS (e.g., `REQ-20260718-d904-01`).

---

## Hard contracts (four — all binding, all explicit)

### Contract 1 — Halt-on-red (per-stage artifact inspection)

After invoking each pipeline command, inspect that stage's produced artifact for a
RED signal BEFORE advancing to the next stage. Detection rules are concrete and
per-stage:

| Stage | Artifact inspected | RED signal → STOP |
|---|---|---|
| `em-intake` | `governance/requirements/REQ-<id>/spec.md` | file absent after invocation |
| `tl-analyze` | `governance/requirements/REQ-<id>/tl-*-analysis.md` | file absent after invocation |
| `trd` | `governance/requirements/REQ-<id>/trd.md` | file absent OR `trd_approved: true` missing from frontmatter OR `trd-lint.mjs` exited non-zero |
| `tl-assign` | `governance/requirements/REQ-<id>/tasks/TASK-*-dev-report.md` OR `implementation/*` | no file produced after invocation |
| `run-tests` | `governance/requirements/REQ-<id>/tests/*.md` OR `tasks/TASK-*-test-*.md` | file absent OR any file contains `FAIL` or `RED` |
| `run-reviews` | `governance/requirements/REQ-<id>/reviews/*.md` OR `tasks/TASK-*-review-*.md` | file absent OR any file contains `NEEDS-CHANGES` or `BLOCKED`; OR `gr-review.md` contains a GR CONFIRMED blocker |
| `merge-readiness` | `governance/requirements/REQ-<id>/merge-readiness.md` | file absent OR frontmatter `status:` is NOT `READY-FOR-MERGE` |
| `em-summary` | `governance/requirements/REQ-<id>/em-summary.md` | file absent after invocation |
| any stage | that stage's self-check (lint/typecheck) | non-zero exit |

On the FIRST red signal detected, **STOP immediately**. Do not invoke the next
pipeline command. Surface the failure per Contract 2 below.

### Contract 2 — Never-swallow-errors

On any halt, print exactly:

```
SHIP HALTED
REQ:           <REQ-id>
Stage reached: <last successfully completed stage, or "none">
Failing stage: <the stage that produced the RED signal>
Red signal:    <exact artifact path + the RED keyword or missing-file fact>
Fix:           <exact fix command from the /eng-org:why 8-row taxonomy below>
```

The `/eng-org:why` 8-row fix-command taxonomy (reused verbatim — do NOT fork):

| Stage that failed | Fix command |
|---|---|
| `em-intake` | `/eng-org:em-intake "<requirement>"` |
| `tl-analyze` | `/eng-org:tl-analyze <REQ-id>` |
| `trd` | `/eng-org:trd <REQ-id>` |
| `tl-assign` | `/eng-org:tl-assign <REQ-id>` |
| `run-tests` | `/eng-org:run-tests <REQ-id>` |
| `run-reviews` | `/eng-org:run-reviews <REQ-id>` |
| `merge-readiness` | `/eng-org:merge-readiness <REQ-id>` |
| `em-summary` | `/eng-org:em-summary <REQ-id>` |

Errors are never summarized, continued past, or silently dropped.

### Contract 3 — Orchestrate, do not reimplement

This command names each pipeline command to run in the sequence below (Step 2).
It MUST NOT duplicate or reimplement any command's internal logic. All behavior
is owned by the command being invoked; `ship` only sequences them and inspects
the artifacts they produce.

### Contract 4 — Merge is human-gated (Constitution §H.47)

`ship` STOPS at `em-summary` / READY-FOR-MERGE. It NEVER merges, pushes,
publishes, or version-bumps. The terminal success output is:

```
SHIP COMPLETE
REQ:    <REQ-id>
Stage:  done — em-summary produced, merge-readiness.md status: READY-FOR-MERGE
Action: READY-FOR-MERGE — awaiting human merge (Constitution §H.47; only Imran approves)
```

No further action is taken by this command after printing the above.

---

## Steps

1. **Resolve the REQ folder.**
   Path: `governance/requirements/<REQ-id>/`
   If the folder does not exist, halt immediately:
   ```
   SHIP HALTED
   REQ:           <REQ-id>
   Stage reached: none
   Failing stage: em-intake
   Red signal:    governance/requirements/<REQ-id>/ — folder absent
   Fix:           /eng-org:em-intake "<requirement>"
   ```
   Stop. Do not proceed.

2. **Invoke the 8 pipeline commands in sequence, halting on first red.**

   For each stage below, in order:
   a. Invoke the named command.
   b. Immediately after it returns, apply the halt-on-red check (Contract 1).
   c. If the check detects a RED signal, print the SHIP HALTED block (Contract 2) and STOP.
   d. Only if the check is GREEN, continue to the next stage.

   | # | Invoke | Halt-on-red check |
   |---|---|---|
   | 1 | `/eng-org:em-intake $ARGUMENTS` | `governance/requirements/REQ-<id>/spec.md` exists |
   | 2 | `/eng-org:tl-analyze <REQ-id>` | any `governance/requirements/REQ-<id>/tl-*-analysis.md` exists |
   | 3 | `/eng-org:trd <REQ-id>` | `governance/requirements/REQ-<id>/trd.md` exists AND `trd_approved: true` in frontmatter AND `trd-lint.mjs` exited 0 |
   | 4 | `/eng-org:tl-assign <REQ-id>` | any `governance/requirements/REQ-<id>/tasks/TASK-*-dev-report.md` OR `implementation/*` exists |
   | 5 | `/eng-org:run-tests <REQ-id>` | any `tests/*.md` OR `tasks/TASK-*-test-*.md` exists AND none contains `FAIL` or `RED` |
   | 6 | `/eng-org:run-reviews <REQ-id>` | any `reviews/*.md` OR `tasks/TASK-*-review-*.md` exists AND none contains `NEEDS-CHANGES` or `BLOCKED` AND no GR CONFIRMED blocker in `gr-review.md` |
   | 7 | `/eng-org:merge-readiness <REQ-id>` | `merge-readiness.md` exists AND frontmatter `status: READY-FOR-MERGE` |
   | 8 | `/eng-org:em-summary <REQ-id>` | `em-summary.md` exists |

3. **On successful completion of all 8 stages**, print the SHIP COMPLETE terminal block
   (Contract 4) and stop. Do not take any further action.

4. **Output contract (binding).**
   This command is an orchestrator: it sequences existing commands and inspects their
   artifacts. It MUST NOT Write, Edit, or mutate any artifact directly — all writes
   are performed by the invoked commands. On halt, it prints the SHIP HALTED block
   and stops. On success, it prints the SHIP COMPLETE block and stops. It NEVER
   merges, pushes, publishes, or version-bumps (Constitution §H.47).
