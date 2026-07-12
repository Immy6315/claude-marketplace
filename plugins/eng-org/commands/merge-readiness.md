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

   - Apply the merge-readiness template from ROLES.md §4:
     - Scope summary
     - Files changed list
     - Test signal (5 reports, all GREEN required; pinned tiers shown as
       `GREEN@<sha> (pinned)`)
     - Review signal (5 reports, all APPROVE required; pinned reviewers
       shown as `GREEN@<sha> (pinned)`; one NEEDS-CHANGES allowed only
       with reason + EM ack)
     - MISTAKES regression sweep result
     - Guardrail sweep: G-1 / G-2 / G-3 / G-5 / G-7 outcomes with
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

A merge-readiness.md without all 10 signals (5 tests + 5 reviews)
green, OR missing any applicable guardrail sweep (G-1 / G-2 / G-3
/ G-5 / G-7), is invalid; the TL refuses to write READY-FOR-MERGE.
