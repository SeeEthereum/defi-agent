/**
 * Signal and leaderboard records from OKX, ready to print.
 *
 * Units follow OKX's documentation of `signal list` and `leaderboard list`
 * (onchainos signal-cli-reference): every `...Percent` field is already a
 * percentage on a 0–100 scale ("45.2" means 45.2%), never a ratio.
 *   - soldRatioPercent: share of the bought tokens since sold, in percent
 *     (the WebSocket feed's example value is "10.5").
 *   - winRatePercent: win rate in percent; its filter takes 0–100.
 *   - realizedPnlPercent: realized PnL in percent, shown as the return.
 * Dollar fields (amountUsd, marketCapUsd, realizedPnlUsd, txVolume) are USD.
 */

import { displayToken, type TokenDisplay } from "@/lib/tokens/display";
import type { Messages } from "@/i18n/messages/en";
import type { Paths, Vars } from "@/i18n/translate";

/** The page's translator for the "signals" namespace (useT("signals")). */
export type SignalsT = (key: Paths<Messages["signals"]>, vars?: Vars) => string;

type WalletTypeKey = keyof Messages["signals"]["walletTypes"];

/** Wallet types: signal codes "1"/"2"/"3" and the leaderboard's names. */
const WALLET_TYPE_KEYS: Record<string, WalletTypeKey> = {
  "1": "smartMoney",
  "2": "influencer",
  "3": "whale",
  smart_money: "smartMoney",
  smartmoney: "smartMoney",
  kol: "influencer",
  influencer: "influencer",
  whale: "whale",
  sniper: "sniper",
  dev: "tokenCreator",
  fresh: "newWallet",
  pump: "launchpadTrader",
};

/**
 * Plain names of the wallet types in any of the given fields (arrays,
 * single codes or "1,3"). Codes we do not know are left out, never printed.
 */
export function walletTypeLabels(t: SignalsT, ...sources: unknown[]): string[] {
  const out: string[] = [];
  for (const source of sources) {
    const parts = Array.isArray(source)
      ? source
      : typeof source === "string" || typeof source === "number"
        ? String(source).split(",")
        : [];
    for (const part of parts) {
      const key = String(part).trim();
      const labelKey = WALLET_TYPE_KEYS[key] ?? WALLET_TYPE_KEYS[key.toLowerCase()];
      const label = labelKey ? t(`walletTypes.${labelKey}`) : null;
      if (label && !out.includes(label)) out.push(label);
    }
  }
  return out;
}

/** A number from an API field, or null when it is missing or not a number. */
export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** First value that is a number, from fields that are tried in order. */
function firstNumber(...values: unknown[]): number | null {
  for (const v of values) {
    const n = numberOrNull(v);
    if (n !== null) return n;
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export interface SignalRow {
  token: TokenDisplay;
  /** "PEPE", or "Unknown token" (in the page's language) when OKX sent no symbol. */
  title: string;
  /** The token's own name when it adds something to the symbol. */
  subtitle: string | null;
  address: string;
  chainIndex: number | null;
  logo: string | null;
  wallets: number | null;
  boughtUsd: number | null;
  marketCapUsd: number | null;
  price: number | null;
  /** Share of the bought tokens already sold, in percent (0–100). */
  soldPercent: number | null;
  walletTypes: string[];
}

type Rec = Record<string, unknown>;

/** One `signal list` item (token nested under `token`, as OKX sends it). */
export function signalRow(s: Rec, t: SignalsT): SignalRow {
  const tk = (s.token && typeof s.token === "object" ? s.token : {}) as Rec;
  const address = text(tk.tokenAddress) || text(s.tokenContractAddress) || text(s.tokenAddress) || text(s.address);
  const chainRaw = s.chainIndex ?? s.chainId ?? tk.chainIndex;
  const rawSymbol = text(tk.symbol) || text(s.tokenSymbol) || text(s.symbol);
  const token = displayToken({
    symbol: rawSymbol,
    name: text(tk.name) || text(s.tokenName),
    chainIndex: typeof chainRaw === "string" || typeof chainRaw === "number" ? chainRaw : null,
    tokenAddress: address || null,
  });
  const hasSymbol = rawSymbol !== "" && token.symbol !== "?";
  const logo = text(tk.logo) || text(s.logo);
  return {
    token,
    title: hasSymbol ? token.symbol : t("unknownToken"),
    subtitle: hasSymbol && token.name && token.name.toLowerCase() !== token.symbol.toLowerCase() ? token.name : null,
    address,
    chainIndex: token.chainIndex,
    logo: logo || null,
    wallets: firstNumber(s.triggerWalletCount, s.addressCount, s.address_count),
    boughtUsd: firstNumber(s.amountUsd, s.amount_usd, s.totalAmountUsd, s.total_amount_usd),
    marketCapUsd: firstNumber(tk.marketCapUsd, s.marketCap, s.market_cap),
    price: firstNumber(s.price),
    soldPercent: firstNumber(s.soldRatioPercent),
    walletTypes: walletTypeLabels(t, s.walletTypes, s.wallet_types, s.walletType),
  };
}

export interface LeaderRow {
  address: string;
  pnlUsd: number | null;
  /** Realized PnL in percent of what was put in (0.5 means 0.5%). */
  returnPercent: number | null;
  /** Win rate in percent, 0–100. */
  winRatePercent: number | null;
  volumeUsd: number | null;
  trades: number | null;
  walletTypes: string[];
}

/** One `leaderboard list` entry. */
export function leaderRow(e: Rec, t: SignalsT): LeaderRow {
  return {
    address: text(e.walletAddress) || text(e.wallet_address) || text(e.address),
    pnlUsd: firstNumber(e.realizedPnlUsd, e.realizedPnl, e.realized_pnl, e.pnl),
    returnPercent: firstNumber(e.realizedPnlPercent),
    winRatePercent: firstNumber(e.winRatePercent),
    volumeUsd: firstNumber(e.txVolume, e.volume),
    trades: firstNumber(e.txs, e.txCount, e.tx_count, e.txNumber),
    walletTypes: walletTypeLabels(t, e.walletType, e.wallet_type),
  };
}

/**
 * "1 trade", "1,204 trades" ("1.204 operazioni" in Italian), or null when
 * the count is unknown. `f` is the page's useFormat().
 */
export function tradesLabel(n: number | null, t: SignalsT, f: { number: (value: number) => string }): string | null {
  if (n === null || n < 0) return null;
  const whole = Math.round(n);
  return t("trades", { count: whole, n: f.number(whole) });
}
