---
description: Scaffold a new project under the eng-org multi-project registry — creates docs (PRD, ARCHITECTURE, SYSTEM-DESIGN, TECH-DOC, TASK-LIST, TEST-PLAN), tests/, src/, a dated DECISIONS.md ADR log, and meta.json; registers it in projects/INDEX.md and eng-org.json.
argument-hint: <name> "<one-line description>"
allowed-tools: Read, Glob, Bash(bash:*), Bash(ls:*), Bash(test:*), Bash(cat:*), Bash(pwd)
---

# eng-org new-project — scaffold a portable project folder

The user invoked `/eng-org:new-project $ARGUMENTS`.

Parse `$ARGUMENTS` as `<name> "<one-line description>"`. If the name is missing,
ask for it. The name should be a short kebab-case slug (e.g. `billing-service`).

## What this does
Stamps out `projects/<name>/` from the plugin's per-project templates:
`README.md`, `meta.json`, `DECISIONS.md` (dated, append-only ADR log), and
`docs/{PRD,ARCHITECTURE,SYSTEM-DESIGN,TECH-DOC,TASK-LIST,TEST-PLAN}.md`, plus
empty `src/` and `tests/{unit,integration,e2e}/`. It then registers the project
in the human-readable `projects/INDEX.md` and the machine-readable `eng-org.json`
manifest (the registry a fresh AI parses to discover all projects).

## Steps

1. **Pre-flight.** Confirm you are at a project root (an `eng-org.json` or
   `governance/` exists). If `projects/<name>/` already exists, refuse — do not
   overwrite an existing project's docs or decision log.

2. **Run the scaffolder.** It is self-contained (only needs `python3`). Drive it
   with the plugin's templates and the current working directory as the root:

   ```bash
   ENG_ORG_TEMPLATES="${CLAUDE_PLUGIN_ROOT}/templates/project" \
   ENG_ORG_ROOT="$(pwd)" \
     bash "${CLAUDE_PLUGIN_ROOT}/scripts/new-project.sh" <name> "<description>"
   ```

3. **Report.** Print the created tree, the INDEX row, and the eng-org.json
   `projects[]` entry. Remind the user of the docs-before-code rule: fill
   `docs/PRD.md` + `docs/ARCHITECTURE.md` before writing code, and log every real
   decision in `DECISIONS.md` with a date.

## Hard rules
- Never overwrite an existing `projects/<name>/`.
- Stay inside the current working directory.
- Do not write application code — this command only scaffolds context.
