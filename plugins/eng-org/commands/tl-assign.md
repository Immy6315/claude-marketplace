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
   - Read its required-reading list (which now includes
     `governance/GUARDRAILS.md`).
   - **FIRST deliverable per G-2:** write
     `tasks/TASK-<n>-regression-check.md` BEFORE any code change,
     listing files touched, prior REQs that touched those files,
     applicable MISTAKES.md entries, and a yes/no preservation
     answer for each. Empty or missing regression-check BLOCKs the
     dev-report.
   - Implement exactly the task scope (refuse to drift).
   - For UI changes: produce `tests/visual-parity-<screen>.png`
     side-by-side per G-1, and register any intentional divergence
     in `governance/design-divergence-registry.md`.
   - For native-dep / `expo.extra` diffs: produce a device-boot
     smoke result per G-3 (run `npx expo run:ios` or ask the
     driving engineer).
   - Write `tasks/TASK-<n>-dev-report.md` with what changed, what
     was refused, MISTAKES checklist ticks, the regression-check
     reference, the G-1 / G-3 evidence as applicable, and a
     hand-off note for Test agents.
   - Update the task file frontmatter to `status: implemented`.

4. After all Devs return, print a summary: "Devs done for
   REQ-<id>: <count>. Run `/run-tests REQ-<id>`."
