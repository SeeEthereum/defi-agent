import type { Tool } from "@anthropic-ai/sdk/resources/messages";

export const AI_TOOLS: Tool[] = [
  {
    name: "get_balances",
    description:
      "Get the user's wallet balances across all supported chains (Ethereum, Arbitrum, Base, BNB Chain, Polygon, Optimism)",
    input_schema: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          description:
            "Optional: filter by chain name (ethereum, arbitrum, base, bsc, polygon, optimism). Omit to get balances on all chains.",
        },
      },
    },
  },
  {
    name: "get_fluid_markets",
    description:
      "Get current Fluid lending market data including supply APR, rewards APR, and TVL. Available on Ethereum, Arbitrum, Base, and Polygon (NOT BNB Chain or Optimism).",
    input_schema: {
      type: "object",
      properties: {
        chainIndex: {
          type: "number",
          description:
            "Optional: filter by chain (1=Ethereum, 42161=Arbitrum, 8453=Base, 137=Polygon). Omit for all chains.",
        },
      },
    },
  },
  {
    name: "get_fluid_positions",
    description: "Get the user's current active positions in Fluid lending protocol (what they have supplied and are earning on).",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_swap_quote",
    description:
      "Get a price quote for swapping ANY token pair via the OKX DEX aggregator. Shows expected output amount, price impact, estimated gas, and routing info. Always call this before propose_swap.",
    input_schema: {
      type: "object",
      properties: {
        fromToken: {
          type: "string",
          description:
            "Source token contract address. Use 0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee for native ETH/BNB.",
        },
        toToken: {
          type: "string",
          description: "Destination token contract address.",
        },
        amount: {
          type: "string",
          description:
            "Amount in minimal units (wei/smallest denomination). E.g. \"1000000\" for 1 USDC (6 decimals), \"100000000000000000\" for 0.1 ETH (18 decimals).",
        },
        chain: {
          type: "string",
          description: "Chain name: ethereum, arbitrum, base, bsc, polygon, or optimism.",
        },
      },
      required: ["fromToken", "toToken", "amount", "chain"],
    },
  },
  {
    name: "propose_supply",
    description:
      "Propose supplying assets to Fluid lending protocol to earn yield. Creates an action card for the user to confirm. Does NOT execute the transaction automatically.",
    input_schema: {
      type: "object",
      properties: {
        fTokenSymbol: {
          type: "string",
          description:
            "The fToken symbol to deposit into: fUSDC, fUSDT, fWETH, or fWPOL (Polygon only).",
        },
        amount: {
          type: "string",
          description:
            "Amount in human-readable units (e.g. \"100\" for 100 USDC, \"0.5\" for 0.5 WETH).",
        },
        chainIndex: {
          type: "number",
          description:
            "Chain ID: 1 (Ethereum), 42161 (Arbitrum), 8453 (Base), or 137 (Polygon). NOT 56 (BNB) or 10 (Optimism).",
        },
      },
      required: ["fTokenSymbol", "amount", "chainIndex"],
    },
  },
  {
    name: "propose_swap",
    description:
      "Propose a swap of ANY token pair via OKX DEX aggregator (0 commission, best price across 500+ DEX sources). Supports all ERC-20 tokens, not just stablecoins. Creates an action card for user confirmation. Does NOT execute automatically.",
    input_schema: {
      type: "object",
      properties: {
        fromToken: {
          type: "string",
          description:
            "Source token address. Use 0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee for native ETH/BNB.",
        },
        toToken: {
          type: "string",
          description: "Destination token address.",
        },
        amount: {
          type: "string",
          description:
            "Amount in minimal units (wei). E.g. \"100000000000000000\" for 0.1 ETH.",
        },
        chain: {
          type: "string",
          description: "Chain name: ethereum, arbitrum, base, bsc, polygon, or optimism.",
        },
        slippage: {
          type: "string",
          description:
            "Optional: slippage tolerance in percent (e.g. \"0.5\" for 0.5%). Defaults to 0.5%.",
        },
        gasLevel: {
          type: "string",
          description:
            "Optional: gas priority — slow, average, or fast. Defaults to average.",
        },
        mevProtection: {
          type: "boolean",
          description:
            "Optional: enable MEV protection (sandwich attack prevention). Available on Ethereum, BSC, and Base only.",
        },
      },
      required: ["fromToken", "toToken", "amount", "chain"],
    },
  },
  {
    name: "search_token",
    description:
      "Search for a token by name or symbol to find its contract address. Use this when the user mentions a token you don't have the address for.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Token name or symbol to search for (e.g. 'PEPE', 'Shiba Inu', 'LINK').",
        },
        chain: {
          type: "string",
          description: "Optional: filter by chain name (ethereum, arbitrum, base, bsc, polygon, optimism).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "propose_send",
    description:
      "Propose sending tokens (native or ERC-20) to a recipient address. Creates an action card for user confirmation. Does NOT execute automatically.",
    input_schema: {
      type: "object",
      properties: {
        recipient: {
          type: "string",
          description: "Recipient EVM wallet address (0x...).",
        },
        amount: {
          type: "string",
          description:
            "Amount in human-readable units (e.g. \"0.1\" for 0.1 ETH, \"50\" for 50 USDC).",
        },
        chainIndex: {
          type: "number",
          description:
            "Chain ID: 1 (Ethereum), 42161 (Arbitrum), 8453 (Base), 56 (BNB Chain), 137 (Polygon), or 10 (Optimism).",
        },
        contractToken: {
          type: "string",
          description:
            "ERC-20 token contract address. Omit for native token (ETH/BNB/MATIC).",
        },
      },
      required: ["recipient", "amount", "chainIndex"],
    },
  },
  {
    name: "propose_withdraw",
    description:
      "Propose withdrawing assets from a Fluid lending position. Creates an action card for user confirmation. Does NOT execute automatically.",
    input_schema: {
      type: "object",
      properties: {
        fTokenSymbol: {
          type: "string",
          description:
            "The fToken symbol to withdraw from: fUSDC, fUSDT, fWETH, or fWPOL.",
        },
        amount: {
          type: "string",
          description:
            "Amount in human-readable units (e.g. \"100\" for 100 USDC). Use \"all\" to withdraw entire position.",
        },
        chainIndex: {
          type: "number",
          description:
            "Chain ID: 1 (Ethereum), 42161 (Arbitrum), 8453 (Base), or 137 (Polygon).",
        },
      },
      required: ["fTokenSymbol", "amount", "chainIndex"],
    },
  },
  {
    name: "get_wallet_addresses",
    description:
      "Get the user's wallet deposit addresses across all chains. Useful for receiving tokens or showing the user their address.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_transaction_history",
    description:
      "Get the user's recent transaction history. Shows past sends, swaps, and other on-chain transactions.",
    input_schema: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          description: "Optional: filter by chain name (ethereum, arbitrum, base, bsc, polygon, optimism).",
        },
        limit: {
          type: "number",
          description: "Optional: number of transactions to return (default 10, max 50).",
        },
      },
    },
  },
  {
    name: "scan_token_safety",
    description:
      "Scan one or more tokens for security risks: honeypot detection, high sell tax, mint/pause capabilities, rug pull risk. Use this before swapping into an unknown or suspicious token. Can also scan all tokens held by a wallet address.",
    input_schema: {
      type: "object",
      properties: {
        tokens: {
          type: "string",
          description:
            "Comma-separated list of 'chainId:contractAddress' pairs, up to 10. E.g. '1:0xdac17f958d2ee523a2206206994597c13d831ec7,42161:0xaf88d065e77c8cc2239327c5edb3a432268e5831'. Mutually exclusive with 'address'.",
        },
        address: {
          type: "string",
          description:
            "Wallet address to scan all held tokens. Mutually exclusive with 'tokens'.",
        },
        chain: {
          type: "string",
          description:
            "Optional chain filter when using 'address' mode (e.g. 'ethereum', 'arbitrum').",
        },
      },
    },
  },
  {
    name: "get_approvals",
    description:
      "Get all active token approvals (ERC-20 approve + Permit2) for a wallet address. Shows which contracts are authorized to spend the user's tokens. Important for security hygiene — users should revoke old/unnecessary approvals.",
    input_schema: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          description:
            "Optional: comma-separated chain names or IDs (e.g. 'ethereum,arbitrum' or '1,42161'). Omit for all chains.",
        },
      },
    },
  },
  {
    name: "get_token_price",
    description:
      "Get the current price of a token by its contract address. Returns price in USD, 24h change, market cap, volume and more. Use 0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee for native tokens (ETH/BNB/MATIC) or an empty string.",
    input_schema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description:
            "Token contract address. Use the native token address (0xeee...eee) or empty string for ETH/BNB/MATIC.",
        },
        chain: {
          type: "string",
          description: "Chain name: ethereum, arbitrum, base, bsc, polygon, or optimism.",
        },
      },
      required: ["address", "chain"],
    },
  },
  {
    name: "get_smart_money_signals",
    description:
      "Get latest smart money / KOL / whale buy signals on a specific chain. Shows aggregated buying activity from notable wallets. Use this when the user asks 'what are whales buying?', 'smart money signals', 'what are KOLs trading?'. WARNING: always add a disclaimer that signals are not investment advice.",
    input_schema: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          description: "Chain name: ethereum, arbitrum, base, bsc, polygon, optimism, solana.",
        },
        walletType: {
          type: "string",
          description:
            "Optional: filter by wallet type. '1'=Smart Money, '2'=KOL/Influencer, '3'=Whales. Comma-separated for multiple (e.g. '1,3'). Omit for all.",
        },
        minAmountUsd: {
          type: "string",
          description: "Optional: minimum transaction amount in USD (e.g. '10000').",
        },
      },
      required: ["chain"],
    },
  },
  {
    name: "get_gas_price",
    description:
      "Get current gas prices for a specific chain. Shows slow/average/fast gas prices. Use when the user asks about gas costs or wants to know if it's cheap to transact.",
    input_schema: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          description: "Chain name: ethereum, arbitrum, base, bsc, polygon, or optimism.",
        },
      },
      required: ["chain"],
    },
  },
  {
    name: "get_leaderboard",
    description:
      "Get the top trader leaderboard — ranked by PnL, win rate, ROI, volume, or number of trades. Shows the best-performing wallets on a specific chain. Use when the user asks about top traders, best performers, or leaderboard rankings.",
    input_schema: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          description: "Chain name: ethereum, arbitrum, base, bsc, polygon, solana.",
        },
        timeFrame: {
          type: "string",
          description: "Time frame: '1'=1 day, '2'=3 days, '3'=7 days, '4'=1 month, '5'=3 months. Default '3' (7 days).",
        },
        sortBy: {
          type: "string",
          description: "Sort by: '1'=PnL, '2'=Win Rate, '3'=Tx number, '4'=Volume, '5'=ROI. Default '1' (PnL).",
        },
      },
      required: ["chain"],
    },
  },
  {
    name: "get_address_activities",
    description:
      "Get latest DEX trading activities from smart money wallets, KOLs, or specific tracked addresses. Shows what notable wallets are buying/selling right now.",
    input_schema: {
      type: "object",
      properties: {
        trackerType: {
          type: "string",
          description: "Tracker type: 'smart_money' (or '1'), 'kol' (or '2'), 'multi_address' (or '3'). Default 'smart_money'.",
        },
        walletAddress: {
          type: "string",
          description: "Required for multi_address mode: comma-separated wallet addresses (max 20).",
        },
        chain: {
          type: "string",
          description: "Optional chain filter (e.g. 'ethereum', 'arbitrum'). Omit for all chains.",
        },
        tradeType: {
          type: "string",
          description: "Optional: '0'=all, '1'=buy only, '2'=sell only. Default '0'.",
        },
      },
      required: ["trackerType"],
    },
  },
  {
    name: "bridge_tokens",
    description:
      "Get a bridge quote for transferring tokens across chains via LI.FI bridge aggregator. Shows estimated output, bridge provider, estimated time, and fees. Use when the user wants to move tokens from one chain to another.",
    input_schema: {
      type: "object",
      properties: {
        fromChain: {
          type: "string",
          description:
            "Source chain ID as string (e.g. '1' for Ethereum, '42161' for Arbitrum, '8453' for Base, '56' for BNB, '137' for Polygon, '10' for Optimism).",
        },
        toChain: {
          type: "string",
          description: "Destination chain ID as string.",
        },
        fromToken: {
          type: "string",
          description:
            "Source token contract address (lowercase). Use 0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee for native tokens (ETH/BNB/MATIC).",
        },
        toToken: {
          type: "string",
          description:
            "Destination token contract address (lowercase). Use same as fromToken to bridge the same asset, or 0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee for native tokens.",
        },
        amount: {
          type: "string",
          description:
            "Amount in minimal units (wei/smallest denomination). E.g. '100000000000000000' for 0.1 ETH (18 decimals), '100000000' for 100 USDC (6 decimals).",
        },
      },
      required: ["fromChain", "toChain", "fromToken", "toToken", "amount"],
    },
  },
  {
    name: "propose_bridge",
    description:
      "Propose a cross-chain bridge transfer for user confirmation. Use bridge_tokens first to get a quote, then propose_bridge to create the action card. The user must confirm before execution.",
    input_schema: {
      type: "object",
      properties: {
        fromChain: {
          type: "string",
          description: "Source chain ID (e.g. '42161' for Arbitrum)",
        },
        toChain: {
          type: "string",
          description: "Destination chain ID (e.g. '1' for Ethereum)",
        },
        fromToken: {
          type: "string",
          description: "Source token contract address",
        },
        toToken: {
          type: "string",
          description:
            "Destination token contract address. Can differ from fromToken for cross-token bridges.",
        },
        fromAmount: {
          type: "string",
          description: "Amount in minimal units (wei)",
        },
        fromTokenSymbol: {
          type: "string",
          description: "Source token symbol for display (e.g. 'USDC')",
        },
        toTokenSymbol: {
          type: "string",
          description: "Destination token symbol for display (e.g. 'ETH')",
        },
        estimatedOutput: {
          type: "string",
          description:
            "Estimated output amount in human-readable form from the quote",
        },
        bridge: {
          type: "string",
          description:
            "Bridge provider name from the quote (e.g. 'stargate', 'across')",
        },
      },
      required: [
        "fromChain",
        "toChain",
        "fromToken",
        "toToken",
        "fromAmount",
      ],
    },
  },
  {
    name: "scan_dapp_safety",
    description:
      "Scan a URL or domain for phishing, scam, or blacklisted status. Use when the user shares a suspicious URL or asks if a website is safe to interact with.",
    input_schema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Full URL or domain to check (e.g. 'https://app.uniswap.org' or 'uniswap.org').",
        },
      },
      required: ["domain"],
    },
  },

  // ── Hyperliquid Perpetuals ─────────────────────────────────────────────────

  {
    name: "get_hl_positions",
    description:
      "Get open perpetual positions and account summary on Hyperliquid. Returns unrealized PnL, liquidation prices, leverage, and margin usage. Use when user asks about their Hyperliquid positions, perp trades, or HL account.",
    input_schema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "Optional wallet address. Defaults to the connected wallet.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_hl_prices",
    description:
      "Get current perpetual market prices on Hyperliquid. Returns mid prices for all markets or a specific coin. Use before proposing an order or when the user asks for perp prices.",
    input_schema: {
      type: "object",
      properties: {
        coin: {
          type: "string",
          description: "Specific coin symbol to query (e.g. 'BTC', 'ETH', 'SOL'). Omit for all markets.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_hl_orders",
    description:
      "List open perpetual orders on Hyperliquid (limit, TP/SL). Use when the user asks about pending orders.",
    input_schema: {
      type: "object",
      properties: {
        coin: {
          type: "string",
          description: "Optional filter by coin symbol.",
        },
      },
      required: [],
    },
  },
  {
    name: "propose_hl_order",
    description:
      "Propose a perpetual order on Hyperliquid for user confirmation. ALWAYS call get_hl_prices first to check the current price, then propose_hl_order to create the action card. The user must confirm before execution. Use for long/short positions with optional leverage, stop loss, and take profit.",
    input_schema: {
      type: "object",
      properties: {
        coin: {
          type: "string",
          description: "Coin symbol (e.g. 'BTC', 'ETH', 'SOL', 'HYPE')",
        },
        side: {
          type: "string",
          enum: ["buy", "sell"],
          description: "'buy' for LONG, 'sell' for SHORT",
        },
        size: {
          type: "string",
          description: "Position size in base coin units (e.g. '0.01' for 0.01 BTC). Min notional $10.",
        },
        type: {
          type: "string",
          enum: ["market", "limit"],
          description: "Order type. Default: 'market'.",
        },
        price: {
          type: "string",
          description: "Limit price in USDC. Only for limit orders.",
        },
        leverage: {
          type: "number",
          description: "Cross leverage multiplier (1–50). Default: 10.",
        },
        slPx: {
          type: "string",
          description: "Stop-loss trigger price in USDC. Must be below entry for longs, above for shorts.",
        },
        tpPx: {
          type: "string",
          description: "Take-profit trigger price in USDC. Must be above entry for longs, below for shorts.",
        },
        currentPrice: {
          type: "string",
          description: "Current mark price from get_hl_prices, for display in the confirmation card.",
        },
      },
      required: ["coin", "side", "size"],
    },
  },
  {
    name: "propose_hl_close",
    description:
      "Propose closing an open Hyperliquid perpetual position for user confirmation. Get current positions with get_hl_positions first.",
    input_schema: {
      type: "object",
      properties: {
        coin: {
          type: "string",
          description: "Coin symbol of the position to close (e.g. 'BTC')",
        },
        size: {
          type: "string",
          description: "Optional partial close size. Omit to close the full position.",
        },
        unrealizedPnl: {
          type: "string",
          description: "Current unrealized PnL from get_hl_positions, for display.",
        },
      },
      required: ["coin"],
    },
  },
];
