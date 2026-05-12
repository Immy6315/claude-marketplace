# GUARDRAILS.md — engineering guardrails (binding)

> Six hard rules that prevent the "fix one thing, break another" failure
> mode. These rules apply IN ADDITION to ROLES.md and CONSTITUTION.md,
> not in place of them. Where a guardrail conflicts with a rule, the
> **stricter reading wins**.
>
> These guardrails are derived from real-world regressions observed in
> multi-agent pipelines. Adjust path placeholders to your project's
> layout, but do not weaken the contracts without an explicit
> Imran / TL signoff recorded in CHANGE LOG below.

---

## G-1. Perceptual parity gate for visual REQs

Before any REQ that touches UI rendering (mobile/web screens, components,
or theme tokens that affect rendered output) is marked READY-FOR-MERGE,
the assigned TL produces a **side-by-side**:

- Left: device / browser screenshot of the changed screen on the same
  target used for the boot smoke.
- Right: the matching design-reference screen (e.g. Figma export,
  `<design-source>/...` reference render) at the device's logical viewport.

Verdict logic:

| State | Outcome |
|---|---|
| Perceptual match (no visible drift) | PASS |
| Drift is listed in `governance/design-divergence-registry.md` with an active entry covering the changed file/component | PASS |
| Drift is declared as an intentional divergence inside the REQ's `spec.md` (§Intentional design divergence) | PASS (and the divergence must be added to the registry as part of merge) |
| Drift exists and is NOT registered | BLOCK — fix or register before READY-FOR-MERGE |

The side-by-side is attached as `tests/visual-parity-<screen>.png` plus
a 1-paragraph caption in `merge-readiness.md`.

**Why this exists:** Literal CSS values copy-pasted from a web reference
into native SVG do NOT reproduce the perceived rendering, because the
rendering pipelines differ (CSS gaussian blur vs SVG radial gradient,
sub-pixel anti-aliasing, color management). Code-level review cannot
catch "this halo is too dim" — only pixels can.

---

## G-2. Regression-check.md per Dev / Test agent task

Every Dev or Test agent's **first deliverable** for a task is
`tasks/TASK-<n>-regression-check.md`, written BEFORE the implementation
work, containing:

1. **Files this task touches** (read from the spec / dev plan).
2. **Prior REQs that touched the same files** — searched via `git log`
   + `governance/requirements/REQ-*/spec.md` grep. List the REQ id,
   date, and a 1-line summary of what it changed.
3. **MISTAKES.md entries that apply to the changed surface** — pulled
   by tag filter (e.g. `[mobile, animation, layout]` for a UI task).
4. **Yes/no answer to each:** "Does the change I am about to make
   preserve the invariant established by this prior REQ / MISTAKES
   entry?" If "no" or "unsure," the agent STOPS and escalates to TL —
   does not silently break the prior fix.

Skipping this deliverable, or producing an empty one, BLOCKs the
dev-report from being accepted by the TL.

**Why this exists:** Each agent dispatch is a fresh context with no
memory of prior breakage. ROLES.md already requires MISTAKES.md
reading, but in practice agents read it once at session start and then
focus on their narrow task. Forcing a written regression-check converts
a passive read into an active verification.

---

## G-3. Device-boot smoke (not bundler-only) for native-dep diffs

Any REQ that:

- Adds a key to `<mobile-app>/package.json::dependencies`, OR
- Introduces a new `import ... from "expo-*"` or `import ... from "react-native-*"`
  in production source, OR
- Adds an entry to `<mobile-app>/app.json::expo.extra` (or the
  equivalent runtime config block)

REQUIRES a boot smoke via `npx expo run:ios` (or `npx expo run:android`)
reaching first-route mount on a device or simulator without:

- `Cannot find native module '<X>'` errors
- Cascade `Route "..." is missing the required default export` warnings
- Any other native-bridge throw at module-eval time

`npx expo start --clear` (Metro bundler only) is **EXPLICITLY
DISALLOWED** as the binding signal for native-dep diffs. Metro never
instantiates native modules; it only verifies JS bundling.

If the agent cannot run `expo run:ios` from its sandboxed environment,
it MUST ask a human (the engineer driving the agent) to run it on a
device and report the outcome, BEFORE marking the REQ READY-FOR-MERGE.

Recommended companion static tests (under `<mobile-app>/__tests__/`):

- `native-dep-import-check.test.ts` — every `from "<pkg>"` in production
  source is declared in `package.json::dependencies`, plus a hard-coded
  list of known transitive native deps (e.g. `expo-auth-session/providers/google`
  requires `expo-application`).
- `expo-config-completeness.test.ts` — every `Constants.expoConfig.extra.X`
  read in production source has a matching declaration in `app.json::expo.extra`
  (empty string OK; missing key fails).

**Why this exists:** Boot-time native-module crashes (e.g. AsyncStorage,
ExpoApplication, iosClientId render-time validation) all pass the
Metro-only smoke and fail at first device load. Metro is necessary
but not sufficient.

---

## G-4. Batch-size cap on parallel REQs

**Maximum 3 parallel REQs** dispatched at any one time. Additional REQs
queue. Larger batches require explicit authorization recorded in the
REQ's `spec.md` (e.g.
`§Authorization: <approver> approved 5-REQ parallel batch on YYYY-MM-DD`).

When a batch finishes, the orchestrator (EM agent or human) drains the
next 3 from queue.

**Why this exists:** Large parallel batches absorb pre-existing
failures under "not introduced by this REQ" excuses, which then cascade
into the next batch with no device-boot smoke or missing config.
Smaller batches keep the regression surface observable.

---

## G-5. "Pre-existing failure" excuse banned

Any test failure, lint error, type error, or build warning present at
the start of a REQ must be EITHER:

- **(a) Fixed within the REQ** — added to scope, even if originally
  not declared — and noted in the dev-report `§Scope expansion`, OR
- **(b) Documented in `governance/TECH_DEBT.md`** with:
  - A retirement date (max 30 days from the REQ that surfaced it)
  - The REQ id under which it was first observed
  - The reason it cannot be fixed in this REQ (with a citation)

The phrase "pre-existing failure, not introduced by this REQ" is **NOT**
an acceptable justification for shipping READY-FOR-MERGE if the failure
is in a regression suite, lint, or type-check. Coverage reports for
unrelated files MAY note pre-existing baselines.

**Why this exists:** Tolerated "pre-existing" failures repeatedly cover
code paths that subsequently break at runtime in later REQs. The signal
was there; ignoring it costs more than fixing it.

---

## G-6 (mechanism). Design-divergence registry

Intentional deviations from the design reference are NOT prohibited.
They are **registered** in `governance/design-divergence-registry.md`
with one entry per divergence, including: file/component, what reference
says, what implementation uses, reason, approved-by (human or named TL),
date.

The G-1 visual-parity gate consults this registry. A registered
divergence PASSES automatically. An unregistered divergence FAILS.

Registry entries are **appended, not edited.** Removing or rewriting an
entry requires a new entry with `Supersedes: <id>` referring to the
prior entry. This gives an audit trail.

**Why this exists:** A strict "always match design" rule would block
legitimate platform-driven divergences (e.g., native SVG can't
reproduce CSS gaussian blur perceptually; mobile may legitimately use
different spacing tokens). The registry decouples "we know about this
divergence" from "we caused this divergence by accident."

---

## Enforcement summary

| Guardrail | Enforced by | At which gate |
|---|---|---|
| G-1 visual parity | TL (assigned), reviewer-standards | `merge-readiness.md` |
| G-2 regression-check.md | TL (assigned), checker | Dev/Test agent first deliverable |
| G-3 device boot smoke | TL-Mobile, reviewer-architecture | `merge-readiness.md` §Boot smoke |
| G-4 batch cap | EM, orchestrator | At `/em-intake` time |
| G-5 no "pre-existing" | TL (assigned), reviewer-standards | `merge-readiness.md` §Test signal |
| G-6 divergence registry | TL (assigned), reviewer-standards | At G-1 evaluation |

These guardrails are part of ROLES.md's effective contract. They take
precedence over agent-internal heuristics. Where any reviewer disagrees
with a guardrail's application, escalate to the project owner — do not
silently waive.

---

## Change log

| Date | Change | Reason |
|---|---|---|
| YYYY-MM-DD | Initial commit (G-1..G-6) | <incident-summary> |
