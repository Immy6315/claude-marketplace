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
   - **Duplicate-check FIRST.** Read every
     `governance/capabilities/*.md` ledger (all machines) and scan
     existing `requirements/*/spec.md` titles. If the request
     semantically overlaps a capability that already exists or is
     in-progress, do NOT create a new REQ — surface the match and ask
     Imran whether to skip (duplicate), enhance the existing feature,
     or build a new one anyway. This is what lets this machine catch
     a feature another synced machine already shipped. Only continue
     if there is no match or Imran opts to build new.
   - **Enforce G-4 (batch cap):** if more than 3 REQs are already
     in-flight (any REQ whose merge-readiness has not yet flipped
     to READY-FOR-MERGE), queue this REQ instead of dispatching.
     Larger batches require explicit owner authorization recorded
     in `spec.md::§Authorization`.
   - **Derive this machine's id (MID)** first, so two machines that
     share the same synced `governance/` folder never collide on a
     requirement id. Run via Bash:
     ```bash
     MID=$( (scutil --get LocalHostName 2>/dev/null || hostname) | shasum | cut -c1-4 )
     ```
     `MID` is a stable 4-char lowercase-hex token unique to the
     machine (derived from its hostname). Same machine → same MID
     every time; two different machines → different MID.
   - Assign the requirement id `REQ-<YYYYMMDD>-<MID>-<NN>` where
     `NN` = next unused 2-digit number for today **scoped to this
     machine's MID** (i.e. count only existing folders matching
     `REQ-<YYYYMMDD>-<MID>-*`, start at `01`). Example:
     `REQ-20260627-a3f9-01`. Never reuse another machine's MID.
   - Create `governance/requirements/REQ-<id>/` and write
     `spec.md` per the template in `governance/requirements/README.md`.
   - **Append one capability line** to
     `governance/capabilities/<MID>.md` (create the file/dir if
     absent): `- [REQ-<id>] <feature title> — <one-line of what it
     does> — status: in-progress — date: <YYYY-MM-DD>`. This is the
     durable record other synced machines read during their own
     duplicate-check.
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
