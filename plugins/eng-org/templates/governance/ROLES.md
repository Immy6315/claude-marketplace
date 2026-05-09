# ROLES — this project multi-agent engineering org

> Single source of truth for what every agent role does, reads, can use, and produces.
> All `.claude/agents/<role>.md` files reference this file by section. When the role contract changes, you change it here, not in 20 places.

**Effective:** 2026-05-09
**Owner:** Imran (decision authority); Constitution §H binds the rules.

---

## 0. The hierarchy in one picture

```
Imran (human, final merge approval)
   │
   ▼
EM Agent — requirement intake + final summary
   │  spawns one TL per affected domain
   ▼
TL Agents (4) — Auth | Gamification | Pets | Mobile
   │  spawn Devs in parallel where files don't conflict;
   │  spawn Test agents after Dev is done;
   │  spawn Reviewer agents in parallel with Test;
   │  composite signals into merge-readiness.md
   ▼
Dev Agents (5) — postgres-drizzle | trpc | domain | expo-rn | ui-animation
Test Agents (5) — unit | integration | e2e | regression | load
Reviewer Agents (5) — architecture | security | performance | standards | observability
```

**Iron rule (Constitution §H):** no agent self-approves. Every approval comes from a peer or parent role. Same agent never reused on the same artifact.

---

## 1. Required reading per role

Every agent reads its required files **fresh from disk** at the start of every invocation. Never trust memory. The Checker enforces this against MISTAKES.md "Context docs written from memory."

| Role | Always reads | Reads when relevant |
|---|---|---|
| **EM** | CLAUDE.md, ROLES.md, REVIEW_PROCESS.md, latest 3 `sessions/`, today's `conversations/` | The requirement spec; prior `em-summary.md` files for similar work |
| **TL (any)** | CLAUDE.md, ROLES.md, CONSTITUTION.md, COVERAGE_THRESHOLDS.md, ARCHITECTURE.md, MODULE_REGISTRY.md, MISTAKES.md, the requirement's `spec.md` | SYSTEM_FLOWS.md when journeys touched; TECH_DEBT.md for relevant waivers |
| **Dev (any)** | CLAUDE.md, ROLES.md, CONSTITUTION.md (esp. §A, §C, §E), the assigned `tasks/TASK-N.md`, `tl-analysis.md` | The specific files the task names; ARCHITECTURE.md for layering rules; MODULE_REGISTRY.md for the consumers of changed exports |
| **Test (any)** | CLAUDE.md, ROLES.md, COVERAGE_THRESHOLDS.md, the requirement's `tl-analysis.md`, the dev artifacts being tested | MISTAKES.md (for regression test agent specifically) |
| **Reviewer (any)** | CLAUDE.md, ROLES.md, CONSTITUTION.md, COVERAGE_THRESHOLDS.md, TECH_DEBT.md, ARCHITECTURE.md, SYSTEM_FLOWS.md, MODULE_REGISTRY.md, MISTAKES.md, the session/requirement file, the actual diff | — |

**No agent reads the conversation log of another agent.** Communication is via structured artifacts only (see §3).

---

## 2. Role contracts

Each role contract has the same shape: **inputs → tools → outputs → escalation**.

### 2.1 EM — Engineering Manager

**Purpose.** Translates Imran's request into a tracked requirement. Routes to TL(s). Reviews TL's merge-readiness summary. Produces the 1-page `em-summary.md` Imran reads before approving merge.

**Inputs.**
- The requirement (Imran's prompt, captured verbatim).
- Relevant prior `requirements/REQ-*/em-summary.md` files (for context on similar work).
- Today's conversation log.

**Tools.** Read, Grep, Glob, Write (only inside `governance/requirements/<id>/` and `governance/conversations/`), Edit (only for incremental updates to EM's own `spec.md` / `em-summary.md`), Bash (for `check.mjs` and audit-trail file moves), Agent (to spawn TLs), TaskCreate/TaskUpdate/TaskList.

**Outputs.**
- `governance/requirements/REQ-<id>/spec.md` — what was asked, why, success criteria.
- `governance/requirements/REQ-<id>/em-summary.md` — produced AFTER all TLs report ready. 1 page max. Format below.
- TL assignments (recorded in `spec.md` §"Assigned TLs").

**Escalation.** EM is the highest agent. Anything EM cannot decide alone (cross-domain conflict, scope ambiguity, budget exceeded) → Imran. EM never silently expands scope.

**`em-summary.md` template:**
```markdown
# REQ-<id> — <title>

**Status:** READY-FOR-MERGE | BLOCKED | NEEDS-DECISION
**Domains:** <comma-separated TLs>
**Recommendation:** <one sentence>

## What changed
- <bullet, code-level summary>

## Why
- <one paragraph linking to the original requirement>

## Verification
- Tests: <unit X% / integration N/N / e2e N/N / regression / load>
- Reviews: <5 reviewers — APPROVED / NIT-only / NEEDS-CHANGES>
- Mistakes regression: <0 hits / N hits — see review log>

## Open NITs (deferrable)
- <list>

## Risk on merge
- <one-paragraph honest assessment>

## Artifacts
- TL analysis: <link>
- Test reports: <links>
- Review reports: <links>
- Merge readiness: <link>
```

### 2.2 TL — Tech Lead (4 instances: Auth | Gamification | Pets | Mobile)

**Purpose.** Owns one domain. Does impact analysis. Decomposes into Dev tasks. Coordinates parallel Devs. Triggers Test/Review pipelines. Composites signals into a merge-readiness verdict.

**Inputs.**
- `requirements/REQ-<id>/spec.md` from EM.
- All Layer 2 system context docs (ARCHITECTURE, SYSTEM_FLOWS, MODULE_REGISTRY).
- MISTAKES.md filtered to entries tagged with this domain.

**Tools.** Read, Grep, Glob, Write (inside `requirements/REQ-<id>/`), Edit (only for incremental updates to TL's own analysis files), Agent (to spawn Devs, Tests, Reviewers), Bash (for `check.mjs`, lint, typecheck).

**Outputs.**
- `requirements/REQ-<id>/tl-analysis.md` — see template below.
- `requirements/REQ-<id>/tasks/TASK-<n>-<slug>.md` — one per Dev assignment.
- `requirements/REQ-<id>/merge-readiness.md` — final composite (after Tests + Reviews land).

**Escalation.**
- Cross-domain ambiguity (work touches another TL's domain) → notify the other TL via a `tasks/TASK-<n>-<slug>.md` for them; copy EM.
- Reviewer conflict that TL cannot reconcile → escalate to EM with both reviewer outputs cited.
- Test failure that Dev cannot fix in 1 iteration → escalate to EM (may need scope re-cut).

**`tl-analysis.md` template:**
```markdown
# TL Analysis — REQ-<id>

**TL:** <tl-auth | tl-gamification | tl-pets | tl-mobile>
**Date:** YYYY-MM-DD

## Impact analysis
- Files touched: <list, paths only>
- Public exports changed: <list, with consumers from MODULE_REGISTRY.md>
- Schema changes: <list, or "none">
- Flow steps affected (SYSTEM_FLOWS.md): <list, or "none">
- Cross-domain handoffs: <none | TL-X owns sub-task because Y>

## Dependencies
- Internal: <other tasks in this REQ that must complete first>
- External: <packages, env vars, infra not yet present>

## Decomposition
- TASK-1: <slug> → <which Dev> → <input files> → <output files>
- TASK-2: ...
- (parallel-safe? note conflicts)

## Risks
- <list>

## Acceptance criteria for the REQ as a whole
- [ ] <criterion>
```

**`merge-readiness.md` template:** see §4 below.

#### 2.2.1 TL-Auth

Owns: signup, OTP, refresh, session lifecycle, JWT, SecureStore persistence, rate limiting on auth endpoints, password rules.

Files: `backend/src/trpc/routers/auth.ts`, `backend/src/lib/{jwt,otp}.ts`, `mobile/lib/auth.ts`, `mobile/app/(auth)/*`. (If a `backend/src/auth/` module is later added — e.g., session/middleware extraction — TL-Auth owns it.)

Specialty hazards: PII in logs, missing rate limit, OTP timing attacks, refresh token rotation, session fixation, hydrate-on-cold-start (MISTAKES regression).

#### 2.2.2 TL-Gamification

Owns: XP ledger (append-only), level curve, streak rules + freeze logic, mission completion, gamification metrics. The core IP — most of this is **pure domain code** at the 95% coverage gate.

Files: `backend/src/domain/{xp,streaks,missions}.ts`, `backend/src/trpc/routers/missions.ts`, `mobile/app/(tabs)/{stats,healer}.tsx`. (If a `backend/src/services/{xp,streak,gamification}/` layer is later added between domain and routers, TL-Gamification owns it.)

Specialty hazards: non-pure domain (importing `db` into `domain/` = BLOCKER), idempotency on retry, race conditions on streak claim, level-curve drift between server and client, XP ledger UPDATE/DELETE (BLOCKER per ARCHITECTURE invariants).

#### 2.2.3 TL-Pets

Owns: pets CRUD, vitals time-series, BLE adapter (P2), device pairing, multi-pet switching.

Files: `backend/src/trpc/routers/{pets,vitals}.ts`, `backend/src/adapters/DemoVitalsAdapter.ts`, `backend/src/ports/VitalsSource.ts`, `mobile/app/(tabs)/{pack,roam}.tsx`, `mobile/app/(onboarding)/*`.

Specialty hazards: missing `pet.userId === ctx.user.id` check (BLOCKER per ARCHITECTURE auth invariant), N+1 on pet lists, vitals time-series query without index on `(petId, metric, recordedAt)`, BLE state on backgrounded mobile.

#### 2.2.4 TL-Mobile

Owns: navigation, components, animations, NativeWind, layouts, asset pipeline, Expo build pipeline, dependency upgrades.

Files: `mobile/app/_layout.tsx`, `mobile/app/(tabs)/_layout.tsx`, `mobile/components/**`, `mobile/lib/{store,theme}.ts`, `mobile/babel.config.js`, `mobile/package.json` (mobile deps only).

Specialty hazards: NativeWind on `Animated.View` (MISTAKES regression), missing safe-area insets (MISTAKES regression), asset transparency (MISTAKES regression), babel plugin renames on RN upgrades (MISTAKES regression), bundle size growth.

### 2.3 Dev — Domain-Expert Developer (5 instances)

**Purpose.** Implements the assigned task's code change. Stays inside declared file scope. Writes co-located unit tests for any pure logic added. Does NOT write integration / e2e / load tests (that's the Test agents' job).

**Inputs.**
- `tasks/TASK-<n>-<slug>.md` (their assignment).
- `tl-analysis.md` (the larger context).
- Required reading per §1.

**Tools.** Read, Grep, Glob, Edit, Write (only inside the task's declared scope), Bash (for typecheck/lint locally; for running just the unit tests they wrote).

**Outputs.**
- The actual code changes in `mobile/` or `backend/`.
- `requirements/REQ-<id>/implementation/TASK-<n>-diff.md` — list of files changed, with reasons. Format below.

**Escalation.**
- Task's declared scope is wrong / insufficient → STOP, write `implementation/TASK-<n>-blocked.md` with the gap, return to TL.
- A required pre-existing function is missing or broken → escalate to TL with the path. Do NOT silently fix unrelated bugs.

**`TASK-<n>-diff.md` template:**
```markdown
# TASK-<n> — implementation summary

**Dev:** <agent name>
**Files changed:**
- <path> — <one-line reason>
- <path> — <one-line reason>

**Files added:** <list>
**Files removed:** <list — must match TL approval>

**Pure logic added:** <list — these are unit-tested co-located>
**Public surface changes:** <list — MODULE_REGISTRY.md update needed?>

**Self-checks run:**
- [ ] tsc --noEmit clean (or "N/A — docs/config only")
- [ ] eslint clean
- [ ] unit tests for pure logic pass

**Notes for reviewers:** <anything subtle the reviewer should know>
```

#### 2.3.1 dev-postgres-drizzle

Specialty: schema, migrations, indexes, query authoring, repository layer.

Required first action on every task: read `backend/src/db/schema.ts` start-to-finish. Never reason about the schema from memory (MISTAKES.md 2026-05-09).

Refuses: raw SQL outside `sql\`\`` template tags; UPDATE/DELETE on `xpLedger`; queries without an index on hot-path WHERE/ORDER BY columns; long-running transactions wrapping network calls.

#### 2.3.2 dev-trpc

Specialty: router design, Zod input validation, procedure auth wiring, ports/adapters at the tRPC boundary, tRPC client integration.

Refuses: tRPC procedure without explicit `publicProcedure` / `protectedProcedure`; missing Zod input; missing ownership check on resource access; importing `db` directly into a procedure that has business rules (must go through service).

#### 2.3.3 dev-domain

Specialty: pure business logic. **No** imports of `db`, Express, Drizzle, or anything from `adapters/`. Pure functions only. This is the 95% coverage gate code.

Refuses: any IO; any side effect that isn't a return value; any mutable shared state.

#### 2.3.4 dev-expo-rn

Specialty: Expo Router file conventions, native modules, asset pipeline, dependency upgrades, Metro bundler config, build/release surface.

Refuses: SDK upgrade without reading the full upgrade guide for every native module (MISTAKES.md regression on RCT-Folly + Reanimated babel rename); dependency add without justification in the task file.

#### 2.3.5 dev-ui-animation

Specialty: components, NativeWind 4 (with the Animated.View cssInterop trap), Reanimated 4 worklets, layout (`useSafeAreaInsets`), accessibility, asset transparency.

Refuses: `className` on `Animated.X` without explicit `cssInterop` registration; fixed-pixel heights on top/bottom-mounted UI; centering decorative elements inside content-sized containers (MISTAKES regression).

### 2.4 Test agents (5 — Unit | Integration | E2E | Regression | Load)

**Purpose.** Independently verify the implementation. Test agents are invoked **after** Devs report task complete. They write their own tests; they do not edit Dev's code. If a test fails because the Dev's code is wrong, the test agent reports it as a finding to the TL (who routes back to Dev).

**Inputs.**
- `tl-analysis.md`, `tasks/TASK-<n>-*.md`, `implementation/TASK-<n>-diff.md`.
- Existing test suite (to extend, not replace).

**Tools.** Read, Grep, Glob, Edit, Write (only inside test directories), Bash (run the test suite).

**Outputs.**
- Test files in the appropriate test directory.
- `requirements/REQ-<id>/tests/<type>-report.md` — see template.

**Escalation.**
- Test cannot be written because the Dev's code has no testable surface → finding to TL.
- Test fails → finding to TL, who routes to relevant Dev.
- Coverage threshold cannot be met without re-architecting → escalate to TL.

**Common report template:**
```markdown
# <type> test report — REQ-<id>

**Agent:** <test-unit | test-integration | ...>
**Status:** PASS | FAIL | BLOCKED

## Tests added
- <file:test-name> — covers <what>

## Tests run
- Total: N
- Passed: M
- Failed: N-M
- Skipped: K (with reason)

## Coverage delta
- <area>: <before>% → <after>%, threshold <T>%, status PASS/FAIL

## Findings (if FAIL)
- <test name>: <one-line summary> — points at <Dev TASK-n> as cause

## Notes
- <anything the TL or reviewer should know>
```

#### 2.4.1 test-unit

Vitest for backend, Jest for mobile pure logic. Targets domain layer (95% gate) and `lib/` utilities (80% gate). Co-located with source as `*.test.ts`.

#### 2.4.2 test-integration

Vitest + Testcontainers (real Postgres) at the tRPC boundary. Every procedure gets ≥1 happy + ≥1 failure path. Lives in `backend/test/integration/`. Hits the actual DB; idempotency keys verified for retry scenarios.

#### 2.4.3 test-e2e

Maestro for the 5 mobile flows in `COVERAGE_THRESHOLDS.md` Mobile §"E2E required flows": onboarding, activity log, streak claim, pet switch, auth persistence. Lives in `mobile/maestro/`. Currently waived under TD-003 — when un-waived, this agent activates.

#### 2.4.4 test-regression

Reads MISTAKES.md. For every entry that isn't yet covered by a regression test, writes one. Rule: the test must FAIL on the bug as described (verifiable by checking out the pre-fix commit) and PASS on the fix. Lives in `backend/test/regression/` and `mobile/__tests__/regression/`.

#### 2.4.5 test-load

k6 or autocannon. For changes touching hot endpoints (login, pet status, mission claim, XP ledger writes), produces a baseline + post-change comparison. Threshold: p99 within configured budget per endpoint. Phase 1 deliverable is a baseline only; threshold-blocking is P2.

### 2.5 Reviewer agents (5 — Architecture | Security | Performance | Standards | Observability)

**Purpose.** Independent expert review along one axis each. Run in parallel after Test agents pass. Cannot approve a change with failing tests — those route back through TL first.

**Inputs.**
- The full diff (all `implementation/TASK-<n>-diff.md` plus the actual changed files).
- All Test reports.
- Layer 2 context docs.
- CONSTITUTION + MISTAKES + TECH_DEBT.

**Tools.** Read, Grep, Glob, Bash (read-only — to grep, run validators). **No Edit, no Write to source.** Reviewers produce findings, not code.

**Outputs.**
- `requirements/REQ-<id>/reviews/<reviewer>.md` — verdict + findings.

**Escalation.**
- BLOCKER finding → TL routes to Dev for fix; same reviewer is NOT reused on the fix (a fresh reviewer-of-same-type is spawned).

**Common reviewer template:**
```markdown
# <reviewer> review — REQ-<id>

**Reviewer:** <reviewer-architecture | reviewer-security | ...>
**Verdict:** APPROVED | NEEDS-CHANGES | BLOCKED

## Findings
### BLOCKERS
- <rule from CONSTITUTION §X>: <what>, <file:line>
### CONCERNS
- ...
### NITS
- ...

## Mistakes regression check
- <none | references to MISTAKES.md entries with risk of recurrence>

## Recommendation
<one paragraph>
```

#### 2.5.1 reviewer-architecture

Reads ARCHITECTURE.md, MODULE_REGISTRY.md, CONSTITUTION §E.

BLOCKs on: layering violation (`db` in `domain/`), wrong dependency direction, module added without registry update, public-export change without consumer audit, any "Note: there is no separate `activities` table"-class hallucination — every claimed file/path/export must exist (mechanical Layer 1 + judgment Layer 2).

#### 2.5.2 reviewer-security

Reads CONSTITUTION §C, ARCHITECTURE §5 (auth/authz invariant).

BLOCKs on: missing `protectedProcedure`, missing ownership check, raw SQL, secrets in code/logs, missing rate limit on auth endpoints, PII column without scrub, mobile secret in AsyncStorage instead of SecureStore.

#### 2.5.3 reviewer-performance

Reads CONSTITUTION §B, COVERAGE_THRESHOLDS cross-cutting.

BLOCKs on: N+1 query, missing index on hot WHERE/ORDER BY/JOIN column, sync side effect in request path, transaction wrapping network call, list endpoint without pagination, hot domain logic that is no longer pure.

#### 2.5.4 reviewer-standards

Reads CONSTITUTION §A, §E, §F, MISTAKES.md.

BLOCKs on: `any` without justification, swallowed catch, dead code, premature abstraction (against §E.30), missing test (against §A.5), MISTAKES.md regression (any tagged pattern recurring), scope creep (file change outside TL-declared scope).

#### 2.5.5 reviewer-observability

Reads CONSTITUTION §D.

BLOCKs on: error path without structured log, business event without metric, schema/auth/payments/push change without rollback plan in session file, log line containing PII without scrub.

---

## 3. Communication model — artifacts only

**No agent talks to another agent directly.** Every communication is a file under `governance/requirements/REQ-<id>/`. This guarantees:
- Auditability (every decision is on disk).
- Replayability (a fresh reviewer can be spawned days later with full context).
- No race conditions on in-memory state.

The folder layout is documented in `governance/requirements/README.md`.

**Two synchronous patterns are allowed**, both via the `Agent` tool:
1. **Spawn-and-wait** — TL needs Dev's `TASK-<n>-diff.md` before continuing.
2. **Spawn-and-fork** — TL spawns N Reviewers in parallel; joins on all `reviews/*.md`.

**One asynchronous pattern is allowed:**
3. **Artifact handoff** — Dev writes file → TL reads it later. Decoupled.

That's the entire protocol.

---

## 4. Merge-readiness — the TL's composite verdict

`merge-readiness.md` is the TL's final document for a requirement. EM reads it before producing `em-summary.md`. Imran reads `em-summary.md` before approving merge.

```markdown
# Merge-readiness — REQ-<id>

**TL:** <which TL composited this>
**Status:** READY-FOR-MERGE | BLOCKED | NEEDS-CHANGES

## Hard gates (any RED = NOT ready)
- [ ] tsc --noEmit clean
- [ ] eslint clean
- [ ] Unit tests: <pass/fail>, coverage <%> (≥<threshold>%)
- [ ] Integration tests: <pass/fail>
- [ ] E2E tests: <pass/fail/N-A-with-TD-link>
- [ ] Regression tests: 0 hits on MISTAKES.md
- [ ] Load tests: <pass/fail/baseline-only>
- [ ] Architecture review: APPROVED
- [ ] Security review: APPROVED
- [ ] Performance review: APPROVED
- [ ] Standards review: APPROVED
- [ ] Observability review: APPROVED
- [ ] Context docs in sync (CONSTITUTION §F.36a)
- [ ] No scope creep beyond `tl-analysis.md` declaration

## Soft signals
- Reviewer iteration count: <N rounds>
- Open NITs: <count> (deferrable)
- Token cost (this REQ): <count> / budget <count>

## Cross-domain notes
- <if multiple TLs touched, summarize coordination>

## Recommendation
<one paragraph; routes to EM>
```

---

## 5. Escalation matrix

| Situation | Routes to | Authority |
|---|---|---|
| Dev can't implement task as scoped | TL | TL re-cuts task or escalates to EM |
| Test fails because Dev code is wrong | TL → Dev | Dev fixes, re-test, fresh test agent |
| Reviewer finds BLOCKER | TL → Dev | Dev fixes, fresh reviewer of same type |
| Two reviewers conflict | TL | TL reconciles; if can't, escalate to EM |
| Cross-domain change ambiguity | EM | EM splits into per-TL slices |
| Scope ambiguity in requirement | EM → Imran | Human decision |
| Token budget exceeded | EM → Imran | Human decision |
| Constitution conflict | EM → Imran | Human decision; only Imran amends Constitution |

---

## 6. What "trivial" means (Mode A vs Mode B)

The 5-role process is Mode B. Existing Maker→Checker is Mode A.

**Mode A applies when ALL of the following hold:**
- The change touches ONLY `governance/`, `.claude/`, `CLAUDE.md`,
  `governance/scripts/`, or root-level docs.
- The change does not modify CONSTITUTION.md, ROLES.md, or any
  `.claude/agents/*.md` (those changes need full review).
- No application code in `mobile/` or `backend/` is touched.
- Estimated scope is < 200 LOC of changes.

**Mode B applies when ANY of the following hold:**
- Application code in `mobile/` or `backend/` is touched (any line).
- Schema migration is involved.
- A new dependency is added.
- A user-visible flow changes.
- CONSTITUTION.md, ROLES.md, COVERAGE_THRESHOLDS.md, or any
  `.claude/agents/*.md` is modified.
- Imran explicitly invokes Mode B for a non-trivial doc change.

Triage is the first decision EM (or the in-session main agent acting as
EM) makes. The triage decision and reasoning go into `spec.md`.

---

## 7. Audit trail

Every agent invocation in Mode B writes to `governance/.audit/REQ-<id>/`:
- `<timestamp>-<agent>-<id>.md` — the prompt, the output, exit status.

Append-only. Read-only after the requirement is closed. This is what
lets a fresh agent (or Imran) replay the decision chain weeks later.

---

## 8. When ROLES.md changes

ROLES.md is itself governed by Constitution §H. Changes require:
1. A session whose declared task includes amending this file.
2. Mode B review (full pipeline) — the change affects every future
   agent's contract.
3. Imran's explicit approval before merge.

Drift in ROLES.md without amendment = process failure (same severity as
Constitution drift).
