---
description: EM produces the 1-page summary Imran reads before approving merge.
---

You are producing the EM summary for a requirement.

The requirement id is: $ARGUMENTS.

Steps:

1. Spawn a fresh `em` subagent. It will:
   - Read `spec.md`, `tl-*-analysis.md`, every dev-report, every
     test report, every review report, and `merge-readiness.md`
     for REQ-<id>.
   - Verify merge-readiness verdict is READY-FOR-MERGE; if not,
     refuse to write em-summary and surface the gap.
   - Write `governance/requirements/REQ-<id>/em-summary.md` per
     the template in ROLES.md §2.1, in 1 page:
     - One-line goal
     - Scope (in / out)
     - Files changed (count + critical paths)
     - Test signal (10/10 green)
     - Review signal (5/5 approve)
     - Risk + rollback
     - "Imran: please review and approve merge or reject."

2. After em-summary is written, print its path and stop. Do NOT
   merge. Do NOT push. Imran approves merge in human terminal.

3. Append to `governance/conversations/<today>.md` a 1-line
   pointer: "REQ-<id> em-summary ready — awaiting Imran approval."
