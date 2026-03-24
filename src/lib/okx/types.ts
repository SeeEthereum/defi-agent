export interface CliResult<T = unknown> {
  ok: boolean;
  data: T;
  raw: string;
}

export interface WalletStatus {
  email: string;
  loggedIn: boolean;
  currentAccountId: string;
  currentAccountName: string;
  accountCount: number;
  loginType?: string;
  apiKey?: string;
}

export interface WalletAccount {
  accountId: string;
  accountName: string;
  evmAddress: string;
  solAddress: string;
  totalValueUsd: string;
  isActive: boolean;
}

export interface TokenBalance {
  chainIndex: string;
  symbol: string;
  balance: string;
  usdValue: string;
  tokenContractAddress: string;
  tokenPrice: string;
}

export interface WalletBalanceResponse {
  totalValueUsd: string;
  accounts?: WalletAccount[];
  details?: Array<{
    tokenAssets: TokenBalance[];
  }>;
}

export interface WalletAddresses {
  accountId: string;
  accountName: string;
  xlayer: Array<{ address: string; chainIndex: string; chainName: string }>;
  evm: Array<{ address: string; chainIndex: string; chainName: string }>;
  solana: Array<{ address: string; chainIndex: string; chainName: string }>;
}

export interface SendResult {
  txHash: string;
}

export interface ContractCallResult {
  txHash: string;
}

export interface HistoryOrder {
  txHash: string;
  txStatus: string;
  txTime: string;
  from: string;
  to: string;
  direction: string;
  chainSymbol: string;
  coinSymbol: string;
  coinAmount: string;
  serviceCharge: string;
  explorerUrl?: string;
  assetChange?: Array<{
    coinSymbol: string;
    coinAmount: string;
    direction: string;
  }>;
}

export interface SwapQuote {
  toTokenAmount: string;
  toToken: { tokenSymbol: string; decimal: number; tokenContractAddress: string };
  fromToken: { tokenSymbol: string; decimal: number; tokenContractAddress: string };
  priceImpactPercent: string;
  isHoneyPot: boolean;
  taxRate: string;
  estimateGasFee: string;
  routerResult: unknown;
}

export interface SwapTxData {
  tx: {
    to: string;
    value: string;
    data: string;
    gas: string;
  };
  jitoCalldata?: string;
}
