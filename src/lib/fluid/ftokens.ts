import { encodeFunctionData, parseUnits } from "viem";
import { erc20Abi, erc4626Abi, fWethNativeAbi } from "./abis";

/** Encode ERC-20 approve calldata */
export function encodeApprove(
  spender: `0x${string}`,
  amount: bigint
): `0x${string}` {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
  });
}

/** Encode fToken deposit calldata (ERC-4626) */
export function encodeDeposit(
  assets: bigint,
  receiver: `0x${string}`
): `0x${string}` {
  return encodeFunctionData({
    abi: erc4626Abi,
    functionName: "deposit",
    args: [assets, receiver],
  });
}

/** Encode fToken withdraw calldata (ERC-4626) */
export function encodeWithdraw(
  assets: bigint,
  receiver: `0x${string}`,
  owner: `0x${string}`
): `0x${string}` {
  return encodeFunctionData({
    abi: erc4626Abi,
    functionName: "withdraw",
    args: [assets, receiver, owner],
  });
}

/** Encode fToken redeem calldata (ERC-4626) — burns shares, returns underlying */
export function encodeRedeem(
  shares: bigint,
  receiver: `0x${string}`,
  owner: `0x${string}`
): `0x${string}` {
  return encodeFunctionData({
    abi: erc4626Abi,
    functionName: "redeem",
    args: [shares, receiver, owner],
  });
}

/** Encode fWETH depositNative calldata (payable, for native ETH) */
export function encodeDepositNative(receiver: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: fWethNativeAbi,
    functionName: "depositNative",
    args: [receiver],
  });
}

/** Encode fWETH withdrawNative calldata */
export function encodeWithdrawNative(
  assets: bigint,
  receiver: `0x${string}`,
  owner: `0x${string}`
): `0x${string}` {
  return encodeFunctionData({
    abi: fWethNativeAbi,
    functionName: "withdrawNative",
    args: [assets, receiver, owner],
  });
}

/** Parse UI amount string to raw wei/units based on token decimals */
export function parseAmount(uiAmount: string, decimals: number): bigint {
  return parseUnits(uiAmount, decimals);
}
