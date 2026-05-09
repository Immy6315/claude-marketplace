---
description: Dry-run the 5-role pipeline on a small canned change to verify the wiring works end-to-end before the first real REQ.
---

You are running the pilot integrity check on the multi-agent
pipeline. This is the smoke test for the framework itself, not a
real requirement.

Steps:

1. Confirm all 20 agent files exist in `.claude/agents/`:
   - em.md
   - tl-{auth,gamification,pets,mobile}.md
   - dev-{postgres-drizzle,trpc,domain,expo-rn,ui-animation}.md
   - test-{unit,integration,e2e,regression,load}.md
   - reviewer-{architecture,security,performance,standards,observability}.md

2. Confirm all 8 slash command files exist in `.claude/commands/`:
   em-intake, tl-analyze, tl-assign, run-tests, run-reviews,
   merge-readiness, em-summary, pilot-check.

3. Confirm `governance/ROLES.md`, `governance/requirements/README.md`,
   `governance/CONSTITUTION.md` (with §H), `governance/REVIEW_PROCESS.md`
   (with Mode B section), `CLAUDE.md` (with §6) all reference the
   5-role model.

4. Run `node governance/scripts/check.mjs` and surface output.

5. Verify each agent's required-reading file list points to files
   that actually exist. Use `Read` to spot-check 3 random agents.

6. Print a 1-paragraph integrity verdict: GREEN (framework ready
   for first real REQ) or RED (with the specific gap).

Do NOT spawn EM/TL/Dev/Test/Reviewer agents in this command.
This is structural, not behavioral.
