---
description: Spawn the default reviewer set (7 role reviewers + GR at 0.15.0) in parallel against a requirement's GREEN tasks.
---

You are running reviews for a requirement.

The requirement id is: $ARGUMENTS.

Preconditions:
- All tasks in `status: implemented`.
- All Test reports GREEN. Do not proceed if any are RED.
- `plugins/eng-org/scripts/verdict-lint.mjs` MUST exist at `$CLAUDE_PLUGIN_ROOT/scripts/verdict-lint.mjs` (shipped in eng-org 0.15.0+). If missing, print a clear diagnostic and abort — do NOT silently fall back to guidance-only mode.

Steps:

1. Read every `tasks/TASK-*.md` and the matching test reports
   (5 per task).

2. For each task, spawn the Reviewer agents in parallel (single
   message). **Default set (REQ-20260713-d904-03 §Amendment 1 Change 5, RESHAPE outcome per TASK-5 audit — empirical basis: `governance/requirements/REQ-20260713-d904-03/reviewer-overlap-audit.md`, `recommendation: RESHAPE`, `corpus_quality: OK`, survivors architecture/performance/standards/observability):**

   - `reviewer-governance` (new consolidated — CONSTITUTION §A–§G conformance + MISTAKES regression + guardrail evidence + derived-verdict discipline)
   - `reviewer-domain-validator` (new consolidated — TL-validation gate over GR findings + project-specific security/architecture invariants)
   - `reviewer-architecture` (RESHAPE survivor per TASK-5 audit)
   - `reviewer-performance` (RESHAPE survivor per TASK-5 audit)
   - `reviewer-standards` (RESHAPE survivor per TASK-5 audit)
   - `reviewer-observability` (RESHAPE survivor per TASK-5 audit)
   - `reviewer-security` (preserved despite audit's 0-count row — extractor gap; CONSTITUTION §H global-auth-invariant re-run rule requires it on every fix-iter final SHA regardless)

   Conditional (added only when the diff signal fires per §Step 2b below):

   - `reviewer-indexes` — when the task touches `backend/src/db/schema.ts`, any generated migration in `backend/drizzle/`, or introduces a new hot-path query (`where` / `order by` / `join` on a > 100k-row table). When in doubt, include `reviewer-indexes`.

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

2b. **Deterministic escalation criteria (diff-based — REQ-20260713-d904-03 §Amendment 1 Change 5).**

    Escalation is computed mechanically from the diff of the changed files for
    each task, NOT from reviewer discretion. Compute against the union of files
    touched by every implemented task in the REQ (from each `TASK-<n>-report.md`
    frontmatter `files_owned:` + git diff of the task branch).

    | Trigger | Detection command | Reviewer disposition | Rationale |
    |---|---|---|---|
    | Schema change (`backend/src/db/schema.ts` OR `backend/drizzle/*`) | `git diff --name-only <base>..HEAD -- 'backend/src/db/schema.ts' 'backend/drizzle/**' \| wc -l` returns > 0 | `reviewer-indexes` added to default set | Schema changes touch indexes / DDL; the indexes reviewer's specialty. |
    | Hot-path query added (new `.where` / `.orderBy` / `.innerJoin` / `.leftJoin` in a new .ts file under `backend/src/`) | `git diff <base>..HEAD -- 'backend/src/**/*.ts' \| grep -E '^\+.*\.(where\|orderBy\|innerJoin\|leftJoin)\('` returns > 0 | `reviewer-indexes` added | New query surface; performance signal. |
    | Auth-surface change (files under `backend/src/trpc/routers/auth/**` OR `backend/src/auth/**` OR files touching Clerk/JWT keys) | `git diff --name-only <base>..HEAD -- 'backend/src/trpc/routers/auth/**' 'backend/src/auth/**' \| wc -l` returns > 0 | `reviewer-security` already in default set (RESHAPE); no additional escalation needed — the always-rerun blockquote still forces re-run on fix-iter final SHA regardless | Auth-invariant is global; already covered. |
    | New dependency added (any change to `package.json` `dependencies` / `devDependencies` sections, any new `go.mod` entry, any new Python requirement) | `git diff <base>..HEAD -- '**/package.json' '**/go.mod' '**/requirements.txt' \| grep -E '^\+.*[":]'` returns > 0 | `reviewer-architecture` already in default set (RESHAPE); Standards axis covers dep hygiene via `reviewer-standards` and `reviewer-governance` | Dep-hygiene axis; already covered. |
    | Governance-core change (any file under `governance/` matching `CONSTITUTION.md \| ROLES.md \| REPORT_DIET.md \| GUARDRAILS.md \| REVIEW_PROCESS.md`) | `git diff --name-only <base>..HEAD -- 'governance/CONSTITUTION.md' 'governance/ROLES.md' 'plugins/eng-org/agents/REPORT_DIET.md' 'governance/GUARDRAILS.md' 'governance/REVIEW_PROCESS.md' \| wc -l` returns > 0 | `reviewer-architecture` and `reviewer-governance` are both in default set (RESHAPE); Mode-B triage catches governance-core amendments at intake | Governance-core changes require the full lens; already covered. |
    | **Docs-only diff** (fires when no code file touched — REQ-20260713-d904-03 Change 8b) | `git diff --name-only <base>..HEAD \| grep -vE '\.(md\|txt\|adoc\|rst)$' \| wc -l` returns 0 (all touched files are docs by extension) | `reviewer-performance`, `reviewer-observability`, `reviewer-indexes` emit `skip-with-note` (no code surface); `reviewer-architecture`, `reviewer-security`, `reviewer-standards`, `reviewer-governance`, `reviewer-domain-validator` (post-Change 5) still run — docs affect governance/policy and standards, and GR findings still need dispositioning | Docs-only diffs cannot introduce runtime perf/observability/index issues by construction; running those reviewers over pure prose is a no-op with zero quality loss. Governance / security / standards reviewers DO run — policy prose defects (MISTAKES 2026-07-12) ARE catchable in docs. |
    | **Config-only diff** (fires when only config files touched — REQ-20260713-d904-03 Change 8b) | `git diff --name-only <base>..HEAD \| grep -vE '\.(json\|yaml\|yml\|toml\|env(\..+)?\|config\.(js\|ts\|mjs\|cjs))$' \| wc -l` returns 0 (all touched files are config by extension) | `reviewer-performance`, `reviewer-observability`, `reviewer-indexes` emit `skip-with-note` (no runtime code); `reviewer-architecture`, `reviewer-security`, `reviewer-standards`, `reviewer-governance`, `reviewer-domain-validator` still run — config changes CAN affect auth surfaces, layering, and policy alignment, and GR findings still need dispositioning | Config-only diffs have no perf/observability/index code path (their runtime effect is loaded, not authored); the running reviewers cover the axes config changes actually risk (auth secrets, module wiring, policy compliance). |

    **Skip-with-note format (Change 8b — pin for merge-readiness compatibility).** When a reviewer emits skip-with-note, its report is a valid signal (counts toward "all reviewers present" at merge-readiness) but not a verdict. Format:

    ```markdown
    ---
    task: TASK-<n>
    reviewer: reviewer-<type>
    verdict: SKIP
    skip_reason: docs-only-diff | config-only-diff
    skip_trigger_row: <the 2b row that fired, verbatim first column>
    files_reviewed: []
    raw_doc_reads: []
    pack_audit: null
    wave: full | focused-fix-iter-<N>
    ---

    # reviewer-<type> — TASK-<n> — SKIP

    **Verdict:** SKIP (per run-reviews.md §Step 2b — <trigger>)

    The diff for this task is <docs-only|config-only>. This reviewer's axis
    (<perf|observability|indexes>) covers no code surface in this diff. No
    findings raised. No inspection performed.

    **No derivation line** is emitted (SKIP is not APPROVE/NEEDS-CHANGES/BLOCK
    per REPORT_DIET §G's derivation mapping; SKIP is outside the mapping domain
    by design). verdict-lint reports `verdict: SKIP` files as status SKIP
    (exit 0) **provided the findings array is empty**; a SKIP report carrying
    findings FAILs the lint as a softening attempt (nit-fix-1, test C15/C16).
    ```

    The `tl-assign` / `run-reviews` invocation MUST compute this table and log the additions to the REQ audit log:

    ```
    20260713TXXXXXXZ-run-reviews-escalation.md
      additional_reviewers: [reviewer-indexes]
      triggers: ["backend/src/db/schema.ts touched"]
    ```

    Escalation is additive — the default RESHAPE set (7 reviewers + GR) remains. Under the RESHAPE outcome most escalation rows are already covered by default; the primary conditional escalation is `reviewer-indexes` on schema/hot-path signals.

3. Each Reviewer writes
   `tasks/TASK-<n>-review-<type>.md` with verdict APPROVE /
   NEEDS-CHANGES / BLOCK and line-cited findings.

3b. **Report diet contract.** Enforce the contract from
   `plugins/eng-org/agents/REPORT_DIET.md §C–§F`.

3d. **Verdict-lint invocation (mandatory, hard-fail — REQ-20260713-d904-03 Change 1/2).**

   *(Numbering note: Step 3d sits between 3b and 3c in file order — intentional. The 3c label is load-bearing in cross-file references (`merge-readiness.md` §3c, `REPORT_DIET.md` §G "Step 3d") and is not renumbered.)*

   After each reviewer writes its report, invoke the mechanical verdict-lint
   against just-that-file. Resolve the script from `$CLAUDE_PLUGIN_ROOT`
   (matches invalidation.mjs pattern in §3c):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/verdict-lint.mjs" \
     --single-file governance/requirements/REQ-<id>/tasks/TASK-<n>-review-<type>.md
   ```

   Exit code semantics:
   - `0` → PASS, proceed.
   - `1` → **Policy violation** (declared verdict disagrees with derived per REPORT_DIET.md §G.1 derivation rule). Block the reviewer batch — remand the offending review to a fresh reviewer instance (§H.43) with the lint output as the finding; the fresh reviewer MUST either re-derive the correct verdict from its findings OR downgrade/promote the finding severity and re-derive.
   - `2` → **Tool failure** (CLI usage error, unreadable file). Log to iteration log; do not block on tool failure — the fail-safe is to surface the error but proceed with a warning in `merge-readiness.md §Soft signals` (matches §3c invalidation-tool-failure fail-safe philosophy).

   Never accept a `--single-file` exit-1 as a "small nit, ignore" — enforcement is not guidance. If a reviewer's verdict is legitimately disputed (e.g., the reviewer intentionally declared BLOCK on a P2 for a specific escalation reason), the correct path is to raise the finding's severity to P1 with justification, not to bypass the lint.

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
   # Write changed files as a JSON array to a temp file (NUL-safe).
   # If git-changed-to-json.mjs exits non-zero, fall through to fail-safe
   # = FULL re-run of ALL reviewers (see "Invalidation tool failure" below).
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

   d) **(Step 4d — GR disposition + derivation line.)** Write
      `governance/requirements/REQ-<id>/gr-review.md`: every GR
      finding with severity, file:line, and a disposition —
      `CONFIRMED` (with evidence) / `FALSE-POSITIVE` (with the
      disproving evidence) / `OUT-OF-SCOPE` (pre-existing, log to
      TECH_DEBT.md instead). Confirmed P0/P1 count as a BLOCK;
      confirmed P2/P3 as NEEDS-CHANGES nits.

      **Derivation line emission (REQ-20260713-d904-03 Change 1).** The TL disposition writer MUST also emit at the top of the gr-review.md body a single line matching REPORT_DIET.md §G.1 format:
      `Verdict: <BLOCK|NEEDS-CHANGES|APPROVE> (derived — <one-sentence citing the load-bearing CONFIRMED finding OR "0 confirmed findings">)`.
      This line is parsed by `verdict-lint.mjs --include-gr` (invoked from `merge-readiness.md §Step 2e item 5`) to enforce the derivation rule against GR's CONFIRMED-row set. The derivation follows the same mapping as §G.1: max CONFIRMED severity ∈ {critical, high, P0, P1, blocker} → BLOCK; ∈ {medium, P2, concern} → NEEDS-CHANGES; ∈ {low, P3, nit} alone → APPROVE; zero CONFIRMED rows → APPROVE.

   e) **Learning loop:** for each CONFIRMED finding, append a
      prevention rule to `governance/MISTAKES.md` (what GR caught,
      why the role reviewers missed it). This is how the org stops
      repeating the same class of mistake.

4b. **§Fix-iteration mode (Feature — Change 7, incremental focused re-review).**

    **Deterministic entry criteria (all three must hold — reviewer discretion is BANNED here):**

    1. The REQ has **≥ 1 complete prior review wave on record** — grep `governance/requirements/REQ-<id>/tasks/` for any `TASK-*-review-*.md` (any verdict). Zero hits ⇒ this is the initial wave, run the standard Steps 2–4 unchanged.
    2. This dispatch is a **TL fix-iteration** — a TL fix-dispatch record exists at `governance/requirements/REQ-<id>/fix-iter-<N>/` (or equivalent per the current TL fix-dispatch protocol from `commands/run-tests.md §4b`).
    3. The escalation criteria table (see §4b.3 below) does NOT fire.

    If any of the three fails, this is a full re-review: run Steps 2–4 unchanged.

    **§4b.1 — Focused-wave scope.**

    When §Fix-iteration mode is entered:

    - **Review diff = the fix iteration's diff only.** Resolve via `git diff --name-only "<fix-iter-base-sha>"..HEAD` where `<fix-iter-base-sha>` is the SHA pinned in the TL fix-dispatch record (mirrors the pinned-sha discipline from Step 3c). Do NOT diff against the REQ's base branch — that would re-review unchanged code.
    - **Reviewer scope has two disjoint parts (both mandatory):**
      1. **Re-verify every previously-flagged finding that the fix claims to address.** For each finding in prior `TASK-*-review-*.md` (any wave) with verdict `NEEDS-CHANGES` or `BLOCK`, emit an explicit re-verdict `RESOLVED` (with evidence citing the fix commit + file:line where the change resolves the finding) or `UNRESOLVED` (with evidence citing why the finding still fires against HEAD). Every prior finding gets a terminal re-verdict — no findings may be silently dropped.
      2. **Fresh review of changed files only.** Reviewers run their standard checks against the files in the fix diff; new findings outside the changed-files set are OUT-OF-SCOPE for this wave and MUST be logged as a `deferred:` frontmatter list, not as findings against this wave.
    - **GR runs with `--range` pinned to the fix diff.** Concretely:
      ```bash
      "$GR_BIN" review --range "<fix-iter-base-sha>"..HEAD --repo <repo-path> --preset standard
      ```
      Same preset as Step 4b. GR findings against files NOT in the fix diff are OUT-OF-SCOPE for this wave.

    **§4b.2 — Focused-wave report shape.**

    Each reviewer writes `TASK-<n>-review-<type>-fix-iter-<N>.md` (filename convention preserves the bench extractor regex — see AC-20 verification below). The report shape is a superset of the standard shape:

    - **All standard frontmatter fields preserved** — `verdict:`, `severity_verdict_policy_ack:`, `rubric_bullet:`, `pack_audit:`, `raw_doc_reads:`, etc. verdict-lint parses this shape unchanged (it ignores fields it does not know about, per its SKIP-not-FAIL philosophy).
    - **New frontmatter field `wave: focused-fix-iter-<N>`** — declares the wave type explicitly. Absent field ⇒ full wave (backward compatible with all prior reports).
    - **New body section `## §Prior-finding re-verdicts`** — one line per prior finding, formatted:
      ```
      - <prior-finding-id or file:line-ref> — RESOLVED | UNRESOLVED — <evidence sentence>
      ```
      This section is IGNORED by verdict-lint's parser (it lives outside verdict-lint's finite grammar of `verdict:` line + findings block). AC-18 tolerance = compatibility by design, not a code change to verdict-lint.
    - **New body section `## §Deferred-out-of-scope findings`** (optional) — findings the reviewer would raise but lie outside the changed-files set. These do NOT count toward the wave's verdict. Format: `- <file:line> — <one-sentence finding> — deferred to next full wave OR to the escalation criteria in §4b.3`.

    **§4b.3 — Escalation-to-full-re-review criteria (deterministic — reviewer discretion BANNED).**

    If ANY row below fires against the fix diff, the TL MUST abandon focused mode and dispatch a full re-review (Steps 2–4 unchanged) for this iteration:

    | Trigger | Detection command | Rationale |
    |---|---|---|
    | Fix diff touches files OUTSIDE the original REQ's reviewed file set | `git diff --name-only "<fix-iter-base-sha>"..HEAD` compared against the union of `files_reviewed:` frontmatter across every `TASK-*-review-*.md` from the prior full wave — any file in the diff not in the union fires | Focused mode assumes reviewers have already seen the file; a new file must go through the full-review lens once. |
    | Fix introduces a new dependency | `git diff "<fix-iter-base-sha>"..HEAD -- '**/package.json' '**/go.mod' '**/requirements.txt' '**/pyproject.toml' '**/Cargo.toml'` — any added dependency line fires | New deps have specialty hazards (license / supply-chain / bundle-size) that specific role reviewers screen for; a focused wave over the fix diff alone under-samples those hazards. |
    | Fix touches schema/migrations | `git diff --name-only "<fix-iter-base-sha>"..HEAD -- 'backend/drizzle/**' 'backend/src/db/schema.ts' '**/*.sql'` — any match fires | Schema changes require `reviewer-indexes` conditional dispatch (mechanical rule from Step 2); focused mode's changed-files scope may miss consumer files that need index verification. |

    All three triggers use exact-match / pathspec — no regex ambiguity. If unsure whether a trigger fires, TREAT AS FIRED and dispatch full re-review (fail-safe = full wave). Log the escalation decision in `governance/.audit/REQ-<id>/<timestamp>-focused-mode-<random>.md` with the trigger row cited.

    **§4b.4 — Interaction with pinned verdicts (Step 3c) and always-rerun tiers (§Always-rerun blockquote).**

    Focused mode does NOT override pinning: a reviewer whose `intersects: false` in Step 3c invalidation is still pinned as `GREEN@<sha>` — the fact that the wave is focused does not change the pin decision. The always-rerun blockquote (reviewer-security, test-regression, G-7 contract-diff, GR deep-review) still forces re-run on the fix-iter final SHA regardless of focused mode. Focused mode narrows the DIFF SURFACE passed to those forced re-runs (GR gets `--range <fix-iter-base>..HEAD`, reviewer-security reviews the fix diff files only) but does NOT skip them.

    **§4b.5 — Bench extractor compatibility (AC-20).**

    Focused-wave report filenames MUST match the bench extractor regex used at `eng-org-bench/packages/extractor/src/parseTaskReview.ts` (and the sibling scan surfaces `extractRun.ts`, `scanPipelineWorkspace.ts`). The regex accepts `^TASK-.*-review-.*\.md$`. The filename `TASK-<n>-review-<type>-fix-iter-<N>.md` matches (the `-fix-iter-<N>` suffix is captured by the trailing `.*`). Verdict token parsing on the `Verdict: X (…)` shape is preserved verbatim from Step 3 (no change to the verdict line format).

    **Verification (mandatory at TASK-9 kickoff and again at merge-readiness):**
    1. Grep `parseTaskReview.ts` for the filename regex; confirm the fix-iter suffix matches.
    2. Grep `extractRun.ts:56` and `scanPipelineWorkspace.ts:107` for the same regex reference; confirm no additional filename filter blocks the suffix.
    3. Static-check `parseTaskReview`'s verdict token parser accepts the standard `Verdict: X (derived — …)` shape TASK-1 landed; no change needed for focused-wave reports because the verdict-line format is identical to full-wave reports.

    If any of the three verification steps fails, TASK-9 HALTS and escalates to TL — bench extractor scope expansion becomes a required companion change (out-of-scope for this REQ per §Out-of-scope).

5. After all return, summarize: per-task verdicts + the GR
   disposition table. If any BLOCK (role reviewer or confirmed GR
   P0/P1), return to the relevant TL with the findings; the TL
   decides whether to dispatch a Dev fix iteration or escalate to EM.
   If all APPROVE / NEEDS-CHANGES are addressed, print "Reviews
   done for REQ-<id>. Run `/merge-readiness REQ-<id>`."
