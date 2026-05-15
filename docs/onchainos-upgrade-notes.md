# onchainos CLI — upgrade notes & deliberate skip-list

Last reviewed: **2026-05-15** against `onchainos-cli@v3.3.2`.

The `onchainos` binary is pinned in `scripts/install-onchainos.sh:LATEST`. This
doc tracks two things:

1. What the latest upgrade audit found (diff against the previous pin).
2. Which net-new features in the latest release we **deliberately skip**, and
   why — so a future contributor doesn't waste time re-evaluating them from
   scratch.

---

## 2026-05-15 — Upgrade v2.3.0 → v3.3.2

### Audit method

Downloaded the `aarch64-apple-darwin` build of v3.3.2 to `/tmp/oc332/onchainos`
and diffed `--help` output for every top-level subcommand and every wallet
subcommand against the in-place v2.3.0 binary. Cross-referenced against commit
log between the two tags via the GitHub REST API (`/repos/okx/onchainos-skills/commits?since=...&until=...`).

### Surface diff that affected us

| Subcommand | Change | Impact |
|---|---|---|
| `wallet contract-call` | Added optional `--gas-token-address`, `--relayer-id`, `--enable-gas-station`, `--biz-type`, `--strategy` | Backwards-compatible. We could opt into `--biz-type` / `--strategy` for attribution analytics. |
| `wallet send` | Added the same three Gas Station flags | Same. |
| `wallet history` | `--address` flag changed from "required when --tx-hash present" to "optional; passed if provided" | Backwards-compatible. |
| `wallet sign-message`, `wallet balance`, `wallet addresses` | No change | Safe. |
| `swap swap` | `--jito-tip` interpretation: lamports → SOL (decimal) | We don't use Jito MEV protection on Solana — non-issue. |
| `security/*`, `gateway/*`, `market/*`, `signal/*`, `leaderboard/*` | No surface change | Safe. |
| `token` | Added `report` composite subcommand | Optional. |

### New top-level subcommands shipped (NOT yet adopted)

- **`cross-chain`** — OKX-native bridge aggregator with `bridges` / `tokens` /
  `quote` / `approve` / `swap` (calldata only) / `execute` / `status` modes.
  Supports `--sort 0|1|2` (optimal / fastest / max output),
  `--allow-bridges`/`--deny-bridges`, `--bridge-id` pinning, `--mev-protection`
  on broadcast, `--receive-address` for heterogeneous chain pairs.
- **`strategy`** — Limit-order strategy trading (`create-limit` / `cancel` /
  `list` / `resume`). Could power a future "limit orders" UI on `/swap`.
- **`workflow`** — Multi-step composed API calls. Marketed as "chain API calls
  for complete operations" — looks like a server-side macro layer.
- **`competition`** — Agentic Wallet trading competition (list / join / rank /
  claim rewards). Marketing surface.
- **`wallet qrcode`** — Unicode-block QR for an address. Probably terminal-only.
- **`wallet gas-station`** — Pay gas in stablecoins. Requires UI for token
  selection + relayer-id provisioning.
- **`wallet geoblock`** — Polymarket geoblock probe. We don't integrate
  Polymarket.
- **`token report`** — Composite endpoint (info + price + advanced + security
  scan in one call). Could compress some `/security` page calls.

### Verification post-bump

- `npx tsc --noEmit`: clean
- `npx eslint src/`: 0 errors, 8 pre-existing warnings
- `npx next build`: clean, all routes prerender as before
- Read-only CLI smoke against v3.3.2 with our actual keystore: `wallet status`,
  `wallet addresses --chain 42161`, `wallet sign-message` (EIP-712 payload
  parser) — all return the exact same response shapes.

### Render deployment

`scripts/install-onchainos.sh` downloads
`https://github.com/okx/onchainos-skills/releases/download/v3.3.2/onchainos-x86_64-unknown-linux-gnu`
at build time. Asset was confirmed present in the v3.3.2 release.

---

## Deliberate skip-list

These were considered during the v3.3.2 audit and consciously **not adopted**.
If a future maintainer reconsiders any of them, document the new reasoning
rather than silently flipping the decision.

### Skill / feature: `cross-chain` (OKX-native bridge aggregator)
- **Current:** We use LI.FI for bridges (`src/lib/bridge/lifi.ts` +
  `/api/bridge/*`).
- **Why skip:** LI.FI aggregates 20+ bridge protocols (Stargate, Across, Hop,
  Celer, Connext, etc.) — proven coverage. OKX's bridge catalog is not
  publicly enumerated and requires login to query. A migration would need:
  (a) catalog parity check, (b) side-by-side fee/speed comparison on our
  common pairs, (c) re-implementing `/api/bridge/quote|execute|status` against
  `wallet cross-chain`, (d) fallback to LI.FI for unsupported routes. Multi-day
  effort with non-trivial regression risk. Park until we have a reason to
  migrate (e.g. LI.FI deprecation, cost issues, or a user complaint we can't
  fix in LI.FI).
- **Revisit if:** LI.FI raises fees, deprecates a protocol we depend on, or
  the user reports a routing failure we can verify is bridge-specific.

### Skill / feature: `wallet gas-station` (pay gas in stablecoins)
- **Why skip:** Compelling UX feature but requires UI work — token selection
  for the gas-paying asset, surfacing `--relayer-id` to the user (or hiding
  it behind a sensible default), and a "first-time activation" flow.
  Estimated 1-2 days of UI + state work. No code change needed in
  `walletContractCall` (already accepts the flags via params), but we don't
  yet expose them from any route.
- **Revisit if:** A user complains about needing native gas tokens on a
  chain, or we want a "no native gas required" pitch.

### Skill / feature: `strategy` (limit-order trading)
- **Why skip:** We already have `/swap` (DEX aggregator) and `/trade`
  (Hyperliquid perps). Adding limit orders for spot would compete with
  Hyperliquid spot. Confusing surface unless we redesign `/swap` to be a
  "trade any token" hub.
- **Revisit if:** We do that redesign.

### Skill / feature: `workflow` (multi-step composed calls)
- **Why skip:** We already orchestrate multi-step flows in our API routes
  (`/api/swap/approve` → `/api/swap/execute`, `/api/bridge/quote` →
  `/api/bridge/execute`). Moving the orchestration into onchainos costs us
  observability and error surface.
- **Revisit if:** We find we're duplicating onchainos's workflow logic
  meaningfully.

### Skill / feature: `competition` (agentic competition)
- **Why skip:** Marketing surface. Not aligned with the app's positioning.

### Skill / feature: `wallet geoblock` (Polymarket probe)
- **Why skip:** We don't integrate Polymarket.

### Skill / feature: `wallet qrcode` (Unicode-block QR)
- **Why skip:** Terminal-output convenience. We render QRs in the UI when
  needed via a JS lib, not via the CLI.

### Skill / feature: `mcp` (Run onchainos as an MCP server)
- **Why skip:** This is the "AI-native tools" surface referenced in the
  REST API changelog (2026-03-03). Adopting it would mean the LLM talks to
  `onchainos mcp` directly via stdio, bypassing our Next.js route layer.
  We'd lose:
  - Auth proxying (the route layer enforces our session check)
  - Telemetry / rate-limit / error wrapping
  - The ability to compose tool results before returning to the model
  (e.g. our `/api/ai/chat` orchestrator runs the OpenAI tool loop server-side
  and decides when to stop)
- **Revisit if:** We move to a fully agentic architecture where the LLM is
  the orchestrator and the Next.js routes are just dumb proxies. Big shift.

### Payment skills: `x402-payment`, `a2a-payment`, MPP (now consolidated under `okx-agent-payments-protocol`)
- **Why skip:** Designed for machine-to-machine / agent-to-agent payments
  and paywalled APIs. Not a retail DeFi app use case.

### Skill / feature: `okx-dapp-discovery`
- **Why skip:** Could power an "Explore DApps" tab in the future, but no
  current UI hook. Park.

### REST API features (changelog-side)

- **Mar 30, 2026 EVM router addresses updated (breaking)** — verified our
  swap path takes the router from quote responses, not from a hardcoded
  constant. **No action required.** See `src/app/api/swap/execute/route.ts`
  and `src/lib/okx/dex-api.ts:dexContractAddress`.
- **Apr 23, 2026 `excludePoolAddresses`, `assetAwareRouting`** — advanced
  routing controls. No UI surface for either; users get default routing.
- **May 12, 2026 `forJitoBundle`** — Solana-only. We don't support Solana
  swap yet.
- **May 12, 2026 X Layer / Blast router updates** — auto-handled (same
  reason as Mar 30 routers).
- **WebSocket push channels (Mar 26, 2026)** — could replace SWR polling
  on prices/positions, but requires server-side WS infra we don't have.
  Roadmap item.

---

## Future upgrade procedure

1. Check upstream:
   `curl -sL "https://api.github.com/repos/okx/onchainos-skills/releases?per_page=5" | jq '.[] | {tag: .tag_name, date: .published_at, body: .body}'`
2. If the tag is newer than `LATEST` in `scripts/install-onchainos.sh`,
   download the macOS build to `/tmp/oc<NEW>/onchainos` and `diff <(old --help)
   <(new --help)` for every subcommand listed in this doc's "Surface diff"
   table.
3. List commits between tags via the API
   (`/commits?since=<old-date>&until=<new-date>`) and grep for `wallet`,
   `sign`, `contract-call`, `BREAKING`.
4. Run `npx tsc --noEmit && npx eslint && npx next build`.
5. Read-only CLI smoke (`wallet status`, `wallet addresses`, `wallet
   sign-message` with a probe payload).
6. Bump `LATEST` and append a section to this doc under "Upgrade
   v<OLD> → v<NEW>" with the audit findings.
