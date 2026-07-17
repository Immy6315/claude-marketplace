---
description: Initialize the 5-role multi-agent engineering framework in the current project. Reads the project folder, detects stack and domains, then writes tailored agents, slash commands, and governance files.
argument-hint: [--yes] [--bare]
allowed-tools: Read, Glob, Grep, Write, Edit, Bash(node:*), Bash(ls:*), Bash(test:*), Bash(mkdir:*), Bash(cp:*), Bash(chmod:*), Bash(cat:*), Bash(pwd)
---

# eng-org init — set up the multi-agent engineering framework

The user invoked `/eng-org:init` in `$ARGUMENTS` mode (default: interactive; pass `--yes` to skip prompts; pass `--bare` for empty scaffold).

You are the eng-org initializer. Read this whole prompt before writing anything.

---

## ⛔ Hard rules

1. **Never write a file without confirming with the user first** unless they passed `--yes`.
2. **Never overwrite an existing `governance/CONSTITUTION.md`, `MISTAKES.md`, `TECH_DEBT.md`, or `ARCHITECTURE.md`** — these are project-owned. If they exist, leave alone and note in the report.
3. **Stay inside the current working directory.** No reads or writes outside cwd.
4. The plugin's templates live at `${CLAUDE_PLUGIN_ROOT}/templates/`. Read from there; write into the project.

---

## Workflow (in this exact order)

### Step 1 — Detect the project

Read these files (silent if absent — many projects only have one):

- `package.json` (Node)
- `pyproject.toml` and `requirements.txt` (Python)
- `go.mod` (Go)
- `Cargo.toml` (Rust)
- `Gemfile` (Ruby)
- `pom.xml` and `build.gradle` (JVM)
- `README.md` and `.gitignore`

Glob the top-level structure: `*/` (one level deep). Drill into common code roots if they exist:
- `backend/src/` or `server/src/` or `api/src/`
- `mobile/app/` or `app/`
- `frontend/src/` or `web/src/`
- `services/*/` (monorepos)

### Step 2 — Infer stack and domains

From manifests + folder structure, decide:

**Backend stack:**
- `package.json` deps include `@trpc/*` + `drizzle-orm` → `node-trpc-drizzle`
- `package.json` deps include `next` + `prisma` → `nextjs-prisma`
- `pyproject.toml` includes `django` → `django`
- `Gemfile` includes `rails` → `rails`
- `go.mod` includes `gin`/`echo`/`fiber` → `go`
- None detected → `none`

**Frontend stack:**
- `expo` + `react-native` → `expo-rn`
- `next` (without backend signals) → `nextjs`
- `nuxt` → `nuxt`
- `svelte`/`@sveltejs/kit` → `sveltekit`
- None → `none`

**Domain candidates** (the SMART part — Claude reasons, not regex):
- tRPC: each file in `*/trpc/routers/*.ts` (excluding `index.ts`) is a domain candidate
- Django: each app folder under `apps/` or top-level Django app
- Rails: clusters of related models, controllers, views
- Mobile route groups: `app/(auth)`, `app/(tabs)/<group>` → domain hint
- Folder names matching common domains: auth, billing, users, products, orders, payments, notifications

### Step 3 — Show the user what you found

Print a concise summary and ask for confirmation. Example:

```
Detected:
  Backend stack: node-trpc-drizzle
  Frontend stack: expo-rn
  Test framework: vitest

Inferred domains (from backend/src/trpc/routers/ + mobile route groups):
  • auth      (auth.ts router, mobile/app/(auth)/)
  • billing   (billing.ts router)
  • users     (users.ts router, mobile/app/(tabs)/profile.tsx)

Will create:
  • 3 TL agents (one per domain)
  • 5 Dev agents (postgres-drizzle, trpc, domain, expo-rn, ui-animation)
  • 5 Test agents (already shipped via plugin: unit, integration, e2e, regression, load)
  • 7 Reviewer agents (already shipped via plugin: architecture, security, performance, standards, observability, governance, domain-validator)
  • 1 EM agent (already shipped via plugin)
  • 8 slash commands (already shipped via plugin)
  • Governance: ROLES.md, REVIEW_PROCESS.md, CONSTITUTION.md (with §H pre-filled, §A–§G as TODO),
                MISTAKES.md, TECH_DEBT.md, COVERAGE_THRESHOLDS.md, ARCHITECTURE.md, requirements/
  • CLAUDE.md (with FRAMEWORK:START/END markers)
  • PROJECT.yml (records this configuration)

Proceed? [Y/n/adjust]
```

If the user types `adjust`, ask which domains to add/remove. If `n`, stop.

If `--bare` was passed, skip detection and create just the empty governance scaffold.

If `--yes` was passed, proceed without confirmation.

### Step 4 — Pre-flight existing-file check

For each file you would write, check if it exists. Categorize:

- **Will overwrite** (with confirmation): files the framework owns (CLAUDE.md framework section, ROLES.md, REVIEW_PROCESS.md, scripts/check.mjs, requirements/README.md)
- **Will skip** (already exists, project-owned): CONSTITUTION.md, MISTAKES.md, TECH_DEBT.md, ARCHITECTURE.md, COVERAGE_THRESHOLDS.md, PROJECT.yml
- **Will create**: everything not yet on disk

Print the plan. If anything is in "will overwrite" and the user did not pass `--yes`, ask once more.

### Step 5 — Write files

Use the Write tool to create:

**A. Governance docs (in `governance/`)** — copy from plugin's `templates/governance/` directory:
- `governance/ROLES.md` ← `${CLAUDE_PLUGIN_ROOT}/templates/governance/ROLES.md`
- `governance/REVIEW_PROCESS.md` ← `${CLAUDE_PLUGIN_ROOT}/templates/governance/REVIEW_PROCESS.md`
- `governance/requirements/README.md` ← `${CLAUDE_PLUGIN_ROOT}/templates/governance/requirements/README.md`
- `governance/capabilities/README.md` ← `${CLAUDE_PLUGIN_ROOT}/templates/governance/capabilities/README.md`
- `governance/scripts/check.mjs` ← `${CLAUDE_PLUGIN_ROOT}/templates/governance/scripts/check.mjs`
- `governance/scripts/contract-diff.mjs` ← `${CLAUDE_PLUGIN_ROOT}/templates/governance/scripts/contract-diff.mjs` (G-7 API contract-parity engine)

**B. Templated governance docs (only if they don't exist)** — read template, substitute placeholders, write:
- `governance/CONSTITUTION.md` ← from `templates/governance/CONSTITUTION.template.md`
- `governance/COVERAGE_THRESHOLDS.md` ← from `templates/governance/COVERAGE_THRESHOLDS.template.md`
- `governance/ARCHITECTURE.md` ← from `templates/governance/ARCHITECTURE.template.md`
- `governance/MISTAKES.md` ← from `templates/governance/MISTAKES.template.md`
- `governance/TECH_DEBT.md` ← from `templates/governance/TECH_DEBT.template.md`
- `governance/GUARDRAILS.md` ← from `templates/governance/GUARDRAILS.template.md`
- `governance/design-divergence-registry.md` ← from `templates/governance/design-divergence-registry.template.md`
- `governance/api-contract-registry.md` ← from `templates/governance/api-contract-registry.template.md` (G-8 registry consulted by the G-7 gate)

Also create the empty baseline directory `governance/api-contracts/`
(where G-7 stores per-endpoint response snapshots) with a `.gitkeep` so
it is tracked. Baselines are added as endpoints are captured, not at init.

Substitute these placeholders in templates:
- `{{PROJECT_NAME}}` — the project's name (from package.json `name` or directory name)
- `{{BACKEND_STACK}}` — detected backend stack id
- `{{FRONTEND_STACK}}` — detected frontend stack id
- `{{DOMAINS}}` — comma-separated list of inferred domain ids
- `{{DATE}}` — today's date as YYYY-MM-DD

**C. Per-domain TL agents (in `.claude/agents/`)** — for each domain, render `templates/tl.md.tmpl` with:
- `{{DOMAIN}}` — domain id (e.g., `auth`)
- `{{DOMAIN_TITLE}}` — domain id title-cased (e.g., `Auth`)
- `{{OWNED_FILES}}` — list of file globs this domain owns, derived from detection
- `{{HAZARDS}}` — generic hazards list (TL will fill in real ones over time)

Example output filename: `.claude/agents/tl-auth.md`.

**D. CLAUDE.md** — read `templates/CLAUDE.template.md`, substitute placeholders, write to `CLAUDE.md`. If `CLAUDE.md` already exists, do not overwrite — instead inject the framework block between `<!-- FRAMEWORK:START -->` and `<!-- FRAMEWORK:END -->` markers (creating them if absent at the end of the file).

**E. Portability pillars (project root)** — these make the project understandable to *any* AI/engineer, not just Claude Code:

- `AGENTS.md` ← from `templates/AGENTS.template.md`. The universal, tool-agnostic entry point. Substitute the same placeholders as the governance docs. If `AGENTS.md` already exists, do not overwrite — leave it and note in the report.
- `eng-org.json` ← from `templates/eng-org.json.template`. The machine-readable manifest (org info, stack, governance doc paths, and an initially-empty project registry). Substitute `{{PROJECT_NAME}}`, `{{DATE}}`, `{{BACKEND_STACK}}`, `{{FRONTEND_STACK}}`, and `{{DOMAINS_JSON}}`. For `{{DOMAINS_JSON}}`, emit one JSON object per inferred domain, comma-separated, e.g. `{"id":"auth","owns":["backend/src/trpc/routers/auth.ts"]},{"id":"billing","owns":["backend/src/trpc/routers/billing.ts"]}`. If there are no domains, substitute an empty string so `"domains": []`. Validate the result parses as JSON (`node -e "JSON.parse(require('fs').readFileSync('eng-org.json'))"`) before continuing. If `eng-org.json` already exists, do not overwrite — note in the report.

**F. Multi-project scaffolder** — copy the standalone scaffolder + per-project templates so the project can grow a multi-project registry without the plugin installed:

- `scripts/new-project.sh` ← copy from `${CLAUDE_PLUGIN_ROOT}/scripts/new-project.sh`, then `chmod +x`.
- `scripts/eng-org-templates/project/` ← copy the whole `${CLAUDE_PLUGIN_ROOT}/templates/project/` tree to sit next to the script. The script auto-discovers templates at `<script>/eng-org-templates/project`, so a standalone `bash scripts/new-project.sh <name> "<desc>"` works with **no env vars** — even after the project is handed to someone without the plugin installed. (When `/eng-org:new-project` drives it, it overrides `ENG_ORG_TEMPLATES` to the live plugin copy instead.)

**G. PROJECT.yml** — write a YAML record of detected configuration so future `/eng-org:update` can re-run deterministically:

```yaml
name: <project-name>
framework_version: "0.6.0"
stack:
  backend: <backend-stack-id>
  frontend: <frontend-stack-id>
domains:
  - id: <domain-1>
    owns: [...]
  - id: <domain-2>
    owns: [...]
specialists:
  devs: [postgres-drizzle, trpc, domain, expo-rn, ui-animation]
  tests: [unit, integration, e2e, regression, load]
  reviewers: [architecture, security, performance, standards, observability]
```

### Step 6 — Validate

Run:

```bash
node governance/scripts/check.mjs
```

Stream the output. If it FAILs, surface the failure and stop.

### Step 7 — Final report

Print a summary:

```
✅ eng-org v0.6.0 setup complete in <project-name>

Created:
  • <N> governance files
  • <N> per-domain TL agents
  • CLAUDE.md (framework section)
  • AGENTS.md (universal AI entry point)
  • eng-org.json (machine-readable manifest + project registry)
  • scripts/new-project.sh + scripts/eng-org-templates/ (multi-project scaffolder)
  • PROJECT.yml

Skipped (already exist):
  • <list>

Validator: PASS

Next steps:
  1. Open governance/CONSTITUTION.md and fill in §A–§G with your project rules
  2. Run /eng-org:pilot-check to verify the framework wiring
  3. Run /eng-org:graphyfy to draw the linking graphs (governance/graphs/) so any
     AI/engineer can see how the project connects
  4. When you're ready for your first real change:
       /eng-org:em-intake "your first requirement"

Docs: https://github.com/Immy6315/claude-marketplace/tree/main/plugins/eng-org
```

---

## Refusal cases

- **Already initialized** (PROJECT.yml exists): suggest `/eng-org:doctor` or `/eng-org:update` instead. Do not re-init.
- **No recognizable stack** AND `--bare` not passed: ask the user to either pass `--bare` for an empty scaffold or describe their stack manually.
- **Cwd is a known temp/system dir** (`/tmp`, `/var`, `~/Downloads`): refuse — surface as "this doesn't look like a project root."

---

## What you do NOT do

- Write application code (no edits to `mobile/`, `backend/`, `src/`).
- Run install scripts beyond `node governance/scripts/check.mjs`.
- Push to git, create PRs, or modify git config.
- Reach outside the cwd.
- Skip Step 3 confirmation unless `--yes` was passed.
