#!/usr/bin/env bash
# Downloads the hyperliquid-plugin binary into ./bin/ (inside the project dir)
# so it survives Render's build→runtime transition.
# On macOS (local dev): skips if already installed globally in ~/.local/bin.

set -euo pipefail

BINARY_NAME="hyperliquid-plugin"
VERSION="0.3.7"

PROJECT_BIN_DIR="$(pwd)/bin"
PROJECT_BIN="$PROJECT_BIN_DIR/$BINARY_NAME"

OS="$(uname -s)"
ARCH="$(uname -m)"

# On macOS dev, prefer ~/.local/bin installation from `npx skills add okx/hyperliquid-skills`
if [ "$OS" = "Darwin" ]; then
  if command -v "$BINARY_NAME" &>/dev/null; then
    echo "$BINARY_NAME already in PATH (macOS dev): $(command -v $BINARY_NAME)"
    exit 0
  fi
  if [ -x "$HOME/.local/bin/$BINARY_NAME" ]; then
    echo "$BINARY_NAME at $HOME/.local/bin/$BINARY_NAME"
    exit 0
  fi
  echo "macOS: install via 'npx skills add okx/hyperliquid-skills' or download manually."
  exit 0
fi

# Already installed in project bin — done
if [ -x "$PROJECT_BIN" ]; then
  echo "$BINARY_NAME already at $PROJECT_BIN"
  "$PROJECT_BIN" --version || true
  exit 0
fi

if [ "$OS" = "Linux" ] && [ "$ARCH" = "x86_64" ]; then
  TARGET="x86_64-unknown-linux-musl"
elif [ "$OS" = "Linux" ] && [ "$ARCH" = "aarch64" ]; then
  TARGET="aarch64-unknown-linux-musl"
else
  echo "Unsupported platform: $OS $ARCH"
  exit 1
fi

# URL-encode the @ as %40 (per GitHub releases)
TAG_URL="plugins/hyperliquid-plugin%40${VERSION}"
URL="https://github.com/okx/plugin-store/releases/download/${TAG_URL}/${BINARY_NAME}-${TARGET}"

echo "Installing $BINARY_NAME $VERSION for $TARGET into $PROJECT_BIN_DIR..."
mkdir -p "$PROJECT_BIN_DIR"
curl -fsSL "$URL" -o "$PROJECT_BIN"
chmod +x "$PROJECT_BIN"

echo "Installed: $PROJECT_BIN"
"$PROJECT_BIN" --version || true
