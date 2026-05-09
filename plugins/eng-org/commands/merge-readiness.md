---
description: TL composites all signals into merge-readiness.md per ROLES.md §4.
---

You are producing merge-readiness for a requirement.

The requirement id is: $ARGUMENTS.

> **Warm-agent note:** This skill resumes the warm TL(s) from
> `agent_state.json` rather than spawning fresh, per
> `plugins/eng-org/AGENT_STATE.md`. The TL that did the analysis and
> assignment is the same TL that aggregates merge-readiness — they
> already have full REQ context.

Steps:

1. Read `governance/requirements/REQ-<id>/agent_state.json` and
   `spec.md` to identify the assigned TL(s).

2. For each assigned TL:
   - **If `agents.tl.<domain>.agent_id` exists AND status is not
     `stale`:** `SendMessage to: <agent_id>` with a focused brief —
     "All test + review reports are now on disk under
     `tasks/`. Read the new ones and produce
     `tl-<domain>-merge-readiness.md` per ROLES.md §4."
   - **Else (state lost or first run on imported REQ):** spawn a
     fresh `tl-<domain>` subagent and point it at the spec, all
     dev-reports, all test reports, and all review reports.

   If multiple TLs, dispatch them in parallel (single message,
   multiple SendMessage / Agent calls).

3. Each TL agent will:
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

4. **Update agent state** for every TL touched:
   - For warm re-uses: set `agents.tl.<domain>.last_phase =
     "merge-readiness"`, `updated_at = <now>`.
   - For fresh spawns: capture the new `agent_id` and write the slot
     fully (status `warm`, last_phase `merge-readiness`).

5. If multiple TLs ran, write the aggregator `merge-readiness.md` at
   the REQ root (this is the orchestrator's job, not a TL agent's).
   For single-TL REQs the TL's `tl-<domain>-merge-readiness.md` is
   the same content; copy or symlink to `merge-readiness.md`.

6. After the TL(s) return, print the path(s) to
   `merge-readiness.md` and tell the user "Run `/em-summary REQ-<id>`
   for the 1-page Imran view."

A merge-readiness.md without all 10 signals (5 tests + 5 reviews)
green is invalid; the TL refuses to write READY-FOR-MERGE.
