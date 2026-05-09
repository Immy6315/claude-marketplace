---
description: Spawn the 5 Reviewer agents in parallel against a requirement's GREEN tasks.
---

You are running reviews for a requirement.

The requirement id is: $ARGUMENTS.

Preconditions:
- All tasks in `status: implemented`.
- All Test reports GREEN. Do not proceed if any are RED.

Steps:

1. Read every `tasks/TASK-*.md` and the matching test reports
   (5 per task).

2. For each task, spawn the 5 Reviewer agents in parallel (single
   message, 5 Agent calls):
   - `reviewer-architecture`
   - `reviewer-security`
   - `reviewer-performance`
   - `reviewer-standards`
   - `reviewer-observability`

   Reviewers are read-only. They consume dev-reports + test
   reports + the actual code; they emit a verdict report.

3. Each Reviewer writes
   `tasks/TASK-<n>-review-<type>.md` with verdict APPROVE /
   NEEDS-CHANGES / BLOCK and line-cited findings.

4. After all return, summarize: per-task verdicts. If any BLOCK,
   return to the relevant TL with the findings; the TL decides
   whether to dispatch a Dev fix iteration or escalate to EM.
   If all APPROVE / NEEDS-CHANGES are addressed, print "Reviews
   done for REQ-<id>. Run `/merge-readiness REQ-<id>`."
