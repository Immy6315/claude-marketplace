---
description: Spawn the 5 Test agents in parallel against a requirement's implemented tasks.
---

You are running tests for a requirement.

The requirement id is: $ARGUMENTS.

Steps:

1. Read every `governance/requirements/REQ-<id>/tasks/TASK-*.md`
   with `status: implemented`. The combined dev-reports are the
   contract Test agents verify.

1b. **Docker preflight (DB-backed tiers only).** The
   `test-integration` and `test-load` tiers need a live Docker
   daemon (testcontainers spins its own ephemeral Postgres/Redis/
   Mosquitto). If ANY implemented task touches `backend/`, bring
   Docker up first:

   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/scripts/docker-lifecycle.sh" up
   ```

   This starts Docker Desktop only if it is not already running,
   and records a marker so the teardown in step 5 knows the
   pipeline started it. **Skip this step entirely** for pure-docs
   or pure-mobile-UI REQs where both `test-integration` and
   `test-load` skip-with-note — they need no daemon, so Docker
   stays off and no RAM is spent.

2. For each task, spawn the 5 Test agents in parallel (single
   message, 5 Agent calls):
   - `test-unit`
   - `test-integration`
   - `test-e2e` (skip-with-note if no UI surface touched)
   - `test-regression`
   - `test-load` (skip-with-note if pure docs / pure UI cosmetic)

   Each is independent of every other and independent of the Dev
   that wrote the code. They write tests, not production code.

3. Each Test agent writes
   `tasks/TASK-<n>-test-<type>-report.md` with verdict GREEN /
   RED, coverage / latency / flake numbers, and a "what I did
   not cover" section.

   **G-7 note:** for any task touching the backend API surface, the
   `test-integration` agent ALSO captures a response snapshot per
   touched endpoint and runs `governance/scripts/contract-diff.mjs`
   against the stored baseline, writing `tasks/TASK-<n>-contract-diff.md`.
   A `DRIFT`/`LEAK` verdict there is a RED (unless already registered in
   `governance/api-contract-registry.md`); a public-endpoint leak is a
   RED that no registry entry can waive.

3b. **Report diet contract.** Each test-report file produced in step 3
   is a verdict-carrying report. Enforce the following:

   When the agent's verdict is `GREEN`:

   > - **Frontmatter (MANDATORY):** verdict, coverage numbers, evidence paths (absolute paths to test files / to specific file:line ranges reviewed).
   > - **Findings table:** `file:line` per finding, one row each; no prose per row beyond a one-sentence what.
   > - **Reasoning section:** capped at **~40 lines** of prose.

   When the agent's verdict is `RED`, `BLOCK`, `NEEDS-CHANGES`, or `FAIL`:

   > verdict is `RED`, `BLOCK`, `NEEDS-CHANGES`, or `FAIL`. Full-prose reasoning is required so the receiving Dev / TL can act.

   The following are EXEMPT from diet (never dieted, even at GREEN):

   > - Dev diffs (`implementation/TASK-<n>-diff.md`) — they are the contract test agents verify.
   > - Any "what I did not cover" / "known gaps" sections in test reports.
   > - `gr-review.md` (GR deep-review artifact from 0.13.0).
   > - `em-summary.md` (Imran-facing, 1-page format governed by ROLES §2.1).
   > - `retro-M<n>.md` (autopilot per-milestone retros).
   > - `merge-readiness.md` (TL composite verdict).

   Mechanical check — verify no dev-diffs were accidentally dieted:
   ```bash
   grep -l 'coverage:' governance/requirements/REQ-<id>/implementation/TASK-*-diff.md
   ```
   The above command must return empty. If it prints any file, that file
   was incorrectly dieted; remand to the Dev.

4. After all return, summarize: green/red count per task. If any
   RED, do NOT proceed to reviews — return to the relevant TL
   to dispatch a fix iteration. If all GREEN, print "Tests done
   for REQ-<id>. Run `/run-reviews REQ-<id>`."

4b. **Fix-iteration protocol (Feature 2 — incremental fix-iterations v2).**
   Activated when a prior RED verdict exists under `tasks/` (signalled by
   the presence of a `TASK-<n>-test-*-report.md` with `verdict: RED`).

   **Step 1 — Resolve changed files.**
   For each prior tier verdict, read its frontmatter `pinned_sha:` (or the
   SHA embedded in the diet frontmatter). Before using it, validate the value
   matches `/^[0-9a-f]{7,40}$/`. If not (non-hex, over-40 chars, or empty),
   treat as tool failure and fall through to the fail-safe = FULL re-run of ALL
   tiers. Never interpolate a raw frontmatter value into a shell command. Then:

   ```bash
   git diff --name-only "<pinned-sha>"..HEAD
   ```

   This is the changed-files list for the invalidation check.

   **Step 2 — Build tier surfaces.**
   For each prior tier's diet-frontmatter `evidence:` field, collect the
   repo-relative file paths. These form `tierSurfaces[tier]`.

   **Step 3 — Run invalidation check.**
   Invoke `scripts/invalidation.mjs` via absolute path resolved from
   `$CLAUDE_PLUGIN_ROOT`. Use the NUL-safe `--changed-file` flag (JSON array
   file) instead of `--changed <csv>` (comma-CSV cannot handle filenames
   containing commas — see Note below):

   ```bash
   # Write changed files as a JSON array to a temp file (NUL-safe)
   git diff --name-only -z "<pinned-sha>"..HEAD \
     | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().rstrip('\x00').split('\x00') if sys.stdin.read() else []))" \
     > /tmp/changed-files-$$.json
   # Equivalent: use node to produce the JSON array
   # node -e "const d=require('fs').readFileSync('/dev/stdin');process.stdout.write(JSON.stringify(d.toString().split('\x00').filter(Boolean)))" < <(git diff --name-only -z "<pinned-sha>"..HEAD)

   node "${CLAUDE_PLUGIN_ROOT}/scripts/invalidation.mjs" \
     --changed-file /tmp/changed-files-$$.json \
     --project-root <repo-root> \
     --surfaces <path-to-surfaces-json>
   ```

   **Note — back-compat `--changed <csv>`:** the `--changed` flag remains
   available for convenience but has a documented limitation: filenames
   containing commas are not handled correctly. Always prefer `--changed-file`
   in automated pipelines.

   The tool emits JSON to stdout with the following shape (matching the
   `@typedef InvalidationResult` in `scripts/invalidation.mjs`):

   ```json
   {
     "inputs": {
       "changed": ["src/foo.ts", "src/bar.ts"],
       "projectRoot": "<repo-root>",
       "surfacesPath": "<path-to-surfaces-json>"
     },
     "head": "<current-git-sha>",
     "perTier": {
       "test-unit": { "intersects": true, "matched": ["src/foo.ts"] },
       "test-integration": { "intersects": false, "matched": [] },
       "reviewer-performance": { "intersects": false, "matched": [] }
     }
   }
   ```

   Parse the JSON output to get `perTier[tier].intersects` for each tier.

   **Invalidation tool failure — fail-safe rule.** If `invalidation.mjs`
   exits non-zero, prints invalid JSON, or the surfaces file is
   missing/malformed → **fail-safe = FULL re-run of ALL tiers** (never
   pin on tool failure). Log the tool failure (stderr + exit code) in the
   iteration log and in merge-readiness.md §Soft signals. Do NOT attempt
   to infer a partial invalidation result from incomplete output.

   **Step 4 — Apply pin or re-run per tier.**

   For each tier where `intersects: false`:
   - Render the verdict as `GREEN@<pinned-sha> (pinned)` in the summary.
   - Write an audit-trail entry at:
     `governance/.audit/REQ-<id>/<timestamp>-pin-<random>.md`
     with the following schema (verbatim from spec §Feature 2):

     > Every pin decision is recorded in
     > `governance/.audit/REQ-<id>/<timestamp>-pin-<random>.md` with:
     > tier name, pinned-at sha, current sha, invalidation key computation
     > output, decision.

     The audit record MUST contain a machine-parseable one-line-per-pin
     header in the following format (write as the first content line after
     the YAML frontmatter, or as the first line of the file body):

     ```
     PIN <tier-name> verdict=GREEN sha=<pinned-sha> head=<current-sha> reason=<no-intersect|...> invalidation=<path-to-json>
     ```

     Example:
     ```
     PIN test-unit verdict=GREEN sha=abc1234 head=def5678 reason=no-intersect invalidation=governance/.audit/REQ-X/20260712T120000-surfaces.json
     ```

     This one-line format allows `merge-readiness.md §Step 2c` and downstream
     tooling to grep/aggregate pin decisions across REQs.

   - Do NOT re-invoke the original tier agent. Pinning is citation of prior
     evidence — not approval. Iron rule §H.43 (fresh agent per artifact — no
     agent reused) is preserved: no agent is invoked for pinned tiers.

   For each tier where `intersects: true`:
   - Re-spawn the tier agent fresh (new agent invocation) against the
     current HEAD.

   **ALWAYS re-run on the final SHA regardless of invalidation result:**

   > - `reviewer-security` — auth invariant is global; a fix elsewhere can
   >   still expose it.
   > - `test-regression` — MISTAKES.md is a moving target. Pin the MISTAKES.md
   >   **content hash** in the regression verdict frontmatter
   >   (`mistakes_sha256: <hex>`); if the hash on final SHA differs from the
   >   pinned hash, force re-run.
   > - G-7 contract-diff (when the REQ touched API contracts).
   > - GR deep-review (Guardian findings apply across the whole diff, not
   >   per-tier).

   For `test-regression` specifically: compare `sha256(MISTAKES.md)` at
   current HEAD against the `mistakes_sha256` field in the prior verdict
   frontmatter. If they differ, force re-run even when `intersects: false`.

   The hash is the **SHA-256 hex of the raw file bytes as-on-disk** — no
   LF/CRLF normalization, no trailing-newline trim, no encoding conversion.
   Canonical shell command:
   ```bash
   shasum -a 256 governance/MISTAKES.md | cut -d' ' -f1
   ```

5. **Docker teardown.** If you ran the step-1b preflight `up`,
   stop Docker now to reclaim RAM:

   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/scripts/docker-lifecycle.sh" down
   ```

   This is marker-guarded: it stops Docker **only if the pipeline
   started it** in step 1b. A Docker instance the engineer opened
   manually (e.g. for live device e2e) has no marker and is left
   running. Run `down` even when tests came back RED — the daemon
   is no longer needed until the next test run, and the fix
   iteration's `/run-tests` will bring it back up.
