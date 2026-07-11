---
description: Run impact analysis with the assigned TL(s) for a requirement.
---

You are running TL impact analysis for a requirement.

The requirement id is: $ARGUMENTS (e.g., `REQ-20260509-01`).

Steps:

1. Read `governance/requirements/REQ-<id>/spec.md` to find which
   TL(s) the EM assigned.

2. For each assigned TL, spawn a fresh subagent of that TL type
   (`tl-auth` / `tl-gamification` / `tl-pets` / `tl-mobile`).
   If multiple TLs, spawn them in parallel (single message,
   multiple Agent calls).

3. Each TL agent will:
   - Read its own §2.2.X contract from ROLES.md.
   - Read all required-reading files for its specialty.
   - Read every file in its domain that the requirement might
     touch (verify against source — no memory).
   - Write `governance/requirements/REQ-<id>/tl-<domain>-analysis.md`
     covering: scope, blast radius, MISTAKES regression checklist,
     specialty-hazard checklist, proposed task decomposition (one
     `tasks/TASK-<n>-<slug>.md` per Dev assignment), test plan,
     review plan, risks, rollback.

4. **Pack generation (Feature 3 — context pack v2).** After all TL
   analyses are complete:

   **Skip rule — if the REQ will spawn ≤ 3 downstream subagents** (total
   Dev + Test + Reviewer agents across all tasks), **do not spawn the
   context-packer**. Record `pack: skipped (small REQ — downstream subagent
   count ≤ 3)` in this TL analysis under §Pack generation. Downstream agents
   read raw docs and log every raw doc in their `raw_doc_reads:` frontmatter.

   **Otherwise**, spawn a fresh `context-packer` subagent (DISTINCT from any
   TL agent — iron rule §H.43 prohibits a TL from authoring its own pack).
   Pass it:
   - The REQ id.
   - The union of all "relevant-reading" files cited across every
     `tl-<domain>-analysis.md` for this REQ.
   - The blast-radius areas (subsystem tags) to use when filtering
     `MISTAKES.md`.

   The `context-packer` agent writes
   `governance/requirements/REQ-<id>/context-pack.md` per its contract
   (verbatim extracts, GUARDRAILS.md always whole, exclusion manifest
   mandatory). **After the packer returns, verify the pack file exists and
   is non-empty (> 10 lines).** If the pack is empty or near-empty (< 10
   lines), log a warning in this TL analysis and instruct downstream agents
   to read raw docs instead (no silent degradation). Do NOT spawn Devs
   until the pack file is confirmed present and non-empty.

   If `context-packer` fails or the pack file is missing, downstream
   Dev and Test agents fall back to reading raw docs and MUST log every
   raw doc they read in their report's `raw_doc_reads:` frontmatter list.
   This fallback is logged but does not block tl-assign.

   **`raw_doc_reads` format:** entries must be a JSON-style list of repo-
   relative paths:

   ```yaml
   raw_doc_reads: ["governance/CONSTITUTION.md", "governance/MISTAKES.md"]
   ```

   Each entry is a repo-relative path string. Absolute paths are NOT
   permitted in `raw_doc_reads` (use repo-relative to avoid machine-specific
   paths per MISTAKES 2026-07-10 REQ-02).

5. After all TLs return and the pack is written, summarize: "TL analysis
   for REQ-<id> complete. Tasks proposed: <count>. Context pack written
   at `governance/requirements/REQ-<id>/context-pack.md`. Run
   `/tl-assign REQ-<id>` to dispatch Devs."

Do NOT spawn Devs in this command. Analysis only.
