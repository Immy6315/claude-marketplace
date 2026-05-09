---
description: Run the gr multi-agent reviewer on a GitHub PR (preview or post)
argument-hint: <pr-url> [--show | --post] [--preset quick|standard|deep] [--repo <path>]
allowed-tools: Bash(gr:*), Bash(GH_TOKEN=*:*), Bash(which:*), Bash(curl:*), Bash(bash:*), Bash(mkdir:*), Bash(pwd), Bash(git:*), Bash(echo:*), Bash(printf:*), Bash(/Users/*:*), Bash(~/.local/bin/gr:*), Read, Glob
---

# Review PR with gr

The user wants a deep, multi-agent review of a GitHub pull request.

Arguments passed: `$ARGUMENTS`

---

## ⛔ HARD RULES — read these first

1. **NEVER** use `&&`, `||`, `;`, `|`, or `2>/dev/null` in any bash command. One operation per `Bash` tool call. Non-negotiable.
2. **NEVER** scan outside the current working directory. No `find /Users/...`, no `find ~`, no `find /`. Only Glob inside CWD.
3. **NEVER** check more than one level of subfolders. If not found in CWD or its immediate children, **ask the user immediately**.
4. Use the **Read** tool to check if a file exists.
5. Use the **Glob** tool to list folders.
6. **NEVER** ask the user for a GitHub token without first trying to auto-extract it from the repo's git config (Step 5).

---

## What to do (in this exact order)

### Step 1: Resolve the `gr` binary

a) Run **only** `which gr`. If a path is returned → use it.
b) Else, use the **Read tool** on `/Users/<username>/.local/bin/gr`.
c) Else, install once:
   ```bash
   bash <(curl -fsSL https://raw.githubusercontent.com/Immy6315/claude-marketplace/main/plugins/gr-reviewer/scripts/install.sh)
   ```

### Step 2: Parse the PR URL

```
https://github.com/<owner>/<repo>/pull/<number>
```
Extract `<owner>` and `<repo>`. If missing, ask the user and stop.

### Step 3: Resolve the repo path (LIMITED SCOPE)

If `--repo <path>` was passed, jump to Step 4.

**3a. Check current directory:**
```bash
git -C . remote get-url origin
```
If the output contains `<owner>/<repo>` → use `.`.

**3b. Check immediate subfolders only:**
Use the **Glob tool** with pattern `*/` to list direct children. For each folder name matching `<repo>` (exact, then case-insensitive):
```bash
git -C ./<folder> remote get-url origin
```
If the output contains `<owner>/<repo>` → use that path.

**3c. If not found, ASK THE USER:**
> ❌ I couldn't find a local clone of **`<owner>/<repo>`** in `<cwd>` or its immediate subfolders.
>
> Where is your local clone? Reply with:
> 1. **Absolute path** — `/Users/.../<repo>`
> 2. **Relative path** — `./some-folder`
> 3. **`clone`** — I'll clone to `/tmp/gr-<repo>`
> 4. **`cancel`** — abort

If they say `clone`:
```bash
git clone https://github.com/<owner>/<repo>.git /tmp/gr-<repo>
```

### Step 4: Validate the chosen path

```bash
git -C "<path>" rev-parse --show-toplevel
```
Then:
```bash
git -C "<path>" remote get-url origin
```
- If first fails → not a git repo, ask again.
- If origin doesn't contain `<owner>/<repo>` → warn (could be a fork), confirm.

### Step 5: AUTO-EXTRACT GitHub token from the repo (don't ask the user!)

You already have the remote URL from Step 4. Try in this order — **stop at the first one that works**:

**5a. Token embedded in remote URL.** The URL might look like:
```
https://username:ghp_xxxx@github.com/owner/repo.git
   or   https://oauth2:ghp_xxxx@github.com/owner/repo.git
   or   https://ghp_xxxx@github.com/owner/repo.git
```
If the URL contains `@github.com` AND has credentials before `@`, extract the token (everything after the last `:` before `@`, or the user-info part if no colon). Strip the username if present (token is the part that starts with `ghp_`, `gho_`, `ghu_`, `ghs_`, or `github_pat_`). Save it to `EXTRACTED_TOKEN`.

**5b. Git credential helper.** If 5a found nothing, try:
```bash
printf "protocol=https\nhost=github.com\n\n"
```
Pipe is forbidden, so do this instead — write to a temp file then read it:

Actually, just use this single command (no pipes, no operators) — `git credential fill` reads from stdin, so we have to use a heredoc-style. But heredocs require `<<EOF` which involves redirection. Skip 5b in the slash command for now.

**5c. `gh auth token`.** Try:
```bash
gh auth token
```
If it returns a token starting with `gh` or `github_pat_` → use it.

**5d. Existing env vars.** Run:
```bash
echo $GH_TOKEN
```
Then:
```bash
echo $GITHUB_TOKEN
```
If either has a value → use it.

**5e. If still no token found, ASK THE USER:**
> 🔑 I need a GitHub token to read PR #`<number>` of `<owner>/<repo>`.
>
> I checked your repo's git remote, `gh auth token`, and your env vars — nothing usable was found.
>
> **Paste your GitHub Personal Access Token** (starts with `ghp_` or `github_pat_`), or reply `cancel` to abort.
>
> Don't have one? Create at: https://github.com/settings/tokens/new with `repo` scope (and `read:org` if the repo is in an SSO org).

When they paste, save it to `EXTRACTED_TOKEN`.

### Step 6: Default to preview mode

Unless the user said "post" or passed `--post`, append `--show`.

### Step 7: Run the review (with the extracted token as env)

```bash
GH_TOKEN=<EXTRACTED_TOKEN> <gr-path> review --pr <URL> --repo <validated-path> --show
```

The `GH_TOKEN=...` prefix is a single-command env assignment, not a shell operator — it's allowed.

Stream the output. First run takes 1–3 min while specialists run in parallel.

### Step 8: After completion

- If `--show`: it was a preview. Offer to re-run without `--show` to post.
- If posted: report the GitHub URL gr emitted.
- If the user wants to persist the token for future runs (so we don't extract it each time), suggest:
  ```bash
  ! /Users/<you>/.local/bin/gr auth login
  ```
  This saves it to macOS Keychain.

---

## Token detection priority summary

```
1. Token embedded in repo's git remote URL  ← most automatic
2. gh auth token                              ← if user has gh CLI logged in
3. $GH_TOKEN / $GITHUB_TOKEN env vars         ← if exported in shell
4. ASK USER (paste PAT)                       ← last resort
```

Never skip steps 1-3 and jump straight to asking the user.
