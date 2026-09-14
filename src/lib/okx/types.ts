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

/**
 * One token entry from `wallet balance`. CLI v4 trimmed this payload to a
 * 9-field whitelist; the fields below are the whole set, confirmed against
 * a live v4.6.0 response.
 */
export interface TokenBalance {
  chainIndex: string;
  symbol: string;
  tokenName: string;
  /** Human-readable amount, already decimal-adjusted. */
  balance: string;
  /** Same amount in minimal units. */
  rawBalance: string;
  decimal: string;
  usdValue: string;
  tokenPrice: string;
  /**
   * Token contract address — **empty string for the chain's native token**
   * (consumers treat "" as native; see use-balances.ts:82).
   *
   * CLI v4 renamed this from `tokenContractAddress` and dropped the alias.
   * The old name is kept optional because consumers read both and we may
   * still parse cached v3 payloads.
   */
  tokenAddress: string;
  /** @deprecated Pre-v4 name for `tokenAddress`. */
  tokenContractAddress?: string;
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

/**
 * One entry of the Gas Station `tokenList` returned inside a Confirming
 * response (exit code 2). `feeTokenAddress` + `relayerId` are the values
 * the second-phase call must pass back verbatim as `--gas-token-address` /
 * `--relayer-id` — never fabricate them.
 */
export interface GasStationToken {
  feeTokenAddress: string;
  relayerId?: string;
  symbol?: string;
  feeTokenSymbol?: string;
  sufficient?: boolean;
  balance?: string;
  serviceCharge?: string;
  serviceChargeSymbol?: string;
  [key: string]: unknown;
}

/**
 * Structured payload extracted from a Gas Station Confirming response.
 * `status` is the backend enum (FIRST_TIME_PROMPT, PENDING_UPGRADE,
 * REENABLE_ONLY, READY_TO_USE, INSUFFICIENT_ALL, HAS_PENDING_TX) when it
 * could be parsed; the raw `message` is authoritative for display.
 */
export interface GasStationConfirming {
  status?: string;
  message: string;
  tokenList: GasStationToken[];
  defaultGasTokenAddress?: string;
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
