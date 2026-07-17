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

3b. **Report diet contract.** Enforce the contract from
   `plugins/eng-org/agents/REPORT_DIET.md §C–§F`.

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
   # Write changed files as a JSON array to a temp file (NUL-safe).
   # If git-changed-to-json.mjs exits non-zero, fall through to fail-safe
   # = FULL re-run of ALL tiers (see "Invalidation tool failure" below).
   git diff --name-only -z "<pinned-sha>"..HEAD \
     | node "${CLAUDE_PLUGIN_ROOT}/scripts/git-changed-to-json.mjs" \
     > /tmp/changed-files-$$.json

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

4c. **Fix-iteration auto-distill to MISTAKES.md (mandatory — REQ-20260713-d904-03 §Amendment 2 Change 6).**

   Every RED→GREEN fix iteration produces exactly ONE new MISTAKES.md entry, using the `Fix-iteration distill template` sub-section of `governance/MISTAKES.md` (do not paraphrase). The TL (or the fix-iteration dispatch that composed the fix) appends the entry.

   Template (copy verbatim; substitute the `{{…}}` fields):

   ```
   ### {{YYYY-MM-DD}} — {{one-line what-broke}} (REQ-{{req-id}}, fix-iter-{{n}})  [{{root_cause_class}}]

   **What broke:** {{failing test id or observable symptom, 1 line}}
   **Root cause:** {{one imperative sentence naming the class}}
   **Prevention:** {{one imperative sentence stating the durable rule}}
   paths: {{glob of touched files, or ** if broad}}
   ```

   The three fixed fields (what-broke / root-cause / prevention) are the distill. The `paths:` glob line enables `mistakes-gate.mjs --match` for future G-2 regression-checks. Root-cause class tag is a short taxonomic label — examples: `null-optional-field`, `stale-import-after-rename`, `mock-vs-live-divergence`, `policy-prose`, `off-by-one`.

   **AC-16 dedup rule:** if THIS fix-iteration's root cause matches an entry already appended earlier in THIS SAME REQ, extend that entry's title (add `fix-iter-<n>`) rather than creating a new entry. One entry may cover multiple fix-iterations in the same REQ that share a root cause. The gate (`mistakes-gate.mjs`, wired into merge-readiness Step 2e item 7) verifies REQ-id presence, not 1:1 iteration count.

4d. **§Small-task test-unit + test-regression merge path (Change 8d).**

    **Entry criteria (deterministic — all four must hold):**

    1. The task's diff size is ≤ **200 LOC total** (TL-pinned threshold; if TL wants a different number for a specific REQ, TL overrides in `tl-<domain>-analysis.md §Test plan`; the default is 200 LOC). Detection command:
       ```bash
       git diff --shortstat "<task-base-sha>"..HEAD | \
         awk '{sum += $4 + $6} END {print sum}'
       ```
       (Sums insertions + deletions across the touched files.)
    2. The task's diff touches **no schema** — no file under `backend/drizzle/**`, `backend/src/db/schema.ts`, `**/*.sql`, or any migration surface. Detection command:
       ```bash
       git diff --name-only "<task-base-sha>"..HEAD -- \
         'backend/drizzle/**' 'backend/src/db/schema.ts' '**/*.sql' \
         | wc -l
       ```
       Zero = pass.
    3. The task's diff touches **no API surface** — no file under `backend/src/trpc/routers/**`, no `backend/src/routes/**`, no `openapi/**`, no `**/*.graphql`. Detection command:
       ```bash
       git diff --name-only "<task-base-sha>"..HEAD -- \
         'backend/src/trpc/routers/**' 'backend/src/routes/**' \
         'openapi/**' '**/*.graphql' | wc -l
       ```
       Zero = pass.
    4. The task's `TASK-<n>.md` does NOT mark `test_merge_forbidden: true` in its frontmatter (an explicit TL override for tasks where unit and regression MUST be independent — e.g., a test-discipline REQ).

    If all four hold, spawn ONE agent (`test-unit`) with an EXTENDED contract: the agent authors both unit tests (its native tier per ROLES §2.4.1) AND regression tests (per test-regression's contract in ROLES §2.4.4). The single agent writes a MERGED report at `TASK-<n>-test-unit+regression-report.md` with both coverage-delta (unit) AND MISTAKES-tag coverage (regression) in the same frontmatter. Verdict is worst-of the two axes.

    **Coverage obligation unchanged.** The 95% domain / 80% lib coverage gate (per COVERAGE_THRESHOLDS.md) applies to the merged report identically. Any MISTAKES entry the merged report failed to cover is still a RED against the regression axis. No coverage relaxation.

    **Iron rule §H.43 preservation.** The merged agent is a NEW invocation (fresh subagent), not a reuse of test-unit or test-regression from a prior wave. §H.43 forbids re-using the SAME agent on the SAME artifact; a merged agent authoring a NEW artifact against a NEW task diff is a fresh invocation.

    If ANY criterion fails, fall through to the standard 5-agent test dispatch from Step 2. No partial-merge — merge is all-or-nothing per task.

4e. **§Deterministic skip-with-note criteria for `test-integration`, `test-e2e`, `test-load` (Change 8d).**

    Today Step 2's prose says "skip-with-note if no UI surface touched" etc. — that leaves judgment to the agent, which produces inconsistent spawning across REQs. §4e pins deterministic diff-based rules:

    | Tier | Skip-with-note when ALL of these hold | Rationale |
    |---|---|---|
    | `test-integration` | (a) `git diff --name-only <base>..HEAD -- 'backend/**' 'backend/src/trpc/**' 'backend/src/routes/**' \| wc -l` returns 0; (b) no schema change (per §4d criterion 2); (c) no API change (per §4d criterion 3) | Integration tests exercise the tRPC boundary + real Postgres. If no backend code touched AND no schema AND no API, there is no integration surface to test. |
    | `test-e2e` | (a) `git diff --name-only <base>..HEAD -- 'mobile/app/**' 'mobile/components/**' \| wc -l` returns 0; (b) `mobile/package.json` untouched; (c) `mobile/app.json::expo.extra` untouched (G-3 boot-smoke also applies independently) | E2E tests exercise mobile UI flows via Maestro. No UI touched ⇒ no flow to exercise. |
    | `test-load` | (a) `git diff --name-only <base>..HEAD -- 'backend/src/trpc/routers/**' 'backend/src/routes/**' \| wc -l` returns 0; (b) no schema change (per §4d criterion 2) | Load tests target hot endpoints. No endpoint code touched ⇒ no hot path change. |

    **Escape hatch.** TL can force any tier to spawn via `force_test_spawn: [<tier>, ...]` in `tl-<domain>-analysis.md §Test plan` even when the deterministic skip criterion fires. Rationale must be written next to the force list (e.g., "REQ touched a shared config that silently affects integration idempotency"). Force lists are logged in the audit trail at `governance/.audit/REQ-<id>/`.

    **Coverage threshold language unchanged.** `governance/COVERAGE_THRESHOLDS.md` is NOT edited by this REQ (per spec §Out-of-scope). §4e is a spawn-side optimization; the threshold set is untouched. A skip-with-note tier does not contribute to the coverage denominator for its axis (no tests authored = no coverage delta possible).

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
