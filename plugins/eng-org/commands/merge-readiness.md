---
description: TL composites all signals into merge-readiness.md per ROLES.md §4.
---

You are producing merge-readiness for a requirement.

The requirement id is: $ARGUMENTS.

Steps:

1. Re-spawn the assigned TL(s) (per `spec.md`). If multiple, run
   in parallel; each writes its own `tl-<domain>-merge-readiness.md`,
   then a final `merge-readiness.md` aggregates.

2. Each TL agent will:
   - Read every dev-report, test report, and review report under
     `governance/requirements/REQ-<id>/tasks/`.
   - Run `node governance/scripts/check.mjs` if any governance
     doc was touched.
   - Apply the merge-readiness template from ROLES.md §4:
     - Scope summary
     - Files changed list
     - Test signal (5 reports, all GREEN required)
     - Review signal (5 reports, all APPROVE required; one
       NEEDS-CHANGES allowed only with reason + EM ack)
     - MISTAKES regression sweep result
     - Out-of-scope drift declared
     - Verdict: READY-FOR-MERGE / NOT-READY (with reason)

3. After the TL(s) return, print the path(s) to
   merge-readiness.md and tell the user "Run `/em-summary REQ-<id>`
   for the 1-page Imran view."

A merge-readiness.md without all 10 signals (5 tests + 5 reviews)
green is invalid; the TL refuses to write READY-FOR-MERGE.
