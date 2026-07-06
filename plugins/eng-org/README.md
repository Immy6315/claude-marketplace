# eng-org — 5-role multi-agent engineering org

A Claude Code plugin that drops a complete multi-agent engineering
process into any project: **EM → Tech Leads → Domain Devs → independent
Test agents → specialist Reviewer agents → human approval**.

The framework stops at *production-ready PR approval*. Deployment stays
human-controlled.

---

## Why

Solo developers and small teams need the discipline of a real
engineering org — separation of duties, independent review, audit
trail — but cannot afford the headcount. eng-org gives you that
discipline as a set of cooperating Claude agents that talk only through
artifacts on disk.

- No agent self-approves.
- The same agent never reused on the same artifact.
- Every decision is recorded under `governance/.audit/`.
- A merge needs human approval. Always.

---

## Install

```
/plugin marketplace add Immy6315/claude-marketplace
/plugin install eng-org@immy6315-marketplace
```

Then `cd` into your project and run:

```
/eng-org:init
```

That single command:

1. Reads your project (manifests, folder structure) to detect the stack.
2. Infers candidate domains from routers / apps / route groups.
3. Shows you what it found and asks for confirmation.
4. Generates a tailored `governance/` tree, `CLAUDE.md`, `PROJECT.yml`,
   and one `tl-<domain>.md` Tech Lead agent per domain.
5. Lays down the **portability layer** (v0.5.0+): `AGENTS.md` universal
   entry point, machine-readable `eng-org.json` manifest, and the
   `scripts/new-project.sh` multi-project scaffolder.
6. Runs the validator and prints a final report.

If your project is already initialised it refuses and points you at
`/eng-org:doctor` and `/eng-org:update`.

---

## What it lays down

```
your-project/
├── AGENTS.md                         # universal AI entry point (read FIRST)
├── eng-org.json                      # machine-readable manifest + project registry
├── PROJECT.yml                       # framework configuration record
├── CLAUDE.md                         # session-binding rules (FRAMEWORK block)
├── governance/
│   ├── ROLES.md                      # role contracts (binding)
│   ├── REVIEW_PROCESS.md             # workflow narrative
│   ├── CONSTITUTION.md               # project rules + §H iron rules
│   ├── MISTAKES.md                   # append-only lessons log
│   ├── TECH_DEBT.md                  # sanctioned waivers
│   ├── COVERAGE_THRESHOLDS.md        # test gates
│   ├── ARCHITECTURE.md               # system shape, layering, SLAs
│   ├── GUARDRAILS.md                 # 9 binding guardrails (G-7/G-8 in v0.11.0+, G-9 in v0.12.0+)
│   ├── design-divergence-registry.md # registered drift from design ref (G-6)
│   ├── api-contract-registry.md      # registered API response-contract changes (G-8, v0.11.0+)
│   ├── api-contracts/                # stored per-endpoint response baselines (G-7, v0.11.0+)
│   ├── graphs/                       # Mermaid linking-graphs (v0.6.0+, /eng-org:graphyfy)
│   ├── autopilot/PROG-<id>/          # Mode L program state (v0.12.0+): SPEC, acceptance-criteria 🔒, PLAN, STATE, ASSUMPTIONS, LEARNINGS
│   ├── requirements/README.md        # per-REQ folder layout
│   └── scripts/
│       ├── check.mjs                 # zero-dep validator
│       └── contract-diff.mjs         # zero-dep G-7 contract-parity engine (v0.11.0+)
├── scripts/
│   ├── new-project.sh                # standalone multi-project scaffolder
│   └── eng-org-templates/project/    # per-project doc templates (PRD, ADR log, …)
└── .claude/
    └── agents/
        └── tl-<domain>.md            # one Tech Lead per declared domain
```

The 18 specialist agents (5 Devs, 5 Tests, 6 Reviewers, 1 EM, **1
Architect**) live inside the plugin and are available globally as
registered subagents. Reviewers: architecture, security,
performance, standards, observability, **indexes** (deep DB-index
review — necessity, reuse, column-order, partial / INCLUDE /
CONCURRENTLY, EXPLAIN-ANALYZE).

The **architect** agent is distinct from `reviewer-architecture`.
It produces **versioned ADR documents** BEFORE any TL decomposes
tasks — against an explicit scale brief, a banned anti-pattern
list, and a locked tech stack. Reviewed adversarially in parallel
by `reviewer-architecture` + `reviewer-security` +
`reviewer-performance`. See `/eng-org:architect` below.

---

## The portability layer (v0.5.0+) — pick the project up cold

Governance docs get a new AI/engineer ~70% of the way. The last 30% — knowing
*where to start*, parsing the project *reliably*, and recovering the *why/when*
behind each decision — is what the portability layer adds. Three pillars, all
plain files in git, no dependency on any agent's private memory:

1. **`AGENTS.md`** — a tool-agnostic universal entry point. Claude Code
   auto-loads `CLAUDE.md`; other tools conventionally look for `AGENTS.md`.
   This file points every one of them at the same context in the same order,
   so a fresh AI knows exactly where to start.
2. **`eng-org.json`** — a machine-readable manifest. JSON, not prose, so any
   tool parses the stack, domains, governance doc paths, and the multi-project
   registry instantly and reliably.
3. **`DECISIONS.md`** (per project) — a dated, **append-only** ADR log. Captures
   the **WHY** and **WHEN** that prose docs lose over time. Never edit a past
   entry; append one that supersedes it.

### Multi-project registry + scaffolder

One workspace can govern many projects under `projects/<name>/`. Scaffold a new
one — docs (PRD, ARCHITECTURE, SYSTEM-DESIGN, TECH-DOC, TASK-LIST, TEST-PLAN),
`tests/`, `src/`, a dated `DECISIONS.md`, and `meta.json`, plus registration in
`projects/INDEX.md` and `eng-org.json` — with a single command:

```
/eng-org:new-project <name> "<one-line description>"
```

The same logic ships as a standalone `scripts/new-project.sh` (only dependency:
`python3`) so the workspace keeps working even when handed to someone without
the plugin installed.

| Question | Where the answer lives |
|----------|------------------------|
| **WHAT** was built? | `README.md`, `docs/PRD.md` |
| **WHY** this way? | `docs/ARCHITECTURE.md`, `DECISIONS.md` |
| **WHEN** did decisions happen? | `DECISIONS.md`, `eng-org.json` |
| **HOW** is it built / run? | `docs/TECH-DOC.md`, `docs/SYSTEM-DESIGN.md` |
| Everything, machine-readable | `eng-org.json`, `meta.json` |

---

## Four pipelines, by risk profile

eng-org gives you four flows. The EM picks A/B/C at intake based on
what the change actually touches; Mode L is human-activated only.

### Mode A — Maker → Checker (trivial)

For docs / config / governance-only changes that don't touch application
code. Single-author + fresh-Checker pattern. Built into the existing
review process.

### Mode C — Bug-fix flow (NEW; ~5 min, 5–6 agent calls)

For **bugs** with a reproducer, narrow scope, and no auth/schema/deps/PII
surface. Faster than Mode B; safer than Mode A. See `MODE_C.md` for the
full eligibility contract.

| Step | Command | What it does |
|---|---|---|
| 1 | `/eng-org:bug-intake "<bug + reproducer>"` | Run safety checklist; write spec.md (`mode: C`); assign 1 TL. Refuses + escalates to Mode B if any safety check fails. |
| 2 | `/eng-org:bug-fix REQ-<id>` | TL writes 1-paragraph analysis; spawns 1 Dev; Dev produces fix + regression test that fails-then-passes. |
| 3 | `/eng-org:bug-verify REQ-<id>` | In parallel: test-regression, test-unit (if pure logic), 1 reviewer (architecture). Orchestrator writes 1-page merge-readiness. |

Auto-escalates to Mode B if any participant detects scope creep.

### Mode B — Full 5-role pipeline (features, schema, auth, ~25–30 calls)

For features, schema migrations, new dependencies, user-visible flows,
auth/PII surface, or governance core changes. The original eng-org flow.

For batches that introduce a **new subsystem**, cross > 3 components,
exceed today's load by > 10×, propose a new data-layer pattern
(partitioning, sharding, multi-region), or add an external dependency
— run `/eng-org:architect <subsystem>` FIRST to produce an ACCEPTED
ADR. TLs MUST read the ADR before `tl-analyze`.

| Step | Command | What it does |
|---|---|---|
| 0 | `/eng-org:architect <subsystem>` | (when triggered) Architect produces a versioned ADR doc against `governance/architecture/briefs/<subsystem>-brief.md`; adversarially reviewed by reviewer-architecture / reviewer-security / reviewer-performance; iterates until all APPROVE → status flips to ACCEPTED |
| 1 | `/eng-org:em-intake "<requirement>"` | EM creates `REQ-<id>`, triages Mode A vs Mode B |
| 2 | `/eng-org:tl-analyze REQ-<id>` | TL drafts a tasks plan + risk list |
| 3 | `/eng-org:tl-assign REQ-<id>` | TL spawns Dev specialists per task |
| 4 | `/eng-org:run-tests REQ-<id>` | Independent test agents (unit / integration / e2e / regression / load) |
| 5 | `/eng-org:run-reviews REQ-<id>` | Reviewers (architecture / security / performance / standards / observability / indexes) **+ GR deep-review** (see below) |
| 6 | `/eng-org:merge-readiness REQ-<id>` | TL aggregates, EM gates |
| 7 | `/eng-org:em-summary REQ-<id>` | Human-facing summary |

`/eng-org:pilot-check` is a self-test of the framework on its own files.

#### GR deep-review (NEW in 0.13.0) — independent second review engine

`/eng-org:run-reviews` now also runs the **gr** multi-specialist review
engine over the REQ's actual diff, in **local-diff mode** — no GitHub
PR, no token, nothing posted anywhere:

```bash
gr review --range <base-branch>..HEAD --repo <repo-path>
```

- **Zero-install friction:** `scripts/gr-ensure.sh` resolves the binary
  (PATH → `~/.local/bin/gr` → one-time download of a pre-built binary
  from the public `Immy6315/gr-releases` repo). The gr-reviewer plugin
  is NOT required. If installation fails (offline), GR is skipped with
  a note — it never blocks the pipeline.
- **Any base branch:** the diff base comes from the REQ's `spec.md`
  target branch (`develop`, `releases/stable`, …) — `main` is never
  assumed.
- **TL validation gate:** GR findings are advisory until the TL
  evidence-verifies them against the code. Dispositions (CONFIRMED /
  FALSE-POSITIVE / OUT-OF-SCOPE) land in `REQ-<id>/gr-review.md`;
  merge-readiness refuses READY-FOR-MERGE without it.
- **Learning loop:** every CONFIRMED finding appends a prevention rule
  to `governance/MISTAKES.md`, so the org stops repeating that class
  of mistake.

### Mode L — Autonomous build-until-done loop (NEW in 0.12.0)

For **whole programs**: "build me this software" with a detailed brief.
The loop decomposes into milestones/REQs, drives the Mode B pipeline
per REQ, fixes RED/BLOCK iteratively, learns per milestone
(retro → validated LEARNINGS), revises its own architecture decisions
(versioned ADRs), and runs until the acceptance criteria are met —
with human input only at the start (gate) and at checkpoints/merges.
See `MODE_L.md` for the full protocol.

| Step | Command | What it does |
|---|---|---|
| 1 | `/eng-org:autopilot "<software brief>"` | **G-9 clarity gate**: 8-item scorecard (machine-checkable acceptance criteria, locked stack, NON-goals, dependency pre-flight, priority, budget, design reference, feasibility). Interviews you until 8/8, records authority grants, architect plan preview → your explicit approval. |
| 2 | `bash scripts/autopilot-driver.sh PROG-<id>` | External crash-safe loop: each iteration invokes `/eng-org:autopilot-iterate` in a **fresh context** (no drift/rot), rehydrating from `governance/autopilot/PROG-<id>/` state files. |
| 3 | `/eng-org:autopilot-iterate PROG-<id>` | One work item per iteration through the normal pipeline. Mid-loop ambiguity: **decide-and-log** (ASSUMPTIONS.md) or **park** — never asks you. Circuit breaker: 3× same fix fingerprint or budget exhausted → park; all parked → HALT + escalation report. |

Hard lines: the loop never edits `SPEC.md` / `acceptance-criteria.md` /
pre-program baseline tests (immutable zone — anti-reward-hacking), never
merges (§H rule 47), and never relaxes a guardrail. Mode L is never a
triage outcome — the EM can only *recommend* it; a human activates it.

---

## Maintenance commands

| Command | Purpose |
|---|---|
| `/eng-org:doctor` | Read-only audit — verifies every framework file is present and consistent with `PROJECT.yml`. |
| `/eng-org:init` | One-time install in a project. Refuses to run twice. |
| `/eng-org:new-project <name> "<desc>"` | Scaffold a new project under the multi-project registry (docs + tests + dated DECISIONS.md + meta.json; registers in `projects/INDEX.md` and `eng-org.json`). |

---

## Skills

| Skill | Purpose |
|---|---|
| `/eng-org:graphyfy` | Generate/refresh Mermaid **linking-graphs** in `governance/graphs/` so any AI or engineer can *see* how the project connects — module/layer dependencies, domain & data-model relationships, the requirement→task dependency DAG, and the role pipeline. Idempotent: creates the graphs if missing, updates them in place if present. `AGENTS.md` points cold-pickup readers at these graphs. |

---

## Triage — when each mode

**Mode A (Maker → Checker)** — touches only:
- `governance/**`, `.claude/**`, `**/*.md`, `PROJECT.yml`
- No new dependencies, no schema changes, no user-visible behaviour.

**Mode C (bug-fix, ~5 min)** — restoring broken behavior, with ALL of:
- A reproducer (failing test or reliable trigger steps)
- ≤ 3 production files (≤ 5 with TL approval)
- No auth / schema / deps / PII / payment surface
- No new behavior introduced — just restoring what was broken

**Mode B (5-role)** — touches any of:
- application code (features), schema migrations, new dependencies,
  user-visible flows, or governance core (CONSTITUTION, ROLES, agent
  definitions). Also: any bug whose fix exceeds Mode C eligibility.

**Mode L (autopilot)** — a whole software/program, not a change:
- Multi-milestone scope that would decompose into 4+ REQs
- Activated ONLY by the human via `/eng-org:autopilot` (EM may recommend,
  never activate)
- Requires the G-9 clarity gate at 8/8 before any work starts

When in doubt, prefer Mode B. The cost of unnecessary review is low;
the cost of skipping necessary review is high. Mode C's safety
guarantees rest entirely on the eligibility checklist — when in doubt
about whether a bug fits, escalate.

---

## Guardrails (v0.2.0+, `governance/GUARDRAILS.md`)

Nine binding guardrails enforced in addition to ROLES.md. They exist
because real multi-agent runs hit "fix one thing, break another" until
the rules below are mechanical:

- **G-1 Perceptual parity gate** — any UI change ships with a
  side-by-side screenshot (device vs design reference). Unregistered
  drift BLOCKs merge. Numeric parity ≠ perceptual parity.
- **G-2 Regression-check.md per task** — every Dev / Test agent's
  FIRST deliverable is `tasks/TASK-<n>-regression-check.md` listing
  prior REQs that touched the same files + applicable MISTAKES entries
  + yes/no preservation answers. Converts passive MISTAKES.md reading
  into active verification.
- **G-3 Device-boot smoke (not Metro)** — any native-dep / `expo.extra`
  diff requires `npx expo run:ios` reaching first-route mount on
  device. Metro-only is explicitly disallowed because Metro never
  instantiates native modules.
- **G-4 Batch cap** — max 3 parallel REQs; larger batches require
  explicit owner authorization in `spec.md`.
- **G-5 "Pre-existing" excuse banned** — any failure tolerated must be
  in `TECH_DEBT.md` with a retirement date ≤ 30 days.
- **G-6 Design-divergence registry** — intentional drift from the
  design reference is registered, not prohibited. G-1 consults the
  registry; registered divergences PASS, unregistered FAIL.
- **G-7 API contract-parity gate** (v0.11.0+) — the backend analogue of
  G-1. Any REQ touching an endpoint's response ships a normalized
  before/after **contract diff** (`governance/scripts/contract-diff.mjs`
  strips volatile fields — timestamps, uuids, ids — so the signal is the
  contract, not noise). Unregistered response drift BLOCKs merge; a
  **private-field leak on a public/unauthenticated endpoint** is an
  unconditional BLOCK that no registry entry can waive.
- **G-8 API-contract registry** (v0.11.0+) — intentional contract changes
  are registered in `governance/api-contract-registry.md` (append-only,
  breaking-change flagged), not prohibited. G-7 consults it; registered
  changes PASS, unregistered FAIL.
- **G-9 Clarity gate for Mode L** (v0.12.0+) — no autonomous loop
  without clarity: 8-item scorecard (incl. feasibility + dependency
  pre-flight) must be 8/8 before the loop starts; the loop's SPEC,
  acceptance criteria, and pre-program baseline tests are an
  **immutable zone** (anti-reward-hacking); a fingerprint-based
  **circuit breaker** parks doom-looping REQs instead of retrying
  forever.

`/eng-org:init` lays these files down. `merge-readiness.md` enforces
G-1/G-2/G-3/G-5/G-7 mechanically; `em-intake.md` enforces G-4. The G-7
snapshot is captured by the `test-integration` agent during `/run-tests`.

---

## Iron rules (Constitution §H, generated by `/eng-org:init`)

42. No agent self-approves.
43. Same agent never reused on the same artifact.
44. Role contracts in `ROLES.md` are binding.
45. Communication is artifact-only — no agent reads another's memory.
46. Audit trail mandatory in `governance/.audit/`.
47. Human approval non-negotiable for merge.
48. ROLES / CONSTITUTION changes follow Mode B.
49. Triage is the first decision per REQ.

These are written into your project's `CONSTITUTION.md` inside a
framework-owned block; the rest of the constitution is yours.

---

## Customising

- **Project-specific rules** go *outside* the `<!-- FRAMEWORK:START -->`
  / `<!-- FRAMEWORK:END -->` block in `CLAUDE.md`. The framework block
  is owned by the plugin.
- **Constitution §A–§G** are yours. §H is owned by the plugin.
- **Adding a domain** — edit `PROJECT.yml`, then run `/eng-org:doctor`.
  A future `/eng-org:update` will regenerate the missing TL agent.
- **Adjusting coverage gates** — edit `governance/COVERAGE_THRESHOLDS.md`
  freely.

---

## License

MIT. See repo root.
