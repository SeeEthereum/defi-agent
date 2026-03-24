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
];
