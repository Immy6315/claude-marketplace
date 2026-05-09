---
description: Dispatch Dev subagents per TL task decomposition; collect dev-reports.
---

You are dispatching Devs for a requirement.

The requirement id is: $ARGUMENTS.

> **Warm-agent note:** Devs are *warm per task* per
> `plugins/eng-org/AGENT_STATE.md`. The Dev that writes the code is the
> same Dev that fixes RED tests / BLOCK reviews via `SendMessage`.
> Persist each Dev's `agent_id` keyed by TASK-id.

Steps:

1. Read every `governance/requirements/REQ-<id>/tasks/TASK-*.md`
   that is in `status: ready` (per the task file frontmatter).
   Each task names the Dev type to spawn.

2. Read `governance/requirements/REQ-<id>/agent_state.json`. For each
   ready task:
   - **If `agents.dev.<TASK-id>.agent_id` exists AND status is `warm`
     or `done`** (re-running the assignment): `SendMessage to:
     <agent_id>` with the focused instruction (e.g., "task scope
     unchanged, re-verify dev-report"). Skip cold context-load.
   - **Else (first pass — typical):** spawn a fresh Dev of the
     declared type. Group tasks with no dependency on each other and
     spawn their Devs in parallel (single message, multiple Agent
     calls). Tasks marked `depends_on: TASK-<m>` wait until
     TASK-<m> reports `status: implemented`.

   Available Dev types:
   - `dev-postgres-drizzle` (schema/migrations/indexes)
   - `dev-trpc` (routers/Zod/auth wiring)
   - `dev-domain` (pure logic in `backend/src/domain/`)
   - `dev-expo-rn` (Expo Router/native modules/asset pipeline)
   - `dev-ui-animation` (components/NativeWind/Reanimated)

3. Each Dev agent will:
   - Read its task file end-to-end.
   - Read its required-reading list.
   - Implement exactly the task scope (refuse to drift).
   - Write `tasks/TASK-<n>-dev-report.md` with what changed,
     what was refused, MISTAKES checklist ticks, and a
     hand-off note for Test agents.
   - Update the task file frontmatter to `status: implemented`.

4. **Persist Dev agent state.** For every Dev spawned, capture the
   `agent_id` and update `agent_state.json`:
   ```json
   "dev": {
     "TASK-<n>": {
       "agent_type": "<dev-type>",
       "agent_id": "<captured-id>",
       "status": "warm",
       "last_phase": "implement",
       "spawned_at": "<ISO-8601 now>",
       "updated_at": "<ISO-8601 now>"
     }
   }
   ```
   For warm re-uses, just update `last_phase` and `updated_at`.

5. After all Devs return, print a summary: "Devs done for
   REQ-<id>: <count>. Run `/run-tests REQ-<id>`."

---

## Dev fix iterations (post-test or post-review)

When a `test-*` returns RED or a `reviewer-*` returns BLOCK /
NEEDS-CHANGES, the orchestrator dispatches a fix to the **same Dev**
that originally wrote the code:

1. Look up `agents.dev.TASK-<n>.agent_id` in `agent_state.json`.
2. **If present and not `stale`:** `SendMessage to: <agent_id>` with a
   focused message — e.g., "test at `<file>:<line>` is RED because
   `<reason>` — fix it. Update dev-report when done." Do NOT re-brief
   the entire task; the warm Dev already has full task context.
3. **If absent or `stale`:** spawn a fresh Dev of the same type, point
   it at the task file + dev-report + the failing test/review report,
   and capture the new `agent_id`.
4. After the fix, mark the slot `last_phase: "fix-iteration"` and
   `updated_at: <now>`.
