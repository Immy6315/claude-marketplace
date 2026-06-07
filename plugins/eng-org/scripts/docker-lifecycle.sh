#!/usr/bin/env bash
#
# docker-lifecycle.sh — start Docker only around DB-backed test tiers, stop it after.
#
# Why: the integration + load tiers need a live Docker daemon (testcontainers spins
# its own ephemeral Postgres/Redis/Mosquitto). Outside those tiers Docker Desktop
# just idles, holding ~2 GB of VM RAM for nothing. This script brings the daemon up
# before the DB-backed tiers and tears it back down after, so RAM is reclaimed when
# the pipeline is not actively testing.
#
# Marker-guarded: `down` only stops Docker if THIS script started it (the `up` call
# wrote the marker). A Docker instance you opened yourself — e.g. for live device
# e2e — has no marker and is left running untouched.
#
# Usage:
#   docker-lifecycle.sh up      # start daemon if not already running (writes marker)
#   docker-lifecycle.sh down    # stop daemon only if we started it (consumes marker)
#   docker-lifecycle.sh status  # print "running" | "stopped"
#
# Env overrides:
#   ENG_ORG_DOCKER_WAIT   seconds to wait for the daemon to become ready (default 120)
#
# Standalone: depends only on the docker CLI plus the platform's app launcher
# (`open` on macOS, `systemctl` on Linux). Safe to run outside Claude Code.

set -euo pipefail

MARKER="${TMPDIR:-/tmp}/eng-org-docker-pipeline.marker"
WAIT_SECS="${ENG_ORG_DOCKER_WAIT:-120}"

docker_ready() { docker info >/dev/null 2>&1; }

start_daemon() {
  if command -v open >/dev/null 2>&1; then
    open -a Docker            # macOS: launch Docker Desktop
  elif command -v systemctl >/dev/null 2>&1; then
    sudo systemctl start docker
  elif command -v dockerd >/dev/null 2>&1; then
    sudo dockerd >/dev/null 2>&1 &
  else
    echo "[docker-lifecycle] ERROR: no way to start Docker on this platform." >&2
    return 1
  fi
}

stop_daemon() {
  if command -v osascript >/dev/null 2>&1; then
    osascript -e 'quit app "Docker"' >/dev/null 2>&1 || true   # macOS: frees the VM RAM
  elif command -v systemctl >/dev/null 2>&1; then
    sudo systemctl stop docker || true
  else
    echo "[docker-lifecycle] WARN: cannot auto-stop Docker on this platform; leaving it running." >&2
  fi
}

cmd_up() {
  if docker_ready; then
    echo "[docker-lifecycle] daemon already running — user-managed, no marker written."
    return 0
  fi
  echo "[docker-lifecycle] starting Docker (pipeline needs a live daemon)..."
  start_daemon
  : > "$MARKER"   # remember WE started it, so `down` knows to stop it
  local waited=0
  until docker_ready; do
    sleep 3; waited=$((waited + 3))
    if [ "$waited" -ge "$WAIT_SECS" ]; then
      echo "[docker-lifecycle] ERROR: Docker not ready after ${WAIT_SECS}s." >&2
      return 1
    fi
  done
  echo "[docker-lifecycle] Docker ready after ${waited}s."
}

cmd_down() {
  if [ ! -f "$MARKER" ]; then
    echo "[docker-lifecycle] no pipeline marker — Docker was user-managed (e.g. live e2e); leaving it running."
    return 0
  fi
  echo "[docker-lifecycle] stopping Docker (pipeline-started); reclaiming RAM..."
  stop_daemon
  rm -f "$MARKER"
  echo "[docker-lifecycle] Docker stopped."
}

case "${1:-}" in
  up)     cmd_up ;;
  down)   cmd_down ;;
  status) docker_ready && echo "running" || echo "stopped" ;;
  *)      echo "usage: docker-lifecycle.sh {up|down|status}" >&2; exit 2 ;;
esac
