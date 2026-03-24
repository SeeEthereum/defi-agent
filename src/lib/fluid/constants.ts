// All addresses lowercase (OKX requirement)
export const LENDING_RESOLVER =
  "0x48d32f49afeaec7ae66ad7b9264f446fc11a1569" as const;
export const VAULT_RESOLVER =
  "0xa5c3e16523eeddcc34706b0e6be88b4c6ea95cc" as const;
export const LENDING_FACTORY =
  "0x54b91a0d94cb471f37f949c60f7fa7935b551d03" as const;

export interface FTokenConfig {
  address: `0x${string}`;
  underlying: `0x${string}`;
  symbol: string;
  underlyingDecimals: number;
  underlyingSymbol: string;
}

// fToken registry per chain (addresses are same across chains via CREATE2)
// but underlying token addresses differ per chain
export const FTOKENS: Record<number, Record<string, FTokenConfig>> = {
  // Ethereum
  1: {
    fUSDC: {
      address: "0x9fb7b4477576fe5b32be4c1843afb1e55f251b33",
      underlying: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      symbol: "fUSDC",
      underlyingDecimals: 6,
      underlyingSymbol: "USDC",
    },
    fUSDT: {
      address: "0x5c20b550819128074fd538edf79791733ccedd18",
      underlying: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      symbol: "fUSDT",
      underlyingDecimals: 6,
      underlyingSymbol: "USDT",
    },
    fWETH: {
      address: "0x90551c1795392094fe6d29b758eccd233cfaa260",
      underlying: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      symbol: "fWETH",
      underlyingDecimals: 18,
      underlyingSymbol: "WETH",
    },
  },
  // Arbitrum — addresses verified via LendingResolver.getAllFTokens() on-chain
  42161: {
    fUSDC: {
      address: "0x1a996cb54bb95462040408c06122d45d6cdb6096",
      underlying: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      symbol: "fUSDC",
      underlyingDecimals: 6,
      underlyingSymbol: "USDC",
    },
    fUSDT: {
      address: "0x4a03f37e7d3fc243e3f99341d36f4b829bee5e03",
      underlying: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
      symbol: "fUSDT",
      underlyingDecimals: 6,
      underlyingSymbol: "USDT",
    },
    fWETH: {
      address: "0x45df0656f8adf017590009d2f1898eeca4f0a205",
      underlying: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
      symbol: "fWETH",
      underlyingDecimals: 18,
      underlyingSymbol: "WETH",
    },
  },
  // Base — verified via LendingResolver.getAllFTokens() on-chain
  8453: {
    fWETH: {
      address: "0x9272d6153133175175bc276512b2336be3931ce9",
      underlying: "0x4200000000000000000000000000000000000006",
      symbol: "fWETH",
      underlyingDecimals: 18,
      underlyingSymbol: "WETH",
    },
  },
};

export function getFTokensForChain(chainIndex: number): FTokenConfig[] {
  return Object.values(FTOKENS[chainIndex] ?? {});
}

export function getFToken(
  chainIndex: number,
  symbol: string
): FTokenConfig | undefined {
  return FTOKENS[chainIndex]?.[symbol];
}
