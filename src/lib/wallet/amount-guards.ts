/**
 * Amount checks shared by the send and swap forms: the gas reserve kept back
 * on "Max", a token's decimals, and whether an amount is above what can be
 * spent. Pure functions, all in base units (bigint), so no float rounding.
 */

/**
 * Native coin kept back for the network fee: 0.002 on Ethereum (L1 gas is
 * dearer), 0.0005 elsewhere. The rule swap's "Max" has always used; a send
 * of the whole native balance fails for lack of gas.
 */
export function gasReserve(chainIndex: number | string | null | undefined): string {
  return String(chainIndex) === "1" ? "0.002" : "0.0005";
}

/** "1.5" → 1500000n for 6 decimals; null when not a plain decimal number. Extra digits are cut. */
export function toBaseUnits(amount: string, decimals: number): bigint | null {
  const normalized = amount.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized) || !Number.isInteger(decimals) || decimals < 0) return null;
  const [int, frac = ""] = normalized.split(".");
  return BigInt(int + frac.slice(0, decimals).padEnd(decimals, "0"));
}

/** 1500000n → "1.5" for 6 decimals, trailing zeros dropped. */
export function fromBaseUnits(units: bigint, decimals: number): string {
  const s = units.toString().padStart(decimals + 1, "0");
  const int = s.slice(0, s.length - decimals) || "0";
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

export interface SpendTarget {
  /** True for the chain's own coin (ETH, BNB, POL), which also pays the fee. */
  native: boolean;
  chainIndex: number | string | null | undefined;
  decimals: number;
}

/**
 * What "Max" may put in the amount: the whole balance of a token; for the
 * native coin, the balance less the gas reserve. `reserved` is the reserve
 * kept (null for a token). `amount` is null when the balance can't be read
 * or is all needed for the fee.
 */
export function maxSpendable(balance: string, t: SpendTarget): { amount: string | null; reserved: string | null } {
  const bal = toBaseUnits(balance, t.decimals);
  if (bal == null) return { amount: null, reserved: null };
  if (!t.native) return { amount: bal > 0n ? fromBaseUnits(bal, t.decimals) : null, reserved: null };
  const reserve = gasReserve(t.chainIndex);
  const left = bal - (toBaseUnits(reserve, t.decimals) ?? 0n);
  return { amount: left > 0n ? fromBaseUnits(left, t.decimals) : null, reserved: reserve };
}

/**
 * True when `amount` is above what can be spent: the balance, less the gas
 * reserve for the native coin. Null when either number can't be read, so a
 * caller never blocks on a guess.
 */
export function exceedsSpendable(amount: string, balance: string, t: SpendTarget): boolean | null {
  const want = toBaseUnits(amount, t.decimals);
  const bal = toBaseUnits(balance, t.decimals);
  if (want == null || bal == null) return null;
  const reserve = t.native ? toBaseUnits(gasReserve(t.chainIndex), t.decimals) ?? 0n : 0n;
  return want > bal - reserve;
}

/**
 * A token's decimals when the data states them: an integer 0–255 (ERC-20
 * decimals are a uint8). Otherwise `nativeFallback` (the chain's
 * nativeDecimals, for the native coin only) or null. Defaulting to 18 would
 * scale amounts and approvals by a wrong power of ten for a 6-decimal token.
 */
export function knownDecimals(raw: unknown, nativeFallback?: number | null): number | null {
  const fallback = nativeFallback != null && Number.isInteger(nativeFallback) ? nativeFallback : null;
  if (raw === null || raw === undefined || typeof raw === "boolean") return fallback;
  if (typeof raw === "string" && raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 255 ? n : fallback;
}
