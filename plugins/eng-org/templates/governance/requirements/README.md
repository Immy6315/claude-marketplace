# governance/requirements/

One folder per Mode B requirement. Folder name is the requirement id.

## Naming

`REQ-<YYYYMMDD>-<NN>` — e.g., `REQ-20260512-01`. EM assigns the id at intake.

## Layout

```
governance/requirements/REQ-<id>/
├── spec.md                       ← EM writes (intake)
├── tl-analysis.md                ← TL writes (impact + decomposition)
│                                   (when multiple TLs: tl-<domain>-analysis.md per TL)
├── tasks/
│   ├── TASK-1-<slug>.md          ← TL writes (one per Dev assignment)
│   └── TASK-2-<slug>.md
├── implementation/
│   ├── TASK-1-diff.md            ← Dev writes (summary of code changes)
│   ├── TASK-1-blocked.md         ← Dev writes (only if scope was wrong; routes back to TL)
│   └── TASK-2-diff.md
├── tests/
│   ├── unit-report.md            ← test-unit
│   ├── integration-report.md     ← test-integration
│   ├── e2e-report.md             ← test-e2e
│   ├── regression-report.md      ← test-regression
│   └── load-report.md            ← test-load
├── reviews/
│   ├── architecture.md           ← reviewer-architecture
│   ├── security.md               ← reviewer-security
│   ├── performance.md            ← reviewer-performance
│   ├── standards.md              ← reviewer-standards
│   └── observability.md          ← reviewer-observability
├── merge-readiness.md            ← TL writes (composite verdict)
└── em-summary.md                 ← EM writes (Imran-facing)
```

## Who writes which file

See `governance/ROLES.md` §2 for the full contract. Cliff notes:

| File | Owner | Required after |
|---|---|---|
| `spec.md` | EM | requirement intake |
| `tl-analysis.md` (per TL) | TL | spec.md |
| `tasks/TASK-N-*.md` | TL | tl-analysis.md |
| `implementation/TASK-N-diff.md` | Dev | task assignment |
| `tests/<type>-report.md` | Test agent | implementation done |
| `reviews/<reviewer>.md` | Reviewer agent | tests green |
| `merge-readiness.md` | TL | all reviews APPROVED |
| `em-summary.md` | EM | merge-readiness READY |

## Templates

Templates for every file type live in `governance/ROLES.md`:
- `spec.md` — §2.1
- `tl-analysis.md` — §2.2
- `TASK-N-*.md` and `TASK-N-diff.md` — §2.3
- `<type>-report.md` — §2.4
- `<reviewer>.md` — §2.5
- `merge-readiness.md` — §4
- `em-summary.md` — §2.1

## Lifecycle

1. **Open** — `spec.md` exists, `em-summary.md` does not. Active work.
2. **In review** — `merge-readiness.md` exists, `em-summary.md` does not.
3. **Awaiting Imran** — `em-summary.md` exists, no merge mark yet.
4. **Closed** — append `## Outcome` to `em-summary.md` with the merge decision (merged / rejected / deferred). Folder becomes read-only thereafter.

## Audit trail

`governance/.audit/REQ-<id>/` contains agent invocation logs:
`<timestamp>-<agent-name>-<invocation-id>.md`. Append-only.

## Mode-A sessions are NOT here

Mode A trivial changes use the existing `governance/sessions/` +
`governance/reviews/` flow. This folder is exclusively for Mode B.
