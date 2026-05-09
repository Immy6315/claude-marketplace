#!/usr/bin/env bash
# install.sh — one-shot bootstrap for the gr CLI behind the
# gr-reviewer Claude Code plugin.
#
# Usage:
#   bash <(curl -fsSL https://raw.githubusercontent.com/Immy6315/claude-marketplace/main/plugins/gr-reviewer/scripts/install.sh)
#
# What it does:
#   1. Verifies prereqs (Go 1.25+, git, claude CLI)
#   2. Clones (or pulls) Immy6315/GR into ~/.gr-src
#   3. Runs the repo's own scripts/install.sh, which builds the gr
#      binary and symlinks both `gr` and `GR` into /usr/local/bin
#
# This is a *source* installer. A binary installer (no Go required)
# will be added once cross-platform releases are published.

set -euo pipefail

SRC_DIR="${GR_SRC_DIR:-$HOME/.gr-src}"
REPO_URL="${GR_REPO_URL:-https://github.com/Immy6315/GR.git}"
BRANCH="${GR_BRANCH:-main}"

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n' "$*"; }

bold "▶ gr-reviewer plugin bootstrap"
echo "  Source dir : $SRC_DIR"
echo "  Repo       : $REPO_URL ($BRANCH)"

# --- prereq: git ---
if ! command -v git >/dev/null 2>&1; then
  red "✗ git not found"
  exit 1
fi

# --- prereq: go ---
if ! command -v go >/dev/null 2>&1; then
  red "✗ go not found in PATH"
  echo "  Install Go 1.25+: https://go.dev/dl/  (macOS: brew install go)"
  exit 1
fi
GO_VERSION="$(go version | awk '{print $3}' | sed 's/^go//')"
GO_MAJOR="$(echo "$GO_VERSION" | cut -d. -f1)"
GO_MINOR="$(echo "$GO_VERSION" | cut -d. -f2)"
if [[ "$GO_MAJOR" -lt 1 || ( "$GO_MAJOR" -eq 1 && "$GO_MINOR" -lt 25 ) ]]; then
  red "✗ go $GO_VERSION is too old — need 1.25+"
  exit 1
fi
green "✓ go $GO_VERSION"

# --- prereq: claude CLI (informational) ---
if command -v claude >/dev/null 2>&1; then
  green "✓ claude CLI found"
else
  yellow "⚠ claude CLI not found — gr needs it at runtime"
  echo "  Install:  curl -fsSL https://claude.ai/install.sh | sh"
  echo "  Log in:   claude login"
fi

# --- clone or pull ---
if [[ -d "$SRC_DIR/.git" ]]; then
  bold "▶ Updating existing clone at $SRC_DIR"
  ( cd "$SRC_DIR" && git fetch --quiet origin "$BRANCH" && git checkout --quiet "$BRANCH" && git pull --quiet --ff-only )
else
  bold "▶ Cloning $REPO_URL into $SRC_DIR"
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$SRC_DIR"
fi
green "✓ source ready"

# --- run repo installer ---
bold "▶ Building & linking gr (delegating to repo installer)"
( cd "$SRC_DIR" && ./scripts/install.sh --skip-auth-check )

bold "▶ Done"
cat <<'EOF'

Next steps:
  gr --help
  gr auth login                # optional; runtime auth-prompt also works
  gr review --pr <PR URL> --show

Or use the slash command from Claude Code:
  /gr-reviewer:review-pr <PR URL>

To uninstall later:
  gr uninstall --purge
EOF
