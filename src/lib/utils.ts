import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatUnits, parseUnits } from "viem";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Convert minimal units (wei/lamports) to UI units (e.g. "1.5" ETH) */
export function toUiUnits(raw: string | bigint, decimals: number): string {
  return formatUnits(typeof raw === "string" ? BigInt(raw) : raw, decimals);
}

/** Convert UI units (e.g. "1.5") to minimal units string (wei/lamports) */
export function toMinimalUnits(ui: string, decimals: number): string {
  return parseUnits(ui, decimals).toString();
}

/** Validate EVM address format */
export function isValidEvmAddress(address: string): boolean {
  return /^0x[0-9a-f]{40}$/.test(address.toLowerCase());
}

/** Normalize EVM address to lowercase (OKX requirement) */
export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

/** Format USD value for display */
export function formatUsd(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "$0.00";
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

/** Format token amount for display (max 6 decimal places) */
export function formatTokenAmount(amount: string | number, maxDecimals = 6): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0";
  if (num === 0) return "0";
  if (num < 0.000001) return "<0.000001";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}

/** Shorten address for display: 0x1234...abcd */
export function shortenAddress(address: string, chars = 4): string {
  if (address.length < chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/** Fluid rate from basis points to percentage: 390 -> 3.90 */
export function bpsToPercent(bps: number): number {
  return bps / 100;
}
