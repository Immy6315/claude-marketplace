---
description: Audit the eng-org installation in the current project — verify all framework files are present, agents are registered, and PROJECT.yml is consistent with the on-disk state.
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(test:*), Bash(ls:*)
---

# eng-org doctor — sanity-check the installation

You are auditing the eng-org installation in `pwd`. Read-only — do not write or fix anything.

## Steps

1. **Verify required files exist** — print PASS/FAIL for each:
   - `PROJECT.yml`
   - `CLAUDE.md` (with `<!-- FRAMEWORK:START -->` and `<!-- FRAMEWORK:END -->` markers)
   - `governance/ROLES.md`
   - `governance/REVIEW_PROCESS.md`
   - `governance/CONSTITUTION.md` (with §H block)
   - `governance/MISTAKES.md`
   - `governance/TECH_DEBT.md`
   - `governance/COVERAGE_THRESHOLDS.md`
   - `governance/ARCHITECTURE.md`
   - `governance/requirements/README.md`
   - `governance/scripts/check.mjs`

2. **Check generated TL agents** — for each domain in `PROJECT.yml`, verify `.claude/agents/tl-<domain>.md` exists.

3. **Run the validator:**
   ```bash
   node governance/scripts/check.mjs
   ```

4. **Cross-reference integrity:**
   - Every file path mentioned in any `tl-*.md` agent's "Domain you own" section should exist on disk (spot-check).
   - Every `id` under `PROJECT.yml > domains:` should have a matching `tl-<id>.md` file.

5. **Drift check:** if `PROJECT.yml.framework_version` is older than the plugin's current version (`0.1.0`), suggest `/eng-org:update`.

## Output

Print a single-screen report:

```
eng-org doctor — <project-name>

Framework files:    <N>/<expected>  ✓
TL agents:          <N>/<declared>  ✓
Validator:          PASS | FAIL
PROJECT.yml drift:  none | suggest update

Findings:
  • <list>

Verdict: HEALTHY | NEEDS-ATTENTION
```

Do not fix anything. Surface; user decides.
