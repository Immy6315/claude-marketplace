---
description: TL composites all signals into merge-readiness.md per ROLES.md §4.
---

You are producing merge-readiness for a requirement.

The requirement id is: $ARGUMENTS.

Steps:

1. Re-spawn the assigned TL(s) (per `spec.md`). If multiple, run
   in parallel; each writes its own `tl-<domain>-merge-readiness.md`,
   then a final `merge-readiness.md` aggregates.

2. Each TL agent will:
   - Read every dev-report, test report, and review report under
     `governance/requirements/REQ-<id>/tasks/`.
   - Run `node governance/scripts/check.mjs` if any governance
     doc was touched.
   - **Apply the guardrails from `governance/GUARDRAILS.md`:**
     - **G-1 (visual parity):** For any UI-rendering change,
       verify `tests/visual-parity-<screen>.png` is attached AND
       passes — perceptual match, OR drift covered by an active
       entry in `governance/design-divergence-registry.md`, OR
       declared in this REQ's `spec.md §Intentional design
       divergence` (in which case add the registry entry as part
       of merge). Unregistered drift = BLOCK.
     - **G-2 (regression-check):** Every Dev / Test agent task
       has a non-empty `tasks/TASK-<n>-regression-check.md`. If
       any task is missing one, BLOCK and remand to the Dev/Test
       agent.
     - **G-3 (device boot smoke):** For any
       `mobile/package.json::dependencies` or
       `mobile/app.json::expo.extra` diff in this REQ, the
       dev-report carries an explicit "Device boot smoke: PASS"
       line citing `npx expo run:ios` (or run:android) reaching
       first-route mount. Metro-only is NOT acceptable. Companion
       tests `mobile/__tests__/native-dep-import-check.test.ts`
       and `mobile/__tests__/expo-config-completeness.test.ts`
       MUST be GREEN.
     - **G-5 (no "pre-existing"):** No test/lint/type failure may
       be excused as "pre-existing, not introduced by this REQ"
       unless it is documented in `governance/TECH_DEBT.md` with
       a retirement date ≤ 30 days and the REQ id under which it
       was surfaced.
     - **G-7 (API contract parity):** For any REQ touching the
       backend API surface, verify `tasks/TASK-<n>-contract-diff.md`
       is attached for each touched endpoint. Verdict logic:
       `PASS`/`NEW` = pass (for `NEW`, commit the normalized
       candidate as the new baseline under
       `governance/api-contracts/<service>/` as part of merge);
       `DRIFT` = BLOCK unless covered by an active entry in
       `governance/api-contract-registry.md` OR declared in this
       REQ's `spec.md §Intentional contract change` (in which case
       add the registry entry AND update the baseline as part of
       merge); `LEAK` on a public endpoint = **unconditional BLOCK**,
       no registry entry waives it.
     - **G-10 (scope-explosion sweep):** Run the guard against the
       REQ's TRD and actual diff:
       ```bash
       node "${CLAUDE_PLUGIN_ROOT}/scripts/scope-explosion-guard.mjs" \
         --trd governance/requirements/REQ-<id>/trd.md \
         --changed /tmp/changed.json \
         --numstat /tmp/numstat.txt
       ```
       Where `changed.json` is produced by `git-changed-to-json.mjs`
       and `numstat.txt` is the output of `git diff --numstat`.
       - Exit 0 + verdict=PASS → PASS (within budget × 1.5).
       - Exit 0 + verdict=OVERRIDE → PASS (TL records the explicit
         `OVERRIDE: allow_full_rewrite=true (provenance: EM-approved TRD)`
         line in `merge-readiness.md §Scope-explosion sweep`).
       - Exit 1 (BLOCK) → NOT-READY; the TL remands to the Dev to
         either reduce scope to fit the declared §E2 budget, or obtain
         EM approval to set `allow_full_rewrite: true` in the TRD.
       - Exit 2/3 (IO/parse error) → investigate; do not silently
         treat as PASS.
       This sweep is **always required** for any REQ with a TRD that
       carries a populated §E2 section. REQs with no §E2 (docs-only,
       governance-only under Mode A) are exempt with a skip-note.
   - **Step 2b — Forced-sampling audit (ALWAYS, not dispute-triggered):**
     On every REQ, TL opens **1 randomly chosen evidence file per REQ**
     from the union of all test-report `evidence:` paths + all
     reviewer-report `files_reviewed:` paths across every TASK in the REQ.

     Procedure:
     1. Collect all `evidence:` entries from `tasks/TASK-*-test-*-report.md`
        and all `files_reviewed:` entries from `tasks/TASK-*-review-*.md`.
        Union the paths (deduplicated).
     2. Select one path uniformly at random (or pseudo-randomly — any
        deterministic selection based on REQ id is acceptable provided it
        is not always the same file class).
     3. Open that file at the pointed line range and verify the content
        at those lines supports the verdict claimed by the source report.
     4. Write the result as a `§Forced-sampling audit` block in
        `merge-readiness.md` citing:
        - chosen path + chosen line range
        - source verdict-report path (which test/review report cited it)
        - `supported` or `not-supported`
        - one-sentence rationale

     `not-supported` outcome = NOT-READY: remand to the relevant
     test or reviewer agent for a RED verdict re-issue against the
     actual file contents.

     Important: this is TL opening OTHER agents' evidence files to
     independently verify their verdicts. It is NOT the TL reviewing
     its own work. Iron rule §H.42 (no self-approval) is preserved —
     the TL's own analysis artifact (`tl-<domain>-merge-readiness.md`)
     is a separate artifact from the sampled evidence; the TL is not
     approving its own analysis, it is spot-checking a different agent's
     evidence path. If the REQ has a separate assigned TL for analysis
     and a different TL for merge-readiness, the distinction is explicit.
     In single-TL REQs the forced-sampling step is still valid because
     the TL is checking test-agent and reviewer-agent evidence, not its
     own artifact.

   - **GR deep-review sweep:** `governance/requirements/REQ-<id>/gr-review.md`
     must exist and give EVERY GR finding a disposition (CONFIRMED /
     FALSE-POSITIVE / OUT-OF-SCOPE, each with evidence) — or contain an
     explicit skip-note (gr binary unavailable). An unresolved CONFIRMED
     P0/P1 = NOT-READY. A missing gr-review.md (when `/run-reviews` ran
     GR) = NOT-READY, remand to the TL.
   - **Step 2c — Pinned-verdict rendering and audit-trail verification
     (Feature 2 — incremental fix-iterations v2).**

     When the REQ went through one or more fix iterations, some tiers or
     reviewers may carry pinned verdicts rather than freshly-computed ones.
     The TL must:

     1. **Render pinned verdicts** in the Hard gates block as
        `GREEN@<sha> (pinned)` — where `<sha>` is the SHA the verdict was
        originally computed against. Example:

        ```
        test-unit:        GREEN@abc1234 (pinned)
        test-integration: GREEN@abc1234 (pinned)
        reviewer-performance: GREEN@abc1234 (pinned)
        ```

        A pinned verdict is cited prior evidence, NOT self-approval
        (iron rule §H.42 preserved — the TL is verifying that the prior
        GREEN was correctly pinned by the `run-tests` / `run-reviews`
        fix-iteration protocol, not re-issuing a verdict on its own work).

     2. **Verify audit-trail file exists** for every claimed pin.
        For each tier rendered as `GREEN@<sha> (pinned)`, confirm that a
        corresponding audit-trail file exists at:
        `governance/.audit/REQ-<id>/<timestamp>-pin-<random>.md`

        A claimed pin WITHOUT a corresponding audit-trail file = NOT-READY.
        Remand to the TL who ran the fix iteration to produce the audit file.

     3. **Verify audit-trail content** — each audit file must contain at
        minimum: tier name, pinned-at sha, current sha, invalidation key
        computation output, decision. Incomplete audit file = NOT-READY.

     4. **Reject pins on always-rerun tiers.** A pin claimed on ANY of the
        following tiers is **INVALID regardless of invalidation result** →
        NOT-READY:

        > - `reviewer-security` — auth invariant is global.
        > - `test-regression` — MISTAKES.md is a moving target.
        > - G-7 contract-diff (when the REQ touched API contracts).
        > - GR deep-review.

        Grep the claimed pinned-tier list for any of these names. If any
        match, the pin is invalid. Remand to the TL who ran the fix iteration
        to produce a fresh verdict.

   - **Step 2d — Canary pack_audit sweep (Feature 3 — context pack v2).**

     When Feature 3 (context pack) is active for the REQ (i.e., a
     `context-pack.md` was produced), the TL performs the following sweep
     across all reviewer verdict files under `tasks/`:

     1. **Verify exactly ONE non-null `pack_audit` field exists** across all
        reviewer reports for this REQ. Grep:
        ```bash
        grep -l "^pack_audit:" tasks/TASK-*-review-*.md | \
          xargs grep -l "^pack_audit: [^n]"
        ```
        - Zero files with a non-null `pack_audit` (when a pack was used) →
          NOT-READY; remand to `/run-reviews` to select and run the canary.
        - More than one file with non-null `pack_audit` → advisory warning
          (multiple canaries ran); note in §Cross-domain notes.
        - Exactly one file → proceed.

     2. **Read the canary's `pack_audit` value.**
        - `pack_audit: MATCH` → log `Canary pack_audit: PASS` in §Pack health.
        - `pack_audit: "DIVERGENT: <what>"` → copy the `<what>` clause
          verbatim into §Cross-domain notes AND mark NOT-READY unless the
          assigned TL has recorded a disposition (CONFIRMED / FALSE-POSITIVE /
          OUT-OF-SCOPE with evidence) for the divergence. An unresolved
          DIVERGENT is a process-integrity failure — the pack is shipping
          stale content.

     3. **Soft-signal check — missing raw_doc_reads escape hatch.** For each
        reviewer report that has an empty `raw_doc_reads: []` field: check
        whether the report's findings cite a passage from the CONSTITUTION,
        ROLES, or MISTAKES that the pack's `## Exclusion Manifest` lists as
        omitted. If so, log an advisory note in §Cross-domain notes:
        `[soft-signal] reviewer-<type> cited excluded passage <doc §section>
        without logging a raw_doc_read — pack may have underserved this reviewer.`
        This is advisory, NOT a blocker.

     4. **Pack-health summary line** (always write, even if no divergence):

        ```
        Pack health: canary=<MATCH|DIVERGENT|NONE> raw_doc_reads_total=<N>
          (per reviewer: <reviewer>:<count>, ...) forced-sampling=<PASS|FAIL|N/A>
        ```

        This one-line summary gives the EM visibility into pack quality per REQ.

   - **Step 2e — Diet-compliance sweep + always-rerun drift guard.**

     **Diet compliance:** verify verdict-carrying reports were not dieted incorrectly.

     1. No dev-diff was accidentally dieted:
        ```bash
        grep -l 'coverage:' governance/requirements/REQ-<id>/implementation/TASK-*-diff.md
        ```
        Must return empty. Any file printed was incorrectly dieted; remand to the Dev.

     2. Check that every GREEN/APPROVE verdict report (`TASK-*-review-*.md` and
        `TASK-*-test-*.md`, NOT `TASK-*-diff.md`) has a reasoning section capped
        at ~40 lines. Files with RED/BLOCK/NEEDS-CHANGES/FAIL verdicts are exempt.

     3. Drift-guard sentinel — no agent file (other than the canonical doc itself)
        must contain the phrase "Cap LIFTED — unbounded prose required when" inlined
        (this is the exact §D heading in REPORT_DIET.md):
        ```bash
        grep -rl "Cap LIFTED — unbounded prose required when" \
          plugins/eng-org/agents/*.md \
          | grep -v REPORT_DIET.md
        ```
        Must return empty (zero non-canonical agent files). Any match = NOT-READY;
        the inlined block must be replaced with the canonical reference to `REPORT_DIET.md`.

     4. Severity-policy ack + rubric grammar sweep (REPORT_DIET.md §G/§B.1) —
        for EVERY `tasks/TASK-*-review-*.md`, grep the frontmatter:
        ```bash
        grep -L "^severity_verdict_policy_ack: true$" tasks/TASK-*-review-*.md
        grep -L 'rubric_bullet: "\(critical\|high\|medium\|low\): ' tasks/TASK-*-review-*.md
        ```
        Both must return empty. Any file printed is INVALID — do NOT count it
        toward the 5-approve review signal; remand to that reviewer to re-issue
        with the ack field and §B.1-grammar `rubric_bullet:` citations.

     5. **Global verdict-lint mechanical sweep (mandatory, hard-fail — REQ-20260713-d904-03 Change 1/2).**

        Run the verdict-lint against every reviewer output for this REQ:

        ```bash
        node "${CLAUDE_PLUGIN_ROOT}/scripts/verdict-lint.mjs" \
          --req-dir governance/requirements/REQ-<id>/ \
          --include-gr \
          --format json
        ```

        Exit-0 → PASS, proceed. Exit-1 → NOT-READY on process integrity: at
        least one reviewer's declared verdict disagrees with the derivation
        from its findings per REPORT_DIET.md §G.1. Log the offending file
        paths in the `§Verdict-lint sweep` section below; remand to a fresh
        reviewer instance for the offending file(s). Exit-2 → tool failure;
        log in §Soft signals and proceed with an explicit note (matches the
        fail-safe philosophy of Step 2c's invalidation tool failure).

        The `--include-gr` flag additionally lints `governance/requirements/REQ-<id>/gr-review.md` if present — the derived verdict of GR is computed from the `disposition = CONFIRMED` rows only (FALSE-POSITIVE and OUT-OF-SCOPE rows are ignored per REPORT_DIET.md §G handling of gr-review).

     6. **Verdict derivation-line format sentinel (REQ-20260713-d904-03 Change 1).**

        Grep every `tasks/TASK-*-review-*.md` for the derivation-line format:

        ```bash
        grep -LE '^Verdict: (BLOCK|NEEDS-CHANGES|APPROVE) \(derived — .+\)$' \
          tasks/TASK-*-review-*.md
        ```

        Must return empty **after excluding skip-with-note stubs**: reports whose frontmatter declares `verdict: SKIP` (run-reviews.md §Step 2b docs-only/config-only rows) carry NO derivation line by design — filter them out first (e.g. skip any file matched by `grep -l '^verdict: SKIP' tasks/TASK-*-review-*.md`). Any remaining file printed lacks the mandatory derivation line — NOT-READY; remand to the reviewer to add the line per REPORT_DIET.md §G.1. This is the readable companion to item 5's mechanical lint — the two together ensure the verdict is BOTH derived and human-auditable.

     7. **MISTAKES-gate learning-loop sweep (mandatory, hard-fail — REQ-20260713-d904-03 Change 6).**

        Enforce that the REQ's learning-loop debt is paid — every CONFIRMED
        GR finding and every fix-iteration produces at least one MISTAKES.md
        entry citing this REQ id.

        ```bash
        node "${CLAUDE_PLUGIN_ROOT}/scripts/mistakes-gate.mjs" \
          --req-dir governance/requirements/REQ-<id>/ \
          --check-fix-iterations \
          --format json
        ```

        Exit code semantics:
        - `0` → PASS (learning-loop debt paid, OR no CONFIRMED findings + zero fix-iterations for this REQ — the SKIP path).
        - `1` → **Learning-loop debt** — NOT-READY on process integrity. gr-review.md has ≥ 1 CONFIRMED finding OR at least one task recorded `fix_iterations ≥ 1` but MISTAKES.md has no entry citing this REQ id. Remand to the TL: the TL either (a) appends an entry using the fixed 3-line template from `governance/MISTAKES.md §Fix-iteration distill template` (what-broke / root-cause class tag / prevention rule + `paths:` glob), or (b) if the confirmed findings genuinely share a root cause with an already-cited REQ's entry, adds this REQ id as an additional citation to that existing entry (AC-16 dedup — one entry may cover multiple findings sharing a root cause).
        - `2` → tool failure (CLI usage error, unreadable path). Log in `§Soft signals`; do not block on tool failure (same fail-safe philosophy as item 5's verdict-lint tool-failure handling).

        SKIP-not-FAIL discipline preserved: if `gr-review.md` is missing, empty, or unparseable, `mistakes-gate.mjs` exits 0 with a SKIP line; item 7 records the SKIP in the `§MISTAKES-gate sweep` companion section below and does not FAIL. Historical REQs with different gr-review.md formats MUST NOT hard-fail merge-readiness retroactively.

     **Always-rerun drift guard:** assert the always-rerun blockquote in
     `commands/run-tests.md §4b` and the always-rerun blockquote in
     `commands/run-reviews.md §3c` are identical. Grep both files:

     ```bash
     grep -A4 "ALWAYS re-run on the final SHA" commands/run-tests.md
     grep -A4 "ALWAYS re-run on the final SHA" commands/run-reviews.md
     ```

     If the two lists differ — NOT-READY on process integrity. The lists
     define which tiers can never be pinned; divergence between the two command
     files creates an inconsistency in the protocol.

   - **§Verdict-lint sweep** — mandatory content section in the composed `merge-readiness.md` (REQ-20260713-d904-03 Change 1/2). List:

     - Command run: `node "$CLAUDE_PLUGIN_ROOT/scripts/verdict-lint.mjs" --req-dir <path> --include-gr --format json`
     - Files linted: N (count of `TASK-*-review-*.md` + `gr-review.md` if present).
     - Exit code: `0` / `1` / `2`.
     - Per-file result: PASS / FAIL / SKIP with derived-vs-declared summary (no raw finding text — redacted per script contract).
     - Overall derived verdict: BLOCK / NEEDS-CHANGES / APPROVE (worst-of).

   - **§MISTAKES-gate sweep** — mandatory content section (REQ-20260713-d904-03 Change 6). List:

     - Command run: `node "$CLAUDE_PLUGIN_ROOT/scripts/mistakes-gate.mjs" --req-dir <path> --check-fix-iterations --format json`
     - Exit code: `0` / `1` / `2`.
     - gr-review.md CONFIRMED-finding count: N (or SKIP with reason).
     - fix_iterations across tasks (max): N.
     - MISTAKES.md entries citing this REQ id: N.
     - Status: PASS / FAIL / SKIP with one-sentence reason.
     - If FAIL: TL remediation plan — either "appended new MISTAKES entry at line X" OR "amended existing entry at line Y to cite REQ-<id>" — cite the specific entry.

   - **§Fix-iteration wave inventory** — mandatory when the REQ went through one or more fix iterations (REQ-20260713-d904-03 Change 7). Enumerate every review wave and its scope:

     | Wave | Type | Files reviewed | Filename pattern |
     |---|---|---|---|
     | Initial | full-wave | union of `files_reviewed:` across `TASK-*-review-*.md` (no `-fix-iter-` suffix) | `TASK-<n>-review-<type>.md` |
     | Fix-iter-1 | focused-fix-iter-1 OR full-re-review-escalated | as declared in the wave's reviewer reports OR full when escalation criteria fired | `TASK-<n>-review-<type>-fix-iter-1.md` |
     | Fix-iter-N | ... | ... | ... |

     **Mixed-wave acceptance rule.** merge-readiness READY-FOR-MERGE requires:

     1. Every reviewer in the default set (post-TASK-6 RESHAPE default per `run-reviews.md §Step 2`: 7 role reviewers — 2 consolidated + 4 survivors + reviewer-security — plus GR; pre-TASK-6 fallback: 5 role reviewers + GR + reviewer-indexes if applicable) has at least ONE report on record across ALL waves. A reviewer with zero reports across every wave is a NOT-READY gap.
     2. For every prior finding with verdict `NEEDS-CHANGES` or `BLOCK` in ANY prior wave, a LATER wave contains an explicit `RESOLVED` re-verdict (with evidence). `UNRESOLVED` re-verdicts of severity P0 or P1 = NOT-READY. `UNRESOLVED` of severity P2 or P3 = NEEDS-CHANGES at overall verdict (worst-of aggregation from TASK-3 §Step 2e item 5's verdict-lint continues to apply per wave).
     3. Escalation rows from `run-reviews.md §4b.3` — if any fix iteration hit an escalation trigger, its wave-type column reads `full-re-review-escalated` and the audit trail at `governance/.audit/REQ-<id>/*-focused-mode-*.md` must cite the triggering row.

     Grep-audit (write to §Cross-domain notes for EM visibility):

     ```bash
     # List all reviewer reports across waves and their declared wave type
     grep -HE "^wave: " governance/requirements/REQ-<id>/tasks/TASK-*-review-*.md

     # List every prior finding still marked UNRESOLVED at final wave
     grep -HE "UNRESOLVED" governance/requirements/REQ-<id>/tasks/TASK-*-review-*.md
     ```

     Failure modes:
     - Missing `wave:` frontmatter on any focused-wave report ⇒ NOT-READY, remand to that reviewer to add the field (single-line frontmatter edit — non-blocking on the review substance itself).
     - `UNRESOLVED` P0/P1 finding with no follow-up wave ⇒ NOT-READY on process integrity.
     - Every finding `RESOLVED` but one reviewer has zero reports across all waves ⇒ NOT-READY gap.

   - Apply the merge-readiness template from ROLES.md §4:
     - Scope summary
     - Files changed list
     - Test signal (5 reports, all GREEN required; pinned tiers shown as
       `GREEN@<sha> (pinned)`)
     - Review signal (all APPROVE required OR SKIP-with-note per `run-reviews.md §Step 2b` (Change 8b) per default-set count from `run-reviews.md §Step 2` — post-TASK-6 that is the RESHAPE set of 7 role reviewers (2 consolidated + 4 survivors + reviewer-security) + GR, pre-TASK-6 fallback is 5 role + GR + reviewer-indexes if applicable; **worst-of aggregation** — verdict of the REQ as a whole is the max of all reviewer verdicts per REPORT_DIET.md §G.1 derivation rule: any BLOCK ⇒ overall BLOCK; else any NEEDS-CHANGES ⇒ overall NEEDS-CHANGES; else APPROVE. Softening/averaging/majority-vote is BANNED. Pinned reviewers shown as `GREEN@<sha> (pinned)`. **One NEEDS-CHANGES overall is not silently accepted** — READY-FOR-MERGE requires either overall APPROVE OR an explicit `em_ack_needs_changes:` line in `merge-readiness.md §EM decisions` citing the specific NEEDS-CHANGES report(s) and the reason for merging with the follow-on remediation plan. **Mixed full-wave + focused-fix-iter waves accepted iff every previously-flagged finding carries a terminal `RESOLVED` / `UNRESOLVED` re-verdict per `§Fix-iteration wave inventory` below — any `UNRESOLVED` finding of severity P0 or P1 = NOT-READY, unchanged.** The verdict-lint sweep (Step 2e item 5 above) enforces the derivation mechanically; this review-signal section documents it.)
     - MISTAKES regression sweep result (test-regression tier)
     - MISTAKES learning-loop debt (`mistakes-gate.mjs` — Step 2e item 7 above); PASS / FAIL / SKIP with reason
     - Guardrail sweep: G-1 / G-2 / G-3 / G-5 / G-7 / G-10 outcomes with
       evidence paths
     - GR deep-review disposition table (or skip-note)
     - Pinned-verdict audit: list of pinned tiers + corresponding
       `governance/.audit/REQ-<id>/` file paths (all must exist)
     - Out-of-scope drift declared
     - Verdict: READY-FOR-MERGE / NOT-READY (with reason)

3. After the TL(s) return, print the path(s) to
   merge-readiness.md and tell the user "Run `/em-summary REQ-<id>`
   for the 1-page Imran view."

4. **Context sync (auto, self-skipping).** Merge-readiness is the point
   where the REQ's full artifact set (tl-analysis, dev-reports, test
   reports, review reports, merge-readiness verdict) is complete and
   worth distributing to other machines. Run the context sync exactly as
   defined in `commands/sync.md` (resolve repo root → guard on git repo
   + `origin` remote → `pull --ff-only` → `add -A` → commit → push),
   using a message like `REQ-<id> merge-readiness <verdict>`. **It
   self-skips silently if this project is not a git repo with a
   remote** — never block or error on projects with no context repo.
   This pushes governance artifacts only; it never touches code repos
   (they are gitignored) and never performs the production merge, which
   stays human-gated.

A merge-readiness.md without all signals green — 5 test tiers + the
full default review set per `run-reviews.md §Step 2` (7 role reviews +
GR at 0.15.0; skip-with-note stubs count as present per §Step 2b) — OR missing any applicable guardrail sweep (G-1 / G-2 / G-3
/ G-5 / G-7 / G-10), is invalid; the TL refuses to write READY-FOR-MERGE.
