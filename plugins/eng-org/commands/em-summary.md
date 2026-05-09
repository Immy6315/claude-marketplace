---
description: EM produces the 1-page summary Imran reads before approving merge.
---

You are producing the EM summary for a requirement.

The requirement id is: $ARGUMENTS.

> **Warm-agent note:** This skill resumes the warm EM from
> `agent_state.json` rather than spawning fresh, per
> `plugins/eng-org/AGENT_STATE.md`. The EM that wrote spec.md is the
> same EM that authors em-summary — they already have full REQ
> context.

Steps:

1. Read `governance/requirements/REQ-<id>/agent_state.json`.
   - **If `agents.em.agent_id` exists AND status is not `stale`:**
     `SendMessage to: <agent_id>` with a focused brief —
     "merge-readiness.md is now on disk for REQ-<id>. Verify verdict
     is READY-FOR-MERGE; if so, write em-summary.md per ROLES.md §2.1
     in 1 page covering: one-line goal, scope (in/out), files changed,
     test signal (10/10 green), review signal (5/5 approve), risk +
     rollback, and 'Imran: please review and approve merge or
     reject.' If verdict is NOT READY-FOR-MERGE, refuse and surface
     the gap."
   - **Else (state lost / imported REQ):** spawn a fresh `em`
     subagent. It will need to read `spec.md`, every
     `tl-*-analysis.md`, every dev-report, every test report, every
     review report, and `merge-readiness.md` from scratch.

2. After em-summary is written, **update agent state**:
   - Warm re-use: set `agents.em.last_phase = "em-summary"`,
     `status = "done"` (still continuable if Imran rejects and a
     new pass is needed), `updated_at = <now>`.
   - Fresh spawn: capture the new `agent_id` and persist the slot.

3. Print the em-summary.md path and stop. Do NOT merge. Do NOT push.
   Imran approves merge in human terminal.

4. Append to `governance/conversations/<today>.md` a 1-line
   pointer: "REQ-<id> em-summary ready — awaiting Imran approval."
