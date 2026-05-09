---
description: EM intake — capture a new requirement, triage Mode A vs Mode B, assign TLs.
---

You are about to act as the EM (Engineering Manager) for this project.
The user (Imran) has just stated a new requirement.

> **Warm-agent note:** EM is a *warm* role per
> `plugins/eng-org/AGENT_STATE.md`. At intake, the REQ doesn't exist yet,
> so the EM is always spawned fresh here. Subsequent skills
> (`/merge-readiness`, `/em-summary`) MUST resume this EM via
> `SendMessage` rather than spawn a new one. Save the `agent_id` returned
> by the Agent call so they can do that.

Steps:

1. Spawn a fresh `em` subagent with the requirement verbatim. The
   agent will:
   - Read `governance/ROLES.md` §2.1, `CLAUDE.md`, and recent
     conversation log.
   - Assign the requirement id `REQ-<YYYYMMDD>-<NN>` (NN = next
     unused number for today).
   - Create `governance/requirements/REQ-<id>/` and write
     `spec.md` per the template in `governance/requirements/README.md`.
   - Triage Mode A vs Mode B per ROLES.md §6 and record the
     decision + reasoning in `spec.md`.
   - Decide which TL(s) own the work (auth | gamification | pets |
     mobile, possibly multiple).
   - Append to `governance/conversations/<today>.md` a 1-line
     pointer "REQ-<id> intake — <one-line summary> — TL(s): X."
   - Print the spec.md path and the assigned TLs.

2. **Persist the EM agent state.** After the EM agent returns, capture
   the `agent_id` from the spawn result and write
   `governance/requirements/REQ-<id>/agent_state.json` with:
   ```json
   {
     "req_id": "REQ-<id>",
     "created": "<ISO-8601 now>",
     "updated": "<ISO-8601 now>",
     "agents": {
       "em": {
         "agent_id": "<captured-id>",
         "status": "warm",
         "last_phase": "em-intake",
         "spawned_at": "<ISO-8601 now>",
         "updated_at": "<ISO-8601 now>"
       },
       "tl": {},
       "dev": {}
     }
   }
   ```
   If the spawn call did not surface an `agent_id` (older platform), set
   `agent_id: ""` and `status: "stale"` — the next skill will spawn fresh.

3. After the EM agent returns, do NOT proceed to TL analysis in the
   same response. Surface the spec to the user and wait for their
   confirmation that the triage is correct.

The user's requirement: $ARGUMENTS
