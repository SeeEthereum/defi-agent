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

# SHA-256 of each binary, from the release's checksums.txt, checked when we
# pinned the version. Pinned here, not fetched with the binary: whoever
# could swap the binary on the release could swap checksums.txt too.
if [ "$OS" = "Linux" ] && [ "$ARCH" = "x86_64" ]; then
  TARGET="x86_64-unknown-linux-gnu"
  SHA256="ec8c08b8fe7eb2190e1971656ccff02b5273481417ee03de0d7c2b92634dbed6"
elif [ "$OS" = "Linux" ] && [ "$ARCH" = "aarch64" ]; then
  TARGET="aarch64-unknown-linux-gnu"
  SHA256="8f9bc3f75a2efd073b9fafab604b5ab5b90d34caf72282092a91ee7ce2e8d4ba"
else
  echo "Unsupported platform: $OS $ARCH"
  exit 1
fi

# Hardcoded version — avoids GitHub API rate-limit 403 errors on Render CI.
# To upgrade: audit the diff, update LATEST and both SHA256 values above.
#
# v4.6.11 (2026-11-15) — audited diff vs v4.6.0 (35 commits), source read:
#   - API-key signing removed from the binary: a signed-in session uses its
#     own login, anything else is anonymous, and OKX meters anonymous market
#     calls. Public market data now comes from OKX's REST API with our key
#     (src/lib/okx/openapi.ts, market-data.ts), so nothing we need relies on
#     the key inside the CLI any more.
#   - New: approval verification. With the user's "doubleConfirmation" on,
#     a token approval answers confirming/scene "approval_code_sent" and
#     waits for `wallet approval-code verify|resend|cancel` (handled:
#     src/lib/okx/approval-code.ts). `--force` does not skip it.
#   - Login poll output adds `securityPolicy` (limits, whitelist, approval
#     verification); `login --phase init` now gets its session id from OKX.
#   - sign-message eip712: `--force` now only skips backend risk warnings
#     (skipWarning); the Hyperliquid signer still passes it.
#   - contract-call defaults its biz type to "dapp" (OKX's classification).
#   - DEX token names/symbols cut to 80 chars; `--base-url` and the
#     OKX_BASE_URL env override removed; no more `.env` loading from cwd.
#   - Unchanged for us: wallet send/contract-call/balance/addresses/history/
#     status/logout/gas-station, swap, security, gateway, market portfolio.
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
LATEST="v4.6.11"

# A binary left by an earlier build (cache) is reused only if it is exactly
# the pinned one.
if [ -x "$PROJECT_BIN" ] && echo "$SHA256  $PROJECT_BIN" | sha256sum -c --status; then
  echo "onchainos $LATEST already at $PROJECT_BIN"
  exit 0
fi

echo "Installing onchainos $LATEST for $TARGET into $PROJECT_BIN_DIR..."

mkdir -p "$PROJECT_BIN_DIR"
curl -fsSL \
  "https://github.com/okx/onchainos-skills/releases/download/${LATEST}/onchainos-${TARGET}" \
  -o "$PROJECT_BIN.download"
if ! echo "$SHA256  $PROJECT_BIN.download" | sha256sum -c --status; then
  echo "onchainos $LATEST checksum mismatch: refusing to install it" >&2
  rm -f "$PROJECT_BIN.download"
  exit 1
fi
mv "$PROJECT_BIN.download" "$PROJECT_BIN"
chmod +x "$PROJECT_BIN"

echo "Installed: $PROJECT_BIN"
"$PROJECT_BIN" --version || true
