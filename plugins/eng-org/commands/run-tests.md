---
description: Spawn the 5 Test agents in parallel against a requirement's implemented tasks.
---

You are running tests for a requirement.

The requirement id is: $ARGUMENTS.

Steps:

1. Read every `governance/requirements/REQ-<id>/tasks/TASK-*.md`
   with `status: implemented`. The combined dev-reports are the
   contract Test agents verify.

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
