/**
 * What a LI.FI quote costs, for the "Fees and gas" line.
 *
 * Fees (LI.FI's own, the bridge's) are usually taken out of the amount and
 * gas is paid on top, so their sum is what the user gives up. On a small
 * transfer that sum can be a few tenths of a cent and still be 10% of the
 * amount, which "$0.00" used to hide: the share is reported next to it.
 */

export interface PricedCost {
  amountUSD?: string;
}

export interface BridgeCost {
  /** Sum of every priced fee and gas line, in USD. Null when nothing is priced. */
  usd: number | null;
  /** True when some lines have no USD value, so `usd` is a lower bound. */
  partial: boolean;
  /** `usd` as a fraction of the amount sent. Null when the amount has no USD value. */
  shareOfAmount: number | null;
}

export function bridgeCost(
  feeCosts: PricedCost[] = [],
  gasCosts: PricedCost[] = [],
  fromAmountUSD?: string
): BridgeCost {
  const lines = [...feeCosts, ...gasCosts];
  const prices = lines.map((l) => (l.amountUSD != null ? parseFloat(l.amountUSD) : NaN));
  const priced = prices.filter((p) => Number.isFinite(p));
  if (priced.length === 0) return { usd: null, partial: lines.length > 0, shareOfAmount: null };

  const usd = priced.reduce((sum, p) => sum + p, 0);
  const from = fromAmountUSD != null ? parseFloat(fromAmountUSD) : NaN;
  return {
    usd,
    partial: priced.length < lines.length,
    shareOfAmount: Number.isFinite(from) && from > 0 ? usd / from : null,
  };
}

/**
 * "$1.23", "Less than $0.01" or "$0.00". When some lines had no USD value the
 * figure is a lower bound: "At least $1.23", or "Not fully priced" if the
 * priced part is under a cent.
 */
export function formatBridgeCost(cost: BridgeCost): string {
  if (cost.usd == null) return "Not given";
  if (cost.usd >= 0.01) {
    const dollars = `$${cost.usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return cost.partial ? `At least ${dollars}` : dollars;
  }
  if (cost.partial) return "Not fully priced";
  return cost.usd > 0 ? "Less than $0.01" : "$0.00";
}

/** "11%" or "2.4%" when the cost is at least 1% of the amount sent; otherwise null. */
export function formatCostShare(cost: BridgeCost): string | null {
  if (cost.shareOfAmount == null || cost.shareOfAmount < 0.01) return null;
  const pct = cost.shareOfAmount * 100;
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}
