#!/usr/bin/env bash
# Downloads the onchainos binary into ./bin/ (inside the project directory)
# so it survives Render's build→runtime transition.
# On macOS (local dev): skips if already installed globally.

set -euo pipefail

BINARY_NAME="onchainos"

# Project-local bin (works on Render — survives build→runtime)
PROJECT_BIN_DIR="$(pwd)/bin"
PROJECT_BIN="$PROJECT_BIN_DIR/$BINARY_NAME"

OS="$(uname -s)"
ARCH="$(uname -m)"

# On macOS, skip if already in PATH (dev machine setup)
if [ "$OS" = "Darwin" ]; then
  if command -v "$BINARY_NAME" &>/dev/null; then
    echo "onchainos already in PATH (macOS dev): $(command -v $BINARY_NAME)"
    exit 0
  fi
  echo "macOS: run 'npx skills add okx/onchainos-skills' to install locally."
  exit 0
fi

# Already installed in project bin — nothing to do
if [ -x "$PROJECT_BIN" ]; then
  echo "onchainos already at $PROJECT_BIN"
  "$PROJECT_BIN" --version || true
  exit 0
fi

if [ "$OS" = "Linux" ] && [ "$ARCH" = "x86_64" ]; then
  TARGET="x86_64-unknown-linux-gnu"
elif [ "$OS" = "Linux" ] && [ "$ARCH" = "aarch64" ]; then
  TARGET="aarch64-unknown-linux-gnu"
else
  echo "Unsupported platform: $OS $ARCH"
  exit 1
fi

# Fetch latest release tag from GitHub
LATEST=$(curl -fsSL "https://api.github.com/repos/okx/onchainos-skills/releases/latest" \
  | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": "\(.*\)".*/\1/')

echo "Installing onchainos $LATEST for $TARGET into $PROJECT_BIN_DIR..."

mkdir -p "$PROJECT_BIN_DIR"
curl -fsSL \
  "https://github.com/okx/onchainos-skills/releases/download/${LATEST}/onchainos-${TARGET}" \
  -o "$PROJECT_BIN"
chmod +x "$PROJECT_BIN"

echo "Installed: $PROJECT_BIN"
"$PROJECT_BIN" --version || true
