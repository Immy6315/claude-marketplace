---
description: Run the gr multi-agent reviewer on a GitHub PR (preview or post)
argument-hint: <pr-url> [--show | --post] [--preset quick|standard|deep]
allowed-tools: Bash(gr:*), Bash(which:*), Read
---

# Review PR with gr

The user wants a deep, multi-agent review of a GitHub pull request.

Arguments passed: `$ARGUMENTS`

## What to do

1. **Check `gr` is installed.** Run `which gr`. If it is missing, do NOT
   try to install it silently — tell the user to run the plugin's
   one-liner installer (see "Bootstrap" below) and stop.

2. **Parse the arguments.** The first non-flag argument must be a GitHub
   PR URL of the form `https://github.com/<owner>/<repo>/pull/<n>`. If
   the user did not pass one, ask them for it.

3. **Default to preview.** Unless the user explicitly said "post" or
   passed `--post`, append `--show` so nothing is posted to GitHub yet.
   This matches the gr "show first, then post" workflow.

4. **Run the review.** Use the Bash tool:

   ```
   gr review --pr <URL> [--show] [--preset <preset>] [--specialists <list>]
   ```

   Stream the output as-is. The first run on a new PR may take 1–3 min
   while specialists run in parallel.

5. **On finish:**
   - If `--show`: tell the user the review was a preview and offer to
     re-run without `--show` to post it for real.
   - If a real post: report the GitHub URL gr emitted.

6. **If gr prompts for a GitHub token** (no env / gh / keychain token
   could read the PR), the user will see step-by-step instructions in
   their terminal. Do not try to handle the prompt for them.

## Bootstrap (only if `gr` not installed)

Tell the user to run **one** of these:

```bash
# Source install (needs Go 1.25+)
git clone https://github.com/Immy6315/GR.git ~/.gr-src && \
  cd ~/.gr-src && ./scripts/install.sh

# Or, if the binary install script is published:
bash <(curl -fsSL https://raw.githubusercontent.com/Immy6315/claude-marketplace/main/plugins/gr-reviewer/scripts/install.sh)
```

Then:

```bash
gr --help
gr auth login    # one-time, optional — runtime fallback handles it too
```
