# CLAUDE.md — {{PROJECT_NAME}} project rules

This file is auto-loaded at the start of every Claude Code session in
this directory and is **binding**. It does not apply to other projects
on this machine.

<!-- FRAMEWORK:START -->

## Framework — eng-org multi-agent process (do not edit by hand)

> This block is owned by the `eng-org` plugin. `/eng-org:update` will
> rewrite it. To customize project behavior, edit OUTSIDE this
> START/END pair.

This project uses the **eng-org** 5-role multi-agent engineering
framework: EM → Tech Leads → Domain Devs → independent Test agents →
specialist Reviewer agents → human approval. The framework stops at
"production-ready PR approval"; deployment is human-controlled.

### 1. Bootstrap before responding

When a session opens (or context has been lost), before answering:

1. Read `governance/ROLES.md` (single source of truth for role contracts).
2. Read `governance/CONSTITUTION.md` (project rules, including §H multi-agent rules).
3. Read `governance/MISTAKES.md` (what we've broken before).
4. Read the latest entries in `governance/conversations/` if present.
5. Run `node governance/scripts/check.mjs` and surface its output.

Confirm understanding in 1–2 sentences, then proceed.

### 2. The 5-role pipeline (Mode B) is binding for non-trivial change

Triage is the first decision per requirement, recorded in
`governance/requirements/REQ-<id>/spec.md`:

- **Mode A (Maker → Checker)** — for trivial, governance/config/docs-only
  changes that touch nothing under code roots and add no dependencies.
  Use the existing flow (declare a session, do work, run validator,
  spawn fresh Checker).
- **Mode B (full 5-role)** — for any change that touches application
  code, schema migrations, new dependencies, user-visible flows, or
  governance core (CONSTITUTION / ROLES / agent definitions). Use the
  slash commands:
  - `/eng-org:em-intake "<requirement>"`
  - `/eng-org:tl-analyze REQ-<id>`
  - `/eng-org:tl-assign REQ-<id>`
  - `/eng-org:run-tests REQ-<id>`
  - `/eng-org:run-reviews REQ-<id>`
  - `/eng-org:merge-readiness REQ-<id>`
  - `/eng-org:em-summary REQ-<id>`

When in doubt, prefer Mode B — the cost of unnecessary review is low,
the cost of skipping necessary review is high.

### 3. Iron rules (Constitution §H — agent-binding)

42. No agent self-approves.
43. Same agent never reused on the same artifact.
44. Role contracts in `ROLES.md` are binding.
45. Communication is artifact-only — no agent reads another's memory.
46. Audit trail mandatory in `governance/.audit/`.
47. Human approval non-negotiable for merge.
48. ROLES / CONSTITUTION changes follow Mode B.
49. Triage is the first decision per REQ.

### 4. Quick references

| Want to … | Read this |
|---|---|
| Role contracts | `governance/ROLES.md` |
| Project rules | `governance/CONSTITUTION.md` |
| Workflow | `governance/REVIEW_PROCESS.md` |
| Coverage gates | `governance/COVERAGE_THRESHOLDS.md` |
| System shape | `governance/ARCHITECTURE.md` |
| Prior lessons | `governance/MISTAKES.md` |
| Sanctioned waivers | `governance/TECH_DEBT.md` |
| Per-REQ folder layout | `governance/requirements/README.md` |
| Validate structure | `node governance/scripts/check.mjs` |

<!-- FRAMEWORK:END -->

---

## Project-specific rules (you own this section)

> *Add anything specific to {{PROJECT_NAME}} here — coding conventions,
> stack-specific gotchas, naming, links to internal docs, on-call
> rotation, etc. The framework will not touch this section.*

- *TODO*
