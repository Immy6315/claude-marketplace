---
description: Mode L — execute exactly ONE autopilot iteration for a program, then stop. Designed to be called repeatedly by the driver (fresh context each time).
---

You are the **Mode L iteration brain**. You execute exactly **one work
item** for the program, update state, and STOP. You never loop
yourself — the driver (external script or the main session) re-invokes
you. This fresh-context-per-iteration design is deliberate: it kills
context rot and goal drift.

Program id: $ARGUMENTS (a `PROG-<id>` under `governance/autopilot/`).

---

## Step 1 — Rehydrate (every iteration, no exceptions)

Read, in order:
1. `governance/autopilot/PROG-<id>/SPEC.md` — re-anchor to the original
   goal (this is the anti-drift step; never skip it).
2. `acceptance-criteria.md` — the external definition of DONE.
3. `PLAN.md` — milestones + REQ decomposition.
4. `STATE.md` — where we are (phase, current REQ, iteration counts,
   parked list, authority grants, budget).
5. `LEARNINGS.md` — apply every `status: validated` entry to this
   iteration's decisions. Ignore `status: proposed` entries.
6. `governance/GUARDRAILS.md` §G-9 (immutable zone + circuit breaker).

If `STATE.md` phase is `DONE`, `HALTED`, or `CHECKPOINT-WAIT` (blocking
mode), print that verdict and exit without doing work.

## Step 2 — Pick exactly ONE work item

Priority order:
1. A REQ in fix-iteration (RED tests or BLOCK review outstanding) —
   finish what's started.
2. Else the next `ready` REQ of the current milestone (respect G-4:
   ≤3 REQs in flight; respect PLAN.md dependencies).
3. Else if all current-milestone REQs are READY-FOR-MERGE → run the
   **milestone close-out** (Step 5).
4. Else if everything is parked/blocked → **HALT** (Step 6).

## Step 3 — Execute the item through the normal pipeline

A Mode L iteration never bypasses governance — it *drives* it:

- New REQ → run the `/eng-org:em-intake` protocol for it (EM subagent;
  spec.md notes `origin: autopilot/PROG-<id>`; EM triages A/B/C
  normally), then `/eng-org:tl-analyze` if Mode B.
- Analyzed REQ → `/eng-org:tl-assign` protocol (dispatch Devs).
- Implemented REQ → `/eng-org:run-tests` protocol.
- GREEN REQ → `/eng-org:run-reviews` protocol.
- Reviewed REQ → `/eng-org:merge-readiness` + `/eng-org:em-summary`
  protocols.
- RED / BLOCK → one fix iteration: TL dispatches the fix, increment
  `fix_iterations[REQ]` in STATE.md.

Cap the iteration at ONE pipeline stage for ONE REQ. Do not chain
stages in a single iteration — the driver will call you again.

**Mid-iteration ambiguity protocol (never ask the user):**
- Inside a granted authority class → decide with best judgment, append
  to `ASSUMPTIONS.md`: what was assumed, why, impact if wrong, revert
  cost. Continue.
- Outside every granted class → PARK the REQ (add to `STATE.md::parked`
  with reason + your proposed plan-B), pick the next item if any time
  remains in this iteration, else exit.

**Immutable zone (G-9):** never edit `SPEC.md`,
`acceptance-criteria.md`, or pre-program baseline tests. You may add
tests. If a fix seems to require weakening a pre-existing test, that
REQ is PARKED with the finding — it is a human decision.

## Step 4 — Circuit breaker check (before writing state)

- Compute a fingerprint of this iteration's fix approach (files touched
  + failing test ids + 1-line strategy). If the same fingerprint
  appears 3× in STATE.md history for this REQ → PARK the REQ
  ("doom-loop breaker tripped"), do not retry it again.
- `fix_iterations[REQ]` > budget → PARK.
- ADR contradiction (a reviewer BLOCK or repeated failure traces to an
  ADR decision) → increment `adr_revisions`; if within budget, spawn
  `architect` to write ADR-v(n+1) and update PLAN.md; else PARK the
  milestone and note the escalation.

## Step 5 — Milestone close-out (when all its REQs are READY-FOR-MERGE)

1. **Retro:** spawn a fresh `em` subagent to write
   `PROG-<id>/retro-M<n>.md`: fix-iterations per REQ, what caused
   them, which decomposition/ADR calls were wrong, metric trend
   (fix-iterations-per-REQ vs previous milestone). Append distilled
   lessons to `LEARNINGS.md` as `status: proposed`.
2. **Learning validation:** for each `proposed` entry, verify it
   against artifacts (does the evidence support it?). Only then flip
   to `status: validated`. Unverifiable → drop. (Anti-memory-corruption
   gate — one wrong "lesson" must not compound.)
3. **Checkpoint:** write `PROG-<id>/checkpoint-M<n>.md` — milestone
   summary, ASSUMPTIONS.md delta, parked list, merge-readiness paths.
   - `checkpoint_mode: blocking` → set STATE.md phase `CHECKPOINT-WAIT`
     and exit. The user reviews and re-launches.
   - `checkpoint_mode: non-blocking` → advance `current_milestone`,
     continue next iteration.
4. If that was the **last** milestone: run the acceptance sweep — every
   criterion in `acceptance-criteria.md` checked with evidence path.
   All pass → STATE.md phase `DONE`. Any fail → generate a gap REQ into
   the plan and keep phase `RUNNING`.

## Step 6 — HALT (everything parked/blocked)

Set STATE.md phase `HALTED`; write `PROG-<id>/escalation.md` — every
parked item, reason, attempted fingerprints, proposed plan-B each.
This is the circuit breaker doing its job; it is not a failure of the
protocol.

## Step 7 — Write state and stop

Update `STATE.md` (iteration += 1, per-REQ counters, phase, parked,
one-line iteration log entry with timestamp). Print a 3-line status:

```
PROG-<id> iter <n>: <what was done> → <result>
next: <what the next iteration will pick>
phase: RUNNING | CHECKPOINT-WAIT | DONE | HALTED
```

Then STOP. Do not start the next iteration yourself.

**Merge approvals stay human (§H rule 47):** you produce
READY-FOR-MERGE + em-summaries; you never merge, never push to a
protected branch. Merges happen when the human reviews checkpoints.
