---
description: Run impact analysis with the assigned TL(s) for a requirement.
---

You are running TL impact analysis for a requirement.

The requirement id is: $ARGUMENTS (e.g., `REQ-20260509-01`).

> **Warm-agent note:** TLs are *warm* per `plugins/eng-org/AGENT_STATE.md`.
> Each TL is spawned once per REQ here; later skills (`/merge-readiness`)
> resume them via `SendMessage`. Persist their agent_ids in
> `agent_state.json`.

Steps:

1. Read `governance/requirements/REQ-<id>/spec.md` to find which
   TL(s) the EM assigned.

2. Read `governance/requirements/REQ-<id>/agent_state.json` if it
   exists. For each assigned TL:
   - **If `agents.tl.<domain>.agent_id` exists AND status is `warm`
     or `done`** (this REQ has been re-run or is being resumed):
     `SendMessage to: <agent_id>` with the analysis brief — the warm
     TL already has spec context and just needs the focused
     instructions for this phase.
   - **Else (first analysis pass — typical case):** spawn a fresh
     subagent of that TL type (`tl-auth` / `tl-gamification` /
     `tl-pets` / `tl-mobile`). If multiple TLs, spawn them in
     parallel (single message, multiple Agent calls).

3. Each TL agent will:
   - Read its own §2.2.X contract from ROLES.md.
   - Read all required-reading files for its specialty.
   - Read every file in its domain that the requirement might
     touch (verify against source — no memory).
   - Write `governance/requirements/REQ-<id>/tl-<domain>-analysis.md`
     covering: scope, blast radius, MISTAKES regression checklist,
     specialty-hazard checklist, proposed task decomposition (one
     `tasks/TASK-<n>-<slug>.md` per Dev assignment), test plan,
     review plan, risks, rollback.

4. **Persist TL agent state.** For every TL spawned (not for warm
   re-uses), capture the `agent_id` and update
   `agent_state.json`:
   ```json
   "tl": {
     "<domain>": {
       "agent_id": "<captured-id>",
       "status": "warm",
       "last_phase": "tl-analyze",
       "spawned_at": "<ISO-8601 now>",
       "updated_at": "<ISO-8601 now>"
     }
   }
   ```
   For warm re-uses, just update `last_phase` and `updated_at`.

5. After all TLs return, summarize: "TL analysis for REQ-<id>
   complete. Tasks proposed: <count>. Run `/tl-assign REQ-<id>`
   to dispatch Devs."

Do NOT spawn Devs in this command. Analysis only.
