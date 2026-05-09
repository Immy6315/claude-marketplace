# Immy6315's Claude Code Marketplace

A Claude Code plugin marketplace by [@Immy6315](https://github.com/Immy6315).

## Plugins

| Plugin | Description |
|---|---|
| [`gr-reviewer`](./plugins/gr-reviewer) | Multi-agent PR reviewer that runs 7 specialist AI agents in parallel and posts inline GitHub comments. |
| [`eng-org`](./plugins/eng-org) | 5-role multi-agent engineering org (EM → Tech Leads → Domain Devs → Test agents → Reviewers). Drops a complete governance + review pipeline into any project via `/eng-org:init`. |

## Add this marketplace to Claude Code

In Claude Code:

```
/plugin marketplace add Immy6315/claude-marketplace
/plugin install gr-reviewer@immy6315-marketplace
/plugin install eng-org@immy6315-marketplace
```

Then follow each plugin's own README for any binary or auth setup.

## Repo layout

```
.
├── .claude-plugin/
│   └── marketplace.json          # marketplace manifest (lists plugins)
├── plugins/
│   ├── gr-reviewer/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json       # plugin manifest
│   │   ├── commands/             # slash commands (/gr-reviewer:*)
│   │   ├── agents/               # subagent definitions
│   │   ├── scripts/              # bootstrap install scripts
│   │   └── README.md             # plugin docs
│   └── eng-org/
│       ├── .claude-plugin/
│       │   └── plugin.json
│       ├── agents/               # 16 specialist subagents (devs/tests/reviewers/em)
│       ├── commands/             # slash commands (/eng-org:*)
│       ├── templates/            # per-project files written by /eng-org:init
│       └── README.md
└── README.md
```

## Maintenance

- Bump a plugin's `version` in both `marketplace.json` and the plugin's
  `plugin.json` whenever its behaviour changes.
- Keep the marketplace `name` (`immy6315-marketplace`) stable — users
  reference it after `@` when installing.
- Plugin slash-command IDs become `/<plugin-name>:<command-file-name>`
  (file name without `.md`).
