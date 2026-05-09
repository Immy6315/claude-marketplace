# Immy6315's Claude Code Marketplace

A Claude Code plugin marketplace by [@Immy6315](https://github.com/Immy6315).

## Plugins

| Plugin | Description |
|---|---|
| [`gr-reviewer`](./plugins/gr-reviewer) | Multi-agent PR reviewer that runs 7 specialist AI agents in parallel and posts inline GitHub comments. |

## Add this marketplace to Claude Code

In Claude Code:

```
/plugin marketplace add Immy6315/claude-marketplace
/plugin install gr-reviewer@immy6315-marketplace
```

Then follow each plugin's own README for any binary or auth setup.

## Repo layout

```
.
├── .claude-plugin/
│   └── marketplace.json          # marketplace manifest (lists plugins)
├── plugins/
│   └── gr-reviewer/
│       ├── .claude-plugin/
│       │   └── plugin.json       # plugin manifest
│       ├── commands/             # slash commands (/gr-reviewer:*)
│       ├── agents/               # subagent definitions
│       ├── scripts/              # bootstrap install scripts
│       └── README.md             # plugin docs
└── README.md
```

## Maintenance

- Bump a plugin's `version` in both `marketplace.json` and the plugin's
  `plugin.json` whenever its behaviour changes.
- Keep the marketplace `name` (`immy6315-marketplace`) stable — users
  reference it after `@` when installing.
- Plugin slash-command IDs become `/<plugin-name>:<command-file-name>`
  (file name without `.md`).
