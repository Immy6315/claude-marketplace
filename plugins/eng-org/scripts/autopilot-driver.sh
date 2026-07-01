#!/usr/bin/env bash
# eng-org Mode L — external autopilot loop driver.
#
# Usage:
#   bash autopilot-driver.sh PROG-<id> [--max-iterations N] [--sleep S] [--bypass]
#
# Runs from the PROJECT ROOT (the directory containing governance/).
# Each iteration invokes `claude -p "/eng-org:autopilot-iterate PROG-<id>"`
# in a FRESH context. State lives in governance/autopilot/PROG-<id>/STATE.md,
# so a crash of any single iteration loses nothing — the next one resumes.
#
# The loop exits when STATE.md phase becomes DONE / HALTED /
# CHECKPOINT-WAIT, when --max-iterations is reached, or on 3
# consecutive claude invocation failures.
#
# --bypass adds --dangerously-skip-permissions for fully unattended runs.
#   Prefer pre-approving tools in .claude/settings.json permissions.allow
#   instead; use --bypass only in an isolated/trusted environment.

set -u

PROG="${1:-}"
if [[ -z "$PROG" ]]; then
  echo "usage: autopilot-driver.sh PROG-<id> [--max-iterations N] [--sleep S] [--bypass]" >&2
  exit 1
fi
shift

MAX_ITERATIONS=200
SLEEP_SECS=5
BYPASS=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-iterations) MAX_ITERATIONS="$2"; shift 2 ;;
    --sleep)          SLEEP_SECS="$2"; shift 2 ;;
    --bypass)         BYPASS=1; shift ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
done

STATE_DIR="governance/autopilot/${PROG}"
STATE_FILE="${STATE_DIR}/STATE.md"
LOG_FILE="${STATE_DIR}/driver.log"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "ERROR: $STATE_FILE not found. Run /eng-org:autopilot first (gate + plan approval)." >&2
  exit 1
fi

phase() { grep -m1 '^phase:' "$STATE_FILE" | awk '{print $2}'; }

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

CLAUDE_ARGS=(-p "/eng-org:autopilot-iterate ${PROG}" --max-turns 80)
if [[ "$BYPASS" -eq 1 ]]; then
  CLAUDE_ARGS+=(--dangerously-skip-permissions)
fi

log "driver start: ${PROG} (max_iterations=${MAX_ITERATIONS}, bypass=${BYPASS})"

FAILS=0
ITER=0
while (( ITER < MAX_ITERATIONS )); do
  P="$(phase)"
  case "$P" in
    DONE)            log "phase=DONE — program complete. Review checkpoints + em-summaries, approve merges."; exit 0 ;;
    HALTED)          log "phase=HALTED — circuit breaker. Read ${STATE_DIR}/escalation.md."; exit 2 ;;
    CHECKPOINT-WAIT) log "phase=CHECKPOINT-WAIT — review ${STATE_DIR}/checkpoint-*.md, then set phase back to RUNNING to resume."; exit 3 ;;
    RUNNING) ;;
    *)               log "unknown phase '$P' in STATE.md — refusing to run."; exit 4 ;;
  esac

  ITER=$((ITER + 1))
  log "iteration ${ITER} starting (fresh context)"
  if claude "${CLAUDE_ARGS[@]}" >>"$LOG_FILE" 2>&1; then
    FAILS=0
  else
    FAILS=$((FAILS + 1))
    log "iteration ${ITER} claude invocation FAILED (${FAILS}/3 consecutive)"
    if (( FAILS >= 3 )); then
      log "3 consecutive failures — stopping. Inspect ${LOG_FILE}."
      exit 5
    fi
    sleep 60
    continue
  fi
  sleep "$SLEEP_SECS"
done

log "max iterations (${MAX_ITERATIONS}) reached — stopping. Loop can be relaunched safely."
exit 6
