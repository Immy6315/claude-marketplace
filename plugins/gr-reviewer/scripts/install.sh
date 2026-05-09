#!/usr/bin/env bash
# install.sh — install the gr binary for the gr-reviewer plugin.
#
# Downloads a pre-built binary from Immy6315/gr-releases (public).
# No Go toolchain required, no source access required.
#
# Usage:
#   bash <(curl -fsSL https://raw.githubusercontent.com/Immy6315/claude-marketplace/main/plugins/gr-reviewer/scripts/install.sh)
#
# Env overrides:
#   GR_VERSION   defaults to 'latest'; pin to e.g. 'v0.1.0' for reproducible installs
#   GR_PREFIX    defaults to '$HOME/.local/bin' (user-writable, no sudo needed)

set -euo pipefail

REPO="${GR_RELEASES_REPO:-Immy6315/gr-releases}"
TAG="${GR_VERSION:-latest}"
PREFIX="${GR_PREFIX:-$HOME/.local/bin}"
mkdir -p "$PREFIX"

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n' "$*"; }

bold "▶ gr-reviewer plugin: installing gr binary"

# --- detect OS / arch ---
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$OS" in
  darwin|linux) ;;
  *) red "✗ unsupported OS: $OS (only darwin/linux are built)"; exit 1 ;;
esac

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) red "✗ unsupported arch: $ARCH (only amd64/arm64 are built)"; exit 1 ;;
esac

green "✓ platform: $OS-$ARCH"

# --- prereqs ---
for cmd in curl install; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    red "✗ '$cmd' not found in PATH"
    exit 1
  fi
done

# --- resolve tag if 'latest' ---
if [[ "$TAG" == "latest" ]]; then
  bold "▶ Resolving latest release of $REPO"
  TAG="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | grep '"tag_name"' | head -1 \
    | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')"
  if [[ -z "$TAG" ]]; then
    red "✗ could not resolve latest tag — has any release been cut yet?"
    echo "  See: https://github.com/$REPO/releases"
    exit 1
  fi
fi
green "✓ version: $TAG"

ASSET="gr-$OS-$ARCH"
URL="https://github.com/$REPO/releases/download/$TAG/$ASSET"
SUMS_URL="https://github.com/$REPO/releases/download/$TAG/checksums.txt"

# --- download ---
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

bold "▶ Downloading $URL"
if ! curl -fsSL "$URL" -o "$TMP/$ASSET"; then
  red "✗ download failed"
  echo "  Check: https://github.com/$REPO/releases/tag/$TAG"
  exit 1
fi
green "✓ downloaded $(wc -c < "$TMP/$ASSET" | awk '{print $1}') bytes"

# --- verify checksum (best effort: skip if checksums.txt missing) ---
if curl -fsSL "$SUMS_URL" -o "$TMP/checksums.txt" 2>/dev/null; then
  expected="$(awk -v a="$ASSET" '$2==a{print $1}' "$TMP/checksums.txt")"
  if [[ -n "$expected" ]]; then
    actual="$(shasum -a 256 "$TMP/$ASSET" | awk '{print $1}')"
    if [[ "$expected" != "$actual" ]]; then
      red "✗ checksum mismatch!"
      echo "  expected: $expected"
      echo "  actual  : $actual"
      exit 1
    fi
    green "✓ checksum verified ($actual)"
  else
    yellow "⚠ asset not in checksums.txt — skipping verification"
  fi
else
  yellow "⚠ no checksums.txt published for $TAG — skipping verification"
fi

chmod +x "$TMP/$ASSET"

# --- install ---
DEST="$PREFIX/gr"
bold "▶ Installing to $DEST"

# Clean up any prior install (broken symlinks, old binary, etc.)
# Important on macOS: filesystem is case-insensitive by default, so a
# previous `ln -sf gr GR` would have created a symlink loop. Remove both.
SUDO=""
if [[ ! -w "$PREFIX" ]]; then
  yellow "→ $PREFIX is not writable; using sudo"
  SUDO="sudo"
fi
$SUDO rm -f "$PREFIX/gr" "$PREFIX/GR" 2>/dev/null || true
$SUDO install -m 0755 "$TMP/$ASSET" "$DEST"

# Only create uppercase GR alias on case-sensitive filesystems
# (otherwise it's the same path → symlink loop)
if [[ ! -e "$PREFIX/GR" ]]; then
  $SUDO ln -sf "$DEST" "$PREFIX/GR" 2>/dev/null || true
fi

green "✓ installed: $("$DEST" version 2>/dev/null || echo "$DEST")"

# --- PATH hint (only if PREFIX is not on PATH) ---
case ":$PATH:" in
  *":$PREFIX:"*) ;;
  *)
    yellow "⚠ $PREFIX is not on your PATH"
    echo "  Add this to your ~/.zshrc or ~/.bashrc:"
    echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo "  (Claude Code's slash commands will still find gr via absolute path.)"
    ;;
esac

# --- claude CLI hint ---
if ! command -v claude >/dev/null 2>&1; then
  yellow "⚠ claude CLI not found on PATH — gr needs it at runtime"
  echo "  Install:  curl -fsSL https://claude.ai/install.sh | sh"
  echo "  Log in:   claude login"
fi

bold "▶ Done"
cat <<EOF

Try it:
  gr --help
  gr review --pr https://github.com/owner/repo/pull/123 --show

Or via the slash command:
  /gr-reviewer:review-pr <PR URL>

To uninstall:
  gr uninstall --purge
EOF
