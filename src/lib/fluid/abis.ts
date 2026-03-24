export const erc20Abi = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const erc4626Abi = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    name: "redeem",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "shares", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "assets", type: "uint256" }],
  },
  {
    name: "convertToAssets",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "assets", type: "uint256" }],
  },
  {
    name: "convertToShares",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "assets", type: "uint256" }],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    name: "maxDeposit",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "receiver", type: "address" }],
    outputs: [{ name: "maxAssets", type: "uint256" }],
  },
  {
    name: "maxWithdraw",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "maxAssets", type: "uint256" }],
  },
] as const;

// LendingResolver ABI
const fTokenDataTuple = {
  type: "tuple" as const,
  components: [
    { name: "tokenAddress", type: "address" as const },
    { name: "eip2612Deposits", type: "bool" as const },
    { name: "isNativeUnderlying", type: "bool" as const },
    { name: "name", type: "string" as const },
    { name: "symbol", type: "string" as const },
    { name: "decimals", type: "uint256" as const },
    { name: "asset", type: "address" as const },
    { name: "totalAssets", type: "uint256" as const },
    { name: "totalSupply", type: "uint256" as const },
    { name: "convertToShares", type: "uint256" as const },
    { name: "convertToAssets", type: "uint256" as const },
    { name: "rewardsRate", type: "uint256" as const },
    { name: "supplyRate", type: "uint256" as const },
    { name: "rebalanceDifference", type: "int256" as const },
    {
      name: "liquidityUserSupplyData",
      type: "tuple" as const,
      components: [
        { name: "isAllowed", type: "bool" as const },
        { name: "supply", type: "uint256" as const },
        { name: "withdrawalLimit", type: "uint256" as const },
        { name: "lastUpdateTimestamp", type: "uint256" as const },
        { name: "expandPercent", type: "uint256" as const },
        { name: "expandDuration", type: "uint256" as const },
        { name: "baseWithdrawalLimit", type: "uint256" as const },
      ],
    },
  ],
};

export const lendingResolverAbi = [
  {
    name: "getAllFTokens",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
  } as const,
  {
    name: "getFTokensEntireData",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "tuple[]" as const, components: fTokenDataTuple.components }],
  } as const,
  {
    name: "getUserPosition",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "fToken_", type: "address" },
      { name: "user_", type: "address" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "fTokenShares", type: "uint256" },
          { name: "underlyingAssets", type: "uint256" },
          { name: "underlyingBalance", type: "uint256" },
          { name: "allowance", type: "uint256" },
        ],
      },
    ],
  } as const,
] as const;

// Payable deposit for native ETH into fWETH
export const fWethNativeAbi = [
  {
    name: "depositNative",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "receiver", type: "address" }],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    name: "withdrawNative",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
] as const;
