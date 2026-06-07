---
description: Spawn the 5 Test agents in parallel against a requirement's implemented tasks.
---

You are running tests for a requirement.

The requirement id is: $ARGUMENTS.

Steps:

1. Read every `governance/requirements/REQ-<id>/tasks/TASK-*.md`
   with `status: implemented`. The combined dev-reports are the
   contract Test agents verify.

1b. **Docker preflight (DB-backed tiers only).** The
   `test-integration` and `test-load` tiers need a live Docker
   daemon (testcontainers spins its own ephemeral Postgres/Redis/
   Mosquitto). If ANY implemented task touches `backend/`, bring
   Docker up first:

   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/scripts/docker-lifecycle.sh" up
   ```

   This starts Docker Desktop only if it is not already running,
   and records a marker so the teardown in step 5 knows the
   pipeline started it. **Skip this step entirely** for pure-docs
   or pure-mobile-UI REQs where both `test-integration` and
   `test-load` skip-with-note — they need no daemon, so Docker
   stays off and no RAM is spent.

2. For each task, spawn the 5 Test agents in parallel (single
   message, 5 Agent calls):
   - `test-unit`
   - `test-integration`
   - `test-e2e` (skip-with-note if no UI surface touched)
   - `test-regression`
   - `test-load` (skip-with-note if pure docs / pure UI cosmetic)

   Each is independent of every other and independent of the Dev
   that wrote the code. They write tests, not production code.

3. Each Test agent writes
   `tasks/TASK-<n>-test-<type>-report.md` with verdict GREEN /
   RED, coverage / latency / flake numbers, and a "what I did
   not cover" section.

4. After all return, summarize: green/red count per task. If any
   RED, do NOT proceed to reviews — return to the relevant TL
   to dispatch a fix iteration. If all GREEN, print "Tests done
   for REQ-<id>. Run `/run-reviews REQ-<id>`."

5. **Docker teardown.** If you ran the step-1b preflight `up`,
   stop Docker now to reclaim RAM:

   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/scripts/docker-lifecycle.sh" down
   ```

   This is marker-guarded: it stops Docker **only if the pipeline
   started it** in step 1b. A Docker instance the engineer opened
   manually (e.g. for live device e2e) has no marker and is left
   running. Run `down` even when tests came back RED — the daemon
   is no longer needed until the next test run, and the fix
   iteration's `/run-tests` will bring it back up.
