/**
 * Token-scan and approval records from OKX, in plain words.
 *
 * Units and codes follow OKX's security docs (onchainos
 * security-cli-reference and the okx-security skill references):
 *   - token-scan `riskLevel`: CRITICAL / HIGH / MEDIUM / LOW (older
 *     answers and examples also use 1 = LOW, 2 = MEDIUM, 3 = HIGH);
 *   - `buyTaxes` / `sellTaxes`: a tax in percent ("5" means 5%), or null;
 *   - approvals: `allowance` is raw base units ("unlimited" for max uint256),
 *     so it is never printed; `remainAmtPrecise` is the readable amount.
 */

import { chainName, displayToken } from "@/lib/tokens/display";
import { formatAmount, formatPercent, MISSING } from "@/lib/format";

export type RiskTier = "critical" | "high" | "medium" | "low";

/** OKX's risk level as one of four tiers, or null when we cannot tell. */
export function riskTier(level: unknown): RiskTier | null {
  if (level === null || level === undefined) return null;
  const l = String(level).trim().toLowerCase();
  if (l === "critical" || l === "4") return "critical";
  if (l === "high" || l === "3" || l === "danger") return "high";
  if (l === "medium" || l === "2" || l === "warning" || l === "warn") return "medium";
  if (l === "low" || l === "1" || l === "0" || l === "safe") return "low";
  return null;
}

export type Tone = "bad" | "warn" | "ok" | "flat";

/** A token's risk as a calm label and the tone of its colour. */
export function tokenRisk(level: unknown): { label: string; tone: Tone } {
  switch (riskTier(level)) {
    case "critical":
      return { label: "Dangerous", tone: "bad" };
    case "high":
      return { label: "High risk", tone: "bad" };
    case "medium":
      return { label: "Medium risk", tone: "warn" };
    case "low":
      return { label: "Looks safe", tone: "ok" };
    default:
      return { label: "Not rated", tone: "flat" };
  }
}

/** An approval's risk in words ("Medium risk"), or null when unknown. */
export function approvalRisk(level: unknown): { label: string; tone: Tone } | null {
  switch (riskTier(level)) {
    case "critical":
      return { label: "Dangerous", tone: "bad" };
    case "high":
      return { label: "High risk", tone: "bad" };
    case "medium":
      return { label: "Medium risk", tone: "warn" };
    case "low":
      return { label: "Low risk", tone: "ok" };
    default:
      return null;
  }
}

/** The network's name, never a raw id. */
export function networkName(chainIndex: unknown): string {
  return chainName(typeof chainIndex === "string" || typeof chainIndex === "number" ? chainIndex : null) ?? "Unknown network";
}

/** A buy or sell tax (OKX sends percent): "5%", "0%", or "–". */
export function taxLabel(value: unknown): string {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return MISSING;
  return formatPercent(value as string | number, { decimals: 1 });
}

/** True when a tax is above 5%: worth a warning colour. */
export function taxIsHigh(value: unknown): boolean {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return false;
  const n = Number(value);
  return Number.isFinite(n) && n > 5;
}

function shortAddress(addr: string): string {
  return addr.length > 14 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

/**
 * What to call a token on screen: its cleaned symbol ("ETH", "USDT"), or
 * "Token 0x1234…abcd" when the record has no symbol (token-scan answers
 * carry only the address).
 */
export function tokenTitle(t: { symbol?: unknown; chainIndex?: unknown; address?: unknown }): {
  title: string;
  iconSymbol: string;
  /** False when the title had to fall back to the address. */
  named: boolean;
} {
  const symbol = typeof t.symbol === "string" ? t.symbol.trim() : "";
  const address = typeof t.address === "string" ? t.address.trim() : "";
  if (symbol) {
    const d = displayToken({
      symbol,
      chainIndex: typeof t.chainIndex === "string" || typeof t.chainIndex === "number" ? t.chainIndex : null,
      tokenAddress: address || null,
    });
    if (d.symbol && d.symbol !== "?") return { title: d.symbol, iconSymbol: d.symbol, named: true };
  }
  return { title: address ? `Token ${shortAddress(address)}` : "Unknown token", iconSymbol: "?", named: false };
}

/** Boolean labels from OKX's token scan, in plain words. */
const RISK_FLAG_LABELS: Record<string, string> = {
  isAirdropScam: "Airdrop scam",
  isRubbishAirdrop: "Spam airdrop",
  isCounterfeit: "Copycat token",
  isFundLinkage: "Linked to known scams",
  isLiquidityRemoval: "Liquidity was pulled",
  isFakeLiquidity: "Fake liquidity",
  isLowLiquidity: "Low liquidity",
  isDumping: "Heavy selling",
  isPump: "Price pumped",
  isWash: "Fake trading volume",
  isWash2: "Fake trading volume",
  isOverIssued: "Supply was inflated",
  isVeryHighLpHolderProp: "Liquidity held by few wallets",
  isVeryLowLpBurn: "Little liquidity locked",
  isHasBlockingHis: "Has frozen wallets before",
  isHasAssetEditAuth: "Owner can change balances",
  isNotOpenSource: "Code is not public",
  isNotRenounced: "Owner keeps control",
};

/** Codes that may come as strings in a risk list, in plain words. */
const RISK_CODE_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(RISK_FLAG_LABELS).map(([k, v]) => [k.toLowerCase(), v])),
  ishoneypot: "Honeypot: you may not be able to sell",
  ismintable: "Owner can mint more",
  ishasfrozenauth: "Owner can freeze tokens",
  spender_address_black: "Spender is blacklisted",
  approve_eoa: "Spender is a wallet, not an app",
  approve_anycall_contract: "Spender can call any contract",
  multicall_phishing_risk: "Possible phishing",
};

/** A sentence from the API: words and spaces, no code-like tokens. */
function isPlainSentence(s: string): boolean {
  return /\s/.test(s) && !/[_{}[\]<>]/.test(s) && s.length <= 80;
}

function readableRisk(item: unknown): string | null {
  if (typeof item === "string") {
    const s = item.trim();
    if (!s) return null;
    return RISK_CODE_LABELS[s.toLowerCase()] ?? (isPlainSentence(s) ? s : null);
  }
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? RISK_CODE_LABELS[o.name.trim().toLowerCase()] : undefined;
    if (name) return name;
    const desc = o.description;
    const text =
      typeof desc === "string" ? desc : desc && typeof desc === "object" ? (desc as Record<string, unknown>).en ?? (desc as Record<string, unknown>).en_US : undefined;
    if (typeof text === "string" && isPlainSentence(text.trim())) return text.trim();
    if (typeof o.label === "string" && isPlainSentence(o.label.trim())) return o.label.trim();
  }
  return null;
}

/**
 * The risks of a scanned token as short readable labels: from its risk
 * list when OKX sends one, else from its boolean flags. Honeypot, mint
 * and pause have their own places on the row and are not repeated. When
 * OKX rates a token above low but names no reason, says so.
 */
export function riskLabels(token: Record<string, unknown>): string[] {
  const out: string[] = [];
  const add = (label: string | null) => {
    if (label && !out.includes(label)) out.push(label);
  };
  const list = Array.isArray(token.riskItems) ? token.riskItems : Array.isArray(token.risks) ? token.risks : [];
  for (const item of list) add(readableRisk(item));
  if (out.length === 0) {
    for (const [flag, label] of Object.entries(RISK_FLAG_LABELS)) {
      if (flag === "isHasAssetEditAuth" && String(token.chainId ?? token.chainIndex) !== "501") continue;
      if (token[flag] === true) add(label);
    }
  }
  const tier = riskTier(token.riskLevel ?? token.risk_level);
  const honeypot = token.isHoneypot === true || token.is_honeypot === true || token.honeypot === true;
  if (out.length === 0 && !honeypot && (tier === "medium" || tier === "high" || tier === "critical")) {
    add("Flagged by OKX's checks");
  }
  return out;
}

/** True for an allowance that lets the spender take everything. */
export function isUnlimitedAllowance(allowance: unknown): boolean {
  const a = String(allowance ?? "");
  return a.includes("unlimited") || a.includes("MAX") || (a.length > 30 && /^[0-9]+$/.test(a));
}

/**
 * An approval's allowance for people: "Unlimited", the readable amount
 * (`remainAmtPrecise`), or "Not known". Raw base units are never shown.
 */
export function allowanceLabel(item: { remainAmtPrecise?: unknown }, unlimited: boolean): string {
  if (unlimited) return "Unlimited";
  const precise = item.remainAmtPrecise;
  if (typeof precise === "string" || typeof precise === "number") {
    const n = Number(precise);
    if (String(precise).trim() !== "" && Number.isFinite(n) && n >= 0) return formatAmount(n);
  }
  return "Not known";
}

/** EVM token address: 0x and 40 hex digits. */
export const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Addresses typed or pasted by the user: split on commas, spaces or lines. */
export function parseAddresses(input: string): string[] {
  return input
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The scan API's "chain:address,chain:address" for one chain. */
export function tokensParam(chainIndex: string | number, addresses: string[]): string {
  return addresses.map((a) => `${chainIndex}:${a}`).join(",");
}
