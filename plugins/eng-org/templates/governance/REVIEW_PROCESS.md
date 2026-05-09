# Review Process — Maker / Checker (Mode A) and 5-role org (Mode B)

> Separation of duties is non-negotiable. The same actor may not write and approve the same change.

> **Two modes.** Mode A (this Maker→Checker flow) is the trivial-change
> shortcut. Mode B (the 5-role pipeline in `governance/ROLES.md`) is the
> full process for any change touching `mobile/`, `backend/`, schema,
> dependencies, user-visible flows, or governance core. See `CLAUDE.md`
> §6 and `ROLES.md` §6 for triage. The rest of this document covers
> Mode A; Mode B is documented at the bottom of this file and in detail
> in `ROLES.md`.

## Roles

| Role | Actor | Authority |
|---|---|---|
| **Maker** | Claude (main session) | Writes code, runs local tests, prepares the diff. |
| **Self-review** | Claude (same session) | Quick sanity pass; cannot approve. |
| **Checker** | Independent reviewer subagent (fresh context) | Reviews diff against Constitution. Has BLOCK authority. |
| **Final say** | Imran (product owner) | Resolves disputes; can override Checker only with written reason. |

The Checker subagent is spawned **fresh, with no conversational context** about the change. Its only inputs are:
- `CONSTITUTION.md` — the rules
- `COVERAGE_THRESHOLDS.md` — the numeric gates
- `TECH_DEBT.md` — sanctioned rule waivers (do not block on these)
- `ARCHITECTURE.md` — the system's current shape (layers, stack, schema, invariants)
- `SYSTEM_FLOWS.md` — major user journeys and their step-by-step traces
- `MODULE_REGISTRY.md` — module → consumers dependency map (used for blast-radius analysis)
- `MISTAKES.md` — recurring patterns to flag
- The session file — declared task, scope, expected files
- The actual diff — files changed

**Why these inputs (not just rules + diff):** independence from the Maker's *reasoning* is essential, but blindness to the system's *state* is not the same thing. The context docs above describe what the system looks like today. They let the Checker detect changes that:
- Break an existing flow (caught via SYSTEM_FLOWS.md)
- Violate an architectural invariant (caught via ARCHITECTURE.md)
- Silently break a consumer of changed code (caught via MODULE_REGISTRY.md)

If the Checker has no system context, it can only verify the diff in isolation. With it, the Checker can detect regressions.

This independence is what makes the review meaningful.

---

## Session Lifecycle

### 1. Session start — declare the task

Before writing any code, the Maker creates `governance/sessions/YYYY-MM-DD-<slug>.md` with:

```markdown
# Session: <slug>
**Date:** YYYY-MM-DD
**Maker:** Claude
**Goal:** <one sentence — what this session ships>

## Scope (binding)
**Allowed to touch:**
- `mobile/app/(tabs)/dashboard.tsx`
- `backend/src/trpc/routers/pets.ts`

**Out of scope:**
- Anything in `backend/src/auth/`
- Mobile navigation

## Acceptance criteria
- [ ] Criterion 1 (testable)
- [ ] Criterion 2

## Test plan
- Unit: <files / coverage delta>
- Integration: <which tRPC procs covered>
- E2E (if applicable): <flow names>

## Risks
- <known unknowns>

## Rollback plan
- <how to revert>

## Files removed
- <list, or "none">

## Self-review notes
(Filled in during step 3 of the process — what the Maker checked before invoking Checker.)
- <e.g., "re-read diff cold, no dead code, no debug logs, all tests green locally">
```

### 2. Maker phase — implement

- Maker writes code only inside declared scope.
- Maker runs `npm run typecheck && npm run lint && npm run test` locally.
- Maker updates the session file's "Files changed" section incrementally.

### 3. Self-review

- Maker re-reads the diff cold.
- Looks for: dead code, debug logs, scope creep, missing tests.
- If anything is off, fix before invoking Checker.

### 4. Checker phase — independent review

Spawn the Checker subagent with this prompt:

```
You are a senior staff engineer reviewing a code change for the project, a mobile + backend
system that must scale to 1M+ users.

You have NO context on why these changes were made. Your only inputs are:
- governance/CONSTITUTION.md (the rules)
- governance/COVERAGE_THRESHOLDS.md (the numeric gates)
- governance/TECH_DEBT.md (sanctioned rule waivers — violations listed here are NOT blockers)
- governance/ARCHITECTURE.md (system shape, layers, stack, schema, invariants)
- governance/SYSTEM_FLOWS.md (traced user journeys with file:line refs)
- governance/MODULE_REGISTRY.md (module → consumers dependency map)
- governance/MISTAKES.md (recurring patterns to watch for)
- governance/sessions/<session-file>.md (what the maker declared they'd do)
- The actual changed artifacts (code, tests, docs — listed below)

Your job:

**Step 0 — Load context (required, before anything else):**
   Read ARCHITECTURE.md, SYSTEM_FLOWS.md, MODULE_REGISTRY.md.
   Build a mental model of: what the system looks like today, how data flows through it,
   which modules depend on which.

**Step 1 — Scope check:**
   Verify the actual artifacts match the declared scope (no scope creep, no silent deletions).

**Step 2 — Acceptance criteria check:**
   Verify all acceptance criteria are demonstrably met by the produced artifacts
   (code + tests for code sessions; documents + cross-references for docs/process sessions).

**Step 3 — Impact analysis (blast radius):**
   For every changed file, look it up in MODULE_REGISTRY.md.
   - Did the diff change any public export name, signature, or behavior?
   - If yes, list the registered Consumers.
   - For each consumer: was it updated in this diff, OR is the change provably backward-compatible?
   - If neither: BLOCKER (regression risk).
   For every flow in SYSTEM_FLOWS.md whose steps are touched by the diff: verify no step
   was skipped, reordered, or broken.
   If the diff touches a public surface but MODULE_REGISTRY.md / ARCHITECTURE.md / SYSTEM_FLOWS.md
   was not also updated in this session: BLOCKER (CONSTITUTION §F.36a — context docs out of sync).

**Step 4 — Constitution check:**
   Check every Constitution rule. List every violation as BLOCKER / CONCERN / NIT.
   Cross-check against TECH_DEBT.md — if a rule is waived there, do not block on it
   (note it in the report as "waived per TD-NNN").

**Step 5 — Coverage check:**
   - For sessions with application code changes: run the coverage commands; if you can't, report
     "coverage unverified" as a BLOCKER.
   - For docs-only / process-only / config-only sessions (no application code change): report
     "Coverage check: N/A (docs-only)" — do NOT block on this.

**Step 6 — Mistakes regression check:**
   Check for repeats of any item in MISTAKES.md.

**Step 7 — Verdict:**
   Be skeptical. Assume the author is wrong until proven right by the artifacts.

Output format:
## Verdict
APPROVED | BLOCKED | NEEDS-CHANGES

## Scope check
- Declared scope: <quote from session file>
- Actual changes: <list>
- Drift: <none | list>

## Impact analysis (blast radius)
- Public exports changed: <list, or "none">
- Consumers per change (from MODULE_REGISTRY.md):
  - <changed-export> → consumers: <list> — status: <updated / backward-compat / NOT-updated → BLOCKER>
- Flows touched (from SYSTEM_FLOWS.md): <list, or "none">
  - For each: <flow N> step changes: <intact | step X modified, verified consistent | step X broken → BLOCKER>
- Context docs sync: <ARCHITECTURE/SYSTEM_FLOWS/MODULE_REGISTRY updated as needed | OUT-OF-SYNC → BLOCKER>

## Constitution review
### BLOCKERS
- <rule #X>: <what was violated, file:line, why it matters>

### CONCERNS
- <rule #X>: <what>

### NITS
- <what>

## Coverage check
- Unit: <% before> → <% after>, threshold <%>, status PASS/FAIL
- Integration: <list of new procs covered>, status PASS/FAIL
- E2E: <flows>, status PASS/FAIL/N/A

## Mistakes regression check
- <none | references to MISTAKES.md entries that may have recurred>

## New mistakes observed
- <if you found errors, propose entries for MISTAKES.md>

## Recommendation
<approve | what must change before approval>
```

### 5. Findings log

Write the Checker's full output to `governance/reviews/YYYY-MM-DD-<slug>.md`.

### 6. Resolution

| Verdict | Action |
|---|---|
| **APPROVED** | Mark session complete. Update `MISTAKES.md` if Checker proposed entries. Move on. |
| **NEEDS-CHANGES** | Maker addresses CONCERNS, then back to step 4 with a fresh Checker. |
| **BLOCKED** | Maker addresses BLOCKERS, then back to step 4 with a fresh Checker. No exceptions. |

### 7. Mistake capture

If the Checker found a **new** category of error (not just a one-off typo), the Maker appends it to `MISTAKES.md` with:
- Date
- What went wrong
- Why it happened (root cause, not symptom)
- The corrected approach
- A rule for next time

This is how the system learns.

### 8. Sign-off

Final entry in the session file:

```markdown
## Outcome
- Verdict: APPROVED
- Reviewed by: Checker subagent (review log: governance/reviews/YYYY-MM-DD-<slug>.md)
- Coverage delta: +X.X%
- Mistakes added: <none | list>
- Tech debt added: <none | list>
```

---

## When the Checker MUST be re-invoked (fresh)

- Any iteration that involves >5 lines of new code → fresh Checker.
- The same Checker subagent is never used twice on the same change. Fresh context every time.

## What the Checker may NOT do

- Approve a change with unresolved BLOCKERS.
- Skip the coverage check (must report "verified" or "unverified" — silence is failure).
- Ignore `MISTAKES.md` regressions.

## What the Maker may NOT do

- Self-approve.
- Edit `CONSTITUTION.md`, `COVERAGE_THRESHOLDS.md`, or a Checker's review log inside the same session as the change being reviewed.
- Skip the session file ("just a small change") — the file IS the contract.

---

## Pragmatic shortcuts (allowed)

- For trivial changes (typo in a string, version bump in a comment), the session file can be a one-liner and the Checker prompt can be abbreviated. The structure stays.
- Multiple small changes can share a session file if they're thematically grouped AND under 100 LOC total.

What is NOT allowed: skipping the system because "I'm sure it's fine."

---

# Mode B — 5-role engineering org

For non-trivial changes (any application code, schema, dependency,
user-visible flow, or governance-core change), the full 5-role pipeline
applies. The canonical specification is `governance/ROLES.md`. This
section is the **operational playbook** — what runs in what order.

## Mode B lifecycle

```
1. EM intake
   • EM (main session, or invoked subagent) reads Imran's request.
   • Triage: Mode A vs Mode B (see ROLES.md §6).
   • Assign requirement id REQ-<YYYYMMDD-NN>.
   • Write governance/requirements/REQ-<id>/spec.md
       — what, why, success criteria, assigned TLs.
   • Slash command: /em-intake

2. TL analysis (one TL per affected domain, in parallel)
   • TL reads spec.md + ARCHITECTURE/SYSTEM_FLOWS/MODULE_REGISTRY.
   • TL writes tl-analysis.md
       — impact, dependencies, decomposition into TASK-N files.
   • TL writes one tasks/TASK-<n>-<slug>.md per Dev assignment.
   • If multiple TLs: each writes their own tl-analysis.md;
     coordination notes link to the others.
   • Slash command: /tl-analyze REQ-<id>

3. TL assignment + Dev implementation (parallel where files don't conflict)
   • TL spawns Dev agent per TASK with /tl-assign.
   • Dev reads task + required files; implements; writes
     implementation/TASK-<n>-diff.md.
   • Dev writes co-located unit tests for any pure logic added.
   • Dev does NOT write integration/e2e/load tests (Test agents do).
   • Self-checks: tsc --noEmit, eslint, the unit tests they wrote.

4. Test agents (5 in parallel after Devs report done)
   • TL fires /run-tests REQ-<id>.
   • test-unit, test-integration, test-e2e, test-regression, test-load
     run in parallel; each writes tests/<type>-report.md.
   • Failure → finding routes back to Dev via TL; Dev fixes;
     fresh test agent of same type re-runs.

5. Reviewer agents (5 in parallel; can start when Tests are green)
   • TL fires /run-reviews REQ-<id>.
   • reviewer-architecture, reviewer-security, reviewer-performance,
     reviewer-standards, reviewer-observability run in parallel;
     each writes reviews/<reviewer>.md.
   • BLOCKER → Dev fix; fresh reviewer of same type re-runs.

6. Merge-readiness composite (TL)
   • TL writes merge-readiness.md with hard gates checked.
   • Slash command: /merge-readiness REQ-<id>.

7. EM summary (EM)
   • EM writes em-summary.md, 1-page, Imran-readable.
   • Slash command: /em-summary REQ-<id>.

8. Human approval
   • Imran reads em-summary.md.
   • Imran approves merge OR returns to EM with reasons.
   • The framework stops at "ready for merge." Deployment is
     human-controlled.
```

## What each agent reads, writes, and is allowed to use

`governance/ROLES.md` §1, §2, and §5. Treat that file as canonical;
anything in this README that disagrees is wrong and should be updated
in ROLES.md, not here.

## Audit trail

Every Mode B agent invocation logs to
`governance/.audit/REQ-<id>/<timestamp>-<agent>-<id>.md`. Append-only.

## Mode-A exceptions in Mode-B sessions

Inside a Mode B requirement, individual sub-tasks may still use Mode A
shortcuts ONLY if the sub-task is itself a typo / one-line config tweak
that would qualify for Mode A on its own. Triage decision goes into
the TASK file. The whole REQ remains Mode B.

## When to NOT use Mode B

- Pure conversation log update.
- Validator script bug fix that's a one-liner.
- Docs typo.
- Any change matching every condition in `ROLES.md` §6 "Mode A applies."

When in doubt, use Mode B. The cost of running unnecessary review is a
bit of token spend. The cost of skipping necessary review is a bug in
production targeting 1M+ users.
