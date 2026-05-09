---
description: Mode C bug-flow — intake a bug, run safety check, write spec, assign 1 TL.
---

You are doing **bug intake** for the eng-org Mode C (bug-fix) flow. The
user has reported a bug, ideally with a reproducer. Mode C is a faster,
narrower pipeline than Mode B — but only if the bug is genuinely small
and safe. See `plugins/eng-org/MODE_C.md` for the full contract.

The user's bug report: $ARGUMENTS

---

## Steps

### 1. Run the Mode C eligibility checklist

Before doing anything else, verify ALL of these conditions hold. If ANY
fail, **refuse Mode C and tell the user to use `/eng-org:em-intake`
instead** (which routes to Mode B).

| Check | If fail → escalate? |
|---|---|
| Bug has a reproducer (failing test or reliable trigger steps) | Yes — refuse, no reproducer = no Mode C |
| Suspected fix does NOT touch auth files (`mobile/lib/auth.ts`, `backend/src/auth/**`, secret storage, JWT, OAuth) | Yes — escalate to Mode B |
| Suspected fix does NOT require a schema migration | Yes — escalate |
| Suspected fix does NOT add/remove a dependency | Yes — escalate |
| Suspected fix does NOT touch PII / payment / billing surface | Yes — escalate |
| Suspected scope is ≤ 3 production files | Borderline — TL may approve up to 5 in next phase, but flag |

If you don't have enough information from the user's report to evaluate
these, **ask the user for clarification** (which file area, do they have
a reproducer, etc.) before proceeding. Do not assume.

### 2. Spawn a fresh `em` subagent

Brief it with the user's bug report verbatim, plus the eligibility
checklist outcome. The EM will:

- Read `governance/ROLES.md` and `plugins/eng-org/MODE_C.md` for Mode C
  contract.
- Assign requirement id `REQ-<YYYYMMDD>-<NN>` (next unused for today).
- Create `governance/requirements/REQ-<id>/` directory.
- Write `spec.md` with this lightweight Mode C template:

  ```markdown
  ---
  req_id: REQ-<id>
  mode: C
  type: bug
  date: <YYYY-MM-DD>
  ---

  # <one-line bug title>

  ## Bug summary
  <1–3 sentences>

  ## Reproducer
  <failing test path, OR step-by-step trigger>

  ## Suspected files
  - <path/to/file1.ts>
  - <path/to/file2.ts>

  ## Mode C eligibility (all must hold)
  - [x] Has reproducer
  - [x] No auth surface
  - [x] No schema migration
  - [x] No new dependency
  - [x] No PII/payment/billing
  - [x] Scope ≤ 3 files (or 5 with TL approval)

  ## Assigned TL
  <tl-auth | tl-gamification | tl-pets | tl-mobile | …>

  ## Escalation
  None. If TL/Dev/Reviewer detects scope creep, escalate to Mode B per
  MODE_C.md.
  ```

- Append to `governance/conversations/<today>.md`:
  `REQ-<id> bug intake — <one-line summary> — TL: X — mode: C.`

### 3. Surface the spec and stop

Print the `spec.md` path and the assigned TL. Do NOT proceed to
`/bug-fix` in the same response. The user must confirm the triage
(specifically: confirm Mode C is correct vs Mode B, and confirm the
suspected files / scope estimate) before the TL spins up.

### 4. If escalation triggered

If the eligibility checklist failed, do NOT write a Mode C spec. Surface
clearly to the user:

> "This bug doesn't fit Mode C because: [reason]. Please run
> `/eng-org:em-intake "<bug>"` for the full Mode B pipeline."

Do not silently downgrade Mode B requirements into Mode C. Better to
over-review than under-review on a misclassified bug.
