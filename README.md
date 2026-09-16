# albicocca

**AI-powered, non-custodial DeFi command center built on OKX Agentic Wallet.**

Swap any token, bridge across chains, earn yield, scan for risks, track smart money, and manage your crypto portfolio — all from a single interface, with a conversational AI agent that can execute every operation by chat. Sign in with Google, Apple or email, TEE custody, no seed phrases.

> Created by [0xSalvo](https://x.com/salvodisobey)

---

## What is albicocca?

albicocca is a non-custodial DeFi platform that combines:

- **DEX Aggregation** — swap any token across 500+ DEX sources at the best price, zero platform fees
- **Cross-Chain Bridge** — bridge tokens between any supported chain via LI.FI aggregator (20+ bridge protocols), with cross-token support
- **Yield Farming** — supply assets to Fluid Protocol and earn passive interest
- **Security Center** — scan tokens for honeypots and rug pulls, manage and revoke ERC-20 approvals, check DApps for phishing
- **Smart Money Intelligence** — track whale/KOL/smart money buy signals and view top trader leaderboards
- **Market Data** — real-time token prices, candlestick charts, gas prices across all chains
- **Gas Station** — pay gas with USDT/USDC/USDG when you have no native token: swap, bridge, and send prompt you to enable it on the fly (a small service fee in the chosen stablecoin applies)
- **AI Assistant** — a conversational interface powered by GPT-4.1 that can execute any operation the app supports, including bridging
- **Hardware-grade Security** — private keys live inside OKX's TEE (Trusted Execution Environment), never exposed to the app or the user

No seed phrases. No browser extensions. Sign in with Google, Apple or email and you're in.

---

## Features

### Swap

- Any ERC-20 token pair on any supported chain
- Aggregates 500+ DEX sources (Uniswap, SushiSwap, Curve, Balancer, etc.)
- 0% platform commission — only blockchain gas fees
- Real-time wallet balances shown during token selection
- Configurable slippage tolerance (0.1% – 50%) with auto-slippage mode
- MEV protection (anti-sandwich attacks) on Ethereum, BSC, Base
- Pre-execution security scan on every transaction
- Automatic USDT allowance reset handling
- Trending tokens section with 24h price data
- ERC-8021 Builder Code attribution for transaction tracking

### Bridge (Cross-Chain)

- Transfer tokens across any supported chain via LI.FI bridge aggregator
- Aggregates 20+ bridge protocols (Stargate, Across, Hop, Celer, Connext, etc.) for optimal routing
- **Cross-token bridging** — bridge USDC on Arbitrum to ETH on Ethereum, or any combination
- **Wallet assets view** — see your tokens per chain with balances and USD values
- MAX button for quick full-balance bridging
- Real-time quote preview with estimated output, bridge provider, time estimate, and fee breakdown
- Transaction status tracking with automatic polling until completion
- Explorer links for both source and destination chain transactions
- 0% platform commission — only bridge protocol fees and gas
- ERC-8021 Builder Code attribution

### Earn (Fluid Protocol)

- Supply USDC, USDT, WETH, or WPOL to earn interest
- ERC-4626 tokenized vaults (fUSDC, fUSDT, fWETH, fWPOL)
- Live APR from on-chain LendingResolver
- Native ETH deposits (no manual WETH wrapping needed)
- Partial or full withdrawal with dust-free share redemption
- Available on Ethereum, Arbitrum, Base, Polygon

### Security Center

- **Token Scanner** — batch scan tokens for honeypot detection, high buy/sell tax, mint/pause capabilities, rug pull risk
  - Scan your entire wallet portfolio with one click
  - Or scan specific tokens by contract address
  - Risk level badges (Safe / Medium / High) with detailed risk factors
- **Approvals Manager** — view and revoke active ERC-20 and Permit2 approvals
  - See which contracts can spend your tokens
  - Identify unlimited approvals that should be revoked
  - **One-click revoke** — revoke any approval directly from the UI (calls `approve(spender, 0)`)
  - Loading, success, and error states per approval
  - Filter by chain
- **DApp Scanner** — check URLs for phishing, scams, and blacklisted domains (via AI chatbot)

### Intelligence (Smart Money Tracking)

- **Smart Money Signals** — aggregated buy signals from notable wallets
  - Filter by wallet type: Smart Money, KOL/Influencer, Whales
  - Shows token, price, 24h change, total volume, market cap, liquidity
  - Filter by chain
- **Top Trader Leaderboard** — ranked by PnL, Win Rate, ROI, Volume, or Tx count
  - Time frames: 1 day, 3 days, 7 days, 1 month, 3 months
  - Wallet type badges (Sniper, Dev, Fresh, Smart Money, KOL)
- **Address Tracker** — follow specific wallets or track smart money/KOL DEX activity (via AI chatbot or API)

### Market Data

- **Token Prices** — real-time USD price for any token by contract address
- **Candlestick Charts** — K-line data with configurable intervals (1s to 1W, up to 299 points)
- **Index Prices** — aggregated prices from multiple third-party sources
- **Gas Prices** — current gas cost for any supported chain (via AI chatbot)

### AI Assistant

- Conversational DeFi management powered by GPT-4.1
- **21 integrated tools:**
  - `get_balances` — portfolio balances across all chains
  - `get_fluid_markets` — Fluid lending APR data
  - `get_fluid_positions` — user's active lending positions
  - `get_swap_quote` — DEX swap price quotes
  - `search_token` — find tokens by name or symbol
  - `propose_swap` — propose token swaps for user confirmation
  - `propose_supply` — propose Fluid lending deposits
  - `propose_withdraw` — propose Fluid lending withdrawals
  - `propose_send` — propose token transfers
  - `bridge_tokens` — cross-chain bridge quotes via LI.FI
  - `propose_bridge` — propose cross-chain bridge for user confirmation
  - `get_wallet_addresses` — deposit addresses
  - `get_transaction_history` — past transaction records
  - `scan_token_safety` — honeypot and risk detection
  - `get_approvals` — active ERC-20 approval management
  - `get_token_price` — real-time token prices
  - `get_smart_money_signals` — whale/KOL buy signals
  - `get_gas_price` — current gas costs
  - `get_leaderboard` — top trader rankings
  - `get_address_activities` — smart money/KOL DEX activity feed
  - `scan_dapp_safety` — phishing URL detection
- Action cards with user confirmation — the AI never executes without approval
- Multilingual — understands and responds in the user's language

### Dashboard

- Total portfolio value across all chains
- Chain allocation visualization bar
- DEX trading performance (PnL, win rate, volume, trades)
- Top holdings sorted by USD value
- Quick actions: Wallet, Earn, Swap, AI, Security, Intelligence
- Top Fluid markets by APY

### Wallet

- Multi-chain balance view with USD values
- Send native tokens and ERC-20s
- Transaction history
- Deposit addresses for receiving funds

---

## Supported Chains

| Chain | Swap | Bridge | Earn | Security | Signals | Gas |
|-------|------|--------|------|----------|---------|-----|
| Ethereum | Yes | Yes | Yes | Yes | Yes | High |
| Arbitrum | Yes | Yes | Yes | Yes | Yes | Low |
| Base | Yes | Yes | Yes | Yes | Yes | Low |
| BNB Chain | Yes | Yes | No | Yes | Yes | Low |
| Polygon | Yes | Yes | Yes | Yes | Yes | Low |
| Optimism | Yes | Yes | No | Yes | Yes | Low |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui |
| Visual identity | Light theme from the vocina design family — Apple system type, apricot `#ff7a1a` accent, scroll reveals, parallax and floating tiles on the landing, `motion/react` in the app |
| Backend | Next.js API Routes (35+ endpoints) |
| Wallet | OKX Agentic Wallet (TEE) via `onchainos` CLI |
| Swap | OKX DEX Aggregator API (HMAC-SHA256 auth) |
| Bridge | LI.FI Aggregator (20+ bridge protocols, cross-token) |
| Lending | Fluid Protocol (ERC-4626, on-chain resolver via viem) |
| AI | OpenAI GPT-4.1 with function calling (27 tools) |
| Security | OKX Security APIs (token-scan, dapp-scan, tx-scan, approvals) |
| Market Data | OKX Market APIs (price, kline, index, signals, leaderboard) |
| Attribution | ERC-8021 Builder Codes (transaction attribution) |
| Auth | Browser sign-in via OKX Wallet (Google, Apple or email), polled server-side |
| Hosting | Render |

---

## Security

### Wallet isolation

- **One wallet per browser session** — every browser gets a signed, `httpOnly` session cookie and its own private onchainos keystore (`ONCHAINOS_HOME` per session, file keyring forced on). One user's sign-in, keystore and signing key are never visible to another.
- **No ambient authority** — every API route runs inside a verified session (`withSession`). A request without a valid session cookie gets 401, and a call made outside a session context fails closed instead of falling back to a shared wallet.
- **CSRF protection** — `src/proxy.ts` rejects any state-changing API call whose `Origin` is missing or does not match the host.
- **Session hygiene** — logout wipes the keystore directory and the cookie; abandoned login directories are swept after 2 hours, inactive keystores after 30 days.

### Transaction safety

- **TEE custody** — private keys are generated and stored inside OKX's hardware enclave. They are never exposed to the server, the frontend, or the user.
- **No seed phrases** — sign in with Google, Apple or email. No mnemonic to lose or get stolen.
- **The server picks the address** — the recipient of a swap, the sender of a bridge and the destination of a Hyperliquid withdrawal always come from the signed-in session, never from the request body.
- **Quote binding** — a quote route issues a one-minute, session-scoped quote id; the matching execute route refuses to sign without it, and refuses again if the price moved more than 1% since the quote.
- **Exact-amount approvals** — ERC-20 approvals cover only the amount being spent, with the existing allowance checked first (and the USDT zero-reset handled).
- **Spender checks** — a bridge is signed only when the quote's target contract and its approval spender match the request that produced it.
- **Pre-execution scanning** — every swap is analyzed for malicious contracts and rug pulls before signing, and a scan that fails to answer blocks the transaction instead of waving it through.
- **Strict input validation** — amounts must be plain positive numbers (no exponent, no negative, comma accepted and normalized), addresses must be real EVM addresses, chains must be supported, slippage is capped at 5%.
- **Explicit confirmations** — sending, supplying, withdrawing, revoking, opening and closing a position all require a confirmation showing the exact parameters, and double submission is blocked.
- **MEV protection** — optional sandwich attack prevention on supported chains.
- **ERC-8021 attribution** — transactions carry a Builder Code suffix for on-chain attribution (zero execution cost, feature-flaggable).

### AI safety

- **The agent never signs** — it can only propose an action; the transaction leaves only after you confirm it in the UI.
- **Proposals are validated server-side** — every parameter the model produces is re-checked against the same schemas the execution routes use.
- **Prompt-injection resistant** — tool results are treated as untrusted data, and the system prompt forbids acting on instructions found inside them.
- **Bounded cost** — the tool loop is capped, each turn has a timeout, and the chat endpoint is rate-limited per session.

### Other

- **Token safety scanning** — honeypots, high tax tokens, mint/pause risks and rug pull indicators.
- **Approval management** — view and revoke risky ERC-20/Permit2 approvals.
- **DApp phishing detection** — scan URLs for known phishing sites and blacklisted domains.
- **Quota protection** — the paid market endpoints are rate-limited per session (20-60 requests per minute depending on the route).
- **Errors stay inside** — CLI stderr, file paths and upstream bodies are logged server-side; the client only sees messages it can act on.

---

## Getting Started

### Prerequisites

- Node.js 18+
- An OKX developer account with API credentials ([get them here](https://web3.okx.com/onchainos/dev-portal/project))
- An OpenAI API key

### Environment Variables

Create a `.env.local` file:

```env
OKX_API_KEY=your_api_key
OKX_SECRET_KEY=your_secret_key
OKX_PASSPHRASE=your_passphrase
OKX_PROJECT_ID=your_project_id
OPENAI_API_KEY=your_openai_key

# Signs the per-browser session cookie (required in production, 32+ chars)
SESSION_SECRET=output_of_openssl_rand_hex_32

# Optional: where each session's private onchainos keystore lives
# (default ./.data/sessions — use a persistent disk to survive restarts)
# ONCHAINOS_SESSIONS_DIR=/var/data/sessions

# Optional: extra origins allowed to call state-changing APIs
# ALLOWED_ORIGINS=https://app.example.com

# Optional: enables GET /api/debug/health with header x-debug-token
# DEBUG_HEALTH_TOKEN=some-long-random-value

# Optional: disable ERC-8021 Builder Code suffix injection
# OKX_BUILDER_CODE_DISABLED=true
```

### Multi-user notes

Each browser session has its own wallet — a private onchainos keystore under `ONCHAINOS_SESSIONS_DIR`. Two consequences:

- The app must run as a **single instance**: locks and in-flight login state live in process memory and are not shared across replicas.
- The sessions directory defaults to `./.data/sessions`, inside the build directory. On a host without a persistent disk (Render's free plan, for example) **every deploy signs all users out** and they sign in again with OKX. Mount a disk and point `ONCHAINOS_SESSIONS_DIR` at it to avoid that.

`SESSION_SECRET` must stay stable: rotating it invalidates every session cookie and signs everyone out.

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Deploy

The app is configured for deployment on [Render](https://render.com). Push to `main` and Render will auto-deploy.

Before the first deploy, set the secrets in the Render dashboard (`OKX_*`, `OPENAI_API_KEY`) and make sure `SESSION_SECRET` exists — `render.yaml` generates it, but a service created before it was added needs it set by hand. In production the app refuses to sign session cookies without it. Keep the service on a single instance.

---

## Architecture

```
src/
├── app/
│   ├── welcome/             # Landing page (albicocca design)
│   ├── auth/                # Risk disclaimer, then OKX browser sign-in
│   └── (app)/
│       ├── page.tsx          # Dashboard
│       ├── wallet/           # Wallet management
│       ├── earn/             # Fluid lending UI
│       ├── swap/             # DEX swap UI
│       ├── bridge/           # Cross-chain bridge UI
│       ├── ai/               # AI Assistant chat
│       ├── security/         # Token scanner + Approvals manager + Revoke
│       └── signals/          # Smart money signals + Leaderboard
├── proxy.ts                  # Session cookie + CSRF origin check (Next 16 proxy)
├── app/api/
│   ├── auth/                 # login, poll, status, logout
│   ├── wallet/               # balances, addresses, send, history, accounts
│   ├── swap/                 # quote, approve, execute
│   ├── earn/                 # markets, positions, supply, withdraw, approve
│   ├── ai/chat/              # AI orchestrator endpoint
│   ├── bridge/               # quote, execute, tokens, status
│   ├── security/             # token-scan, approvals, revoke, dapp-scan
│   ├── market/               # price, kline
│   ├── signals/              # smart money signal list
│   ├── gateway/gas/          # gas prices
│   ├── leaderboard/          # top trader rankings
│   ├── tracker/              # address activity tracker
│   ├── tokens/               # search, trending
│   ├── perp/                 # Hyperliquid: markets, order, close, tpsl, deposit, withdraw
│   └── portfolio/pnl/        # DEX PnL overview
├── lib/
│   ├── session/
│   │   ├── session.ts        # Per-session keystore, withSession, sweep
│   │   └── token.ts          # Signed session cookie
│   ├── api/
│   │   ├── validation.ts     # Shared zod schemas + safe error mapping
│   │   ├── quote-store.ts    # Quote id binding for swap and bridge
│   │   └── rate-limit.ts     # Per-session request budgets
│   ├── ai/
│   │   ├── orchestrator.ts   # GPT-4.1 agentic loop (27 tools)
│   │   ├── tools.ts          # Tool definitions
│   │   └── system-prompt.ts  # AI system prompt
│   ├── okx/
│   │   ├── cli.ts            # onchainos CLI wrapper (30+ commands)
│   │   ├── dex-api.ts        # OKX DEX Aggregator HTTP client
│   │   ├── builder-code.ts   # ERC-8021 attribution suffix
│   │   └── types.ts          # TypeScript interfaces
│   ├── bridge/
│   │   └── lifi.ts           # LI.FI bridge aggregator client
│   ├── hyperliquid/          # Perp trading: signer, markets, order math
│   ├── fluid/
│   │   ├── constants.ts      # fToken addresses & configs
│   │   ├── abis.ts           # ERC-4626 & resolver ABIs
│   │   ├── ftokens.ts        # Calldata encoding
│   │   ├── resolver.ts       # On-chain data fetching
│   │   └── client.ts         # Viem public clients
│   └── chains.ts             # Chain configurations (6 chains)
└── components/
    ├── layout/                # Sidebar, Header, Mobile nav
    ├── ui/                    # shadcn/ui components
    └── token-icon.tsx         # Token logo rendering (40+ tokens)
```

---

## API Endpoints

Every endpoint requires the session cookie, and every state-changing call must carry a same-origin `Origin` header. `/api/swap/execute` and `/api/bridge/execute` also require the `quoteId` returned by the matching quote endpoint.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Start browser sign-in, returns the OKX login URL |
| GET | `/api/auth/poll` | Progress of the in-flight sign-in (in-memory, no CLI call) |
| DELETE | `/api/auth/poll` | Cancel the in-flight sign-in |
| GET | `/api/auth/status` | Check login status |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/wallet/balances` | Get wallet balances |
| GET | `/api/wallet/addresses` | Get deposit addresses |
| POST | `/api/wallet/send` | Send tokens |
| GET | `/api/wallet/history` | Transaction history |
| GET | `/api/wallet/accounts` | List wallet accounts |
| POST | `/api/swap/quote` | Get swap quote, returns `quoteId` |
| POST | `/api/swap/approve` | Approve token for swap |
| POST | `/api/swap/execute` | Execute swap |
| GET | `/api/bridge/quote` | Cross-chain bridge quote, returns `quoteId` |
| POST | `/api/bridge/execute` | Execute cross-chain bridge |
| GET | `/api/bridge/tokens` | Available bridge tokens per chain |
| GET | `/api/bridge/status` | Bridge transaction status |
| GET | `/api/earn/markets` | Fluid lending markets |
| GET | `/api/earn/positions` | User's lending positions |
| POST | `/api/earn/approve` | Approve token for lending |
| POST | `/api/earn/supply` | Supply to Fluid vault |
| POST | `/api/earn/withdraw` | Withdraw from Fluid vault |
| POST | `/api/ai/chat` | AI assistant chat |
| GET | `/api/security/token-scan` | Batch token security scan |
| GET | `/api/security/approvals` | ERC-20/Permit2 approvals |
| POST | `/api/security/revoke` | Revoke token approval |
| GET | `/api/security/dapp-scan` | DApp/URL phishing check |
| GET | `/api/market/price` | Token price by address |
| GET | `/api/market/kline` | Candlestick chart data |
| GET | `/api/gateway/gas` | Current gas prices |
| GET | `/api/signals` | Smart money buy signals |
| GET | `/api/leaderboard` | Top trader rankings |
| GET | `/api/tracker` | Address activity tracker |
| GET | `/api/tokens/search` | Token search |
| GET | `/api/tokens/trending` | Trending tokens |
| GET | `/api/portfolio/pnl` | Portfolio PnL overview |
| GET | `/api/perp/markets` | Hyperliquid markets with live mids and max leverage |
| GET | `/api/perp/positions` | Open perp positions |
| GET | `/api/perp/orders` | Open perp orders |
| GET | `/api/perp/prices` | Perp mid prices |
| GET | `/api/perp/quickstart` | Perp onboarding state for this session |
| GET | `/api/perp/register` | Signing address registration state |
| POST | `/api/perp/order` | Place a perp order |
| POST | `/api/perp/close` | Close a position (reduce-only) |
| POST | `/api/perp/cancel` | Cancel an order |
| POST | `/api/perp/tpsl` | Set take-profit / stop-loss |
| POST | `/api/perp/deposit` | Deposit USDC from Arbitrum |
| POST | `/api/perp/withdraw` | Withdraw USDC to your own address |

---

## License

This project is proprietary software. All rights reserved.
