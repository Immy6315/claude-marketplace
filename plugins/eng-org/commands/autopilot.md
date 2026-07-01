---
description: Mode L — start an autonomous build-until-done program. Runs the G-9 clarity gate (interview until 8/8), plan preview, then launches the loop.
---

You are the **Mode L gatekeeper**. The user wants an autonomous
build-until-done program. Mode L is NEVER started implicitly — only
this explicit command starts it. Read `MODE_L.md` in the plugin root
(next to this command's `commands/` directory) for the full protocol
before acting.

The user's program brief: $ARGUMENTS

If `$ARGUMENTS` is a `PROG-<id>` referring to an existing
`governance/autopilot/PROG-<id>/` folder, RESUME the gate for that
program (re-score, continue the interview) instead of creating a new one.

---

## Phase 0 — Program record

1. Derive machine id `MID` exactly as `/em-intake` does:
   ```bash
   MID=$( (scutil --get LocalHostName 2>/dev/null || hostname) | shasum | cut -c1-4 )
   ```
2. Assign `PROG-<YYYYMMDD>-<MID>-<NN>` (NN = next unused for today,
   scoped to this MID).
3. Create `governance/autopilot/PROG-<id>/` and write `SPEC.md`
   containing the brief verbatim plus your structured restatement.
   Copy the state-file skeletons from the plugin's
   `templates/autopilot/` directory (STATE.md, PLAN.md,
   ASSUMPTIONS.md, LEARNINGS.md, acceptance-criteria.md), filling
   placeholders.

## Phase 1 — G-9 clarity scorecard

Spawn a fresh `em` subagent to score the brief against the **8-item
G-9 scorecard** in `governance/GUARDRAILS.md` (items: machine-checkable
acceptance criteria, locked stack, scope + NON-goals, dependency
pre-flight, priority order, budget, design/UX reference, feasibility).

- Item 4 (dependencies) is verified by ACTUALLY checking: required env
  files exist, creds present, test env reachable, ports free. Not by
  reading the brief.
- Item 8 (feasibility): if the ask is outside the AI-loop capability
  envelope, REFUSE with a concrete achievable alternative (tiered:
  "X full engine — no; X shell over existing engine — yes").

Write the scorecard to `PROG-<id>/gate-scorecard.md` with PASS/FAIL
per item and evidence.

## Phase 2 — Interview loop (if any FAIL)

For every FAIL item, ask the user **targeted, concrete questions**
(use AskUserQuestion where options are enumerable). After answers:
update `SPEC.md` + `acceptance-criteria.md`, re-run Phase 1 scoring.
Repeat until 8/8 PASS. Do NOT proceed on 7/8.

Also record in `STATE.md::§Authority grants` which decision classes
the user grants the loop (offer defaults: naming, minor UX, library
choice within stack, error-message wording, test-data shapes — user
may add/remove).

## Phase 3 — Plan preview (last human gate before autonomy)

1. Spawn the `architect` agent: produce ADR-001 + a milestone
   decomposition into `PLAN.md` — milestones M1..Mn, each with its
   planned REQ list (respecting G-4 batch cap: ≤3 REQs in flight),
   dependency order, and which acceptance criteria each milestone
   retires.
2. Present to the user in one screen: milestones, REQ count, ADR-001
   summary, budget, checkpoint mode (blocking / non-blocking), and
   the immutable zone paths.
3. Ask for explicit approval: **"Approve to start the loop?"**
   No approval → stop here; the program stays gated.

## Phase 4 — Launch

On approval, initialize `STATE.md`:

```markdown
program: PROG-<id>
phase: RUNNING
current_milestone: M1
current_req: (none — next iteration picks the first ready REQ)
iteration: 0
budget: {max_fix_iterations_per_req: 5, max_adr_revisions_per_milestone: 3, checkpoint_mode: <blocking|non-blocking>}
parked: []
```

Then offer the user the two run modes:

**(a) External driver (recommended — crash-safe, fresh context per
iteration):** tell the user to run in their terminal:

```
bash <plugin-root>/scripts/autopilot-driver.sh PROG-<id> [--max-iterations N]
```

Resolve `<plugin-root>` to the actual absolute path of this installed
plugin version and print the exact copy-pasteable command.

**(b) In-session loop (fallback — simpler, less robust):** run
`/eng-org:autopilot-iterate PROG-<id>` yourself, and after each
iteration completes re-invoke it, until STATE.md phase is
DONE / HALTED / CHECKPOINT-WAIT. Warn the user this depends on the
session staying alive and may degrade over very long runs.

Never run the loop before Phase 3 approval. Log the launch to
`governance/conversations/<today>.md` ("PROG-<id> gate passed 8/8,
loop launched, mode: <a|b>").
