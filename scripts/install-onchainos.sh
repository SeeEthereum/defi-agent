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

# Hardcoded version — avoids GitHub API rate-limit 403 errors on Render CI.
# Update this string when a new onchainos release is published.
#
# v4.6.0 (2026-09-12) — audited diff vs v3.3.11, all 39 call sites checked:
#   - BREAKING, handled: `wallet verify` removed and `wallet login` is now a
#     browser social login with --phase init/open/poll. Our /api/auth/* and
#     the /auth page were rewritten for it (see login-session.ts).
#   - BREAKING, handled: wallet balance renamed tokenContractAddress →
#     tokenAddress and dropped the alias.
#   - Everything else we call is byte-identical in --help: market, security,
#     gateway, token, signal, leaderboard, swap, wallet gas-station. The
#     runCli contract holds: {ok,data} envelope, JSON on stdout, human text
#     on stderr, exit codes unchanged. v4 prints compact JSON instead of
#     pretty-printed — parseLastJsonDoc is brace-depth based, so unaffected.
#   - Top-level: `competition` removed (unused), `preflight`/`agent` added
#     (unused). NOT adopted yet: FreeGas, BTC/BRC-20/SUI, `receive`,
#     `funding-check`.
#
# v3.3.11 (2026-06-09) — audited diff vs v3.3.2 (73 commits):
#   - Zero breaking changes on subcommands we call (wallet contract-call /
#     sign-message / send / balance / addresses / history, security/*,
#     gateway/*, market/*, signal/*, leaderboard/*, token/*).
#   - Changes land in skills we don't use: cross-chain approve flags
#     (--readable-amount), strategy validators, payment mpp-session --salt,
#     Solana jitoCalldata path fix, gas-station EIP-7702 auth-hash signing.
#   - wallet email-login: --locale now validated as enum (en_US/zh_CN) —
#     we don't pass --locale, unaffected.
#   - Friendlier 50114 (Invalid Authority) errors with login guidance.
#
# v3.3.2 (2026-05-14) — audited diff vs v2.3.0:
#   - Zero breaking changes on subcommands we call.
#   - Additive on contract-call + send: --gas-token-address, --relayer-id,
#     --enable-gas-station, --biz-type, --strategy (all optional).
#   - New top-level subcommands available but not yet used: `cross-chain`
#     (OKX-native bridge alternative to LI.FI), `strategy`, `workflow`,
#     `competition`, `wallet qrcode`, `wallet gas-station`, `token report`.
LATEST="v4.6.0"

echo "Installing onchainos $LATEST for $TARGET into $PROJECT_BIN_DIR..."

mkdir -p "$PROJECT_BIN_DIR"
curl -fsSL \
  "https://github.com/okx/onchainos-skills/releases/download/${LATEST}/onchainos-${TARGET}" \
  -o "$PROJECT_BIN"
chmod +x "$PROJECT_BIN"

echo "Installed: $PROJECT_BIN"
"$PROJECT_BIN" --version || true
