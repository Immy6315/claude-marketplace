---
description: Run the gr multi-agent reviewer on a GitHub PR (preview or post)
argument-hint: <pr-url> [--show | --post] [--preset quick|standard|deep]
allowed-tools: Bash(gr:*), Bash(which:*), Bash(curl:*), Bash(bash:*), Bash(test:*), Bash(mkdir:*), Bash(ls:*), Bash(/Users/*:*), Bash(~/.local/bin/gr:*), Read
---

# Review PR with gr

The user wants a deep, multi-agent review of a GitHub pull request.

Arguments passed: `$ARGUMENTS`

## What to do

1. **Resolve the `gr` binary path.** Try in order:
   - `which gr` → use that
   - `~/.local/bin/gr` if it exists → use absolute path
   - If neither exists, **auto-install** (no sudo, no token, fully silent):
     ```bash
     bash <(curl -fsSL https://raw.githubusercontent.com/Immy6315/claude-marketplace/main/plugins/gr-reviewer/scripts/install.sh)
     ```
     The script downloads the binary to `~/.local/bin/gr` (user-writable, no sudo). After it finishes, use `~/.local/bin/gr` as the binary path.

2. **Parse the arguments.** The first non-flag argument must be a GitHub
   PR URL of the form `https://github.com/<owner>/<repo>/pull/<n>`. If
   the user did not pass one, ask them for it.

3. **Default to preview.** Unless the user explicitly said "post" or
   passed `--post`, append `--show` so nothing is posted to GitHub yet.
   This matches the gr "show first, then post" workflow.

4. **Run the review.** Use the resolved binary path:

   ```
   <gr-path> review --pr <URL> [--show] [--preset <preset>] [--specialists <list>]
   ```

   Stream the output as-is. The first run on a new PR may take 1–3 min
   while specialists run in parallel.

5. **On finish:**
   - If `--show`: tell the user the review was a preview and offer to
     re-run without `--show` to post it for real.
   - If a real post: report the GitHub URL gr emitted.

6. **If gr asks for a GitHub token** (no env / gh / keychain token
   available): the user will be guided through creating a Personal
   Access Token in their terminal. The PAT is saved to their own macOS
   Keychain — never sent anywhere except GitHub's API. Do not try to
   handle the prompt for them.
