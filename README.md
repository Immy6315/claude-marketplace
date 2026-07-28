# Immy6315's Claude Code Marketplace

A Claude Code plugin marketplace by [@Immy6315](https://github.com/Immy6315).

## Plugins

| Plugin | Description |
|---|---|
| `gr-reviewer` | Multi-agent PR reviewer that runs 7 specialist AI agents in parallel and posts inline GitHub comments. |
| `eng-org` | 5-role multi-agent engineering org (EM → Tech Leads → Domain Devs → Test agents → Reviewers). Drops a complete governance + review pipeline into any project via `/eng-org:init`. |

## Add this marketplace to Claude Code

In Claude Code:

```
/plugin marketplace add Immy6315/claude-marketplace
/plugin install gr-reviewer@immy6315-marketplace
/plugin install eng-org@immy6315-marketplace
```

That's it — Claude Code fetches and installs each plugin automatically. No extra
tooling or manual setup required.

## About

This repository is the marketplace manifest only — it lists the available
plugins and where to fetch them. The plugins themselves are distributed as
packages and are installed through the commands above; their source is
maintained privately by the author.

The marketplace `name` (`immy6315-marketplace`) is stable — users reference it
after `@` when installing.
