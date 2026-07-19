---
description: Human-gated inbox — surfaces open items from HUMAN-BLOCKERS.md that need Imran's action (read-only; never auto-resolves).
---

You are rendering the human-gated blocker inbox for one or all programs. This
command is STRICTLY READ-ONLY. You MUST NOT Write, Edit, or mutate any artifact
on disk. You MUST NOT flip a `Status:` value, remove a row, or resolve a blocker
entry — that is exclusively Imran's action.

<!-- 8e-restructure marker: static-prefix ends here, variable body begins -->

Optional argument: $ARGUMENTS = `PROG-<id>` (e.g., `PROG-20260718-d904-01`).
If omitted, all programs are surfaced (glob across programs).

Steps:

1. **Resolve the target file(s).**

   - If `$ARGUMENTS` is a `PROG-<id>`:
     - Target path: `governance/autopilot/<PROG-id>/HUMAN-BLOCKERS.md`
     - If this file does not exist, print:
       ```
       No human blockers on record for <PROG-id>.
       ```
       Then stop. Do NOT create the file — creation is the autopilot loop's
       responsibility, not this command's.

   - If `$ARGUMENTS` is absent or empty:
     - Glob: `governance/autopilot/PROG-*/HUMAN-BLOCKERS.md`
     - If the glob returns no files, print:
       ```
       No human blockers on record across any program.
       ```
       Then stop. Do NOT create any file.

2. **For each resolved file, read it (read-only).**

   Extract the program id from the file path
   (`governance/autopilot/<PROG-id>/HUMAN-BLOCKERS.md` → `<PROG-id>`).

   From the append-only table in the file, collect every row where
   `Status` is `open`. If the `Status` column is absent or unrecognized,
   treat every non-header row as `open` (err toward surfacing).

   If the file exists but contains no rows with `Status: open` (all rows
   are closed/resolved or the table has only the placeholder `(none yet)` row):

   ```
   <PROG-id>: no open human blockers.
   ```

3. **Render the open-blocker table for each program with open rows.**

   Print one table per program, grouped by program, with a header naming
   the program. Emit ONLY the columns `#`, `Date`, `Blocker`,
   `Why human-gated`, and `Proposed action for Imran` — do NOT emit the
   `Status` column in the output (it is always `open` for the rows shown).

   Format:

   ```
   ## <PROG-id> — open human blockers

   | # | Date | Blocker | Why human-gated | Proposed action for Imran |
   |---|---|---|---|---|
   | <row> | … | … | … | … |
   ```

   One table per program. If multiple programs have open blockers, render
   them in the order the glob returns (typically lexicographic by PROG-id).

4. **After all tables**, print exactly one closing line:

   ```
   These items require Imran's action. This command surfaces them only — it
   does not resolve, flip, or remove any row.
   ```

5. **Output contract (binding).**
   The ONLY output is the per-program open-blocker tables above (step 3) plus
   the closing line (step 4), or the "no human blockers on record" message
   (step 1/2) if applicable. No headings-with-prose beyond the program group
   headers, no summary paragraphs, no additional narration. This command is
   read-only: it reads `HUMAN-BLOCKERS.md` files and renders their open rows.
   It MUST NOT Write, Edit, or mutate any artifact on disk. It MUST NOT flip
   a `Status:` value, remove a row, or auto-resolve any blocker entry — that
   is exclusively Imran's action (human-gated per Constitution §H.47).
