# Design-divergence registry (binding)

> Append-only registry of intentional deviations from the design
> reference (`<design-source>`). The G-1 visual-parity gate (see
> `GUARDRAILS.md`) consults this file: a registered divergence PASSES
> automatically, an unregistered divergence FAILS.
>
> **Rules:**
> 1. Entries are **appended, not edited.** Superseding an entry
>    requires a new entry with `Supersedes: <id>` referencing the prior
>    one.
> 2. Every entry MUST be approved by the project owner or a named TL
>    **before** being registered. Self-approval by a Dev agent is not
>    permitted.
> 3. Entries undergo a 6-month review: any entry older than 6 months
>    that is still active must be re-confirmed or replaced.
> 4. Removing an entry without a superseder is allowed ONLY when the
>    underlying divergence has been eliminated (i.e., implementation
>    now matches reference). The remover MUST note the REQ id that
>    closed the gap.

---

## Entry format

```markdown
## DIV-<YYYYMMDD>-<n> — <short title>

- **Date:** YYYY-MM-DD
- **Scope:** <file:line> or <component> or <screen>
- **Reference says:** <what the design source renders / specifies>
- **Mobile/web uses:** <what the native implementation does instead>
- **Reason:** <why the divergence exists — platform constraint,
  product decision, accessibility, etc.>
- **Approved by:** <owner / TL-Mobile / TL-Auth / etc.>
- **Supersedes:** <DIV-id or "none">
- **Status:** active | proposed | retired (with retirement REQ if
  applicable)
```

---

## Active entries

<!-- New entries are appended below this line. -->

(none)

---

## Retired entries

<!-- Retired entries (implementation now matches reference, or
divergence superseded). -->

(none)
