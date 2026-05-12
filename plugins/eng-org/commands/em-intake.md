---
description: EM intake — capture a new requirement, triage Mode A vs Mode B, assign TLs.
---

You are about to act as the EM (Engineering Manager) for the this project
project. The user (Imran) has just stated a new requirement.

Steps:

1. Spawn a fresh `em` subagent with the requirement verbatim. The
   agent will:
   - Read `governance/ROLES.md` §2.1, `governance/GUARDRAILS.md`,
     `CLAUDE.md`, and recent conversation log.
   - **Enforce G-4 (batch cap):** if more than 3 REQs are already
     in-flight (any REQ whose merge-readiness has not yet flipped
     to READY-FOR-MERGE), queue this REQ instead of dispatching.
     Larger batches require explicit owner authorization recorded
     in `spec.md::§Authorization`.
   - Assign the requirement id `REQ-<YYYYMMDD>-<NN>` (NN = next
     unused number for today).
   - Create `governance/requirements/REQ-<id>/` and write
     `spec.md` per the template in `governance/requirements/README.md`.
   - Triage Mode A vs Mode B per ROLES.md §6 and record the
     decision + reasoning in `spec.md`.
   - Decide which TL(s) own the work (auth | gamification | pets |
     mobile, possibly multiple).
   - Append to `governance/conversations/<today>.md` a 1-line
     pointer "REQ-<id> intake — <one-line summary> — TL(s): X."
   - Print the spec.md path and the assigned TLs.

2. After the EM agent returns, do NOT proceed to TL analysis in the
   same response. Surface the spec to the user and wait for their
   confirmation that the triage is correct.

The user's requirement: $ARGUMENTS
