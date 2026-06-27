---
description: Push governance/context changes to the shared context repo (cross-machine sync). Self-skips if no repo is configured.
---

You are running the **context sync**. It pushes this project's shared
context (governance/ + CLAUDE.md + .claude/) to its git remote so other
machines can pull an identical context.

It is **safe to run anywhere**: if this project is not a git repo with a
remote, it skips quietly and changes nothing. This is the "only if a
repository exists" gate — not every project has set one up.

Optional argument: `$ARGUMENTS` — a commit message or REQ id
(e.g. `REQ-20260627-a3f9-01 intake`). If empty, auto-summarise.

Steps (run against the repo root):

1. **Resolve repo root + guard — never error, only skip.**
   - `ROOT=$(git rev-parse --show-toplevel 2>/dev/null)`. If this is
     empty (not a git repo), print `[sync] skipped — no git repo` and STOP.
   - `git -C "$ROOT" remote get-url origin 2>/dev/null`. If empty (no
     remote), print `[sync] skipped — no 'origin' remote` and STOP.

2. **Pull first** so you build on the other machine's latest, never clobber it:
   `git -C "$ROOT" pull --ff-only`.
   - If it fails as a non-fast-forward (histories diverged), STOP, surface
     the divergence, and ask the user how to reconcile. Never force,
     never `reset --hard`, never blind-merge.
   - If it fails on auth / offline, print the skip reason and STOP (do not
     block the pipeline).

3. **Stage:** `git -C "$ROOT" add -A`.
   - The repo's `.gitignore` is expected to exclude code sub-repos,
     secrets, and build output. If you can see that code folders are NOT
     gitignored, WARN the user and stop before committing — do not push
     code through the context repo.

4. If nothing staged (`git -C "$ROOT" diff --cached --quiet` succeeds),
   print `[sync] nothing to sync` and STOP.

5. **Commit.** Show the user a one-line summary (staged file count + key
   paths). message = `$ARGUMENTS` if provided, else a short auto summary
   (`context sync: <n> files`). Commit with the repo's configured git
   identity.

6. **Push:** `git -C "$ROOT" push`. If rejected because the remote moved,
   go back to step 2 (pull) and retry — never force.

7. Report the pushed commit sha + remote URL, or the skip reason.

Hard rules: never force-push, never push gitignored code, never bypass the
fast-forward check. This command does not manage tokens — auth is whatever
the repo's git credentials already provide.
