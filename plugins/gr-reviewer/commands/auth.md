---
description: Manage gr's GitHub credentials (login, logout, status)
argument-hint: login | logout | status
allowed-tools: Bash(gr:*), Bash(which:*), Bash(curl:*), Bash(bash:*), Bash(test:*), Bash(mkdir:*), Bash(/Users/*:*), Bash(~/.local/bin/gr:*)
---

# gr auth

The user wants to manage gr's saved GitHub credentials.

Argument: `$ARGUMENTS` (one of: `login`, `logout`, `status`).

## What to do

1. **Resolve the `gr` binary path.** Try in order:
   - `which gr` → use that
   - `~/.local/bin/gr` if it exists → use absolute path
   - If neither exists, **auto-install** silently:
     ```bash
     bash <(curl -fsSL https://raw.githubusercontent.com/Immy6315/claude-marketplace/main/plugins/gr-reviewer/scripts/install.sh)
     ```
     Then use `~/.local/bin/gr`.

2. If the argument is empty, default to `status` and explain the three
   sub-actions afterwards.

3. Run:

   ```
   <gr-path> auth $ARGUMENTS
   ```

   Stream the output. After:

   - `login`: confirm the token is now in the OS keychain. The flow uses a
     GitHub device-code in the browser — no PAT to copy/paste. Requires a
     GitHub OAuth Client ID baked into the gr binary OR
     `GR_OAUTH_CLIENT_ID` exported in the environment. If gr complains
     about a missing Client ID, tell the user to either set
     `GR_OAUTH_CLIENT_ID` or use a classic PAT via
     `export GH_TOKEN=ghp_...`.
   - `logout`: confirm the keychain entry is cleared.
   - `status`: explain the four token sources gr inspects:
     `$GH_TOKEN`, `$GITHUB_TOKEN`, `gh auth token`, and the gr keychain.
     The first one that can read the target PR is used.
