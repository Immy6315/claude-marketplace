---
description: Run the gr multi-agent reviewer on a GitHub PR (preview or post)
argument-hint: <pr-url> [--show | --post] [--preset quick|standard|deep] [--repo <path>]
allowed-tools: Bash(gr:*), Bash(which:*), Bash(curl:*), Bash(bash:*), Bash(test:*), Bash(mkdir:*), Bash(ls:*), Bash(pwd:*), Bash(find:*), Bash(git:*), Bash(/Users/*:*), Bash(~/.local/bin/gr:*), Read, Glob
---

# Review PR with gr

The user wants a deep, multi-agent review of a GitHub pull request.

Arguments passed: `$ARGUMENTS`

## What to do (in this exact order — keep each shell command SIMPLE, no `&&`, `||`, or `2>/dev/null`)

### Step 1: Resolve the `gr` binary path

Do these as separate tool calls:

a) Try `which gr` — if it returns a path, use it.
b) Else, use the **Read tool** (NOT bash) to check if `~/.local/bin/gr` exists.
c) If neither exists, auto-install with this single command:
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Immy6315/claude-marketplace/main/plugins/gr-reviewer/scripts/install.sh)
```
After install, use `~/.local/bin/gr`.

### Step 2: Parse the PR URL

The first non-flag argument must be of the form:
```
https://github.com/<owner>/<repo>/pull/<number>
```
Extract `<owner>` and `<repo>`. If missing, ask the user and stop.

### Step 3: Resolve the repo path (MANDATORY auto-detection)

If the user passed `--repo <path>`, skip auto-detect and jump to Step 4.

Otherwise, run these checks **sequentially**, one bash command at a time, **no shell operators**:

**3a. Check current directory.** Run each command separately:
```bash
pwd
```
```bash
git -C . remote get-url origin
```
If the second command succeeds and the URL contains `<owner>/<repo>`, use `.` and skip to Step 5.

**3b. Look for a matching subfolder.** Use the **Glob tool** (NOT bash find) with pattern `*` to list subfolders. For each candidate that matches `<repo>` (exact, then case-insensitive, then prefix match):
```bash
git -C ./<candidate> remote get-url origin
```
If the URL contains `<owner>/<repo>`, use that path and skip to Step 5.

**3c. One level deeper.** Use the **Glob tool** with pattern `*/.git` to find nested git repos. For each match's parent directory:
```bash
git -C ./<parent> remote get-url origin
```
If the URL matches, use that path.

**3d. If still not found — ASK THE USER.**

First, build a list of git repos in CWD by running this for each subfolder you saw in Step 3b:
```bash
git -C ./<folder> remote get-url origin
```
Collect successful results into a list.

Then ask the user (use plain natural language, no shell):

> ❌ Couldn't auto-detect a local clone of **`<owner>/<repo>`**.
>
> Git repos found here:
> - `./os-item` → gokwik/os-item
> - `./os-order` → gokwik/os-order
> - ...
>
> **Where is your local clone of `<owner>/<repo>`?** Reply with one of:
> 1. An absolute path: `/Users/.../path/to/repo`
> 2. A relative path: `./some-folder`
> 3. `clone` — and I'll clone it for you to a temp dir
> 4. `cancel` — to abort

Wait for the user's answer.

If they say `clone`:
```bash
git clone https://github.com/<owner>/<repo>.git /tmp/gr-<repo>
```
Then use `/tmp/gr-<repo>` as the path.

### Step 4: Validate the chosen repo path

Run **separately**:
```bash
git -C "<path>" rev-parse --show-toplevel
```
```bash
git -C "<path>" remote get-url origin
```
- If the first fails → not a git repo, tell the user and ask again.
- If the origin doesn't contain `<owner>/<repo>` → it's likely a fork; warn the user and ask if they want to proceed.

### Step 5: Default to preview mode

If the user did NOT explicitly say "post" or pass `--post`, append `--show` so nothing is posted to GitHub yet.

### Step 6: Run the review

```bash
<gr-path> review --pr <URL> --repo <validated-path> --show
```
(Drop `--show` if the user wanted to post.)

Stream the output. The first run on a new PR may take 1–3 min. The first review of a repo also builds the symbol graph (cached for future reviews).

### Step 7: On finish

- If `--show`: tell the user it was a preview, offer to re-run without `--show` to post for real.
- If posted: report the GitHub URL gr emitted.

### Step 8: GitHub token prompt

If gr asks for a GitHub token, the user will be guided through creating a Personal Access Token in their terminal. The PAT is saved to their own macOS Keychain — never sent anywhere except GitHub's API. Do not try to handle the prompt for them.

## Repo detection priority

```
1. --repo <path> flag        → explicit, skip auto-detect
2. Current dir's git remote matches owner/repo
3. ./<repo> subfolder with matching origin
4. Case-insensitive / prefix subfolder match
5. One level deeper (Glob for */.git)
6. ASK USER (mandatory) — options: path | clone | cancel
```

## ⚠️ Shell command rules (avoid auto-prompt)

- **Never** use `&&`, `||`, `;`, `|`, or `2>/dev/null` in a single bash command — Claude Code asks for approval on every compound command.
- One operation per `Bash` tool call. Use the LLM's reasoning to chain them.
- Use the **Read** or **Glob** tools instead of `test -f`, `ls -la`, or `find`.
