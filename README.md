# DeFi Agent

**AI-powered DeFi management platform built on OKX Agentic Wallet.**

Trade any token, earn yield, and manage your crypto portfolio — all from a single interface, with an AI assistant that can do it all via chat.

> Created by [0xSalvo](https://x.com/salvodisobey)

---

## What is DeFi Agent?

DeFi Agent is a non-custodial DeFi platform that combines:

- **DEX Aggregation** — swap any token across 500+ DEX sources at the best price, zero platform fees
- **Yield Farming** — supply assets to Fluid Protocol and earn passive interest
- **AI Assistant** — a conversational interface powered by GPT-4.1 that can execute any operation the app supports
- **Hardware-grade Security** — private keys live inside OKX's TEE (Trusted Execution Environment), never exposed to the app or the user

No seed phrases. No browser extensions. Just email login and you're in.

---

## Features

### Swap

- Any ERC-20 token pair on any supported chain
- Aggregates 500+ DEX sources (Uniswap, SushiSwap, Curve, Balancer, etc.)
- 0% platform commission — only blockchain gas fees
- Real-time wallet balances shown during token selection
- Configurable slippage tolerance (0.1% – 50%)
- MEV protection (anti-sandwich attacks) on Ethereum, BSC, Base
- Pre-execution security scan on every transaction
- Automatic USDT allowance reset handling

### Earn (Fluid Protocol)

- Supply USDC, USDT, WETH, or WPOL to earn interest
- ERC-4626 tokenized vaults (fUSDC, fUSDT, fWETH, fWPOL)
- Live APR from on-chain LendingResolver
- Native ETH deposits (no manual WETH wrapping needed)
- Partial or full withdrawal with dust-free share redemption
- Available on Ethereum, Arbitrum, Base, Polygon

### AI Assistant

- Conversational DeFi management powered by GPT-4.1
- 10 integrated tools: balances, swap quotes, token search, supply, withdraw, send, transaction history
- Action cards with user confirmation — the AI never executes without approval
- Multilingual — understands and responds in the user's language

### Dashboard

- Total portfolio value across all chains
- Chain allocation visualization
- Top holdings sorted by USD value
- Quick actions to Swap, Earn, Wallet, AI

### Wallet

- Multi-chain balance view with USD values
- Send native tokens and ERC-20s
- Transaction history
- Deposit addresses for receiving funds

---

## Supported Chains

| Chain | Swap | Earn | Gas |
|-------|------|------|-----|
| Ethereum | Yes | Yes | High |
| Arbitrum | Yes | Yes | Low |
| Base | Yes | Yes | Low |
| BNB Chain | Yes | No | Low |
| Polygon | Yes | Yes | Low |
| Optimism | Yes | No | Low |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js (App Router), React, Tailwind CSS, shadcn/ui |
| Backend | Next.js API Routes |
| Wallet | OKX Agentic Wallet (TEE) via `onchainos` CLI |
| Swap | OKX DEX Aggregator API (HMAC-SHA256 auth) |
| Lending | Fluid Protocol (ERC-4626, on-chain resolver) |
| AI | OpenAI GPT-4.1 with function calling |
| Auth | Email + OTP via OKX Wallet |
| Hosting | Render |

---

## Security

- **TEE custody** — private keys are generated and stored inside OKX's hardware enclave. They are never exposed to the server, the frontend, or the user.
- **No seed phrases** — wallet access is tied to your email. No mnemonic to lose or get stolen.
- **Pre-execution scanning** — every swap transaction is analyzed for malicious contracts, rug pulls, and suspicious activity before signing.
- **MEV protection** — optional sandwich attack prevention on supported chains.
- **Slippage guards** — configurable tolerance to prevent excessive price impact losses.

---

## Getting Started

### Prerequisites

- Node.js 18+
- An OKX developer account with API credentials
- An OpenAI API key

### Environment Variables

Create a `.env.local` file:

```env
OKX_API_KEY=your_api_key
OKX_SECRET_KEY=your_secret_key
OKX_PASSPHRASE=your_passphrase
OKX_PROJECT_ID=your_project_id
OPENAI_API_KEY=your_openai_key
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
│   ├── auth/              # Login page (email + OTP)
│   ├── welcome/           # Onboarding slides
│   └── (app)/
│       ├── page.tsx        # Dashboard
│       ├── wallet/         # Wallet management
│       ├── earn/           # Fluid lending UI
│       ├── swap/           # DEX swap UI
│       └── ai/             # AI Assistant chat
├── lib/
│   ├── ai/
│   │   ├── orchestrator.ts # GPT-4.1 agentic loop
│   │   ├── tools.ts        # Tool definitions
│   │   └── system-prompt.ts
│   ├── okx/
│   │   ├── cli.ts          # onchainos CLI wrapper
│   │   └── dex-api.ts      # OKX DEX Aggregator HTTP client
│   ├── fluid/
│   │   ├── constants.ts    # fToken addresses & configs
│   │   ├── abis.ts         # ERC-4626 & resolver ABIs
│   │   ├── ftokens.ts      # Calldata encoding
│   │   ├── resolver.ts     # On-chain data fetching
│   │   └── client.ts       # Viem public clients
│   └── chains.ts           # Chain configurations
└── components/
    └── token-icon.tsx       # Token logo rendering (40+ tokens)
```

---

## License

This project is proprietary software. All rights reserved.
