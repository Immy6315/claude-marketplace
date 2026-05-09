---
description: Mode C bug-flow — run test-regression + test-unit + 1 reviewer (cold), then write 1-page merge-readiness.
---

You are running the **verification phase** of the eng-org Mode C bug-fix
flow. This is the safety net before merge: independent test confirmation
+ 1 independent code review.

The requirement id is: $ARGUMENTS (e.g., `REQ-20260509-02`).

See `plugins/eng-org/MODE_C.md` for the full Mode C contract.

---

## Steps

### 1. Verify pre-conditions

Read `governance/requirements/REQ-<id>/spec.md` and `dev-report.md`.
Confirm:

- `mode: C` in spec.md frontmatter
- `status: implemented` in spec.md frontmatter
- `dev-report.md` exists and confirms "test FAILS without fix, PASSES
  with fix"
- No `escalate: true` flag in spec or dev-report

If any condition fails: stop and surface the gap.

### 2. Spawn 3 cold subagents in parallel

In a single message with 3 Agent calls (in parallel):

**A. `test-regression`**

> Read `governance/requirements/REQ-<id>/spec.md` and `dev-report.md`.
> Locate the regression test the Dev wrote (path is in dev-report.md).
> Verify by inspection:
>
> 1. Test exists at the cited path
> 2. Test references the bug behavior (the spec's reproducer)
> 3. Run the regression suite (`<project test command>`) and confirm
>    GREEN — the new test, plus all existing regression tests, pass
> 4. Optionally: temporarily revert the Dev's fix in your local copy,
>    run the test, confirm it FAILS (proves the test actually catches
>    the bug). Restore the fix.
>
> Write `governance/requirements/REQ-<id>/test-regression-report.md`:
> verdict GREEN/RED, what you ran, fail-then-pass evidence,
> "what I did not cover" section.

**B. `test-unit`**

> Read `governance/requirements/REQ-<id>/spec.md` and `dev-report.md`.
> Determine if the fix is in pure logic eligible for the unit-coverage
> gate (per `governance/COVERAGE_THRESHOLDS.md` — typically
> `backend/src/domain/*` or pure-logic mobile utils).
>
> If yes: write/update unit tests for the fixed function, ensure 95%+
> coverage on the touched lines, run unit suite, confirm GREEN.
> If no (fix is in IO/wiring/component code): write a SKIPPED-WITH-NOTE
> report justifying why the unit gate doesn't apply here.
>
> Write `governance/requirements/REQ-<id>/test-unit-report.md`:
> verdict GREEN / SKIPPED-WITH-NOTE / RED, with reasoning.

**C. `reviewer-architecture`** (default reviewer for Mode C)

> Read `governance/requirements/REQ-<id>/spec.md`,
> `tl-analysis.md`, `dev-report.md`, and the actual code changes the
> Dev made.
>
> Apply the standard `reviewer-architecture` contract from
> `governance/ROLES.md`, but ALSO check Mode C-specific concerns:
>
> 1. **Scope discipline** — fix is ≤ 3 files (or ≤ 5 with TL
>    justification cited). If broader, verdict = ESCALATE-TO-MODE-B.
> 2. **No drift** — fix doesn't introduce new behavior, just restores
>    broken behavior. Refactors / "while-I'm-here" cleanups are NOT
>    permitted in Mode C.
> 3. **No hidden Mode-B surface** — fix doesn't actually touch auth /
>    schema / PII / payment / deps despite spec saying it doesn't.
> 4. **Standard architecture review** — layering, MODULE_REGISTRY
>    ownership, no circular imports, no leaky abstractions.
>
> Verdict: APPROVE / NEEDS-CHANGES / BLOCK / ESCALATE-TO-MODE-B.
> Write `governance/requirements/REQ-<id>/review-report.md` with line
> citations.

### 3. Handle outcomes

After all 3 return:

| Outcome | Action |
|---|---|
| All GREEN/APPROVE | Proceed to step 4 (write merge-readiness) |
| `test-regression: RED` | Stop. Tell user the regression test fails — Dev's fix is broken. Run `/eng-org:bug-fix` again (TL re-engages, Dev re-fixes). |
| `test-unit: RED` | Same — Dev fix iteration needed. |
| `reviewer: NEEDS-CHANGES` | Surface findings to user; user decides whether to dispatch fix iteration or accept the NIT and ack. |
| `reviewer: BLOCK` | Stop. Surface findings. Do NOT write merge-readiness. Either fix or escalate. |
| `reviewer: ESCALATE-TO-MODE-B` | Stop. Tag spec.md with footer "ESCALATED-TO-MODE-B at verify phase: [reason]." Tell user to restart via `/eng-org:em-intake`. |

### 4. Write 1-page `merge-readiness.md`

The orchestrator writes this directly (no second TL spawn needed in
Mode C). Use this template:

```markdown
# Merge-readiness — REQ-<id> (Mode C bug fix)

**REQ:** REQ-<id> — <bug title>
**Mode:** C (bug fix)
**Date:** <YYYY-MM-DD>
**Verdict:** READY-FOR-MERGE pending Imran approval

## Bug summary
<from spec.md>

## Reproducer
<spec.md cite>

## Files changed
- <file:line cites from dev-report.md>

## Regression test
- Path: <from dev-report.md>
- Behavior: FAILS without fix, PASSES with fix (verified by test-regression)

## Signals (Mode C: 3 reports, all must pass)

| Check | Verdict | Report |
|---|---|---|
| test-regression | GREEN | test-regression-report.md |
| test-unit | GREEN / SKIPPED-WITH-NOTE | test-unit-report.md |
| reviewer-architecture | APPROVE | review-report.md |

## Mode C eligibility re-confirmed
- [x] Reproducer exists and passes after fix
- [x] No auth surface touched
- [x] No schema migration
- [x] No new dependency
- [x] No PII/payment/billing surface
- [x] Scope ≤ 3 files (or ≤ 5 with TL justification)

## Out-of-scope drift
None. (Or document any TL-acknowledged in-spirit expansion.)

## Risk + rollback
- **Risk:** Low — narrow fix, regression test guards against re-break.
- **Rollback:** Revert the commit; regression test will fail again,
  matching pre-fix state.

## Verdict

READY-FOR-MERGE pending:
- [ ] Imran's explicit merge approval (CONSTITUTION §47, non-negotiable)

Next: Imran reviews and merges in human terminal.
```

### 5. Print path and stop

Print the `merge-readiness.md` path. Append to
`governance/conversations/<today>.md`:

> `REQ-<id> Mode C bug-verify done — awaiting Imran approval.`

Do NOT merge. Do NOT push. Imran approves merge in human terminal.
