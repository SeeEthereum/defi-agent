/**
 * What an assistant swap or bridge card shows before the user confirms.
 *
 * The model's own numbers never reach the confirmation: the card asks the
 * quote route for the final quote and shows it from the response (output,
 * minimum received, price impact or fees, route), with the quote id the
 * execute route will hold the transaction to. Pure functions, used by the
 * assistant page.
 */

import { bridgeCost, formatBridgeCost, formatCostShare } from "@/lib/bridge/cost";

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

/** Base units to "1,234.56", at most `maxFraction` decimals. */
export function readable(base: string, decimals: number, maxFraction = 6): string {
  if (!/^\d+$/.test(base) || !Number.isInteger(decimals) || decimals < 0) return base;
  const padded = base.padStart(decimals + 1, "0");
  const int = padded.slice(0, padded.length - decimals) || "0";
  const frac = padded.slice(padded.length - decimals, padded.length - decimals + maxFraction).replace(/0+$/, "");
  const grouped = BigInt(int).toLocaleString("en-US");
  return frac ? `${grouped}.${frac}` : grouped;
}

/** `base` minus `percent` percent, rounded down. */
export function minusPercent(base: string, percent: string): string {
  if (!/^\d+$/.test(base)) return base;
  const bps = BigInt(Math.round(Number(percent) * 100));
  if (bps < 0n || bps > 10_000n) return base;
  return ((BigInt(base) * (10_000n - bps)) / 10_000n).toString();
}

function usd(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
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
export function swapReview(data: Obj, params: Obj, now = Date.now()): QuoteReview | null {
  const quoteId = quoteIdOf(data);
  const toAmount = str(data.toTokenAmount);
  const toToken = obj(data.toToken);
  const fromToken = obj(data.fromToken);
  const toDecimals = Number(toToken.decimal);
  if (!quoteId || !toAmount || !/^\d+$/.test(toAmount) || !Number.isInteger(toDecimals)) return null;

  const toSymbol = str(toToken.tokenSymbol) ?? str(params.toSymbol) ?? "";
  const fromSymbol = str(fromToken.tokenSymbol) ?? str(params.fromSymbol) ?? "";
  const slippage = str(params.slippage) ?? "0.5";
  const received = readable(toAmount, toDecimals);
  const unitPrice = Number(toToken.tokenUnitPrice);
  const receivedUsd = Number.isFinite(unitPrice) && unitPrice > 0
    ? ` (about ${usd(Number(received.replace(/,/g, "")) * unitPrice)})`
    : "";

  const rows = [
    { label: "You pay", value: `${String(params.amountDisplay ?? "")} ${fromSymbol}`.trim() },
    { label: "You receive", value: `${received} ${toSymbol}${receivedUsd}`.trim() },
    {
      label: "Minimum received",
      value: `${readable(minusPercent(toAmount, slippage), toDecimals)} ${toSymbol} (slippage ${slippage}%)`,
    },
  ];

  const impactRaw = Number(data.priceImpactPercentage ?? data.priceImpactPercent);
  const impact = Number.isFinite(impactRaw) ? Math.abs(impactRaw) : null;
  if (impact != null) rows.push({ label: "Price impact", value: `${impact.toFixed(2)}%` });

  const router = obj((data.dexRouterList as unknown[] | undefined)?.[0]);
  const protocol = obj(
    (obj((router.subRouterList as unknown[] | undefined)?.[0]).dexProtocol as unknown[] | undefined)?.[0] ??
      router.dexProtocol
  );
  const dexName = str(protocol.dexName);
  if (dexName) rows.push({ label: "Route", value: dexName });

  return {
    quoteId,
    expiresAt: now + REVIEW_TTL_MS,
    rows,
    blocked:
      impact != null && impact > IMPACT_BLOCK
        ? `Price impact is ${impact.toFixed(1)}%: this trade would lose too much value. Try a smaller amount.`
        : null,
    warning:
      impact != null && impact >= IMPACT_WARN && impact <= IMPACT_BLOCK
        ? `High price impact (${impact.toFixed(1)}%): you get noticeably less than the market price.`
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
export function bridgeReview(data: Obj, params: Obj, now = Date.now()): QuoteReview | null {
  const quoteId = quoteIdOf(data);
  const action = obj(data.action);
  const estimate = obj(data.estimate);
  const toToken = obj(action.toToken);
  const fromToken = obj(action.fromToken);
  const toDecimals = Number(toToken.decimals);
  const toAmount = str(estimate.toAmount);
  const toAmountMin = str(estimate.toAmountMin);
  if (!quoteId || !toAmount || !toAmountMin || !Number.isInteger(toDecimals)) return null;

  const toSymbol = str(toToken.symbol) ?? str(params.toSymbol) ?? "";
  const fromSymbol = str(fromToken.symbol) ?? str(params.fromSymbol) ?? "";
  const cost = bridgeCost(
    (estimate.feeCosts as { amountUSD?: string }[] | undefined) ?? [],
    (estimate.gasCosts as { amountUSD?: string }[] | undefined) ?? [],
    str(estimate.fromAmountUSD) ?? undefined
  );
  const share = formatCostShare(cost);
  const seconds = Number(estimate.executionDuration);
  const tool = str(obj(data.toolDetails).name) ?? str(data.tool);

  const rows = [
    { label: "You send", value: `${String(params.amountDisplay ?? "")} ${fromSymbol}`.trim() },
    { label: "You receive", value: `${readable(toAmount, toDecimals)} ${toSymbol}` },
    { label: "Minimum received", value: `${readable(toAmountMin, toDecimals)} ${toSymbol}` },
    { label: "Fees and gas", value: share ? `${formatBridgeCost(cost)} (${share} of the amount)` : formatBridgeCost(cost) },
  ];
  if (Number.isFinite(seconds) && seconds > 0) {
    rows.push({ label: "Time", value: seconds < 90 ? `About ${Math.round(seconds)} s` : `About ${Math.round(seconds / 60)} min` });
  }
  if (tool) rows.push({ label: "Provider", value: tool });

  return {
    quoteId,
    expiresAt: now + REVIEW_TTL_MS,
    rows,
    blocked: null,
    warning:
      cost.shareOfAmount != null && cost.shareOfAmount >= 0.05
        ? `Fees and gas take ${share} of the amount. A larger transfer, or another chain, costs less in proportion.`
        : null,
  };
}
