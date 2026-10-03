"use client";

/**
 * Trade: Hyperliquid perpetuals. Account figures, then a ticker of markets,
 * then positions and open orders beside an order ticket that is always in
 * view. Funding opens as a sheet.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Fade } from "@/components/motion";
import { LineIcon } from "@/components/line-icon";
import { Empty, Metric, PageHead, Panel, PillTabs, Segmented, Sheet, Skeleton } from "@/components/premium";
import { FEATURED_MARKETS } from "@/lib/hyperliquid/markets";

// Hyperliquid brand colour: its logo only. The UI uses the app theme.
const HL_GREEN = "#97FCE4";

function HyperliquidLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 144 144" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M144 71.6991C144 119.306 114.866 134.582 99.5156 120.98C86.8804 109.889 83.1211 86.4521 64.116 84.0456C39.9942 81.0113 37.9057 113.133 22.0334 113.133C3.5504 113.133 0 86.2428 0 72.4315C0 58.3063 3.96809 39.0542 19.736 39.0542C38.1146 39.0542 39.1588 66.5722 62.132 65.1073C85.0007 63.5379 85.4184 34.8689 100.247 22.6271C113.195 12.0593 144 23.4641 144 71.6991Z"
        fill={HL_GREEN}
      />
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Position {
  coin: string;
  side: "long" | "short";
  size: string;
  entryPrice: string;
  markPrice?: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  liquidationPrice: string;
  marginUsed: string;
  positionValue: string;
  leverage: { type: "cross" | "isolated"; value: number };
}

interface PositionsData {
  address: string;
  accountValue: string;
  totalMarginUsed: string;
  totalNotionalPosition: string;
  withdrawable: string;
  positions: Position[];
}

interface OrderRow {
  oid: number;
  coin: string;
  side: string;
  limitPrice: string;
  size: string;
  origSize: string;
  type?: string;
  reduceOnly?: boolean;
  timestamp: number;
}

interface MarketPrice {
  coin: string;
  label: string;
  price: string;
}

interface MarketMeta {
  coin: string;
  label?: string;
  name?: string;
  maxLeverage?: number;
}

interface MarketsPayload {
  markets?: MarketMeta[];
  prices?: MarketPrice[];
  meta?: MarketMeta[];
}

interface OrderParams {
  coin: string;
  side: "buy" | "sell";
  size: string;
  type: "market" | "limit";
  price?: string;
  leverage: number;
  slPx?: string;
  tpPx?: string;
}

interface BoundOrderPreview {
  data: Record<string, unknown>;
  params: OrderParams;
  estimatedLiq: number | null;
}

interface QuickstartData {
  status: "active" | "ready" | "needs_deposit" | "low_balance" | "no_funds";
  wallet: string;
  assets: {
    arb_usdc_balance: number;
    hl_account_value_usd: number;
    hl_withdrawable_usd: number;
    hl_open_positions: number;
  };
  suggestion?: string;
  next_command?: string;
  onboarding_steps?: string[];
}

interface RegisterData {
  status: "ready" | "needs_agent" | "registered";
  hl_address: string;
  hl_signing_address?: string;
  message?: string;
}

type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; errorCode?: string; suggestion?: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function PnlBadge({ value }: { value: string }) {
  const n = parseFloat(value);
  const pos = n >= 0;
  return <span className={`glp ${pos ? "pos" : "neg"}`}>{`${pos ? "+" : "−"}${Math.abs(n).toFixed(2)} USDC`}</span>;
}

function fmtUsd(v: string | number | undefined, digits = 2): string {
  const n = typeof v === "string" ? parseFloat(v) : v ?? 0;
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function fmtPrice(v: string | number | undefined): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (n === undefined || !Number.isFinite(n)) return "n/a";
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(3);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

const DECIMAL_RE = /^\d+(\.\d+)?$/;
const COIN_RE = /^[A-Z0-9@_-]{1,16}$/;
const GENERIC_ORDER_ERROR = "Order failed, please try again";

const ORDER_ERROR_MESSAGES: Record<string, string> = {
  INSUFFICIENT_BALANCE:
    "Not enough USDC on Arbitrum. Send USDC to your Arbitrum address, then try again.",
  INSUFFICIENT_MARGIN:
    "Not enough margin for this position. Reduce the size or deposit more to Hyperliquid.",
  SIGNING_FAILED:
    "The wallet could not sign. Check that you are still signed in, then refresh.",
  NOT_REGISTERED:
    "Hyperliquid is not set up yet. Register the wallet first.",
  MIN_NOTIONAL:
    "The order is below Hyperliquid's $10 minimum. Increase the size.",
  PRICE_OUT_OF_BAND:
    "The limit price is too far from the market. Use a price closer to the mark.",
  REDUCE_ONLY_VIOLATION:
    "A reduce-only order cannot open or grow a position.",
};

/** Normalize a user decimal (comma → dot) and accept only /^\d+(\.\d+)?$/. */
function normalizeDecimal(raw: string): string | null {
  const s = raw.trim().replace(",", ".");
  if (!DECIMAL_RE.test(s)) return null;
  return s;
}

function isPositiveDecimal(raw: string): boolean {
  const s = normalizeDecimal(raw);
  if (!s) return false;
  const n = Number(s);
  return Number.isFinite(n) && n > 0;
}

function marketMaxLeverage(coin: string, byCoin: Record<string, number>): number {
  const cap = byCoin[coin];
  if (typeof cap === "number" && Number.isFinite(cap) && cap >= 1) {
    return Math.max(1, Math.min(50, Math.floor(cap)));
  }
  return 50;
}

function buildLeverageByCoin(data: MarketsPayload): Record<string, number> {
  const map: Record<string, number> = {};
  const take = (coin: string | undefined, max: number | undefined) => {
    if (!coin || typeof max !== "number" || !Number.isFinite(max) || max < 1) return;
    map[coin] = Math.max(1, Math.min(50, Math.floor(max)));
  };
  for (const m of data.markets ?? []) take(m.coin ?? m.name, m.maxLeverage);
  for (const u of data.meta ?? []) take(u.coin ?? u.name, u.maxLeverage);
  return map;
}

/** Isolated-margin liq estimate: long entry*(1-1/lev), short entry*(1+1/lev). */
function estimatedLiqPrice(entry: number, leverage: number, side: "buy" | "sell"): number | null {
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(leverage) || leverage < 1) return null;
  return side === "buy" ? entry * (1 - 1 / leverage) : entry * (1 + 1 / leverage);
}

function entryPrice(type: "market" | "limit", limitPx: string, mark: string | undefined): number | null {
  const raw = type === "limit" && limitPx.trim() ? limitPx : (mark ?? "");
  const n = Number(normalizeDecimal(raw) ?? raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function tpslDirectionError(
  side: "buy" | "sell",
  mark: string | undefined,
  slPx: string,
  tpPx: string,
): string | null {
  const hasSl = slPx.trim() !== "";
  const hasTp = tpPx.trim() !== "";
  if (!hasSl && !hasTp) return null;
  const markN = mark ? Number(mark) : NaN;
  if (!Number.isFinite(markN) || markN <= 0) {
    return "The mark price is unavailable, so take-profit and stop-loss cannot be checked.";
  }
  const sl = hasSl ? normalizeDecimal(slPx) : null;
  const tp = hasTp ? normalizeDecimal(tpPx) : null;
  // Format errors are handled by the decimal check; skip direction until valid.
  if (hasSl && !sl) return null;
  if (hasTp && !tp) return null;
  if (side === "buy") {
    if (sl && !(Number(sl) < markN)) {
      return "For a long, the stop-loss goes below the mark and the take-profit above it.";
    }
    if (tp && !(Number(tp) > markN)) {
      return "For a long, the stop-loss goes below the mark and the take-profit above it.";
    }
  } else {
    if (sl && !(Number(sl) > markN)) {
      return "For a short, the stop-loss goes above the mark and the take-profit below it.";
    }
    if (tp && !(Number(tp) < markN)) {
      return "For a short, the stop-loss goes above the mark and the take-profit below it.";
    }
  }
  return null;
}

function mapOrderError(res: { error: string; errorCode?: string; suggestion?: string }): string {
  if (res.errorCode && ORDER_ERROR_MESSAGES[res.errorCode]) {
    const mapped = ORDER_ERROR_MESSAGES[res.errorCode];
    return res.suggestion ? `${mapped} ${res.suggestion}` : mapped;
  }
  console.error("Order failed", res);
  return GENERIC_ORDER_ERROR;
}

async function apiGet<T>(url: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url);
    return (await res.json()) as ApiResult<T>;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

async function apiPost<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as ApiResult<T>;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function TradePage() {
  const { authenticated } = useAuth();

  // Core state
  const [register, setRegister] = useState<RegisterData | null>(null);
  const [registerErr, setRegisterErr] = useState<string | null>(null);
  const [quickstart, setQuickstart] = useState<QuickstartData | null>(null);
  const [positions, setPositions] = useState<PositionsData | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [leverageByCoin, setLeverageByCoin] = useState<Record<string, number>>({});

  const [tab, setTab] = useState<"positions" | "trade" | "orders">("positions");

  // Order form
  const [orderSide, setOrderSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [orderCoin, setOrderCoin] = useState("BTC");
  const [orderSize, setOrderSize] = useState("");
  const [orderPrice, setOrderPrice] = useState("");
  const [orderLeverage, setOrderLeverage] = useState(10);
  const [orderSlPx, setOrderSlPx] = useState("");
  const [orderTpPx, setOrderTpPx] = useState("");
  const [orderPreview, setOrderPreview] = useState<BoundOrderPreview | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderConfirming, setOrderConfirming] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);

  // Funding modal
  const [showFund, setShowFund] = useState(false);
  const [fundMode, setFundMode] = useState<"deposit" | "withdraw">("deposit");
  const [fundAmount, setFundAmount] = useState("");
  const [fundLoading, setFundLoading] = useState(false);
  const [fundPreview, setFundPreview] = useState<Record<string, unknown> | null>(null);
  const [fundError, setFundError] = useState<string | null>(null);
  const [fundSuccess, setFundSuccess] = useState<string | null>(null);

  // Close position: confirmation step, then in-flight
  const [pendingClose, setPendingClose] = useState<Position | null>(null);
  const [closingCoin, setClosingCoin] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  // Initial fetch — do everything in parallel so UI boots fast
  const bootstrap = useCallback(async () => {
    if (!authenticated) return;

    const [reg, qs, pos, ord, mkts] = await Promise.all([
      apiGet<RegisterData>("/api/perp/register"),
      apiGet<QuickstartData>("/api/perp/quickstart"),
      apiGet<PositionsData>("/api/perp/positions"),
      apiGet<{ orders: OrderRow[] }>("/api/perp/orders"),
      apiGet<MarketsPayload>("/api/perp/markets"),
    ]);

    if (reg.success) {
      setRegister(reg.data);
      setRegisterErr(null);
    } else {
      setRegisterErr(reg.error);
    }
    if (qs.success) setQuickstart(qs.data);
    if (pos.success) setPositions(pos.data);
    if (ord.success) setOrders(ord.data.orders ?? []);
    if (mkts.success) {
      setPrices(mkts.data.prices ?? []);
      setLeverageByCoin(buildLeverageByCoin(mkts.data));
    }
  }, [authenticated]);

  // Bootstrap on mount / when auth flips. Inline the effect body (instead of
  // calling `bootstrap()` directly) so the React 19 lint can see that every
  // setState call happens *after* the await — calling a useCallback that
  // contains setState trips set-state-in-effect even though setState is
  // itself async here.
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    (async () => {
      const [reg, qs, pos, ord, mkts] = await Promise.all([
        apiGet<RegisterData>("/api/perp/register"),
        apiGet<QuickstartData>("/api/perp/quickstart"),
        apiGet<PositionsData>("/api/perp/positions"),
        apiGet<{ orders: OrderRow[] }>("/api/perp/orders"),
        apiGet<MarketsPayload>("/api/perp/markets"),
      ]);
      if (cancelled) return;
      if (reg.success) {
        setRegister(reg.data);
        setRegisterErr(null);
      } else {
        setRegisterErr(reg.error);
      }
      if (qs.success) setQuickstart(qs.data);
      if (pos.success) setPositions(pos.data);
      if (ord.success) setOrders(ord.data.orders ?? []);
      if (mkts.success) {
        setPrices(mkts.data.prices ?? []);
        setLeverageByCoin(buildLeverageByCoin(mkts.data));
      }
    })();
    return () => { cancelled = true; };
  }, [authenticated]);

  // Live refresh: positions / orders / prices every 8s
  const refreshTimer = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    const pulse = async () => {
      const [pos, ord, mkts, qs] = await Promise.all([
        apiGet<PositionsData>("/api/perp/positions"),
        apiGet<{ orders: OrderRow[] }>("/api/perp/orders"),
        apiGet<MarketsPayload>("/api/perp/markets"),
        apiGet<QuickstartData>("/api/perp/quickstart"),
      ]);
      if (cancelled) return;
      if (pos.success) setPositions(pos.data);
      if (ord.success) setOrders(ord.data.orders ?? []);
      if (mkts.success) {
        setPrices(mkts.data.prices ?? []);
        setLeverageByCoin(buildLeverageByCoin(mkts.data));
      }
      if (qs.success) setQuickstart(qs.data);
    };
    refreshTimer.current = setInterval(pulse, 8000);
    return () => {
      cancelled = true;
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [authenticated]);

  // ── Derived state machine ──────────────────────────────────────────────────
  const stage = (() => {
    if (!authenticated) return "auth" as const;
    if (registerErr) return "register_error" as const;
    if (register && register.status === "needs_agent") return "needs_agent" as const;
    const arb = quickstart?.assets.arb_usdc_balance ?? 0;
    const hl = quickstart?.assets.hl_account_value_usd ?? 0;
    if (hl <= 0 && arb < 5) return "needs_arb_funds" as const;
    if (hl <= 0 && arb >= 5) return "needs_hl_deposit" as const;
    return "ready" as const;
  })();

  // Current coin mark price (for notional estimate)
  const currentMark = prices.find((p) => p.coin === orderCoin)?.price;
  const coinMaxLeverage = marketMaxLeverage(orderCoin, leverageByCoin);
  const clampedLeverage = Math.min(orderLeverage, coinMaxLeverage);
  const previewOpen = orderPreview !== null;

  function setCoinAndClamp(coin: string) {
    setOrderCoin(coin);
    setOrderLeverage((v) => {
      const cap = marketMaxLeverage(coin, leverageByCoin);
      return v > cap ? cap : v;
    });
  }

  function markForCoin(coin: string): string | undefined {
    return prices.find((p) => p.coin === coin)?.price;
  }

  // ── Order flow: preview → confirm ──────────────────────────────────────────
  async function submitOrderPreview() {
    setOrderError(null);
    setOrderSuccess(null);
    setOrderPreview(null);

    if (!COIN_RE.test(orderCoin)) {
      setOrderError("Choose a valid market");
      return;
    }
    const size = normalizeDecimal(orderSize);
    if (!size || Number(size) <= 0) {
      setOrderError("Enter a size");
      return;
    }
    let price: string | undefined;
    if (orderType === "limit") {
      const p = normalizeDecimal(orderPrice);
      if (!p || Number(p) <= 0) {
        setOrderError("A limit order needs a price");
        return;
      }
      price = p;
    }
    const sl = orderSlPx.trim() ? normalizeDecimal(orderSlPx) : null;
    if (orderSlPx.trim() && (!sl || Number(sl) <= 0)) {
      setOrderError("The stop-loss is not a valid price");
      return;
    }
    const tp = orderTpPx.trim() ? normalizeDecimal(orderTpPx) : null;
    if (orderTpPx.trim() && (!tp || Number(tp) <= 0)) {
      setOrderError("The take-profit is not a valid price");
      return;
    }
    const dirErr = tpslDirectionError(orderSide, currentMark, orderSlPx, orderTpPx);
    if (dirErr) {
      setOrderError(dirErr);
      return;
    }

    const leverage = clampedLeverage;
    const params: OrderParams = {
      coin: orderCoin,
      side: orderSide,
      size,
      type: orderType,
      ...(price ? { price } : {}),
      leverage,
      ...(sl ? { slPx: sl } : {}),
      ...(tp ? { tpPx: tp } : {}),
    };
    const entry = entryPrice(params.type, params.price ?? "", currentMark);
    const estimatedLiq = entry ? estimatedLiqPrice(entry, params.leverage, params.side) : null;

    setOrderLoading(true);
    const res = await apiPost<Record<string, unknown>>("/api/perp/order", {
      ...params,
      confirm: false,
    });
    setOrderLoading(false);
    if (res.success) {
      setOrderPreview({ data: res.data, params, estimatedLiq });
    } else {
      setOrderError(mapOrderError(res));
    }
  }

  async function submitOrderConfirm() {
    if (!orderPreview) return;
    setOrderError(null);
    setOrderConfirming(true);
    const { params } = orderPreview;
    const res = await apiPost<Record<string, unknown>>("/api/perp/order", {
      ...params,
      confirm: true,
    });
    setOrderConfirming(false);
    if (res.success) {
      setOrderSuccess(
        `${params.side === "buy" ? "Long" : "Short"} order for ${params.size} ${params.coin} sent`
      );
      setOrderPreview(null);
      setOrderSize("");
      setOrderPrice("");
      setOrderSlPx("");
      setOrderTpPx("");
      bootstrap();
    } else {
      setOrderError(mapOrderError(res));
    }
  }

  function requestClose(position: Position) {
    setCloseError(null);
    setPendingClose(position);
  }

  async function confirmClose() {
    if (!pendingClose) return;
    const coin = pendingClose.coin;
    if (!COIN_RE.test(coin)) {
      setCloseError("Choose a valid market");
      return;
    }
    setCloseError(null);
    setClosingCoin(coin);
    const res = await apiPost<Record<string, unknown>>("/api/perp/close", {
      coin,
      confirm: true,
    });
    setClosingCoin(null);
    if (!res.success) {
      setCloseError(mapOrderError(res));
    } else {
      setPendingClose(null);
      bootstrap();
    }
  }

  async function cancelOrder(coin: string, oid: number) {
    const res = await apiPost("/api/perp/cancel", {
      coin,
      orderId: String(oid),
      confirm: true,
    });
    if (res.success) bootstrap();
  }

  // ── Funding flow ───────────────────────────────────────────────────────────
  async function submitFundPreview() {
    setFundError(null);
    setFundPreview(null);
    setFundSuccess(null);
    const amount = normalizeDecimal(fundAmount);
    if (!amount || Number(amount) <= 0) {
      setFundError("Enter a valid amount");
      return;
    }
    setFundLoading(true);
    const res = await apiPost<Record<string, unknown>>(
      `/api/perp/${fundMode}`,
      { amount, confirm: false }
    );
    setFundLoading(false);
    if (res.success) {
      setFundPreview(res.data);
    } else {
      setFundError(res.suggestion ? `${res.error}. ${res.suggestion}` : res.error);
    }
  }

  async function submitFundConfirm() {
    setFundError(null);
    const amount = normalizeDecimal(fundAmount);
    if (!amount || Number(amount) <= 0) {
      setFundError("Enter a valid amount");
      return;
    }
    setFundLoading(true);
    const res = await apiPost<Record<string, unknown>>(
      `/api/perp/${fundMode}`,
      { amount, confirm: true }
    );
    setFundLoading(false);
    if (res.success) {
      setFundSuccess(
        fundMode === "deposit"
          ? `Deposit of ${fundAmount} USDC sent. It arrives in 2 to 5 minutes.`
          : `Withdrawal of ${fundAmount} USDC sent. It arrives in 2 to 5 minutes, less the $1 fee.`
      );
      setFundPreview(null);
      bootstrap();
    } else {
      setFundError(res.suggestion ? `${res.error}. ${res.suggestion}` : res.error);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div className="page">
        <Empty icon="bar-chart" title="Sign in first" text="Connect your wallet to trade perpetuals on Hyperliquid." />
      </div>
    );
  }

  const openFund = (mode: "deposit" | "withdraw", amount = "") => {
    setFundMode(mode);
    setFundAmount(amount);
    setFundPreview(null);
    setFundError(null);
    setFundSuccess(null);
    setShowFund(true);
  };

  const positionCount = positions?.positions.length ?? 0;

  // Setup state, one message at a time. It sits in the order ticket, where it
  // explains why ordering is locked, so its arrival does not push the page.
  const setupNote =
    stage === "register_error" ? (
        <div className="note loss msg-note" role="alert">
          <LineIcon name="alert" size={16} />
          <div>
            <strong>Hyperliquid setup failed</strong>
            <p>{registerErr ?? "Hyperliquid could not be set up."}</p>
          </div>
          <button
            type="button"
            className="btn btn--sm"
            onClick={async () => {
              setRegisterErr(null);
              const r = await apiGet<RegisterData>("/api/perp/register?force=true");
              if (r.success) setRegister(r.data);
              else setRegisterErr(r.error);
            }}
          >
            Try again
          </button>
        </div>
      ) : stage === "needs_agent" && register ? (
        <div className="note warn msg-note">
          <LineIcon name="alert" size={16} />
          <div>
            <strong>Finish the Hyperliquid setup</strong>
            <p>{register.message ?? "The signing agent still needs to be registered."}</p>
          </div>
        </div>
      ) : stage === "needs_arb_funds" && quickstart ? (
        <div className="note warn msg-note">
          <LineIcon name="wallet" size={16} />
          <div>
            <strong>Fund your Arbitrum wallet</strong>
            <p>
              You need at least $5 USDC on Arbitrum to start. You have {fmtUsd(quickstart.assets.arb_usdc_balance)}. Send USDC on Arbitrum&nbsp;to:
            </p>
            <p className="num conf-recipient">{quickstart.wallet}</p>
          </div>
        </div>
      ) : stage === "needs_hl_deposit" && quickstart ? (
        <div className="note msg-note">
          <HyperliquidLogo size={16} />
          <div>
            <strong>Deposit USDC to Hyperliquid</strong>
            <p>
              You have {fmtUsd(quickstart.assets.arb_usdc_balance)} on Arbitrum. Deposit it to start trading: minimum $5, it arrives in 2 to 5&nbsp;minutes.
            </p>
          </div>
          <button type="button" className="btn btn--sm btn--primary" onClick={() => openFund("deposit", String(Math.floor(quickstart.assets.arb_usdc_balance)))}>
            Deposit now
          </button>
        </div>
      ) : null;

  return (
    <div className="page">
      <PageHead
        title="Trade"
        lede={
          <span className="hl-lede">
            <HyperliquidLogo size={18} />
            Perpetual futures on Hyperliquid, settled in&nbsp;USDC.
          </span>
        }
        actions={
          <button type="button" className="btn" onClick={() => openFund("deposit")}>
            <LineIcon name="swap" size={16} />
            Deposit or withdraw
          </button>
        }
      />

      <div className="metrics in" style={{ "--i": 1 } as React.CSSProperties}>
        <Metric label="Account value" value={fmtUsd(quickstart?.assets.hl_account_value_usd ?? positions?.accountValue)} />
        <Metric label="Withdrawable" value={fmtUsd(quickstart?.assets.hl_withdrawable_usd ?? positions?.withdrawable)} />
        <Metric label="Margin used" value={fmtUsd(positions?.totalMarginUsed)} />
        <Metric label="USDC on Arbitrum" value={fmtUsd(quickstart?.assets.arb_usdc_balance)} sub="Ready to deposit" />
      </div>

      {/* Markets ticker */}
      <div className="ticker in" style={{ "--i": 2 } as React.CSSProperties} role="group" aria-label="Markets">
        {prices.length === 0
          ? [0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="tick">
                <Skeleton height={36} width={92} />
              </span>
            ))
          : prices.slice(0, 12).map((p) => (
              <button
                key={p.coin}
                type="button"
                className="tick"
                aria-pressed={orderCoin === p.coin}
                disabled={previewOpen}
                onClick={() => setCoinAndClamp(p.coin)}
              >
                <span className="c">{p.coin}</span>
                <span className="num">{fmtPrice(p.price)}</span>
              </button>
            ))}
      </div>

      <div className="bento">
        <Panel
          className="span-7"
          flush
          index={3}
          title="Your trades"
          action={
            <PillTabs
              id="trade-tabs"
              label="Your trading"
              value={tab === "trade" ? "positions" : tab}
              onChange={(v) => setTab(v)}
              options={[
                { value: "positions", label: "Positions", count: positionCount || undefined },
                { value: "orders", label: "Open orders", count: orders.length || undefined },
              ]}
            />
          }
        >
          {tab === "orders" ? (
            <OrdersTab orders={orders} onCancel={cancelOrder} />
          ) : (
            <PositionsTab
              positions={positions}
              pendingClose={pendingClose}
              closingCoin={closingCoin}
              closeError={closeError}
              markForCoin={markForCoin}
              onRequestClose={requestClose}
              onCancelClose={() => {
                setPendingClose(null);
                setCloseError(null);
              }}
              onConfirmClose={confirmClose}
            />
          )}
        </Panel>

        <Panel className="span-5 ticket" index={4} title="New order">
          {setupNote}
          <TradeTab
            lockNote={!setupNote}
            stage={stage}
            side={orderSide}
            setSide={setOrderSide}
            type={orderType}
            setType={setOrderType}
            coin={orderCoin}
            setCoin={setCoinAndClamp}
            size={orderSize}
            setSize={setOrderSize}
            price={orderPrice}
            setPrice={setOrderPrice}
            leverage={clampedLeverage}
            setLeverage={(v) => setOrderLeverage(Math.min(Math.max(1, v), coinMaxLeverage))}
            maxLeverage={coinMaxLeverage}
            slPx={orderSlPx}
            setSlPx={setOrderSlPx}
            tpPx={orderTpPx}
            setTpPx={setOrderTpPx}
            mark={currentMark}
            preview={orderPreview}
            loading={orderLoading}
            confirming={orderConfirming}
            error={orderError}
            success={orderSuccess}
            onPreview={submitOrderPreview}
            onConfirm={submitOrderConfirm}
            onModify={() => setOrderPreview(null)}
          />
        </Panel>
      </div>

      <FundModal
        open={showFund}
        mode={fundMode}
        setMode={setFundMode}
        amount={fundAmount}
        setAmount={setFundAmount}
        arbBalance={quickstart?.assets.arb_usdc_balance ?? 0}
        hlWithdrawable={quickstart?.assets.hl_withdrawable_usd ?? 0}
        preview={fundPreview}
        loading={fundLoading}
        error={fundError}
        success={fundSuccess}
        onPreview={submitFundPreview}
        onConfirm={submitFundConfirm}
        onClose={() => {
          setShowFund(false);
          setFundPreview(null);
          setFundError(null);
          setFundSuccess(null);
          setFundAmount("");
        }}
      />
    </div>
  );
}

// ── Components ────────────────────────────────────────────────────────────────

function Facts({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="facts">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd className="num">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function PositionsTab({
  positions,
  pendingClose,
  closingCoin,
  closeError,
  markForCoin,
  onRequestClose,
  onCancelClose,
  onConfirmClose,
}: {
  positions: PositionsData | null;
  pendingClose: Position | null;
  closingCoin: string | null;
  closeError: string | null;
  markForCoin: (coin: string) => string | undefined;
  onRequestClose: (p: Position) => void;
  onCancelClose: () => void;
  onConfirmClose: () => void;
}) {
  if (!positions) {
    return (
      <div className="wal-pad" style={{ display: "grid", gap: 12 }}>
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    );
  }
  if (positions.positions.length === 0) {
    return <Empty icon="bar-chart" title="No open positions" text="Pick a market and open one from the order ticket." />;
  }
  return (
    <div className="wal-pad pos-list">
      <Fade in={!!closeError}>
        {closeError && (
          <p className="note loss">
            <LineIcon name="alert" size={16} />
            <span>{closeError}</span>
          </p>
        )}
      </Fade>
      {positions.positions.map((p) => {
        const isLong = p.side === "long";
        const confirmingThis = pendingClose?.coin === p.coin;
        const inFlight = closingCoin === p.coin;
        const mark = p.markPrice ?? markForCoin(p.coin);
        const sizeN = Math.abs(Number(p.size));
        const markN = mark ? Number(mark) : NaN;
        const proceeds = Number.isFinite(sizeN) && Number.isFinite(markN) ? sizeN * markN : null;
        return (
          <article key={p.coin} className="pos" data-side={isLong ? "long" : "short"}>
            <header className="pos-head">
              <span className="pos-coin">{p.coin}</span>
              <span className={`side-tag ${isLong ? "long" : "short"}`}>
                {isLong ? "Long" : "Short"} {p.leverage?.value ?? 1}×
              </span>
              <span className="muted pos-type">{p.leverage?.type}</span>
              <PnlBadge value={p.unrealizedPnl} />
            </header>
            <Facts
              items={[
                ["Size", `${p.size} ${p.coin}`],
                ["Entry", fmtPrice(p.entryPrice)],
                ["Liquidation", fmtPrice(p.liquidationPrice)],
                ["Value", fmtUsd(p.positionValue)],
                ["Margin", fmtUsd(p.marginUsed)],
                ["Return", `${parseFloat(p.returnOnEquity).toFixed(2)}%`],
              ]}
            />
            {confirmingThis ? (
              <div className="close-confirm">
                <dl className="sum">
                  <div>
                    <dt>Mark price</dt>
                    <dd className="num">{fmtPrice(mark)}</dd>
                  </div>
                  <div>
                    <dt>Estimated proceeds</dt>
                    <dd className="num">{proceeds === null ? "n/a" : fmtUsd(proceeds)}</dd>
                  </div>
                </dl>
                <p className="hint">An estimate, without fees and funding.</p>
                <div className="sheet-actions">
                  <button type="button" className="btn btn--sm" onClick={onCancelClose} disabled={inFlight}>
                    Keep it open
                  </button>
                  <button type="button" className="btn btn--sm btn--primary" onClick={onConfirmClose} disabled={inFlight}>
                    {inFlight ? <span className="spin" aria-hidden="true" /> : `Close ${p.coin}`}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn btn--sm pos-close" disabled={closingCoin !== null} onClick={() => onRequestClose(p)}>
                Close position
              </button>
            )}
          </article>
        );
      })}
    </div>
  );
}

function TradeTab(props: {
  lockNote: boolean;
  stage: "auth" | "register_error" | "needs_agent" | "needs_arb_funds" | "needs_hl_deposit" | "ready";
  side: "buy" | "sell";
  setSide: (v: "buy" | "sell") => void;
  type: "market" | "limit";
  setType: (v: "market" | "limit") => void;
  coin: string;
  setCoin: (v: string) => void;
  size: string;
  setSize: (v: string) => void;
  price: string;
  setPrice: (v: string) => void;
  leverage: number;
  setLeverage: (v: number) => void;
  maxLeverage: number;
  slPx: string;
  setSlPx: (v: string) => void;
  tpPx: string;
  setTpPx: (v: string) => void;
  mark: string | undefined;
  preview: BoundOrderPreview | null;
  loading: boolean;
  confirming: boolean;
  error: string | null;
  success: string | null;
  onPreview: () => void;
  onConfirm: () => void;
  onModify: () => void;
}) {
  const disabled = props.stage !== "ready";
  const locked = disabled || !!props.preview;
  const sizeOk = isPositiveDecimal(props.size);
  const priceOk = props.type !== "limit" || isPositiveDecimal(props.price);
  const slFormatOk = !props.slPx.trim() || isPositiveDecimal(props.slPx);
  const tpFormatOk = !props.tpPx.trim() || isPositiveDecimal(props.tpPx);
  const tpslErr = tpslDirectionError(props.side, props.mark, props.slPx, props.tpPx);
  const coinOk = COIN_RE.test(props.coin);
  const canPreview = !locked && !props.loading && sizeOk && priceOk && slFormatOk && tpFormatOk && !tpslErr && coinOk;

  const sizeN = sizeOk ? Number(normalizeDecimal(props.size)) : NaN;
  const markN = props.mark ? Number(props.mark) : NaN;
  const notional = Number.isFinite(sizeN) && Number.isFinite(markN) ? sizeN * markN : 0;
  const entry = entryPrice(props.type, props.price, props.mark);
  const liq = entry ? estimatedLiqPrice(entry, props.leverage, props.side) : null;
  const sideWord = props.side === "buy" ? "long" : "short";
  const levPct = props.maxLeverage > 1 ? ((props.leverage - 1) / (props.maxLeverage - 1)) * 100 : 100;

  return (
    <div className="form order">
      {disabled && props.lockNote && (
        <p className="note">
          <LineIcon name="lock" size={16} />
          <span>Orders open once Hyperliquid is set up and funded.</span>
        </p>
      )}

      <Segmented
        id="trade-side"
        label="Direction"
        className="side-seg"
        value={props.side}
        disabled={locked}
        onChange={props.setSide}
        options={[
          { value: "buy", label: "Long" },
          { value: "sell", label: "Short" },
        ]}
      />

      <div className="order-row">
        <div className="select select--chip">
          <label htmlFor="trade-coin" className="sr-only">
            Market
          </label>
          <select id="trade-coin" className="input" disabled={locked} value={props.coin} onChange={(e) => props.setCoin(e.target.value)}>
            {FEATURED_MARKETS.map((m) => (
              <option key={m.coin} value={m.coin}>
                {m.coin} · {m.label}
              </option>
            ))}
          </select>
        </div>
        <Segmented
          id="trade-type"
          label="Order type"
          value={props.type}
          disabled={locked}
          onChange={props.setType}
          options={[
            { value: "market", label: "Market" },
            { value: "limit", label: "Limit" },
          ]}
        />
      </div>

      <div className="field">
        <div className="lbl">
          <label htmlFor="trade-size">Size in {props.coin}</label>
          <span className="num muted">Mark {fmtPrice(props.mark)}</span>
        </div>
        <input
          id="trade-size"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className="input num-in"
          disabled={locked}
          value={props.size}
          aria-invalid={props.size.trim() !== "" && !sizeOk}
          onChange={(e) => props.setSize(e.target.value)}
          placeholder="0.01"
        />
        {props.size.trim() !== "" && !sizeOk ? (
          <p className="err">The size must be a positive number, for example 0.01.</p>
        ) : notional > 0 && notional < 10 ? (
          <p className="err">Hyperliquid&rsquo;s minimum is $10. Increase the size.</p>
        ) : (
          <p className="hint">
            Worth <span className="num">{fmtUsd(notional)}</span>
          </p>
        )}
      </div>

      {props.type === "limit" && (
        <div className="field">
          <label htmlFor="trade-price">Limit price in USDC</label>
          <input
            id="trade-price"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className="input num-in"
            disabled={locked}
            value={props.price}
            aria-invalid={props.price.trim() !== "" && !priceOk}
            onChange={(e) => props.setPrice(e.target.value)}
            placeholder={fmtPrice(props.mark)}
          />
          {props.price.trim() !== "" && !priceOk && <p className="err">The price must be a positive number.</p>}
        </div>
      )}

      <div className="field">
        <div className="lbl">
          <label htmlFor="trade-lev">Leverage</label>
          <span>
            <span className="num lev-v">{props.leverage}×</span> <span className="muted">of {props.maxLeverage}× max</span>
          </span>
        </div>
        <input
          id="trade-lev"
          type="range"
          min="1"
          max={props.maxLeverage}
          disabled={locked}
          value={Math.min(props.leverage, props.maxLeverage)}
          onChange={(e) => props.setLeverage(Number(e.target.value))}
          className="lev"
          style={{ "--p": `${levPct}%` } as React.CSSProperties}
        />
      </div>

      <div className="order-row two">
        <div className="field">
          <label htmlFor="trade-sl">Stop-loss, optional</label>
          <input id="trade-sl" type="text" inputMode="decimal" autoComplete="off" className="input mono" disabled={locked} value={props.slPx} onChange={(e) => props.setSlPx(e.target.value)} placeholder="Price" />
        </div>
        <div className="field">
          <label htmlFor="trade-tp">Take-profit, optional</label>
          <input id="trade-tp" type="text" inputMode="decimal" autoComplete="off" className="input mono" disabled={locked} value={props.tpPx} onChange={(e) => props.setTpPx(e.target.value)} placeholder="Price" />
        </div>
      </div>
      {(!slFormatOk || !tpFormatOk) && <p className="err">Take-profit and stop-loss must be positive numbers, for example 64000.5.</p>}
      {tpslErr && slFormatOk && tpFormatOk && <p className="err">{tpslErr}</p>}

      <dl className="sum">
        <div>
          <dt>Estimated liquidation</dt>
          <dd className="num">{fmtPrice(liq ?? undefined)}</dd>
        </div>
      </dl>

      {!props.preview ? (
        <button type="button" className={`btn btn--primary sheet-cta side-cta ${sideWord}`} onClick={props.onPreview} disabled={!canPreview}>
          {props.loading ? <span className="spin" aria-hidden="true" /> : `Preview ${sideWord}`}
        </button>
      ) : (
        <div className="conf-quote in">
          <strong>Order preview</strong>
          <Facts
            items={[
              ["Market", props.preview.params.coin],
              ["Side", props.preview.params.side === "buy" ? "Long" : "Short"],
              ["Size", `${props.preview.params.size} ${props.preview.params.coin}`],
              ["Type", props.preview.params.type === "limit" ? `Limit ${props.preview.params.price ?? ""}`.trim() : "Market"],
              ["Leverage", `${props.preview.params.leverage}×`],
              ["Liquidation", props.preview.estimatedLiq === null ? "n/a" : fmtPrice(props.preview.estimatedLiq)],
              ["Take-profit", props.preview.params.tpPx ?? "None"],
              ["Stop-loss", props.preview.params.slPx ?? "None"],
            ]}
          />
          <p className="hint">Estimates, without fees and funding.</p>
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={props.onModify} disabled={props.confirming}>
              Edit
            </button>
            <button type="button" className="btn btn--primary" onClick={props.onConfirm} disabled={props.confirming}>
              {props.confirming ? <span className="spin" aria-hidden="true" /> : `Place ${sideWord}`}
            </button>
          </div>
        </div>
      )}

      <Fade in={!!props.error}>
        {props.error && (
          <p className="note loss" role="alert">
            <LineIcon name="alert" size={16} />
            <span>{props.error}</span>
          </p>
        )}
      </Fade>
      <Fade in={!!props.success}>
        {props.success && (
          <p className="note gain" role="status">
            <LineIcon name="check" size={16} />
            <span>{props.success}</span>
          </p>
        )}
      </Fade>
    </div>
  );
}

function OrdersTab({ orders, onCancel }: { orders: OrderRow[]; onCancel: (coin: string, oid: number) => void }) {
  if (orders.length === 0) {
    return <Empty icon="file" title="No open orders" text="Limit orders waiting to fill will show up here." />;
  }
  return (
    <ul className="rows wal-pad">
      {orders.map((o) => (
        <li key={o.oid}>
          <div className="row">
            <span className={`side-tag ${o.side === "buy" ? "long" : "short"}`}>{o.side === "buy" ? "Buy" : "Sell"}</span>
            <div style={{ minWidth: 0 }}>
              <div className="t">
                {o.coin} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>{o.type ?? "limit"}</span>
              </div>
              <div className="sub num">
                {o.size} at {fmtPrice(o.limitPrice)}
              </div>
            </div>
            <button type="button" className="btn btn--sm" onClick={() => onCancel(o.coin, o.oid)}>
              Cancel
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function FundModal(props: {
  open: boolean;
  mode: "deposit" | "withdraw";
  setMode: (m: "deposit" | "withdraw") => void;
  amount: string;
  setAmount: (s: string) => void;
  arbBalance: number;
  hlWithdrawable: number;
  preview: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
  success: string | null;
  onPreview: () => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const isDeposit = props.mode === "deposit";
  const maxBalance = isDeposit ? props.arbBalance : props.hlWithdrawable;
  const amountOk = isPositiveDecimal(props.amount);
  const previewRows = props.preview
    ? Object.entries(props.preview).map(([k, v]) => [
        k.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()),
        typeof v === "object" ? JSON.stringify(v) : String(v),
      ] as [string, string])
    : [];

  return (
    <Sheet open={props.open} onClose={props.onClose} title="Hyperliquid funds">
      <div className="sheet-body">
        <Segmented
          id="fund-mode"
          label="Direction"
          value={props.mode}
          disabled={!!props.preview || props.loading}
          onChange={(m) => {
            props.setMode(m);
            props.setAmount("");
          }}
          options={[
            { value: "deposit", label: "Deposit" },
            { value: "withdraw", label: "Withdraw" },
          ]}
        />

        <div className="field">
          <div className="lbl">
            <label htmlFor="fund-amount">Amount in USDC</label>
            <span className="num muted">Up to {fmtUsd(maxBalance)}</span>
          </div>
          <input
            id="fund-amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className="input num-in"
            value={props.amount}
            onChange={(e) => props.setAmount(e.target.value)}
            placeholder={isDeposit ? "5.00" : "10.00"}
            disabled={!!props.preview || props.loading}
          />
          <div className="quick">
            {[0.25, 0.5, 1].map((frac) => (
              <button key={frac} type="button" className="chip" disabled={!!props.preview} onClick={() => props.setAmount((maxBalance * frac).toFixed(2))}>
                {frac === 1 ? "Max" : `${frac * 100}%`}
              </button>
            ))}
          </div>
        </div>

        <dl className="sum">
          {isDeposit ? (
            <>
              <div>
                <dt>Minimum</dt>
                <dd className="num">5 USDC</dd>
              </div>
              <div>
                <dt>Route</dt>
                <dd>Arbitrum to Hyperliquid</dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt>Fee</dt>
                <dd className="num">1 USDC</dd>
              </div>
              <div>
                <dt>Arrives at</dt>
                <dd>Your Arbitrum wallet</dd>
              </div>
            </>
          )}
          <div>
            <dt>Time</dt>
            <dd>2 to 5 minutes</dd>
          </div>
        </dl>

        {props.success ? (
          <>
            <p className="note gain" role="status">
              <LineIcon name="check" size={16} />
              <span>{props.success}</span>
            </p>
            <button type="button" className="btn sheet-cta" onClick={props.onClose}>
              Close
            </button>
          </>
        ) : props.preview ? (
          <>
            {previewRows.length > 0 && <Facts items={previewRows} />}
            <div className="sheet-actions">
              <button type="button" className="btn" onClick={props.onClose}>
                Cancel
              </button>
              <button type="button" className="btn btn--primary" onClick={props.onConfirm} disabled={props.loading}>
                {props.loading ? <span className="spin" aria-hidden="true" /> : `Confirm ${isDeposit ? "deposit" : "withdrawal"}`}
              </button>
            </div>
          </>
        ) : (
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={props.onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={props.onPreview} disabled={props.loading || !amountOk}>
              {props.loading ? <span className="spin" aria-hidden="true" /> : "Preview"}
            </button>
          </div>
        )}

        <Fade in={!!props.error}>
          {props.error && (
            <p className="note loss" role="alert">
              <LineIcon name="alert" size={16} />
              <span>{props.error}</span>
            </p>
          )}
        </Fade>
      </div>
    </Sheet>
  );
}
