#!/usr/bin/env bash
# gr-ensure.sh — resolve (or auto-install) the `gr` deep-review binary
# for the eng-org pipeline. Prints the absolute path to gr on stdout;
# everything else goes to stderr.
#
# Resolution order:
#   1. `gr` already on PATH
#   2. ~/.local/bin/gr (default install prefix)
#   3. one-time install of the pre-built binary from Immy6315/gr-releases
#      (public repo — no token, no Go toolchain, no gr-reviewer plugin
#      required; the installer is fetched from this marketplace repo)
#
# Exit codes:
#   0 — path printed on stdout
#   1 — gr unavailable and install failed (caller should skip-with-note,
#       never hard-block the review pipeline on this)

set -euo pipefail

INSTALLER_URL="https://raw.githubusercontent.com/Immy6315/claude-marketplace/main/plugins/gr-reviewer/scripts/install.sh"

if command -v gr >/dev/null 2>&1; then
  command -v gr
  exit 0
fi

if [[ -x "$HOME/.local/bin/gr" ]]; then
  echo "$HOME/.local/bin/gr"
  exit 0
fi

echo "▶ gr binary not found — installing once from gr-releases (no plugin needed)" >&2
if curl -fsSL "$INSTALLER_URL" | bash >&2; then
  if [[ -x "$HOME/.local/bin/gr" ]]; then
    echo "$HOME/.local/bin/gr"
    exit 0
  fi
fi

echo "✗ could not install gr — GR deep-review will be skipped this run" >&2
exit 1
