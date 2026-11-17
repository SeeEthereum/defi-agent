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
import { MISSING } from "@/lib/format";
import type { Messages } from "@/i18n/messages/en";
import type { Paths, Vars } from "@/i18n/translate";

/** The page's translator for the "security" namespace (useT("security")). */
export type SecurityT = (key: Paths<Messages["security"]>, vars?: Vars) => string;

/** The number formats these labels use: the page's useFormat(). */
export interface SecurityFormat {
  percent: (value: number | string, opts?: { decimals?: number }) => string;
  amount: (value: number) => string;
}

type RiskKey = keyof Messages["security"]["risks"];

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
export function tokenRisk(level: unknown, t: SecurityT): { label: string; tone: Tone } {
  switch (riskTier(level)) {
    case "critical":
      return { label: t("tokenRisk.dangerous"), tone: "bad" };
    case "high":
      return { label: t("tokenRisk.high"), tone: "bad" };
    case "medium":
      return { label: t("tokenRisk.medium"), tone: "warn" };
    case "low":
      return { label: t("tokenRisk.low"), tone: "ok" };
    default:
      return { label: t("tokenRisk.unrated"), tone: "flat" };
  }
}

/** An approval's risk in words ("Medium risk"), or null when unknown. */
export function approvalRisk(level: unknown, t: SecurityT): { label: string; tone: Tone } | null {
  switch (riskTier(level)) {
    case "critical":
      return { label: t("approvalRisk.dangerous"), tone: "bad" };
    case "high":
      return { label: t("approvalRisk.high"), tone: "bad" };
    case "medium":
      return { label: t("approvalRisk.medium"), tone: "warn" };
    case "low":
      return { label: t("approvalRisk.low"), tone: "ok" };
    default:
      return null;
  }
}

/** The network's name, never a raw id. */
export function networkName(chainIndex: unknown, t: SecurityT): string {
  return chainName(typeof chainIndex === "string" || typeof chainIndex === "number" ? chainIndex : null) ?? t("unknownNetwork");
}

/** A buy or sell tax (OKX sends percent): "5%", "0%", or "–". */
export function taxLabel(value: unknown, f: SecurityFormat): string {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return MISSING;
  return f.percent(value as string | number, { decimals: 1 });
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
export function tokenTitle(
  token: { symbol?: unknown; chainIndex?: unknown; address?: unknown },
  t: SecurityT
): {
  title: string;
  iconSymbol: string;
  /** False when the title had to fall back to the address. */
  named: boolean;
} {
  const symbol = typeof token.symbol === "string" ? token.symbol.trim() : "";
  const address = typeof token.address === "string" ? token.address.trim() : "";
  if (symbol) {
    const d = displayToken({
      symbol,
      chainIndex: typeof token.chainIndex === "string" || typeof token.chainIndex === "number" ? token.chainIndex : null,
      tokenAddress: address || null,
    });
    if (d.symbol && d.symbol !== "?") return { title: d.symbol, iconSymbol: d.symbol, named: true };
  }
  return { title: address ? t("tokenAt", { address: shortAddress(address) }) : t("unknownToken"), iconSymbol: "?", named: false };
}

/** Boolean labels from OKX's token scan, in plain words (keys of "security.risks"). */
const RISK_FLAG_LABELS: Record<string, RiskKey> = {
  isAirdropScam: "airdropScam",
  isRubbishAirdrop: "spamAirdrop",
  isCounterfeit: "copycat",
  isFundLinkage: "scamLinks",
  isLiquidityRemoval: "liquidityPulled",
  isFakeLiquidity: "fakeLiquidity",
  isLowLiquidity: "lowLiquidity",
  isDumping: "heavySelling",
  isPump: "pumped",
  isWash: "fakeVolume",
  isWash2: "fakeVolume",
  isOverIssued: "inflatedSupply",
  isVeryHighLpHolderProp: "concentratedLiquidity",
  isVeryLowLpBurn: "littleLocked",
  isHasBlockingHis: "frozeBefore",
  isHasAssetEditAuth: "editsBalances",
  isNotOpenSource: "closedSource",
  isNotRenounced: "notRenounced",
};

/** Codes that may come as strings in a risk list, in plain words (keys of "security.risks"). */
const RISK_CODE_LABELS: Record<string, RiskKey> = {
  ...Object.fromEntries(Object.entries(RISK_FLAG_LABELS).map(([k, v]) => [k.toLowerCase(), v])),
  ishoneypot: "honeypot",
  ismintable: "mintable",
  ishasfrozenauth: "freezable",
  spender_address_black: "spenderBlacklisted",
  approve_eoa: "spenderIsWallet",
  approve_anycall_contract: "spenderAnyCall",
  multicall_phishing_risk: "phishing",
};

/** A sentence from the API: words and spaces, no code-like tokens. */
function isPlainSentence(s: string): boolean {
  return /\s/.test(s) && !/[_{}[\]<>]/.test(s) && s.length <= 80;
}

/**
 * One item of a risk list in words. Our own labels are translated; a plain
 * sentence written by OKX is shown as OKX sent it (in English).
 */
function readableRisk(item: unknown, t: SecurityT): string | null {
  if (typeof item === "string") {
    const s = item.trim();
    if (!s) return null;
    const key = RISK_CODE_LABELS[s.toLowerCase()];
    return key ? t(`risks.${key}`) : isPlainSentence(s) ? s : null;
  }
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? RISK_CODE_LABELS[o.name.trim().toLowerCase()] : undefined;
    if (name) return t(`risks.${name}`);
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
export function riskLabels(token: Record<string, unknown>, t: SecurityT): string[] {
  const out: string[] = [];
  const add = (label: string | null) => {
    if (label && !out.includes(label)) out.push(label);
  };
  const list = Array.isArray(token.riskItems) ? token.riskItems : Array.isArray(token.risks) ? token.risks : [];
  for (const item of list) add(readableRisk(item, t));
  if (out.length === 0) {
    for (const [flag, label] of Object.entries(RISK_FLAG_LABELS)) {
      if (flag === "isHasAssetEditAuth" && String(token.chainId ?? token.chainIndex) !== "501") continue;
      if (token[flag] === true) add(t(`risks.${label}`));
    }
  }
  const tier = riskTier(token.riskLevel ?? token.risk_level);
  const honeypot = token.isHoneypot === true || token.is_honeypot === true || token.honeypot === true;
  if (out.length === 0 && !honeypot && (tier === "medium" || tier === "high" || tier === "critical")) {
    add(t("risks.flaggedByOkx"));
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
export function allowanceLabel(item: { remainAmtPrecise?: unknown }, unlimited: boolean, t: SecurityT, f: SecurityFormat): string {
  if (unlimited) return t("unlimited");
  const precise = item.remainAmtPrecise;
  if (typeof precise === "string" || typeof precise === "number") {
    const n = Number(precise);
    if (String(precise).trim() !== "" && Number.isFinite(n) && n >= 0) return f.amount(n);
  }
  return t("notKnown");
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
