# Mode L — Autonomous build-until-done loop ("Loop engineering")

The fourth tier alongside Mode A (docs/config), Mode B (full 5-role
pipeline), and Mode C (bug-fix flow). Mode L is for **whole programs**:
"build me this software" with a detailed brief — the loop decomposes,
builds, tests, reviews, learns, and revises its own decisions until the
acceptance criteria are met, with human input only at the start (gate)
and at checkpoints/merges.

**Mode L is not a triage outcome.** The EM may *recommend* it in a
spec ("this is a program, not a REQ — suggest Mode L"), but only the
human can *activate* it, via the explicit `/eng-org:autopilot` command.
Internally, every REQ the loop generates still goes through normal
A/B/C triage and the full guardrail set — Mode L orchestrates the
pipeline; it never replaces or dilutes it.

Architecture note: this design follows the industry-validated pattern
for long-running coding agents (fresh context per iteration + durable
state files + test-anchored backpressure + independent evaluators +
externally-defined done-criteria), and installs explicit defenses
against the two documented killer failure modes: doom loops (circuit
breaker) and reward hacking (immutable zone). See G-9 in the
GUARDRAILS template.

---

## Lifecycle

```
/eng-org:autopilot "<software brief>"
   ↓ Phase 0: PROG-<id> record under governance/autopilot/
   ↓ Phase 1: G-9 clarity scorecard (8 items, incl. feasibility + dependency pre-flight)
   ↓ Phase 2: interview loop — targeted questions until 8/8 PASS
   ↓          + authority grants recorded (what the loop may decide alone)
   ↓ Phase 3: architect plan preview (ADR-001 + milestones) → HUMAN APPROVAL
   ↓ Phase 4: launch
   ↓
LOOP (driver re-invokes /eng-org:autopilot-iterate PROG-<id>, fresh context each time)
   ↓ rehydrate from SPEC / acceptance-criteria / PLAN / STATE / LEARNINGS
   ↓ ONE work item: one pipeline stage of one REQ (em-intake → tl-analyze
   ↓   → tl-assign → run-tests → run-reviews → merge-readiness → em-summary)
   ↓ ambiguity: decide-and-log (ASSUMPTIONS.md) or park — never ask mid-loop
   ↓ circuit breaker: 3× same fix fingerprint → park; budget exhausted → park;
   ↓   everything parked → HALT + escalation.md
   ↓ milestone done: retro → LEARNINGS.md (proposed → validated) → checkpoint
   ↓ last milestone: acceptance sweep against every criterion
   ↓
END: phase DONE — human reviews checkpoints + ASSUMPTIONS + em-summaries,
     approves merges (§H rule 47 — never automated)
```

## Run modes

| | (a) External driver (recommended) | (b) In-session loop |
|---|---|---|
| How | `bash scripts/autopilot-driver.sh PROG-<id>` from project root | main session re-invokes `/eng-org:autopilot-iterate` |
| Context | fresh per iteration (no rot/drift) | one long session (compaction risk) |
| Crash safety | script retries; STATE.md resumes | session death loses the loop |
| Unattended | yes (pre-approve tools in settings.json, or `--bypass` in isolated envs) | needs the session alive |

## State files (`governance/autopilot/PROG-<id>/`)

| File | Owner | Mutability |
|---|---|---|
| `SPEC.md` | human (via gate interview) | 🔒 immutable after plan approval |
| `acceptance-criteria.md` | human (via gate) | 🔒 immutable — the loop may never redefine DONE |
| `PLAN.md` + `adr/` | architect agent | revisable only via versioned ADR |
| `STATE.md` | autopilot-iterate | every iteration |
| `ASSUMPTIONS.md` | autopilot-iterate | append-only |
| `LEARNINGS.md` | milestone retro | append; entries binding only after validation |
| `gate-scorecard.md`, `checkpoint-M<n>.md`, `retro-M<n>.md`, `escalation.md` | gate / iterate | write-once each |

## Iron constraints (inherit Constitution §H)

1. Human merge approval — never automated (rule 47).
2. Every generated REQ runs the full normal pipeline + guardrails
   G-1..G-9. No guardrail is relaxed because "the loop is in a hurry."
3. The loop never edits the immutable zone (SPEC, acceptance criteria,
   pre-program baseline tests). Violation = BLOCK, no waiver.
4. The loop never asks the user mid-run. It decides-and-logs, parks, or
   halts. All human interaction is front-loaded (gate) or batched
   (checkpoints).
5. G-4 batch cap applies inside the loop (≤3 REQs in flight).
