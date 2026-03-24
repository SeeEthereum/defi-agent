import type { Tool } from "@anthropic-ai/sdk/resources/messages";

export const AI_TOOLS: Tool[] = [
  {
    name: "get_balances",
    description:
      "Get the user's wallet balances across all supported chains (Ethereum, Arbitrum, Base, BNB Chain)",
    input_schema: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          description:
            "Optional: filter by chain name (ethereum, arbitrum, base, bnb). Omit to get balances on all chains.",
        },
      },
    },
  },
  {
    name: "get_fluid_markets",
    description:
      "Get current Fluid lending market data including supply APR, rewards APR, and TVL. Available on Ethereum, Arbitrum, and Base only (NOT BNB Chain).",
    input_schema: {
      type: "object",
      properties: {
        chainIndex: {
          type: "number",
          description:
            "Optional: filter by chain (1=Ethereum, 42161=Arbitrum, 8453=Base). Omit for all chains.",
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
      "Get a price quote for swapping tokens. Shows expected output amount, price impact, and estimated gas. Always call this before propose_swap.",
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
          description: "Chain name: ethereum, arbitrum, base, or bsc.",
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
            "The fToken symbol to deposit into: fUSDC, fUSDT, or fWETH.",
        },
        amount: {
          type: "string",
          description:
            "Amount in human-readable units (e.g. \"100\" for 100 USDC, \"0.5\" for 0.5 WETH).",
        },
        chainIndex: {
          type: "number",
          description:
            "Chain ID: 1 (Ethereum), 42161 (Arbitrum), or 8453 (Base). NOT 56 (BNB).",
        },
      },
      required: ["fTokenSymbol", "amount", "chainIndex"],
    },
  },
  {
    name: "propose_swap",
    description:
      "Propose a token swap via OKX DEX aggregator (0 commission, best price across 500+ sources). Creates an action card for user confirmation. Does NOT execute automatically.",
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
          description: "Chain name: ethereum, arbitrum, base, or bsc.",
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
            "Chain ID: 1 (Ethereum), 42161 (Arbitrum), 8453 (Base), or 56 (BNB Chain).",
        },
        contractToken: {
          type: "string",
          description:
            "ERC-20 token contract address. Omit for native token (ETH/BNB).",
        },
      },
      required: ["recipient", "amount", "chainIndex"],
    },
  },
];
