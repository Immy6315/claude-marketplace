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
5. Runs the validator and prints a final report.

If your project is already initialised it refuses and points you at
`/eng-org:doctor` and `/eng-org:update`.

---

## What it lays down

```
your-project/
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
│   ├── requirements/README.md        # per-REQ folder layout
│   └── scripts/check.mjs             # zero-dep validator
└── .claude/
    └── agents/
        └── tl-<domain>.md            # one Tech Lead per declared domain
```

The 16 specialist agents (5 Devs, 5 Tests, 5 Reviewers, 1 EM) live
inside the plugin and are available globally as registered subagents.

---

## Three pipelines, by risk profile

eng-org gives you three flows. The EM picks at intake based on what the
change actually touches.

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

| Step | Command | What it does |
|---|---|---|
| 1 | `/eng-org:em-intake "<requirement>"` | EM creates `REQ-<id>`, triages Mode A vs Mode B |
| 2 | `/eng-org:tl-analyze REQ-<id>` | TL drafts a tasks plan + risk list |
| 3 | `/eng-org:tl-assign REQ-<id>` | TL spawns Dev specialists per task |
| 4 | `/eng-org:run-tests REQ-<id>` | Independent test agents (unit / integration / e2e / regression / load) |
| 5 | `/eng-org:run-reviews REQ-<id>` | Reviewers (architecture / security / performance / standards / observability) |
| 6 | `/eng-org:merge-readiness REQ-<id>` | TL aggregates, EM gates |
| 7 | `/eng-org:em-summary REQ-<id>` | Human-facing summary |

`/eng-org:pilot-check` is a self-test of the framework on its own files.

---

## Maintenance commands

| Command | Purpose |
|---|---|
| `/eng-org:doctor` | Read-only audit — verifies every framework file is present and consistent with `PROJECT.yml`. |
| `/eng-org:init` | One-time install in a project. Refuses to run twice. |

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

When in doubt, prefer Mode B. The cost of unnecessary review is low;
the cost of skipping necessary review is high. Mode C's safety
guarantees rest entirely on the eligibility checklist — when in doubt
about whether a bug fits, escalate.

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
