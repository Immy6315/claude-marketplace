---
description: Spawn the 6 Reviewer agents in parallel against a requirement's GREEN tasks.
---

You are running reviews for a requirement.

The requirement id is: $ARGUMENTS.

Preconditions:
- All tasks in `status: implemented`.
- All Test reports GREEN. Do not proceed if any are RED.

Steps:

1. Read every `tasks/TASK-*.md` and the matching test reports
   (5 per task).

2. For each task, spawn the Reviewer agents in parallel (single
   message). The default set is 5; spawn the 6th — `reviewer-indexes`
   — additionally whenever the task touches `backend/src/db/schema.ts`,
   any generated migration in `backend/drizzle/`, or introduces a
   new hot-path query (`where` / `order by` / `join` on a > 100k-row
   table). When in doubt, include `reviewer-indexes`.

   - `reviewer-architecture`
   - `reviewer-security`
   - `reviewer-performance`
   - `reviewer-standards`
   - `reviewer-observability`
   - `reviewer-indexes` (schema / hot-path query changes only)

   Reviewers are read-only. They consume dev-reports + test
   reports + the actual code; they emit a verdict report.

3. Each Reviewer writes
   `tasks/TASK-<n>-review-<type>.md` with verdict APPROVE /
   NEEDS-CHANGES / BLOCK and line-cited findings.

4. **GR deep-review (independent second engine).** While the role
   reviewers run, also run the `gr` multi-specialist review engine on
   the REQ's actual diff. GR fans out its own specialist agents
   (security, performance, architecture, code-quality, testing,
   observability, domain) over the raw diff + repo neighborhood — an
   independent lens that regularly catches what role reviewers miss,
   and vice versa.

   a) Resolve the binary (auto-installs on first use; needs NO
      gr-reviewer plugin and NO GitHub token):

      ```bash
      GR_BIN=$(bash "${CLAUDE_PLUGIN_ROOT}/scripts/gr-ensure.sh")
      ```

      If this fails (offline, unsupported platform), SKIP GR with a
      note in `gr-review.md` — never hard-block the pipeline on it.

   b) Determine the diff base: the REQ's target/base branch from
      `spec.md` (e.g. `develop`, `releases/stable`) — do NOT assume
      `main`. Then run in local-diff mode against the working repo:

      ```bash
      "$GR_BIN" review --range <base-branch>..HEAD --repo <repo-path> --preset standard
      ```

      This needs no PR and posts nothing; findings print locally and
      land in `<repo>/.gr/reviews/<N>/result.json`.

   c) **TL validation gate (mandatory).** GR findings are ADVISORY
      until the assigned TL evidence-verifies each one: open the cited
      file/lines and confirm the claim against the actual code. GR
      medium-confidence findings have a known false-positive rate —
      never dispatch a Dev fix from an unverified finding.

   d) Write `governance/requirements/REQ-<id>/gr-review.md`: every GR
      finding with severity, file:line, and a disposition —
      `CONFIRMED` (with evidence) / `FALSE-POSITIVE` (with the
      disproving evidence) / `OUT-OF-SCOPE` (pre-existing, log to
      TECH_DEBT.md instead). Confirmed P0/P1 count as a BLOCK;
      confirmed P2/P3 as NEEDS-CHANGES nits.

   e) **Learning loop:** for each CONFIRMED finding, append a
      prevention rule to `governance/MISTAKES.md` (what GR caught,
      why the role reviewers missed it). This is how the org stops
      repeating the same class of mistake.

5. After all return, summarize: per-task verdicts + the GR
   disposition table. If any BLOCK (role reviewer or confirmed GR
   P0/P1), return to the relevant TL with the findings; the TL
   decides whether to dispatch a Dev fix iteration or escalate to EM.
   If all APPROVE / NEEDS-CHANGES are addressed, print "Reviews
   done for REQ-<id>. Run `/merge-readiness REQ-<id>`."
