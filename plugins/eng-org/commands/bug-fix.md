---
description: Mode C bug-flow — TL writes 1-paragraph analysis, dispatches 1 Dev, Dev writes fix + regression test.
---

You are running the **TL → Dev** phase of the eng-org Mode C bug-fix
flow.

The requirement id is: $ARGUMENTS (e.g., `REQ-20260509-02`).

See `plugins/eng-org/MODE_C.md` for the full Mode C contract.

---

## Steps

### 1. Verify Mode C still applies

Read `governance/requirements/REQ-<id>/spec.md`. Confirm:

- `mode: C` in frontmatter
- All eligibility boxes checked
- Suspected files list is present

If the spec is Mode B, refuse — direct user to `/eng-org:tl-analyze`.
If the spec is Mode C but eligibility is broken (e.g., user wrote
`mode: C` but the file list includes `mobile/lib/auth.ts`), refuse and
tell the user to re-run `/eng-org:bug-intake`.

### 2. Spawn the assigned TL (1 cold subagent)

Per `spec.md`'s `## Assigned TL`, spawn a fresh subagent of that TL
type (e.g., `tl-mobile`, `tl-auth`).

Brief the TL with:

> Mode C bug fix. Read `governance/requirements/REQ-<id>/spec.md` and
> `plugins/eng-org/MODE_C.md`. Then write
> `governance/requirements/REQ-<id>/tl-analysis.md` with EXACTLY:
>
> 1. **Root cause hypothesis** — 1-2 sentences. Cite the file:line that's
>    likely broken.
> 2. **Fix scope** — list the files you expect the Dev to modify (must
>    be ≤ 3, or ≤ 5 with explicit one-line justification).
> 3. **Safety re-check** — re-confirm the 5 Mode C eligibility conditions
>    against the actual code you just read. If any fail now that you've
>    looked at code, mark `escalate: true` and stop. Do NOT proceed to
>    Dev dispatch.
> 4. **Dev type** — one of: `dev-postgres-drizzle`, `dev-trpc`,
>    `dev-domain`, `dev-expo-rn`, `dev-ui-animation`. Pick the one whose
>    surface the fix lives in.
> 5. **Dev brief** — exactly what the Dev needs: failing reproducer
>    location, suspected fix location, regression-test target file.
>
> Keep tl-analysis.md to ~30 lines. This is Mode C; brevity is the
> point.

### 3. If TL says `escalate: true`

The TL detected a hidden Mode B condition while reading the actual
code. Do NOT spawn a Dev. Print the escalation reason and tell the user:

> "TL escalated to Mode B because: [reason from tl-analysis.md].
> Please run `/eng-org:em-intake` to restart with Mode B."

Mark `governance/requirements/REQ-<id>/spec.md` with a footer note:
"ESCALATED-TO-MODE-B at TL phase: [reason]." Stop.

### 4. Spawn 1 Dev (1 cold subagent)

Per the TL's `## Dev type`, spawn a fresh Dev subagent. Brief it with:

> Mode C bug fix. Read `governance/requirements/REQ-<id>/spec.md` and
> `governance/requirements/REQ-<id>/tl-analysis.md`. Then:
>
> 1. **Implement the fix** in exactly the files the TL listed. Do not
>    drift. Do not refactor adjacent code. Do not add comments unless
>    they explain something non-obvious in the fix itself.
> 2. **Write a regression test** that:
>    - FAILS deterministically against the broken code (without your fix)
>    - PASSES with your fix applied
>    Place it where the project's regression tests live (e.g.,
>    `<lang>/__tests__/regression/REQ-<id>-regression.test.<ext>`).
> 3. **Verify locally** — run the test once with the fix to confirm
>    GREEN. If you can't get GREEN, surface the blocker and stop.
> 4. **Write `governance/requirements/REQ-<id>/dev-report.md`** — keep
>    to ~20 lines max:
>    - What changed (file:line cites)
>    - Regression test path
>    - 1-line confirmation: "Test FAILS without fix, PASSES with fix"
>    - Anything you refused to do (scope creep avoided)
>    - Any "while I'm here" temptations you noticed (note them; do NOT
>      act on them — those are separate REQs)
> 5. **Update `spec.md` frontmatter** to `status: implemented`.
>
> If during implementation you discover the fix actually requires
> touching auth/PII/schema/deps, or grows beyond 3-5 files, STOP and
> mark `escalate: true` in dev-report.md. Do not partial-implement.

### 5. If Dev says `escalate: true`

Same as TL escalation — surface to user, mark spec, stop. Do not
proceed to `/bug-verify`.

### 6. On Dev completion

Print:

> "Dev done for REQ-<id>. Run `/eng-org:bug-verify REQ-<id>` to run
> regression test, unit test (if applicable), and 1 reviewer."

Do NOT spawn tests/reviewer in this command.
