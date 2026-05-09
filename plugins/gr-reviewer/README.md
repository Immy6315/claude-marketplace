# gr-reviewer (Claude Code plugin)

Multi-agent PR reviewer that runs **7 specialist AI agents in parallel**
(security, performance, observability, architecture, code-quality,
testing, domain), consolidates their findings, and posts inline review
comments on GitHub PRs.

This plugin is a thin wrapper around the [gr CLI](https://github.com/Immy6315/GR).

---

## Install

In Claude Code:

```
/plugin marketplace add Immy6315/claude-marketplace
/plugin install gr-reviewer@immy6315-marketplace
```

Then bootstrap the underlying `gr` binary (one time, needs Go 1.25+):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Immy6315/claude-marketplace/main/plugins/gr-reviewer/scripts/install.sh)
```

Or, if you prefer to install gr directly from source:

```bash
git clone https://github.com/Immy6315/GR.git ~/.gr-src
cd ~/.gr-src && ./scripts/install.sh
```

A binary installer (no Go required) is planned once tagged releases
are published.

---

## Use

From Claude Code, two slash commands are available:

| Command                                    | What it does                              |
|--------------------------------------------|-------------------------------------------|
| `/gr-reviewer:review-pr <PR URL> [--show]` | Review a GitHub PR. Defaults to preview.  |
| `/gr-reviewer:auth status`                 | Inspect saved GitHub credentials.         |

Or call the underlying CLI directly:

```bash
gr review --pr https://github.com/owner/repo/pull/123 --show
gr review --pr https://github.com/owner/repo/pull/123          # post for real
gr auth login
gr auth status
gr uninstall --purge                                            # remove gr
```

---

## Authentication

`gr` resolves a GitHub token at run time in this order:

1. `$GH_TOKEN`
2. `$GITHUB_TOKEN`
3. `gh auth token` (GitHub CLI)
4. `gr`'s keychain entry (set by `gr auth login` or interactive paste)
5. Interactive PAT paste (TTY only — gr prints a step-by-step guide)
6. Browser device flow (TTY only — needs `GR_OAUTH_CLIENT_ID` or a baked-in Client ID)

If the token can read the PR but lacks write scope, `gr` falls back
to printing findings in your terminal instead of failing — re-run
with a stronger token to actually post.

You do **not** need `ANTHROPIC_API_KEY`. `gr` reuses your Claude Code
OAuth login.

---

## Uninstall

From the plugin host:

```
/plugin uninstall gr-reviewer
```

To also remove the underlying CLI:

```bash
gr uninstall --purge
```

This removes both `gr` and `GR` symlinks, deletes the binary, and
clears the keychain entry. It does NOT touch your shell rc, `gh auth`
state, or Claude Code login.

---

## Links

- gr CLI repo: https://github.com/Immy6315/GR
- gr README:   https://github.com/Immy6315/GR/blob/main/README.md
- Issues:      https://github.com/Immy6315/GR/issues
