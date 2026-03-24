#!/usr/bin/env bash
# Downloads the onchainos binary for the current platform at Render build time.
# On Linux x86_64 (Render): fetches the prebuilt binary from GitHub releases.
# On macOS (local dev): skips if already installed.

set -euo pipefail

BINARY_NAME="onchainos"
INSTALL_DIR="$HOME/.local/bin"
INSTALL_PATH="$INSTALL_DIR/$BINARY_NAME"

# Already installed — nothing to do
if command -v "$BINARY_NAME" &>/dev/null; then
  echo "onchainos already in PATH: $(command -v $BINARY_NAME)"
  exit 0
fi

if [ -x "$INSTALL_PATH" ]; then
  echo "onchainos already at $INSTALL_PATH"
  export PATH="$INSTALL_DIR:$PATH"
  exit 0
fi

OS="$(uname -s)"
ARCH="$(uname -m)"

if [ "$OS" = "Linux" ] && [ "$ARCH" = "x86_64" ]; then
  TARGET="x86_64-unknown-linux-gnu"
elif [ "$OS" = "Linux" ] && [ "$ARCH" = "aarch64" ]; then
  TARGET="aarch64-unknown-linux-gnu"
elif [ "$OS" = "Darwin" ]; then
  echo "macOS: run 'npx skills add okx/onchainos-skills' locally instead."
  exit 0
else
  echo "Unsupported platform: $OS $ARCH"
  exit 1
fi

# Fetch latest release tag from GitHub
LATEST=$(curl -fsSL "https://api.github.com/repos/okx/onchainos-skills/releases/latest" \
  | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": "\(.*\)".*/\1/')

echo "Installing onchainos $LATEST for $TARGET..."

mkdir -p "$INSTALL_DIR"
curl -fsSL \
  "https://github.com/okx/onchainos-skills/releases/download/${LATEST}/onchainos-${TARGET}" \
  -o "$INSTALL_PATH"
chmod +x "$INSTALL_PATH"

echo "Installed: $INSTALL_PATH"
"$INSTALL_PATH" --version || true
