export interface ChainConfig {
  chainIndex: number;
  name: string;
  swapName: string; // name used in onchainos swap CLI
  rpcUrl: string;
  explorer: string;
  hasFluid: boolean;
  nativeSymbol: string;
  nativeDecimals: number;
}

export const CHAINS: Record<string, ChainConfig> = {
  ethereum: {
    chainIndex: 1,
    name: "Ethereum",
    swapName: "ethereum",
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    explorer: "https://etherscan.io",
    hasFluid: true,
    nativeSymbol: "ETH",
    nativeDecimals: 18,
  },
  arbitrum: {
    chainIndex: 42161,
    name: "Arbitrum",
    swapName: "arbitrum",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    explorer: "https://arbiscan.io",
    hasFluid: true,
    nativeSymbol: "ETH",
    nativeDecimals: 18,
  },
  base: {
    chainIndex: 8453,
    name: "Base",
    swapName: "base",
    rpcUrl: "https://mainnet.base.org",
    explorer: "https://basescan.org",
    hasFluid: true,
    nativeSymbol: "ETH",
    nativeDecimals: 18,
  },
  bnb: {
    chainIndex: 56,
    name: "BNB Chain",
    swapName: "bsc",
    rpcUrl: "https://bsc-dataseed.binance.org",
    explorer: "https://bscscan.com",
    hasFluid: false,
    nativeSymbol: "BNB",
    nativeDecimals: 18,
  },
} as const;

export const SUPPORTED_CHAIN_IDS = Object.values(CHAINS).map(
  (c) => c.chainIndex
);
export const FLUID_CHAIN_IDS = Object.values(CHAINS)
  .filter((c) => c.hasFluid)
  .map((c) => c.chainIndex);

export function getChainByIndex(chainIndex: number): ChainConfig | undefined {
  return Object.values(CHAINS).find((c) => c.chainIndex === chainIndex);
}

export function getChainBySwapName(name: string): ChainConfig | undefined {
  return Object.values(CHAINS).find((c) => c.swapName === name);
}
