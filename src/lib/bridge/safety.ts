/**
 * Pre-sign checks on a LI.FI bridge quote: the minimum received and the
 * security scans. Pure functions, so the route stays readable and the rules
 * are tested here. Safe to import from a page (no server imports).
 */

/**
 * Slippage the app asks LI.FI for (0.5%, the swap page's default). Without
 * it LI.FI picks its own per route: live quotes came back between 0.87% and
 * 15%, so the minimum received was whatever LI.FI chose.
 */
export const BRIDGE_SLIPPAGE = 0.005;

/**
 * LI.FI rounds `toAmountMin` to a few significant digits, which can put it a
 * hair under toAmount × (1 − slippage): 0.4 ppm in live quotes. 10 ppm
 * (0.001%) absorbs that and nothing more.
 */
const ROUNDING_PPM = 10n;

/** Response code for a bridge refused before signing; the page shows its message as is. */
export const BRIDGE_REFUSED_CODE = "bridge_refused";

/** The scan service failed: same words and policy as swap/execute (refuse, never pass). */
export const SCAN_UNAVAILABLE_MESSAGE = "Security check unavailable, transaction not sent";

function baseUnits(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

/**
 * Null when the quote's guaranteed minimum is within `slippage` of its
 * estimate; otherwise why it is refused. A missing or zero minimum means the
 * transaction would accept any outcome, so it is refused too.
 */
export function checkMinReceived(
  toAmount: unknown,
  toAmountMin: unknown,
  slippage: number = BRIDGE_SLIPPAGE
): string | null {
  const expected = baseUnits(toAmount);
  const min = baseUnits(toAmountMin);
  if (expected == null || expected === 0n || min == null || min === 0n) {
    return "The bridge quote has no guaranteed minimum, so it was not sent. Get a new quote.";
  }
  const slipPpm = BigInt(Math.round(Math.min(Math.max(slippage, 0), 1) * 1_000_000));
  const floorPpm = 1_000_000n - slipPpm - ROUNDING_PPM;
  if (min * 1_000_000n < expected * floorPpm) {
    const pct = `${Math.round(slippage * 1000) / 10}%`;
    return `The bridge quote could pay out more than ${pct} below its estimate, so it was not sent. Get a new quote.`;
  }
  return null;
}

export type RiskLevel = "high" | "medium" | "none";
export interface ScanVerdict {
  level: RiskLevel;
  /** Readable reasons, possibly empty. */
  reasons: string[];
}

function levelOf(value: unknown): RiskLevel {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "high" || v === "3" || v === "critical" || v === "4" || v === "block") return "high";
  if (v === "medium" || v === "2" || v === "warn" || v === "warning") return "medium";
  return "none";
}

function worst(a: RiskLevel, b: RiskLevel): RiskLevel {
  if (a === "high" || b === "high") return "high";
  if (a === "medium" || b === "medium") return "medium";
  return "none";
}

/** A short sentence from a risk item: a plain string, or an item's English description or name. */
function reasonOf(item: unknown): string | null {
  if (typeof item === "string") return item.trim() || null;
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    const d = o.description;
    const text =
      typeof d === "string"
        ? d
        : d && typeof d === "object"
          ? ((d as Record<string, unknown>).en ?? (d as Record<string, unknown>).en_US)
          : undefined;
    if (typeof text === "string" && text.trim()) return text.trim();
    if (typeof o.name === "string" && o.name.trim()) return o.name.trim().replace(/_/g, " ").toLowerCase();
  }
  return null;
}

/**
 * OKX tx-scan answer as a risk level. Reads the fields swap/execute reads
 * (riskLevel / risk_level / level: HIGH or 3, MEDIUM or 2) and also OKX's
 * documented `action` ("block" = high, "warn" = medium), so a block is
 * never missed whichever shape the CLI prints.
 */
export function readTxScan(data: unknown): ScanVerdict {
  const scan = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const level = worst(levelOf(scan.riskLevel ?? scan.risk_level ?? scan.level), levelOf(scan.action));
  const items = [scan.riskItems, scan.risks, scan.riskItemDetail].find(Array.isArray) as unknown[] | undefined;
  const reasons = [...new Set((items ?? []).map(reasonOf).filter((r): r is string => r != null))].slice(0, 3);
  return { level, reasons };
}

/**
 * OKX token-scan answer for one token as a risk level. `isRiskToken` or a
 * honeypot is high; a chain OKX cannot scan, or no record, is "none" (OKX:
 * inform, do not block). A failed request never reaches here: the route
 * refuses it, like a failed tx-scan.
 */
export function readTokenScan(data: unknown, tokenAddress: string): ScanVerdict {
  const list = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  const want = tokenAddress.toLowerCase();
  const addressOf = (r: unknown): unknown => {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    return o.tokenAddress ?? o.tokenContractAddress ?? o.contractAddress;
  };
  // One token was scanned: an answer without an address field is still its record.
  const record = (list.find((r) => {
    const addr = addressOf(r);
    return typeof addr === "string" && addr.toLowerCase() === want;
  }) ?? (list.length === 1 && addressOf(list[0]) == null ? list[0] : undefined)) as Record<string, unknown> | undefined;
  if (!record || record.isChainSupported === false) return { level: "none", reasons: [] };

  const honeypot = record.isHoneypot === true || record.is_honeypot === true;
  let level = levelOf(record.riskLevel ?? record.risk_level);
  if (record.isRiskToken === true || honeypot) level = "high";
  const reasons: string[] = [];
  if (honeypot) reasons.push("the token may not be sellable (honeypot)");
  else if (level !== "none") reasons.push("the token is flagged as risky");
  return { level, reasons };
}

/** "Security scan flagged this bridge as high risk: a, b. Nothing was sent." */
export function highRiskMessage(what: "bridge" | "destination token", reasons: string[]): string {
  const why = reasons.length ? reasons.join("; ") : "possible malicious activity";
  return `Security scan flagged this ${what} as high risk: ${why}. Nothing was sent.`;
}
