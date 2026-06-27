# governance/capabilities/

A durable, cross-machine ledger of **what this project can already do** —
one append-only file per machine. It exists so any agent (including a
fresh Claude on a *different* machine that has only synced the repo) can,
**before** starting new work, answer: "does this feature already exist?"

## Why per-machine sharding

Each machine writes only to its own `<MID>.md` file, where `MID` is the
4-char machine token used in requirement ids
(`(scutil --get LocalHostName 2>/dev/null || hostname) | shasum | cut -c1-4`).
Two machines that share the same synced `governance/` folder never append
to the same file, so the ledger never produces git merge conflicts. To get
the *complete* picture, an agent reads **every** `governance/capabilities/*.md`,
not just its own.

## File format

`governance/capabilities/<MID>.md` — one capability per line, append-only:

```
- [REQ-<id>] <feature title> — <one-line of what it does for the user> — status: in-progress | shipped | rejected — date: <YYYY-MM-DD>
```

Example (`governance/capabilities/d904.md`):

```
- [REQ-20260627-d904-01] Public app-store browsing — logged-out visitors can browse + search the full catalog and view app detail/permissions without login — status: shipped — date: 2026-06-27
- [REQ-20260628-d904-01] Bulk CSV product import — merchants upload a CSV to create/update products in batch — status: in-progress — date: 2026-06-28
```

## Lifecycle (maintained by the pipeline, not by hand)

1. **Intake** — when the EM opens a requirement (`/eng-org:em-intake` or
   `/eng-org:bug-intake`), it appends one line with `status: in-progress`.
2. **Ship** — when the EM writes `em-summary.md`
   (`/eng-org:em-summary`), it flips that line to `status: shipped`.
3. **Reject / abandon** — if the requirement is closed without merge, the
   EM flips the line to `status: rejected` (keep the line — a rejected idea
   is still useful history).

## The duplicate-check gate (the whole point)

Before assigning a new REQ id, the EM **must** read every
`governance/capabilities/*.md` (plus scan existing
`requirements/*/spec.md` titles) and judge whether the new request
semantically overlaps an existing capability. If it does, the EM does
**not** silently create a duplicate REQ — it surfaces the match to the
human and asks whether to skip, enhance the existing feature, or
deliberately build a new one anyway. See `ROLES.md` §2.1 and the
`em-intake` / `bug-intake` commands for the exact gate.

This is what lets a Claude on machine B say "that's already built
(REQ-X)" when asked to build something machine A already shipped — as
long as the repo (and therefore this ledger) is synced.
