/**
 * What an assistant swap or bridge card shows before the user confirms.
 *
 * The model's own numbers never reach the confirmation: the card asks the
 * quote route for the final quote and shows it from the response (output,
 * minimum received, price impact or fees, route), with the quote id the
 * execute route will hold the transaction to. Pure functions, used by the
 * assistant page, which passes the words and the language (QuoteText):
 * labels from the "quoteReview" messages, numbers as lib/format writes
 * them in that language.
 */

import { bridgeCost, type BridgeCost } from "@/lib/bridge/cost";
import { getChainBySwapName } from "@/lib/chains";
import { formatAmount, formatPercent, formatUsd, MISSING } from "@/lib/format";
import { cleanSymbol, displayToken } from "@/lib/tokens/display";
import type { Locale } from "@/i18n/config";
import type { At, Paths, Vars } from "@/i18n/translate";
import type { Messages } from "@/i18n/messages/en";

/** The card's words and language: useT("quoteReview") and useFormat().locale on the page. */
export interface QuoteText {
  t: (key: Paths<At<Messages, "quoteReview">>, vars?: Vars) => string;
  locale: Locale;
}

/** A plain decimal ("0.5") with the language's decimal mark ("0,5"). */
function decimalMark(value: string, locale: Locale): string {
  return locale === "it" ? value.replace(".", ",") : value;
}

/** The server keeps a quote for 60 s; the card stops offering it a little earlier. */
export const REVIEW_TTL_MS = 55_000;

/** True once the card should stop offering this quote. */
export function reviewExpired(review: QuoteReview, now = Date.now()): boolean {
  return now >= review.expiresAt;
}

/** Price impact (percent) that needs a warning, and the one that blocks. */
export const IMPACT_WARN = 3;
export const IMPACT_BLOCK = 10;

export interface QuoteReview {
  quoteId: string;
  expiresAt: number;
  rows: { label: string; value: string }[];
  /** Shown above the buttons; the user can still confirm. */
  warning: string | null;
  /** The trade is refused: Confirm stays disabled. */
  blocked: string | null;
}

type Obj = Record<string, unknown>;

function obj(value: unknown): Obj {
  return value && typeof value === "object" ? (value as Obj) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function validBase(base: string, decimals: number): boolean {
  return /^\d+$/.test(base) && Number.isInteger(decimals) && decimals >= 0;
}

/** Base units to the exact decimal, every digit kept: "2512.345678", "0.000000000000000001". */
export function exactAmount(base: string, decimals: number): string | null {
  if (!validBase(base, decimals)) return null;
  const padded = base.padStart(decimals + 1, "0");
  const int = BigInt(padded.slice(0, padded.length - decimals) || "0").toString();
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

/**
 * Cut base units down to the digits formatAmount shows (four decimals from
 * 1, four significant digits below), so a shown amount, above all a
 * minimum received, is never rounded up past the real one.
 */
function floorToShown(base: bigint, decimals: number): bigint {
  const one = 10n ** BigInt(decimals);
  const shownDecimals = base >= one ? 4 : decimals - base.toString().length + 4;
  if (shownDecimals >= decimals) return base;
  const unit = 10n ** BigInt(decimals - shownDecimals);
  return (base / unit) * unit;
}

/** Base units as people read them: "2,512.3456", "0.000005", "< 0.00000001". */
export function readable(base: string, decimals: number, locale: Locale = "en"): string {
  if (!validBase(base, decimals)) return MISSING;
  return formatAmount(exactAmount(floorToShown(BigInt(base), decimals).toString(), decimals), { locale });
}

/** A token's symbol as people know it ("USD₮0" → "USDT", the chain's own coin for native), else the card's. */
function symbolOf(token: Obj, chainIndex: number | null, fallback: unknown): string {
  const raw = str(token.tokenSymbol) ?? str(token.symbol);
  if (raw) {
    return displayToken({
      tokenSymbol: raw,
      tokenContractAddress: str(token.tokenContractAddress) ?? str(token.address),
      chainIndex: chainIndex ?? (token.chainId as number | string | undefined) ?? null,
    }).symbol;
  }
  return cleanSymbol(str(fallback));
}

/** `base` minus `percent` percent, rounded down. */
export function minusPercent(base: string, percent: string): string {
  if (!/^\d+$/.test(base)) return base;
  const bps = BigInt(Math.round(Number(percent) * 100));
  if (bps < 0n || bps > 10_000n) return base;
  return ((BigInt(base) * (10_000n - bps)) / 10_000n).toString();
}

/** " (about $2,512.35)" after an amount, or "" when the value is unknown or a crumb. */
function aboutUsd(value: number, { t, locale }: QuoteText): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return value < 0.01 ? t("lessThanUsd", { usd: formatUsd(0.01, { locale }) }) : t("aboutUsd", { usd: formatUsd(value, { locale }) });
}

/** Total fees and gas in dollars, as lib/bridge/cost judges them, in the card's language. */
function costText(cost: BridgeCost, { t, locale }: QuoteText): string {
  if (cost.usd == null) return t("costNotGiven");
  if (cost.usd >= 0.01) {
    const dollars = formatUsd(cost.usd, { locale });
    return cost.partial ? t("costAtLeast", { usd: dollars }) : dollars;
  }
  if (cost.partial) return t("costNotFullyPriced");
  return cost.usd > 0 ? t("costLessThan", { usd: formatUsd(0.01, { locale }) }) : formatUsd(0, { locale });
}

/** "11%" or "2.4%" when the cost is at least 1% of the amount sent; otherwise null. */
function costShare(cost: BridgeCost, locale: Locale): string | null {
  if (cost.shareOfAmount == null || cost.shareOfAmount < 0.01) return null;
  const pct = cost.shareOfAmount * 100;
  return `${decimalMark(pct < 10 ? pct.toFixed(1) : String(Math.round(pct)), locale)}%`;
}

function quoteIdOf(data: Obj): string | null {
  return str(data.quoteId);
}

/** Request body for /api/swap/quote from the card's params. */
export function swapQuoteBody(params: Obj): Obj {
  const body: Obj = {
    fromToken: params.fromToken,
    toToken: params.toToken,
    amount: params.amount,
    chain: params.chain,
  };
  if (str(params.slippage)) body.slippage = params.slippage;
  return body;
}

/** The final swap quote as card rows. Null when the response has no usable quote. */
export function swapReview(data: Obj, params: Obj, text: QuoteText, now = Date.now()): QuoteReview | null {
  const { t, locale } = text;
  const quoteId = quoteIdOf(data);
  const toAmount = str(data.toTokenAmount);
  const toToken = obj(data.toToken);
  const fromToken = obj(data.fromToken);
  const toDecimals = Number(toToken.decimal);
  if (!quoteId || !toAmount || !/^\d+$/.test(toAmount) || !Number.isInteger(toDecimals)) return null;

  const chainIndex = getChainBySwapName(String(params.chain ?? ""))?.chainIndex ?? null;
  const toSymbol = symbolOf(toToken, chainIndex, params.toSymbol);
  const fromSymbol = symbolOf(fromToken, chainIndex, params.fromSymbol);
  const slippage = str(params.slippage) ?? "0.5";
  const received = readable(toAmount, toDecimals, locale);
  const unitPrice = Number(toToken.tokenUnitPrice);
  // The dollar value from the exact amount, not the rounded one on screen.
  const receivedUsd = Number.isFinite(unitPrice) && unitPrice > 0
    ? aboutUsd(Number(exactAmount(toAmount, toDecimals)) * unitPrice, text)
    : "";

  const rows = [
    { label: t("youPay"), value: `${decimalMark(String(params.amountDisplay ?? ""), locale)} ${fromSymbol}`.trim() },
    { label: t("youReceive"), value: `${received} ${toSymbol}${receivedUsd}`.trim() },
    {
      label: t("minimumReceived"),
      value: t("withSlippage", {
        amount: `${readable(minusPercent(toAmount, slippage), toDecimals, locale)} ${toSymbol}`,
        slippage: decimalMark(slippage, locale),
      }),
    },
  ];

  const impactRaw = Number(data.priceImpactPercentage ?? data.priceImpactPercent);
  const impact = Number.isFinite(impactRaw) ? Math.abs(impactRaw) : null;
  if (impact != null) rows.push({ label: t("priceImpact"), value: formatPercent(impact, { locale }) });

  const router = obj((data.dexRouterList as unknown[] | undefined)?.[0]);
  const protocol = obj(
    (obj((router.subRouterList as unknown[] | undefined)?.[0]).dexProtocol as unknown[] | undefined)?.[0] ??
      router.dexProtocol
  );
  const dexName = str(protocol.dexName);
  if (dexName) rows.push({ label: t("route"), value: dexName });

  return {
    quoteId,
    expiresAt: now + REVIEW_TTL_MS,
    rows,
    blocked:
      impact != null && impact > IMPACT_BLOCK
        ? t("blockedImpact", { impact: formatPercent(impact, { decimals: 1, locale }) })
        : null,
    warning:
      impact != null && impact >= IMPACT_WARN && impact <= IMPACT_BLOCK
        ? t("warnImpact", { impact: formatPercent(impact, { decimals: 1, locale }) })
        : null,
  };
}

/** Query string for /api/bridge/quote from the card's params. */
export function bridgeQuoteQuery(params: Obj): URLSearchParams {
  return new URLSearchParams({
    fromChain: String(params.fromChain),
    toChain: String(params.toChain),
    fromToken: String(params.fromToken),
    toToken: String(params.toToken),
    fromAmount: String(params.fromAmount),
  });
}

/** The final bridge quote as card rows. Null when the response has no usable quote. */
export function bridgeReview(data: Obj, params: Obj, text: QuoteText, now = Date.now()): QuoteReview | null {
  const { t, locale } = text;
  const quoteId = quoteIdOf(data);
  const action = obj(data.action);
  const estimate = obj(data.estimate);
  const toToken = obj(action.toToken);
  const fromToken = obj(action.fromToken);
  const toDecimals = Number(toToken.decimals);
  const toAmount = str(estimate.toAmount);
  const toAmountMin = str(estimate.toAmountMin);
  if (!quoteId || !toAmount || !toAmountMin || !Number.isInteger(toDecimals)) return null;

  const toSymbol = symbolOf(toToken, null, params.toSymbol);
  const fromSymbol = symbolOf(fromToken, null, params.fromSymbol);
  const cost = bridgeCost(
    (estimate.feeCosts as { amountUSD?: string }[] | undefined) ?? [],
    (estimate.gasCosts as { amountUSD?: string }[] | undefined) ?? [],
    str(estimate.fromAmountUSD) ?? undefined
  );
  const share = costShare(cost, locale);
  const seconds = Number(estimate.executionDuration);
  const tool = str(obj(data.toolDetails).name) ?? str(data.tool);

  const rows = [
    { label: t("youSend"), value: `${decimalMark(String(params.amountDisplay ?? ""), locale)} ${fromSymbol}`.trim() },
    { label: t("youReceive"), value: `${readable(toAmount, toDecimals, locale)} ${toSymbol}`.trim() },
    { label: t("minimumReceived"), value: `${readable(toAmountMin, toDecimals, locale)} ${toSymbol}`.trim() },
    { label: t("feesAndGas"), value: share ? t("feesShare", { cost: costText(cost, text), share }) : costText(cost, text) },
  ];
  if (Number.isFinite(seconds) && seconds > 0) {
    rows.push({
      label: t("time"),
      value: seconds < 90 ? t("aboutSeconds", { count: Math.round(seconds) }) : t("aboutMinutes", { count: Math.round(seconds / 60) }),
    });
  }
  if (tool) rows.push({ label: t("provider"), value: tool });

  return {
    quoteId,
    expiresAt: now + REVIEW_TTL_MS,
    rows,
    blocked: null,
    warning:
      cost.shareOfAmount != null && cost.shareOfAmount >= 0.05
        ? t("warnFees", { share: share ?? "" })
        : null,
  };
}
