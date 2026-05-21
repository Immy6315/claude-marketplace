---
description: Run the full mobile + backend test suite cold; on RED, spawn eng-org:test-triage; on GREEN, write the test-full-suite-GREEN.md marker for the REQ.
---

You are running the mandatory full-suite test gate for a requirement.
This gate implements ADR-mini §B (gate contract) and ADR-mini §C (marker lifecycle)
from `governance/requirements/REQ-20260520-01/ADR-mini-test-triage-gate.md`.
It inserts at pipeline step 6a — after Dev done, before `/run-tests` and `/run-reviews`.
See `governance/ROLES.md` §2.6 (test-triage gate role contract) and
`governance/REVIEW_PROCESS.md` step 6a in the Mode B lifecycle diagram.

The requirement id is: $ARGUMENTS (e.g., REQ-20260520-01).

**Use a fresh shell for every Bash invocation below. Do NOT chain to prior
caches. Capture exit code; the test runner exits non-zero on any RED.**

---

## Refusal rules (binding — ADR-mini §B and §C)

Before executing any step, commit to these refusals. If any situation below
arises, STOP and report the refusal — do NOT proceed silently.

**Refusal R-1 (no REQ id).** Refuse to run if `$ARGUMENTS` is empty, whitespace,
or not a recognized REQ folder path. Emit:
`BLOCKED: no REQ id provided. Re-invoke as /eng-org:test-full-suite REQ-<id>.`

**Refusal R-2 (no cached results).** Refuse to read or honor any previously
captured test output, prior log file, or prior exit code as a substitute for
running `yarn test` now. Every invocation is a fresh `yarn test` process.
Flags `--onlyChanged`, `--changedSince`, and `--cache` are banned. Vitest
`--changed` flag is also banned. No exceptions.

**Refusal R-3 (no partial GREEN marker).** Refuse to write `test-full-suite-GREEN.md`
unless BOTH mobile exit code AND backend exit code are 0, AND BOTH suite outputs
report 0 failing tests. If mobile is GREEN and backend is RED — no marker.
If mobile is RED and backend is GREEN — no marker. Both must be clean.

**Refusal R-4 (no marker auto-renewal).** Refuse to "touch", copy-paste, or
hand-write a marker file to satisfy `/merge-readiness`. The marker is a
side-effect of a real `yarn test` run executed by this command. If a fresh marker
is needed, re-execute this full command. There is no shortcut.

---

## Steps (execute in order — do NOT reorder)

### Step A — Resolve paths and verify REQ folder

1. Determine the repo root: the directory that contains `governance/`. This is the
   `Petso-Phase1/` checkout root. Use the absolute path.

2. Resolve the REQ folder:
   ```
   REQ_DIR=<repo-root>/governance/requirements/$ARGUMENTS
   ```
   Verify it exists on disk. If it does not exist, emit:
   `BLOCKED: REQ folder not found at <path>. Is the REQ id correct?`
   Then stop.

3. Print: `Gate starting for $ARGUMENTS — repo root: <path>`

### Step B — Pre-run sweep: delete any prior GREEN marker

Delete any pre-existing marker so a prior GREEN cannot linger if this run is RED.
This is the "Deletion on RED" defensive step from ADR-mini §C.

```bash
MARKER="<repo-root>/governance/requirements/$ARGUMENTS/test-full-suite-GREEN.md"
rm -f "$MARKER"
```

Print: `Pre-run sweep: any prior test-full-suite-GREEN.md deleted.`

### Step C — Run mobile yarn test (fresh process)

Run `yarn test` in the `mobile/` directory as a fresh process. Capture stdout,
stderr, and exit code. Record wall-clock start and end times.

```bash
cd <repo-root>/mobile
START_MOBILE=$(date +%s)
yarn test --watchAll=false 2>&1
MOBILE_EXIT=$?
END_MOBILE=$(date +%s)
MOBILE_DURATION=$((END_MOBILE - START_MOBILE))
```

Capture the full output (do not truncate). Record:
- `MOBILE_EXIT` — exit code (0 = pass, non-zero = fail)
- `MOBILE_DURATION` — wall-clock seconds
- Full stdout/stderr as `MOBILE_OUTPUT`

Print one structured log line after the run completes:
```
{ "repo": "mobile", "exit": <MOBILE_EXIT>, "duration_s": <MOBILE_DURATION> }
```

### Step D — Run backend yarn test (fresh process)

Run `yarn test` in the `backend/` directory as a fresh process. Same capture
pattern as Step C. The two runs execute sequentially by default for log clarity
(per TL analysis §9: sequential ~1m43s, parallel ~52s — both well under the
AC-2 5-min budget; sequential chosen for audit clarity).

```bash
cd <repo-root>/backend
START_BACKEND=$(date +%s)
yarn test 2>&1
BACKEND_EXIT=$?
END_BACKEND=$(date +%s)
BACKEND_DURATION=$((END_BACKEND - START_BACKEND))
```

Print one structured log line after the run completes:
```
{ "repo": "backend", "exit": <BACKEND_EXIT>, "duration_s": <BACKEND_DURATION> }
```

Note on parallelism: if future AC-2 budget pressure requires it, Steps C and D
MAY be dispatched in parallel via `&` + `wait` — capturing outputs to separate
temp files per repo. Parallel is NOT the default today because the measurement
(mobile ~51s, backend ~52s, sequential ~103s total) is safely within the 5-min
budget. Any future change to parallelism must preserve separate output capture
per repo (no interleaved stdout).

### Step E — GREEN path: write the marker

**Only execute Step E if BOTH `MOBILE_EXIT == 0` AND `BACKEND_EXIT == 0`.**

If either exit code is non-zero, skip directly to Step F.

Additional GREEN check: scan `MOBILE_OUTPUT` and `BACKEND_OUTPUT` for any
line matching patterns like `X failing`, `X failed`, `FAIL `, `× `, or `✕ `.
If any failing-test signal is found despite exit 0 (e.g., `--passWithNoTests`
misconfiguration), treat as RED and go to Step F. This matches CLAUDE.md §8
definition of GREEN: "zero failing tests."

Get the current git HEAD SHA:
```bash
cd <repo-root>
GIT_SHA=$(git rev-parse HEAD)
```

If `git rev-parse HEAD` fails (not a git repo / detached state with no commit),
STOP and emit: `BLOCKED: git rev-parse HEAD failed — cannot write marker without
branch SHA. Resolve git state and re-run.`

Get the current UTC timestamp in ISO-8601:
```bash
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
```

Extract suite counts from the captured outputs (total tests, passed, failed,
skipped). Parse from the runner's summary line. For jest: look for the
`Tests: N failed, N passed, N total` summary line. For vitest: look for the
`Test Files N | Tests N` summary. If counts cannot be parsed, write `<unparsed>`
rather than fabricating numbers.

Write the marker file with the minimum required contents per ADR-mini §C:

```
governance/requirements/$ARGUMENTS/test-full-suite-GREEN.md
```

Marker file contents (write verbatim — substitute the variables):

```markdown
# test-full-suite GREEN — $ARGUMENTS

**Timestamp (UTC, ISO-8601):** <TIMESTAMP>
**Wall-clock duration:** <MOBILE_DURATION + BACKEND_DURATION>s total (<MOBILE_DURATION>s mobile + <BACKEND_DURATION>s backend)
**mobile yarn test exit:** 0
**backend yarn test exit:** 0
**mobile suite counts:** <total> total / <passed> passed / 0 failed / <skipped> skipped (all skips ref TD-IDs)
**backend suite counts:** <total> total / <passed> passed / 0 failed / <skipped> skipped (all skips ref TD-IDs)
**Branch HEAD SHA:** <GIT_SHA>
**Commands run (verbatim):**
- `cd mobile && yarn test --watchAll=false`
- `cd backend && yarn test`
```

After writing the marker, print:
`GREEN — gate cleared for $ARGUMENTS. Marker written. Proceed to /eng-org:run-reviews.`

Exit 0.

### Step F — RED path: spawn test-triage agent

**Only execute Step F if either `MOBILE_EXIT != 0` OR `BACKEND_EXIT != 0`,
or if Step E's GREEN scan detected failing-test signals.**

Do NOT write any GREEN marker. Step B already deleted any prior marker.

1. Get the base branch diff for this REQ. Default base is `main`; if the REQ
   folder contains a `spec.md` with an explicit base-branch override, use that.
   ```bash
   cd <repo-root>
   git diff main..HEAD > /tmp/req-diff-$ARGUMENTS.txt 2>&1 || true
   ```
   If `git diff` fails entirely (e.g., no `main` branch), capture the error and
   pass an empty diff with a note; do NOT abort the triage spawn.

2. Spawn the `eng-org:test-triage` subagent synchronously via the Agent tool.
   Pass the following prompt verbatim (substituting variables):

   ```
   You are eng-org:test-triage. REQ id: $ARGUMENTS.

   yarn test output (mobile):
   <MOBILE_OUTPUT>

   yarn test output (backend):
   <BACKEND_OUTPUT>

   git diff base: main (or override if specified in spec.md)
   Diff:
   <contents of /tmp/req-diff-$ARGUMENTS.txt>

   Read governance/requirements/$ARGUMENTS/spec.md now.
   Read the failing test files at the paths listed in the yarn test output.
   Read governance/MISTAKES.md.

   Produce the full triage report per your contract.
   ```

   The agent is defined at `.claude/agents/eng-org/test-triage.md`.
   Its contract is ADR-mini §D (binding).
   Its refusal rules (1-6) are enforced by the agent's own prompt.

   Session-reload constraint (R-11 from `tl-mobile-analysis.md §8`): the
   `eng-org:test-triage` agent requires a fresh Claude Code session started
   AFTER TASK-D1 (marketplace mirror) has landed and the plugin has been
   re-loaded. Running in the session that authored the agent will fail with
   "Agent type not found." If that error occurs, surface it to TL — do NOT
   fake a triage report.

3. Capture the agent's final assistant message verbatim. Write it to:
   ```
   governance/requirements/$ARGUMENTS/tasks/test-triage-report.md
   ```
   This is the only file the slash command writes in the RED path.

4. Surface the full triage report to the user (print it inline or reference
   the path clearly).

5. Print:
   `RED — gate refused for $ARGUMENTS. See classifications in tasks/test-triage-report.md.`
   `Fix per classification routing and re-run /eng-org:test-full-suite $ARGUMENTS.`

Exit 1.

---

## Bypass (only Imran — human)

No agent bypass exists. Only Imran (human) may override this gate by placing
an explicit line in the REQ's `spec.md §Authorization`:

```
> Imran override YYYY-MM-DD: test-full-suite gate skipped for REQ-<id>; reason: <reason>
```

If that exact pattern is found in `spec.md §Authorization`, print:
`Override detected — gate skipped per Imran YYYY-MM-DD. Reason: <reason>`
Then still write a marker file but with an additional field `OVERRIDDEN: true`
so `/merge-readiness` can flag the override in `em-summary.md`.
No other bypass format is accepted. No CLI flag, env var, or per-task
scoping substitutes for this explicit line.

---

## How /merge-readiness consumes the marker (ADR-mini §C, §E)

`/merge-readiness` checks for the marker file at:
`governance/requirements/REQ-<id>/test-full-suite-GREEN.md`

It reads the file's **mtime** (filesystem modified-time — NOT the in-file
timestamp field). If `now() - mtime > 24 hours`, the marker is stale and
`/merge-readiness` emits:
```
BLOCKED (G-6): full-suite GREEN marker stale (>24h) or missing.
Re-run /eng-org:test-full-suite $ARGUMENTS to refresh.
```

If the file is absent — same BLOCK.
If the file exists and mtime is within 24 hours — G-6 is cleared.

This is a deliberate design: mtime is harder to forge in a normal workflow
than an in-file timestamp field, and mirrors the boot-smoke artifact
convention. "Touch the file to renew" is explicitly banned (Refusal R-4 above).

The 24-hour freshness window means: if more than one day passes between
the last gate run and `/merge-readiness`, the gate must re-run. This is
intentional — long-running reviews should re-confirm the suite is still GREEN.

Cross-reference: `governance/REVIEW_PROCESS.md` step 6a (Mode B pipeline
diagram); `governance/ROLES.md` §4 G-6 line; ADR-mini §E.

---

## Cross-references

- ADR-mini: `governance/requirements/REQ-20260520-01/ADR-mini-test-triage-gate.md` §B, §C, §E (binding contracts for this command).
- test-triage agent: `.claude/agents/eng-org/test-triage.md` (name: `test-triage`; subagent_type: `eng-org:test-triage`).
- ROLES.md: `governance/ROLES.md` §2.6 (test-triage gate-role contract) and §4 (merge-readiness G-6 gate).
- Spec: `governance/requirements/REQ-20260520-01/spec.md` §5.1, AC-1/AC-2/AC-3.
- Pipeline diagram: `governance/REVIEW_PROCESS.md` Mode B step 6a.
- Cold runtime baseline: mobile ~51s, backend ~52s, sequential total ~1m43s (measured 2026-05-21, `tl-mobile-analysis.md §9`). Both comfortably under AC-2 5-min budget.
