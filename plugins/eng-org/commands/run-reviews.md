---
description: Spawn the 6 Reviewer agents in parallel against a requirement's GREEN tasks.
---

You are running reviews for a requirement.

The requirement id is: $ARGUMENTS.

Preconditions:
- All tasks in `status: implemented`.
- All Test reports GREEN. Do not proceed if any are RED.

Steps:

1. Read every `tasks/TASK-*.md` and the matching test reports
   (5 per task).

2. For each task, spawn the Reviewer agents in parallel (single
   message). The default set is 5; spawn the 6th — `reviewer-indexes`
   — additionally whenever the task touches `backend/src/db/schema.ts`,
   any generated migration in `backend/drizzle/`, or introduces a
   new hot-path query (`where` / `order by` / `join` on a > 100k-row
   table). When in doubt, include `reviewer-indexes`.

   - `reviewer-architecture`
   - `reviewer-security`
   - `reviewer-performance`
   - `reviewer-standards`
   - `reviewer-observability`
   - `reviewer-indexes` (schema / hot-path query changes only)

   Reviewers are read-only. They consume dev-reports + test
   reports + the actual code; they emit a verdict report.

   **Context pack — pack-first rule.** Before reading any raw governance
   doc, every spawned reviewer reads
   `governance/requirements/REQ-<id>/context-pack.md` first. If the
   pack is sufficient for the reviewer's checks, it reads only the pack.
   If the pack is insufficient (a needed passage is in the exclusion
   manifest or the pack does not exist), the reviewer reads the raw doc
   AND logs every raw doc it read in its report's `raw_doc_reads:`
   frontmatter list (the YAML field already present in all reviewer
   report templates since v0.14.0).

   **Rotating canary — pack-audit (Feature 3).** For each REQ, select
   ONE reviewer from the spawned set to act as the canary reviewer.
   Selection rule: use the REQ id string's last hex digit (0–f) modulo
   the reviewer count to select an index into the alphabetically-sorted
   reviewer list. Example: 6 reviewers, last digit `a` (= 10 decimal),
   10 mod 6 = 4 → reviewer at index 4 (0-based) is the canary.

   The canary reviewer reads the **raw governance docs** instead of the
   context pack (it is explicitly exempt from the pack-first rule for
   this REQ only). After completing its normal verdict, it appends a
   `pack_audit:` line to its report frontmatter (the field is already
   present as `null` in all reviewer report templates):

   ```yaml
   pack_audit: MATCH
   # or, when divergence found:
   pack_audit: "DIVERGENT: <one sentence describing the passage the pack omitted
     or misrepresented that materially affected this review>"
   ```

   `MATCH` means the pack was sufficient — the canary found no passage in the
   raw doc that was missing or misrepresented in the pack and that affected
   the review outcome.
   `DIVERGENT: <what>` means the canary found a specific passage in the raw doc
   that the pack did not cover and that materially affected the review; the
   `<what>` clause must cite the source doc section-id or passage.

   Non-canary reviewers set `pack_audit: null` (default; already in template).

   **Bootstrap note:** the rotating canary is active from the first REQ
   run under version 0.14.0 (the version that introduced Feature 3). No
   warm-up period. The first REQ that reaches `/run-reviews` after 0.14.0
   ships uses the rotation formula above.

   **GR deep-review and test-regression are EXEMPT from pack-first.**
   GR (step 4 below) reads raw diffs and raw docs — it is an independent
   second engine whose value depends on the same source as role reviewers,
   not a curated subset. `test-regression` always reads MISTAKES.md raw
   (whole file required for regression coverage). These exemptions are
   stated in the respective agent contracts.

3. Each Reviewer writes
   `tasks/TASK-<n>-review-<type>.md` with verdict APPROVE /
   NEEDS-CHANGES / BLOCK and line-cited findings.

3b. **Report diet contract.** Each review-report file produced in step 3
   is a verdict-carrying report. Enforce the following:

   When the agent's verdict is `APPROVE` or NIT-only:

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

3c. **Fix-iteration protocol (Feature 2 — incremental fix-iterations v2).**
   Activated when a prior BLOCK or NEEDS-CHANGES verdict exists under `tasks/`
   (a `TASK-<n>-review-<type>.md` with `verdict: BLOCK` or
   `verdict: NEEDS-CHANGES`).

   **Step 1 — Resolve changed files.**
   Read each prior reviewer verdict's frontmatter `pinned_sha:` (or the diet
   frontmatter SHA). Before using it, validate the value matches
   `/^[0-9a-f]{7,40}$/`. If not (non-hex, over-40 chars, or empty), treat as
   tool failure and fall through to the fail-safe = FULL re-run of ALL
   reviewers. Never interpolate a raw frontmatter value into a shell command.
   Then:

   ```bash
   git diff --name-only "<pinned-sha>"..HEAD
   ```

   **Step 2 — Build reviewer surfaces.**
   For each prior reviewer verdict's diet-frontmatter `files_reviewed:` field,
   collect the repo-relative file paths. These form `tierSurfaces[reviewer]`.

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

   node "${CLAUDE_PLUGIN_ROOT}/scripts/invalidation.mjs" \
     --changed-file /tmp/changed-files-$$.json \
     --project-root <repo-root> \
     --surfaces <path-to-surfaces-json>
   ```

   **Note — back-compat `--changed <csv>`:** the `--changed` flag remains
   available for convenience but has a documented limitation: filenames
   containing commas are not handled correctly. Always prefer `--changed-file`
   in automated pipelines.

   **Invalidation tool failure — fail-safe rule.** If `invalidation.mjs`
   exits non-zero, prints invalid JSON, or the surfaces file is
   missing/malformed → **fail-safe = FULL re-run of ALL reviewers** (never
   pin on tool failure). Log the tool failure (stderr + exit code) in the
   iteration log and in merge-readiness.md §Soft signals. Do NOT attempt
   to infer a partial invalidation result from incomplete output.

   **Step 4 — Apply pin or re-run per reviewer.**

   For each reviewer where `intersects: false`:
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
     PIN <reviewer-name> verdict=GREEN sha=<pinned-sha> head=<current-sha> reason=<no-intersect|...> invalidation=<path-to-json>
     ```

     Example:
     ```
     PIN reviewer-performance verdict=GREEN sha=abc1234 head=def5678 reason=no-intersect invalidation=governance/.audit/REQ-X/20260712T120000-surfaces.json
     ```

     This one-line format allows `merge-readiness.md §Step 2c` and downstream
     tooling to grep/aggregate pin decisions across REQs.

   - Do NOT re-invoke the original reviewer agent. Pinning is citation of
     prior evidence — not approval. Iron rule §H.43 preserved: no agent is
     invoked for pinned reviewers.

   For each reviewer where `intersects: true`:
   - Re-spawn the reviewer agent fresh (new agent invocation) against the
     current HEAD.

   **`reviewer-security` ALWAYS re-runs on the fix-iteration final SHA
   regardless of invalidation result:**

   > `reviewer-security` — auth invariant is global; a fix elsewhere can
   > still expose it.

   Cite spec §Feature 2 verbatim. Even if `intersects: false` for
   `reviewer-security`, force re-run on every fix iteration.

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

4. **GR deep-review (independent second engine).** While the role
   reviewers run, also run the `gr` multi-specialist review engine on
   the REQ's actual diff. GR fans out its own specialist agents
   (security, performance, architecture, code-quality, testing,
   observability, domain) over the raw diff + repo neighborhood — an
   independent lens that regularly catches what role reviewers miss,
   and vice versa.

   a) Resolve the binary (auto-installs on first use; needs NO
      gr-reviewer plugin and NO GitHub token):

      ```bash
      GR_BIN=$(bash "${CLAUDE_PLUGIN_ROOT}/scripts/gr-ensure.sh")
      ```

      If this fails (offline, unsupported platform), SKIP GR with a
      note in `gr-review.md` — never hard-block the pipeline on it.
      On a fix iteration, re-attempt GR but do NOT hard-block if it
      skip-notes again (preserves v0.13.0 GR skip-note fallback path).

   b) Determine the diff base: the REQ's target/base branch from
      `spec.md` (e.g. `develop`, `releases/stable`) — do NOT assume
      `main`. Then run in local-diff mode against the working repo:

      ```bash
      "$GR_BIN" review --range <base-branch>..HEAD --repo <repo-path> --preset standard
      ```

      This needs no PR and posts nothing; findings print locally and
      land in `<repo>/.gr/reviews/<N>/result.json`.

   c) **TL validation gate (mandatory).** GR findings are ADVISORY
      until the assigned TL evidence-verifies each one: open the cited
      file/lines and confirm the claim against the actual code. GR
      medium-confidence findings have a known false-positive rate —
      never dispatch a Dev fix from an unverified finding.

   d) Write `governance/requirements/REQ-<id>/gr-review.md`: every GR
      finding with severity, file:line, and a disposition —
      `CONFIRMED` (with evidence) / `FALSE-POSITIVE` (with the
      disproving evidence) / `OUT-OF-SCOPE` (pre-existing, log to
      TECH_DEBT.md instead). Confirmed P0/P1 count as a BLOCK;
      confirmed P2/P3 as NEEDS-CHANGES nits.

   e) **Learning loop:** for each CONFIRMED finding, append a
      prevention rule to `governance/MISTAKES.md` (what GR caught,
      why the role reviewers missed it). This is how the org stops
      repeating the same class of mistake.

5. After all return, summarize: per-task verdicts + the GR
   disposition table. If any BLOCK (role reviewer or confirmed GR
   P0/P1), return to the relevant TL with the findings; the TL
   decides whether to dispatch a Dev fix iteration or escalate to EM.
   If all APPROVE / NEEDS-CHANGES are addressed, print "Reviews
   done for REQ-<id>. Run `/merge-readiness REQ-<id>`."
