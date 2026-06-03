# Sentinel — Auto-Generate Unit Tests with Claude

A Go binary that scans uncovered code in your repo and spawns Claude (or Codex)
to write unit tests until coverage hits a target. Designed for our NestJS / Go
backends.

---

## Where it lives

```
Binary:   /Users/imrankhan/Desktop/Gokwik-Github/sentinel/bin/sentinel
Source:   /Users/imrankhan/Desktop/Gokwik-Github/sentinel/
Cache:    .sentinel/  (created in each repo when you run it)
```

---

## How it works (one-liner)

1. Reads your jest config / Go test setup.
2. Runs coverage to see what's uncovered.
3. Splits uncovered files into batches.
4. For each batch, spawns Claude (Sonnet) in parallel with a prompt:
   *"Write unit tests for these functions to bring coverage to X%."*
5. Validates generated tests by running them.
6. Retries failed batches up to `--max-iterations` times.
7. Optionally runs mutation testing to verify test quality.

---

## Quickstart — generate tests in any repo

```bash
cd ~/Desktop/Gokwik-Github/<repo-name>     # e.g. os-item

/Users/imrankhan/Desktop/Gokwik-Github/sentinel/bin/sentinel pipeline \
  --preset strict \
  --max-parallel 1 \
  --resume
```

That's it. It will:
- detect TypeScript/Jest automatically
- find uncovered files
- generate tests using Claude
- write them to `unit-testcases/unit/` (or your repo's test dir)
- validate by running `npm test`

---

## Common flags

| Flag | Purpose |
|------|---------|
| `--preset strict` | Target = 95% line, 80% per-file (recommended) |
| `--preset standard` | Target = 80% line, 60% per-file |
| `--preset legacy` | Default, lenient |
| `--max-parallel 1` | Safe on 16 GB Mac. Use 2-4 if you have 32+ GB |
| `--resume` | Skip already-completed batches in `.sentinel/` cache |
| `--skip-mutation` | Faster; skips mutation testing step |
| `--generate-only` | Only generate tests, don't validate |
| `--language typescript` | Force language if auto-detect fails (e.g. no package.json) |
| `--max-iterations 3` | How many generate→validate retry cycles per batch |
| `--max-batch-functions 100` | Split big packages so Claude doesn't run out of context |

---

## Recommended runs

### Fresh repo, want max coverage
```bash
sentinel pipeline --preset strict --max-parallel 1 --max-iterations 3
```

### Resume after interruption / rate limit
```bash
sentinel pipeline --preset strict --max-parallel 1 --resume
```

### Just check current coverage (no generation)
```bash
sentinel check
```

### Generate fast, skip mutation
```bash
sentinel pipeline --preset strict --max-parallel 1 --skip-mutation --resume
```

---

## What to tell Claude (paste this prompt)

> I want you to use Sentinel to generate unit tests for the current repo and
> reach **95% coverage**. Sentinel binary is at
> `/Users/imrankhan/Desktop/Gokwik-Github/sentinel/bin/sentinel`.
>
> Before running, please:
> 1. Confirm we're in a backend repo (check for `package.json` or `go.mod`).
> 2. Read `./mistakes.md` if it exists — past Sentinel runs may have logged
>    config issues for this repo.
> 3. Check the current coverage with `sentinel check` first.
>
> Then run:
> ```
> sentinel pipeline --preset strict --max-parallel 1 --resume
> ```
>
> Stream the output and report:
> - How many batches got processed
> - Final coverage % achieved
> - Any batches that failed (and why)
> - Files where coverage is still below 80% (these may need manual help)
>
> **Constraints:**
> - Never modify production source code — only add files in the test dir.
> - If a batch fails twice, log it to `./mistakes.md` and skip it.
> - Don't run `--max-parallel` higher than 1 unless I explicitly ask.

---

## Per-repo configs (verified working)

| Repo | Test Dir | Notes |
|------|----------|-------|
| os-item | `unit-testcases/unit/` | jest.config.js |
| os-inventory | `unit-testcases/unit/` | jest.config.js |
| os-worker | `unit-testcases/unit/` | jest.config.js |
| os-edd | `unit-testcases/unit/` | jest.config.js |
| os-timeline | `unit-testcases/unit/` | jest.config.js |
| os-devecosystem | `unit-testcases/unit/` | jest.config.js |
| os-search | `src/` | uses `*.spec.ts`, config in package.json |
| os-bulk-ops | `src/` | uses `*.spec.ts`, config in package.json |
| notification-service | `test/` | uses `*.spec.ts` |
| Custom-Unicommerce-App | `test/` | needs `--language typescript` flag |
| os-webhook-processor (Go) | `*_test.go` next to source | use `go test ./... -cover` |
| os-webhook-worker (Go) | `*_test.go` next to source | use `go test ./... -cover` |

---

## Known issues / gotchas

1. **NestJS stdout pollution** — Nest log output sometimes corrupts the JSON
   coverage report Sentinel parses. If `sentinel check` errors out with a JSON
   parse error, run `npm test --silent` once first to validate the suite is
   clean.
2. **Wrong jest config picked** — Sentinel doesn't auto-detect
   `jest.unit.config.js`. Ensure your active config is `jest.config.js`.
3. **Rate limit on Anthropic** — at higher `--max-parallel` you may hit Sonnet
   rate limits. Re-run with `--resume` and it will pick up where it left off.
4. **Cache lives in `.sentinel/`** — delete this dir to force a clean run.

---

## Pipeline cycle (one batch)

```
analyze coverage → identify uncovered functions → batch them
   ↓
spawn Claude with batch prompt → generate test files
   ↓
run tests → measure new coverage
   ↓
if coverage met → mark batch done in .sentinel/
if failed      → retry up to --max-iterations
if still bad   → log batch failure, move on
```
