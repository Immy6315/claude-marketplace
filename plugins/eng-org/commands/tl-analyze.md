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

4. After all TLs return, summarize: "TL analysis for REQ-<id>
   complete. Tasks proposed: <count>. Run `/tl-assign REQ-<id>`
   to dispatch Devs."

Do NOT spawn Devs in this command. Analysis only.
