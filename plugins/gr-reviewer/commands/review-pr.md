---
description: Run the gr multi-agent reviewer on a GitHub PR (preview or post)
argument-hint: <pr-url> [--show | --post] [--preset quick|standard|deep] [--repo <path>]
allowed-tools: Bash(gr:*), Bash(which:*), Bash(curl:*), Bash(bash:*), Bash(mkdir:*), Bash(pwd), Bash(git:*), Bash(/Users/*:*), Bash(~/.local/bin/gr:*), Read, Glob
---

# Review PR with gr

The user wants a deep, multi-agent review of a GitHub pull request.

Arguments passed: `$ARGUMENTS`

---

## ⛔ HARD RULES — read these first

1. **NEVER** use `&&`, `||`, `;`, `|`, or `2>/dev/null` in any bash command. One operation per `Bash` tool call. This is non-negotiable.
2. **NEVER** scan outside the current working directory. No `find /Users/...`, no `find ~`, no `find /`. Only Glob inside CWD.
3. **NEVER** check more than one level of subfolders. If not found in CWD or its immediate children, **ask the user immediately**.
4. Use the **Read** tool (not `test -f`, not `ls`) to check if a file exists.
5. Use the **Glob** tool (not `find`, not `ls -d`) to list folders.

---

## What to do (in this exact order)

### Step 1: Resolve the `gr` binary

a) Run **only** `which gr` (no operators, nothing else).
   - If it returns a path → use it. Done.
b) Else, use the **Read tool** on `/Users/<username>/.local/bin/gr` to check existence.
   - If it exists → use that absolute path.
c) Else, install once:
   ```bash
   bash <(curl -fsSL https://raw.githubusercontent.com/Immy6315/claude-marketplace/main/plugins/gr-reviewer/scripts/install.sh)
   ```
   Then use `~/.local/bin/gr`.

### Step 2: Parse the PR URL

The first non-flag argument must be:
```
https://github.com/<owner>/<repo>/pull/<number>
```
Extract `<owner>` and `<repo>`. If missing, ask the user and stop.

### Step 3: Resolve the repo path (LIMITED SCOPE — CWD only)

If the user passed `--repo <path>`, skip auto-detect and jump to Step 4.

Otherwise:

**3a. Check current directory.** Run **only**:
```bash
git -C . remote get-url origin
```
If the output contains `<owner>/<repo>` → use `.` and skip to Step 5.

**3b. Check immediate subfolders only (no deeper, no broader).**
Use the **Glob tool** with pattern `*/` (one level only) to list direct children of CWD.
For each folder name that equals `<repo>` (exact, then case-insensitive), run **only**:
```bash
git -C ./<folder> remote get-url origin
```
If a match is found → use that folder and skip to Step 5.

**3c. If not found, ASK THE USER IMMEDIATELY.** Do **NOT** search further. Do **NOT** run `find` anywhere.

Tell the user, in plain prose:

> ❌ I couldn't find a local clone of **`<owner>/<repo>`** in your current folder (`<cwd>`) or its immediate subfolders.
>
> Where is your local clone of `<owner>/<repo>`? Reply with one of:
>
> 1. **Absolute path** — e.g., `/Users/<you>/code/<repo>`
> 2. **Relative path from here** — e.g., `./some-folder`
> 3. **`clone`** — and I'll clone it into `/tmp/gr-<repo>`
> 4. **`cancel`** — to abort

Wait for the user's reply. Then go to Step 4 with whatever path they gave.

If they reply `clone`:
```bash
git clone https://github.com/<owner>/<repo>.git /tmp/gr-<repo>
```
Use `/tmp/gr-<repo>` as the path.

### Step 4: Validate the chosen repo path

Run **separately**:
```bash
git -C "<path>" rev-parse --show-toplevel
```
Then:
```bash
git -C "<path>" remote get-url origin
```
- If the first command fails → not a git repo, tell the user, ask again.
- If the origin doesn't contain `<owner>/<repo>` → likely a fork; warn the user, ask if they want to proceed.

### Step 5: Default to preview mode

Unless the user said "post" or passed `--post`, append `--show`.

### Step 6: Run the review

```bash
<gr-path> review --pr <URL> --repo <validated-path> --show
```

Stream the output. First run on a new PR may take 1–3 min while specialists run in parallel.

### Step 7: After completion

- If `--show`: tell the user it was a preview, offer to re-run without `--show` to post.
- If posted: report the GitHub URL gr emitted.

### Step 8: GitHub token prompt

If gr asks for a GitHub token, the user will be guided through creating a Personal Access Token in their terminal. The PAT is saved to their own macOS Keychain — never sent anywhere except GitHub's API. Don't try to handle the prompt for them.

---

## Detection priority summary

```
1. --repo <path> flag        → explicit, use it
2. CWD's git remote          → matches owner/repo? use "."
3. Immediate subfolder       → matches ./<repo> with right origin? use it
4. ASK USER                  → path | clone | cancel  ← STOP SEARCHING HERE
```
