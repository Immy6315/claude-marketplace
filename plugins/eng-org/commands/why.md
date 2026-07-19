---
description: Current blocker for a REQ — prints the first missing pipeline stage and the exact fix command (read-only).
---

You are diagnosing the current blocker for one requirement. This command is
STRICTLY READ-ONLY. You MUST NOT Write, Edit, or mutate any artifact on disk.

<!-- 8e-restructure marker: static-prefix ends here, variable body begins -->

The requirement id is: $ARGUMENTS (e.g., `REQ-20260718-d904-01`).

Steps:

1. **Resolve the REQ folder.**
   Path: `governance/requirements/<REQ-id>/`
   If the folder does not exist, print:
   > Blocker: requirement not intaked
   > Fix: `/eng-org:em-intake "<requirement>"`
   Then stop.

2. **Walk the pipeline FORWARD — find the FIRST missing or incomplete stage.**
   Check each stage in order (1 → 8). Stop at the first stage that is missing
   or incomplete. Print exactly ONE blocker line + ONE fix command.

   Canonical 8-stage sequence (hardcoded — if the pipeline renames a stage,
   BOTH `why.md` and `status.md` must be updated together; see hazard
   H-Scripts-DX-1 in `governance/requirements/REQ-20260718-d904-06/tl-scripts-analysis.md`):

   | # | Detected state (read-only check) | Blocker | Fix command |
   |---|---|---|---|
   | 1 | `spec.md` absent (or folder absent) | requirement not intaked | `/eng-org:em-intake "<requirement>"` |
   | 2 | `spec.md` present; no `tl-*-analysis.md` exists | impact analysis not run | `/eng-org:tl-analyze <REQ-id>` |
   | 3 | `tl-*-analysis.md` present; no `trd.md` OR `trd.md` lacks `trd_approved: true` in frontmatter | TRD not authored / not approved | `/eng-org:trd <REQ-id>` |
   | 4 | `trd.md` with `trd_approved: true`; no `tasks/TASK-*-dev-report.md` AND no `implementation/*` | tasks not implemented | `/eng-org:tl-assign <REQ-id>` |
   | 5 | dev reports present; no `tests/*.md` AND no `tasks/TASK-*-test-*.md` — OR any test report contains `FAIL` or `RED` | tests missing or RED | `/eng-org:run-tests <REQ-id>` |
   | 6 | tests green; no `reviews/*.md` AND no `tasks/TASK-*-review-*.md` — OR any review file contains `NEEDS-CHANGES` or `BLOCKED` | reviews pending or not approved | `/eng-org:run-reviews <REQ-id>` |
   | 7 | tests + reviews green; no `merge-readiness.md` — OR `merge-readiness.md` frontmatter `status:` is not `READY-FOR-MERGE` | merge-readiness not composited / not READY | `/eng-org:merge-readiness <REQ-id>` |
   | 8 | `merge-readiness.md` has `status: READY-FOR-MERGE`; no `em-summary.md` | ready, EM summary pending | `/eng-org:em-summary <REQ-id>` |
   | — | `em-summary.md` present AND `READY-FOR-MERGE` confirmed | no pipeline blocker | awaiting human merge — no command (merge is human-gated per Constitution §H.47; only Imran approves) |

3. **Print exactly one blocker.**
   Format:
   ```
   REQ: <REQ-id>
   Stage reached: <last completed stage or "none">
   Blocker: <blocker text from map above>
   Fix: <exact fix command, or "awaiting human merge — no command" for the terminal state>
   ```
   Do NOT print a list of all blockers. Do NOT print stages that are already
   complete. Print the single first-forward-missing blocker only.

4. **Terminal state.**
   If `em-summary.md` is present and the REQ is `READY-FOR-MERGE`, print:
   ```
   REQ: <REQ-id>
   Stage reached: done
   Blocker: no pipeline blocker
   Fix: awaiting human merge — no command (Constitution §H.47)
   ```
   Do NOT suggest a slash command. Merge is exclusively human-gated.

5. **Output contract (binding).**
   This command is read-only: it reads governance artifacts and prints one
   diagnostic block. It MUST NOT Write, Edit, or mutate any artifact on disk.
