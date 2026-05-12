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
   - Apply the merge-readiness template from ROLES.md §4:
     - Scope summary
     - Files changed list
     - Test signal (5 reports, all GREEN required)
     - Review signal (5 reports, all APPROVE required; one
       NEEDS-CHANGES allowed only with reason + EM ack)
     - MISTAKES regression sweep result
     - Guardrail sweep: G-1 / G-2 / G-3 / G-5 outcomes with
       evidence paths
     - Out-of-scope drift declared
     - Verdict: READY-FOR-MERGE / NOT-READY (with reason)

3. After the TL(s) return, print the path(s) to
   merge-readiness.md and tell the user "Run `/em-summary REQ-<id>`
   for the 1-page Imran view."

A merge-readiness.md without all 10 signals (5 tests + 5 reviews)
green, OR missing any applicable guardrail sweep (G-1 / G-2 / G-3
/ G-5), is invalid; the TL refuses to write READY-FOR-MERGE.
