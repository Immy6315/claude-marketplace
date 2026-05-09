---
description: Dispatch Dev subagents per TL task decomposition; collect dev-reports.
---

You are dispatching Devs for a requirement.

The requirement id is: $ARGUMENTS.

Steps:

1. Read every `governance/requirements/REQ-<id>/tasks/TASK-*.md`
   that is in `status: ready` (per the task file frontmatter).
   Each task names the Dev type to spawn.

2. Group tasks that have no dependency on each other and spawn
   their Devs in parallel (single message, multiple Agent
   calls). Tasks marked `depends_on: TASK-<m>` wait until
   TASK-<m> reports `status: done`.

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

4. After all Devs return, print a summary: "Devs done for
   REQ-<id>: <count>. Run `/run-tests REQ-<id>`."
