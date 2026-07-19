---
description: Pipeline board — table-only status of all REQs and programs (read-only).
---

You are rendering the eng-org pipeline board. This command is STRICTLY READ-ONLY.
You MUST NOT Write, Edit, or mutate any artifact on disk.

<!-- 8e-restructure marker: static-prefix ends here, variable body begins -->

Flags accepted (optional, space-separated after the command):
- `--all` — show every REQ, including shipped/done ones.
- `--program PROG-<id>` — show only REQs that belong to the named program.
- Default (no flags) — show only **in-flight** REQs (exclude any REQ whose
  highest-reached stage is `done` AND whose `em-summary.md` / `merge-readiness.md`
  indicates shipped or READY-FOR-MERGE-and-merged).

Steps:

1. **Build the program → REQ lookup (read each PROG STATE.md exactly once).**
   Glob `governance/autopilot/PROG-*/STATE.md`. Read every file in that list
   ONCE. For each STATE.md, collect:
   - The program id (e.g. `PROG-1`) from the file's path or frontmatter.
   - The list of REQ ids it references (look for `current_req:`, `reqs:`,
     `milestones[*].reqs`, or any array/inline list of `REQ-*` ids).
   - The milestone label associated with each REQ id.
   - The `phase:` and `current_milestone:` frontmatter fields.

   Store the result as an in-memory lookup:
   `REQ-id → { program: "PROG-<id>", milestone: "<label>" }`

   If a REQ id appears in multiple programs (unusual but possible), keep the
   first match.  This lookup is built ONCE and reused for every REQ row — do
   NOT re-read any STATE.md during the per-REQ loop below.

2. **Discover all REQs.**
   Glob `governance/requirements/REQ-*/` (skip `README.md`). One entry per
   REQ folder — this is the full candidate list.

   Apply the active filter (evaluated once, before the per-REQ loop):
   - `--program PROG-<id>` flag present → keep only REQ ids that the lookup
     (step 1) maps to that program id.
   - `--all` flag present → keep all REQ ids.
   - Default (no flags) → keep only REQ ids whose stage (step 3) is NOT
     `done`. Specifically: exclude any REQ where `em-summary.md` is present
     AND (`merge-readiness.md` `status:` is `READY-FOR-MERGE` OR em-summary
     frontmatter/body marks it as shipped/merged). When in doubt, include the
     REQ (err on the side of showing more).

   The table produced in step 4 contains ONLY the filtered set.

3. **For each REQ in the filtered set, detect its furthest-reached pipeline stage.**
   Walk the artifact list below from END to START (end-of-pipeline-wins
   precedence): the first matching artifact from the bottom of the list sets
   the stage.

   Canonical 8-stage sequence (hardcoded — if the pipeline renames a stage,
   BOTH `status.md` and `why.md` must be updated together; see hazard
   H-Scripts-DX-1 in `governance/requirements/REQ-20260718-d904-06/tl-scripts-analysis.md`):

   | Artifact (repo-relative) | Signal | Stage / verdict |
   |---|---|---|
   | `governance/requirements/REQ-<id>/em-summary.md` exists | `**Status:**` line or frontmatter | `done` / verdict from em-summary |
   | `governance/requirements/REQ-<id>/merge-readiness.md` exists | frontmatter `status:` value | `merge-readiness` + `READY-FOR-MERGE` / `BLOCKED` / `NEEDS-CHANGES` |
   | any `governance/requirements/REQ-<id>/reviews/*.md` OR `tasks/TASK-*-review-*.md` | presence | `run-reviews` |
   | any `governance/requirements/REQ-<id>/tests/*.md` OR `tasks/TASK-*-test-*.md` | presence | `run-tests` |
   | any `governance/requirements/REQ-<id>/implementation/*` OR `tasks/TASK-*-dev-report.md` | presence | `tl-assign` |
   | `governance/requirements/REQ-<id>/trd.md` exists | frontmatter `trd_approved: true`? | `trd` (approved) or `trd` (draft) |
   | any `governance/requirements/REQ-<id>/tl-*-analysis.md` | presence | `tl-analyze` |
   | `governance/requirements/REQ-<id>/spec.md` exists | `**Verdict: Mode …**` | `spec` |
   | folder exists, no `spec.md` | — | `intake-incomplete` |

4. **For each REQ in the filtered set, derive the remaining columns.**

   - `program/milestone` — look up the REQ id in the in-memory lookup built in
     step 1. Use `—` if not found. Do NOT re-read any STATE.md here.
   - `mode` — read from `spec.md` frontmatter `mode:` or from the `**Verdict:
     Mode …**` line. Use `—` if spec absent.
   - `blocker` — the single next-action line (same taxonomy as `/eng-org:why`):
     - `intake-incomplete` → `run /eng-org:em-intake "<requirement>"`
     - `spec` → `run /eng-org:tl-analyze REQ-<id>`
     - `tl-analyze` → `run /eng-org:trd REQ-<id>`
     - `trd (draft)` → `run /eng-org:trd REQ-<id>` (approval pending)
     - `trd (approved)` → `run /eng-org:tl-assign REQ-<id>`
     - `tl-assign` → `run /eng-org:run-tests REQ-<id>`
     - `run-tests` → `run /eng-org:run-reviews REQ-<id>`
     - `run-reviews` → `run /eng-org:merge-readiness REQ-<id>`
     - `merge-readiness` (not READY) → `run /eng-org:merge-readiness REQ-<id>`
     - `merge-readiness` (READY) → `run /eng-org:em-summary REQ-<id>`
     - `done` / READY-FOR-MERGE terminal → `awaiting human merge`
   - `verdict` — `READY-FOR-MERGE` / `BLOCKED` / `NEEDS-CHANGES` /
     `in-progress` (use `in-progress` for any stage before merge-readiness).

5. **Render REQ table — TABLE ONLY, no prose sections.**

   Print EXACTLY this table and no surrounding narrative:

   | REQ id | program/milestone | mode | current stage | blocker | verdict |
   |---|---|---|---|---|---|
   | REQ-… | … | … | … | … | … |

   One-line legend (permitted as a table caption, not a prose section):
   `Stages: intake-incomplete → spec → tl-analyze → trd → tl-assign → run-tests → run-reviews → merge-readiness → done | Showing: in-flight only (add --all to widen, --program PROG-<id> to filter by program)`

6. **Render programs table — TABLE ONLY, immediately below the REQ table.**
   Use the data already collected in step 1 (already in memory — no new reads).

   | program id | phase | current milestone | REQs in flight | next action |
   |---|---|---|---|---|
   | PROG-… | … | … | … | … |

   `REQs in flight` = count of REQ ids in the step-1 lookup for this program
   that have not yet reached `done`/READY-FOR-MERGE.

7. **Output contract (binding).**
   The ONLY output is the two tables above plus their one-line captions.
   No headings-with-prose, no summary paragraphs, no narration between or
   after the tables. This command is read-only: it reads governance artifacts
   and renders tables. It MUST NOT Write, Edit, or mutate anything.
