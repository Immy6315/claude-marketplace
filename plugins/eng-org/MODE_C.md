# Mode C — Bug-fix flow

A third tier alongside the existing Mode A (docs/config) and Mode B (full
5-role pipeline), specifically for **bug fixes**: known failures with a
narrow scope and a reproducer.

Industry parallel: hotfix flow. Bugs differ from features — they don't
introduce new behavior surface; they restore broken behavior. The risk
profile is lower **iff** there's a regression test that fails-then-passes.

---

## When Mode C applies (ALL must hold)

1. **Bug has a reproducer** — a failing test, or steps that reliably
   trigger the failure. No reproducer ⇒ no regression test ⇒ no Mode C.
2. **No auth surface** — does not touch `mobile/lib/auth.ts`,
   `backend/src/auth/**`, secret storage, OAuth flow, JWT signing, etc.
3. **No schema change** — no migration, no new column / index / table.
4. **No new dependency** — `package.json` / `pyproject.toml` / `Cargo.toml`
   etc. unchanged.
5. **No PII / payment / billing surface** — does not touch
   user data export, payment processing, billing records.
6. **Scope cap** — fix touches ≤ 3 files of production code (heuristic;
   the TL may approve up to 5 with a one-line justification, but anything
   broader escalates).

If any condition fails → **escalate to Mode B**. Stop, surface to user,
route through `/em-intake`.

---

## Pipeline

```
/eng-org:bug-intake "<bug + reproducer>"
   ↓ orchestrator/EM creates REQ-<id> with mode: C, runs safety checklist
   ↓ if any check fails: refuse, escalate to Mode B
   ↓ writes spec.md (lightweight: bug summary, reproducer, suspected files, mode: C)
   ↓ assigns 1 TL
   ↓
/eng-org:bug-fix REQ-<id>
   ↓ TL writes 1-paragraph analysis: root cause hypothesis, fix scope,
   ↓   safety re-check, dev type to dispatch
   ↓ TL spawns 1 Dev (cold) with focused brief
   ↓ Dev writes:
   ↓   - the code fix (≤3 files)
   ↓   - a regression test that FAILS on broken code, PASSES after fix
   ↓   - 1-paragraph dev-report
   ↓ on completion: status flips to "implemented"
   ↓
/eng-org:bug-verify REQ-<id>
   ↓ orchestrator spawns in parallel (all cold):
   ↓   - test-regression (run new + existing regression suite; verify GREEN)
   ↓   - test-unit (only if fix is in pure logic per COVERAGE_THRESHOLDS;
   ↓                else SKIPPED-WITH-NOTE)
   ↓   - 1 reviewer (default: reviewer-architecture; alternative:
   ↓                 reviewer-standards if structural-architecture review
   ↓                 isn't relevant)
   ↓ orchestrator writes 1-page merge-readiness.md:
   ↓   bug ID, reproducer cite, fix cite, regression test cite, reviewer
   ↓   verdict, escalation status
   ↓ Imran approves merge → done
```

**Total agent calls: 5–6.** Time target: 5–10 min for a typical bug.

---

## Hard escalation triggers (any participant flips to Mode B)

| Trigger | Detected by | Action |
|---|---|---|
| Reproducer absent or unreliable | bug-intake safety check | Refuse Mode C; reroute to `/em-intake` |
| Fix touches >3 files (or >5 with TL approval) | TL or Dev | Escalate; stop; surface to user |
| Fix introduces new behavior, not just restoration | TL or Reviewer | Escalate |
| Fix touches auth/PII/payment/schema/deps | Any participant | Escalate immediately |
| Regression test cannot be written | Dev | Stop; surface to user; consider Mode B with manual gate |
| Reviewer finds critical (BLOCK) issue not fixable in scope | Reviewer | Escalate to Mode B for proper architectural treatment |

The escalation is the safety net. Without it, Mode C is dangerous. With
it, it's safe.

---

## Files written under `governance/requirements/REQ-<id>/`

```
spec.md                       # mode: C, bug summary, reproducer, suspected files
tl-analysis.md                # 1-paragraph root cause + fix scope + safety re-check
dev-report.md                 # 1-paragraph: what changed + regression test cite
test-regression-report.md     # GREEN/RED + reproducer test now passes
test-unit-report.md           # GREEN or SKIPPED-WITH-NOTE
review-report.md              # APPROVE / NEEDS-CHANGES / BLOCK / ESCALATE-TO-MODE-B
merge-readiness.md            # 1-page aggregator
```

No `tasks/TASK-N-*.md` subdirectory — Mode C is single-task by design.

---

## Why this is safe (and what's traded off)

**Preserved from Mode B:**
- Dev independent of Reviewer (Reviewer reads the code, not the Dev's reasoning)
- Test agents independent of Dev (test-regression confirms reproducer)
- Human approval gate at merge (CONSTITUTION §47, non-negotiable)
- Audit trail in `governance/.audit/` (each agent invocation logged)
- Full Mode B escalation if any safety condition fails

**Reduced from Mode B:**
- 1 Reviewer instead of 5 (assumes bug doesn't span security/perf/obs/std/arch surfaces)
- 2 Test agents instead of 5 (no integration/e2e/load by default)
- 1 task instead of N tasks
- 1-page merge-readiness instead of full template

**The trade is calibrated to the risk profile of bugs**, not features.
Features can blast in 5 directions; bugs blast in 1 (the broken behavior
they restore). When a bug actually does blast wider, the eligibility
checklist forces escalation.

---

## Counter-rule

If you ever find yourself adding a feature, refactor, or "while I'm here"
cleanup inside a Mode C bug fix → **stop and escalate to Mode B**. Mode
C's safety guarantees are predicated on narrow scope. Drift breaks them.

CONSTITUTION §F.36a (in-spirit scope expansion) does NOT apply to Mode C
without explicit TL approval and a re-eligibility check.
