# DeFi Agent

**AI-powered, non-custodial DeFi command center built on OKX Agentic Wallet.**

Swap any token, bridge across chains, earn yield, scan for risks, track smart money, and manage your crypto portfolio — all from a single interface, with a conversational AI agent that can execute every operation by chat. Email login, TEE custody, no seed phrases.

> Created by [0xSalvo](https://x.com/salvodisobey)

---

## What is DeFi Agent?

DeFi Agent is a non-custodial DeFi platform that combines:

- **DEX Aggregation** — swap any token across 500+ DEX sources at the best price, zero platform fees
- **Cross-Chain Bridge** — bridge tokens between any supported chain via LI.FI aggregator (20+ bridge protocols), with cross-token support
- **Yield Farming** — supply assets to Fluid Protocol and earn passive interest
- **Security Center** — scan tokens for honeypots and rug pulls, manage and revoke ERC-20 approvals, check DApps for phishing
- **Smart Money Intelligence** — track whale/KOL/smart money buy signals and view top trader leaderboards
- **Market Data** — real-time token prices, candlestick charts, gas prices across all chains
- **Gas Station** — pay gas with USDT/USDC/USDG when you have no native token: swap, bridge, and send prompt you to enable it on the fly (a small service fee in the chosen stablecoin applies)
- **AI Assistant** — a conversational interface powered by GPT-4.1 that can execute any operation the app supports, including bridging
- **Hardware-grade Security** — private keys live inside OKX's TEE (Trusted Execution Environment), never exposed to the app or the user

No seed phrases. No browser extensions. Just email login and you're in.

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
| Visual identity | Voxr-inspired dark theme — OKLCH tokens, iridescent 3D prop (Three.js + R3F + drei), procedural Lightformer environment, Apple-style motion (`motion/react`) |
| Backend | Next.js API Routes (35+ endpoints) |
| Wallet | OKX Agentic Wallet (TEE) via `onchainos` CLI |
| Swap | OKX DEX Aggregator API (HMAC-SHA256 auth) |
| Bridge | LI.FI Aggregator (20+ bridge protocols, cross-token) |
| Lending | Fluid Protocol (ERC-4626, on-chain resolver via viem) |
| AI | OpenAI GPT-4.1 with function calling (27 tools) |
| Security | OKX Security APIs (token-scan, dapp-scan, tx-scan, approvals) |
| Market Data | OKX Market APIs (price, kline, index, signals, leaderboard) |
| Attribution | ERC-8021 Builder Codes (transaction attribution) |
| Auth | Email + OTP via OKX Wallet |
| Hosting | Render |

---

## Security

- **TEE custody** — private keys are generated and stored inside OKX's hardware enclave. They are never exposed to the server, the frontend, or the user.
- **No seed phrases** — wallet access is tied to your email. No mnemonic to lose or get stolen.
- **Pre-execution scanning** — every swap transaction is analyzed for malicious contracts, rug pulls, and suspicious activity before signing.
- **Token safety scanning** — detect honeypots, high tax tokens, mint/pause risks, and rug pull indicators before you trade.
- **Approval management** — view and identify risky ERC-20/Permit2 approvals that should be revoked.
- **DApp phishing detection** — scan URLs for known phishing sites and blacklisted domains.
- **MEV protection** — optional sandwich attack prevention on supported chains.
- **Slippage guards** — configurable tolerance to prevent excessive price impact losses.
- **ERC-8021 attribution** — all transactions include a Builder Code suffix for on-chain attribution (zero execution cost, feature-flaggable).

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

# Optional: disable ERC-8021 Builder Code suffix injection
# OKX_BUILDER_CODE_DISABLED=true
```

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Deploy

The app is configured for deployment on [Render](https://render.com). Push to `main` and Render will auto-deploy.

---

## Architecture

```
src/
├── app/
│   ├── auth/                # Login page (email + OTP)
│   ├── welcome/             # Onboarding / disclaimer
│   └── (app)/
│       ├── page.tsx          # Dashboard
│       ├── wallet/           # Wallet management
│       ├── earn/             # Fluid lending UI
│       ├── swap/             # DEX swap UI
│       ├── bridge/           # Cross-chain bridge UI
│       ├── ai/               # AI Assistant chat
│       ├── security/         # Token scanner + Approvals manager + Revoke
│       └── signals/          # Smart money signals + Leaderboard
├── app/api/
│   ├── auth/                 # login, verify, status, logout
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
│   └── portfolio/pnl/        # DEX PnL overview
├── lib/
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

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Initiate email login |
| POST | `/api/auth/verify` | Verify OTP code |
| GET | `/api/auth/status` | Check login status |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/wallet/balances` | Get wallet balances |
| GET | `/api/wallet/addresses` | Get deposit addresses |
| POST | `/api/wallet/send` | Send tokens |
| GET | `/api/wallet/history` | Transaction history |
| GET | `/api/wallet/accounts` | List wallet accounts |
| POST | `/api/swap/quote` | Get swap quote |
| POST | `/api/swap/approve` | Approve token for swap |
| POST | `/api/swap/execute` | Execute swap |
| GET | `/api/bridge/quote` | Cross-chain bridge quote |
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

---

## License

This project is proprietary software. All rights reserved.
