---
description: TRD authoring + lint + approval — author the Technical Requirements Document for a REQ, lint it with trd-lint.mjs (exit 0 required), and record EM approval before tl-assign may dispatch Devs.
---

You are running the TRD authoring and approval stage for a requirement.

<!-- 8e-restructure marker: static-prefix ends here, variable body begins -->

The requirement id is: $ARGUMENTS (e.g., `REQ-20260509-01`).

This command sits BETWEEN `/eng-org:tl-analyze` and `/eng-org:tl-assign` in the
Mode B pipeline. Devs cannot be dispatched until this command completes and records
a `trd_approved: true` marker in `governance/requirements/REQ-<id>/trd.md`.

Steps:

1. Read `governance/requirements/REQ-<id>/tl-scripts-analysis.md` (or the
   relevant `tl-<domain>-analysis.md` if multiple TLs were assigned).
   Extract:
   - The scope, blast radius, and proposed task decomposition.
   - Any Q-decisions that constrain the technical approach.
   - All binding MISTAKES.md regressions cited by the TL.

2. Author the TRD from the frozen template into
   `governance/requirements/REQ-<id>/trd.md`.
   - Copy `templates/trd.template.md` as the starting point (do NOT modify
     the template itself).
   - Fill every section — §1 (What), §2 (How, including the mermaid sequence
     diagram), §3 (DB Schema — N/A if no DB changes), §4 (API Contracts —
     N/A if no API changes), §5 (Acceptance Criteria), E1 (Design Principles),
     E2 (Blast Radius, including the three machine-parsed budget fields:
     `files_touched_max`, `loc_max`, `allow_full_rewrite`), E3 (File-by-File
     Change Map), E4 (Test-Tier Strategy).
   - Placeholder lines (`[...]`, `TODO`, `TBD`, HTML comments) do NOT satisfy
     the non-empty requirement — the linter rejects them.
   - §3 and §4 may carry "N/A" as their entire content if no changes apply.
   - The frontmatter block at the top of the TRD carries `status: draft` until
     approval; leave the frontmatter keys `trd_approved`, `approved_by`, and
     `approved_at` ABSENT until Step 4 below.

3. Run `trd-lint.mjs` on the authored TRD:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/trd-lint.mjs" \
     "governance/requirements/REQ-<id>/trd.md"
   ```

   Exit-code contract (authoritative — defined in `scripts/trd-lint.mjs`):
   - **exit 0** — all sections present and non-empty, E2 budget fields
     present, ≥1 mermaid fence found → PASS. Continue to Step 4.
   - **exit 1** — one or more findings printed to stderr → FAIL.
     Print every finding, fix the TRD, re-run the linter. Do NOT proceed
     to Step 4 until exit 0 is achieved.
   - **exit 2** — IO error (file not found, unreadable, etc.) → STOP.
     Report the error and do not write any approval marker.

   The approval marker (Step 4) MUST NOT be written until exit 0 is
   achieved in this step. Writing it before lint PASS defeats the
   `tl-assign` gate.

4. Record the EM/human TRD-approval marker in the TRD's frontmatter ONLY
   after Step 3 exits 0. Add these three keys immediately after the
   existing frontmatter keys in `governance/requirements/REQ-<id>/trd.md`:

   ```yaml
   trd_approved: true
   approved_by: <EM-agent-id or human name>
   approved_at: <YYYY-MM-DD>
   ```

   These keys are machine-checkable by `tl-assign` via:
   ```bash
   grep -q '^trd_approved: true' governance/requirements/REQ-<id>/trd.md
   ```

   The linter ignores frontmatter, so adding these keys does NOT invalidate
   the lint result.

5. Declare the TRD binding context for Devs. Print a summary:
   - Path of the approved TRD: `governance/requirements/REQ-<id>/trd.md`
   - Lint result: PASS (exit 0)
   - Approval recorded: `trd_approved: true` by `<approved_by>` on `<approved_at>`
   - Instruction: "The TRD is now binding for all Devs assigned to this REQ.
     Run `/eng-org:tl-assign REQ-<id>` to dispatch Dev agents."

   Devs MUST read `trd.md` as part of their required reading. The TRD
   supersedes any informal design notes from the tl-analysis; where they
   conflict, `trd.md` is authoritative.
