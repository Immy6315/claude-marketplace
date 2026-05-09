---
description: Run the gr multi-agent reviewer on a GitHub PR (preview or post)
argument-hint: <pr-url> [--show | --post] [--preset quick|standard|deep] [--repo <path>]
allowed-tools: Bash(gr:*), Bash(which:*), Bash(curl:*), Bash(bash:*), Bash(test:*), Bash(mkdir:*), Bash(ls:*), Bash(pwd:*), Bash(find:*), Bash(git:*), Bash(/Users/*:*), Bash(~/.local/bin/gr:*), Read
---

# Review PR with gr

The user wants a deep, multi-agent review of a GitHub pull request.

Arguments passed: `$ARGUMENTS`

## What to do (in this exact order)

### Step 1: Resolve the `gr` binary path

Try in order:
- `which gr` → use that
- `~/.local/bin/gr` if it exists → use absolute path
- If neither exists, **auto-install** silently (no sudo, no token):
  ```bash
  bash <(curl -fsSL https://raw.githubusercontent.com/Immy6315/claude-marketplace/main/plugins/gr-reviewer/scripts/install.sh)
  ```
  Then use `~/.local/bin/gr`.

### Step 2: Parse the PR URL

The first non-flag argument must be a GitHub PR URL of the form:
```
https://github.com/<owner>/<repo>/pull/<number>
```

Extract `<owner>` and `<repo>`. If the user did not pass one, ask them for it and stop.

### Step 3: Resolve the repo path (MANDATORY auto-detection)

The user may have explicitly passed `--repo <path>`. If so, **skip auto-detection** and use that path directly (after validating it's a git repo at Step 4).

Otherwise, run the auto-detection flow:

**3a. Check current working directory first.**
```bash
pwd
git -C . rev-parse --show-toplevel 2>/dev/null
git -C . remote get-url origin 2>/dev/null
```
If the current directory is itself a git repo AND its `origin` remote matches `github.com[:/]<owner>/<repo>(\.git)?`, **use `.` and skip to Step 5**.

**3b. Look for a matching subfolder in CWD.**
```bash
ls -d */ 2>/dev/null
```
For each subfolder, check if it matches the repo name. Look for these patterns (in order of preference):
- exact: `./<repo>`
- case-insensitive: `./<repo>` ignoring case
- prefix: any folder starting with `<repo>` (e.g., `<repo>-fork`, `<repo>.git`)

For each candidate that looks like a git repo, verify:
```bash
git -C ./<candidate> remote get-url origin 2>/dev/null
```
If the origin URL matches `github.com[:/]<owner>/<repo>`, **use that path and skip to Step 5**.

**3c. Search one level deeper (optional, only if 3a and 3b found nothing).**
```bash
find . -maxdepth 2 -name .git -type d 2>/dev/null | head -20
```
For each `.git` folder found, check the parent's `git remote get-url origin`. If any matches, use it.

**3d. If still not found — ASK THE USER.**
Show them this clearly:

> ❌ Couldn't auto-detect a local clone of **`<owner>/<repo>`** in or under `<cwd>`.
>
> Found these git repos here:
> - `./os-item` (origin: gokwik/os-item)
> - `./os-order` (origin: gokwik/os-order)
> - ...
>
> **Where is your local clone of `<owner>/<repo>`?**
> Reply with one of:
> 1. An absolute path: `/Users/.../path/to/repo`
> 2. A relative path from here: `./some-folder`
> 3. `clone` — and I'll clone it for you to a temp dir
> 4. `cancel` — to abort

Wait for the user's answer. Then proceed to Step 4 with their answer.

If they say `clone`, do:
```bash
git clone https://github.com/<owner>/<repo>.git /tmp/gr-<repo>-$$
```
and use that path.

### Step 4: Validate the chosen repo path

Whatever path you ended up with (auto-detected or user-provided), verify:
```bash
git -C "<path>" rev-parse --show-toplevel
git -C "<path>" remote get-url origin
```
- If the path is not a git repo → tell the user and ask again.
- If the origin doesn't match `<owner>/<repo>` → warn the user and ask if they're sure (could be a fork). Wait for confirmation.

### Step 5: Default to preview mode

Unless the user explicitly said "post" or passed `--post`, append `--show` so nothing is posted to GitHub yet.

### Step 6: Run the review

```bash
<gr-path> review --pr <URL> --repo <validated-path> [--show] [--preset <preset>] [--specialists <list>]
```

Stream the output. The first run on a new PR may take 1–3 min while specialists run in parallel. The first review of a repo also builds the symbol graph (cached for future reviews).

### Step 7: On finish

- If `--show`: tell the user the review was a preview and offer to re-run without `--show` to post it for real.
- If a real post: report the GitHub URL gr emitted.

### Step 8: GitHub token prompt

If gr asks for a GitHub token (no env / gh / keychain token available), the user will be guided through creating a Personal Access Token in their terminal. The PAT is saved to their own macOS Keychain — never sent anywhere except GitHub's API. Do not try to handle the prompt for them.

## Summary of repo detection priority

```
1. --repo <path> flag (explicit, skips auto-detect)
2. Current dir is the matching git repo
3. ./<repo> subfolder with matching origin
4. Case-insensitive / prefix subfolder match with matching origin
5. Find under maxdepth=2 for matching origin
6. ASK THE USER (with options: path | clone | cancel)
```

Step 6 (asking the user) is mandatory — never silently skip the review or use the wrong path.
