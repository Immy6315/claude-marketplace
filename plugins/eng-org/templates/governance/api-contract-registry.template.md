# API-contract registry (binding)

> Append-only registry of intentional changes to an API response
> contract. The G-7 contract-parity gate (see `GUARDRAILS.md`) consults
> this file: a registered change PASSES automatically, an unregistered
> change FAILS.
>
> **Rules:**
> 1. Entries are **appended, not edited.** Superseding an entry
>    requires a new entry with `Supersedes: <id>` referencing the prior
>    one.
> 2. Every entry MUST be approved by the project owner or a named TL
>    **before** being registered. Self-approval by a Dev agent is not
>    permitted.
> 3. A registry entry can NEVER waive a **private-field leak on a
>    public / unauthenticated endpoint** (G-7, last verdict row). That
>    is always a BLOCK — fix it, do not register it.
> 4. Every entry MUST state whether the change is **breaking** for
>    existing consumers. Breaking changes require an explicit owner
>    signoff and a migration/notice note.
> 5. Removing an entry without a superseder is allowed ONLY when the
>    underlying contract change has been reverted (i.e., the endpoint
>    now matches the prior baseline). The remover MUST note the REQ id
>    that reverted it.

---

## Baselines

Stored response snapshots (the "left" side of every G-7 diff) live under:

```
governance/api-contracts/<service>/<METHOD>__<path-slug>.snapshot.json
```

Each snapshot is the **normalized** response body for a fixed request
fixture (volatile fields — timestamps, uuids, auto-increment ids,
cursors, nonces — already stripped by `governance/scripts/contract-diff.mjs`).
A snapshot is updated only when an intentional change is registered
below, or when a net-new endpoint captures its first baseline.

---

## Entry format

```markdown
## CONTRACT-<YYYYMMDD>-<n> — <METHOD> <path> — <short title>

- **Date:** YYYY-MM-DD
- **Endpoint:** <METHOD> <path>  (e.g. `GET /api/apps`)
- **Auth:** public | authenticated | admin
- **Baseline returned:** <what the prior snapshot contained for the
  changed field(s)>
- **New contract returns:** <what the response returns now>
- **Change type:** field-added | field-removed | field-renamed |
  type-changed | value-semantics-changed
- **Breaking for consumers?:** yes | no  (if yes: migration/notice note)
- **Reason:** <why the contract changed — product decision, new field
  requested, cleanup, etc.>
- **REQ:** REQ-<id>
- **Approved by:** <owner / TL-<domain>>
- **Supersedes:** <CONTRACT-id or "none">
- **Status:** active | proposed | reverted (with reverting REQ if
  applicable)
```

---

## Active entries

<!-- New entries are appended below this line. -->

(none)

---

## Reverted entries

<!-- Reverted entries (endpoint now matches a prior baseline, or entry
superseded). -->

(none)
