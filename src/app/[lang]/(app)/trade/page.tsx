"use client";

/**
 * Trade: Hyperliquid perpetuals. Account figures, then a ticker of markets,
 * then positions and open orders beside an order ticket that is always in
 * view. Funding opens as a sheet.
 */

import { documentLocale, translateApiMessage } from "@/i18n/api-messages";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Fade } from "@/components/motion";
import { LineIcon } from "@/components/line-icon";
import { Empty, Metric, PageHead, Panel, PillTabs, Segmented, Sheet, Skeleton } from "@/components/premium";
import { TokenIcon } from "@/components/token-icon";
import { FEATURED_MARKETS } from "@/lib/hyperliquid/markets";
import { MISSING } from "@/lib/format";
import { useFormat, useT } from "@/i18n/client";
import {
  coinLabel,
  coinLogoUrl,
  formatExactNumber,
  formatExactPrice,
  formatLiquidation,
  formatRoe,
  fundPreviewRows,
  leverageTypeLabel,
  orderTypeLabel,
  type TradeKey,
  type TradeT,
} from "./display";

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

/** Unrealized PnL in USDC as a signed dollar pill; "–" when unknown. */
function PnlBadge({ value }: { value: string | undefined }) {
  const f = useFormat();
  const n = value === undefined || value === "" ? NaN : Number(value);
  if (!Number.isFinite(n)) return <span className="glp flat">{MISSING}</span>;
  return <span className={`glp ${n > 0 ? "pos" : n < 0 ? "neg" : "flat"}`}>{f.usd(n, { sign: true })}</span>;
}

/** A Hyperliquid coin's logo: the icon set, else Hyperliquid's own, else letters. */
function CoinIcon({ coin, size = 20 }: { coin: string; size?: number }) {
  return <TokenIcon symbol={coin} size={size} logoUrl={coinLogoUrl(coin)} />;
}

/** "Bitcoin" for BTC, or the ticker for coins outside the curated list. */
function coinName(coin: string): string {
  return coinLabel(coin) ?? coin;
}

const DECIMAL_RE = /^\d+(\.\d+)?$/;
const COIN_RE = /^[A-Z0-9@_-]{1,16}$/;

/** Hyperliquid error codes the page explains in its own words (trade.orderErrors). */
const ORDER_ERROR_KEYS: Record<string, TradeKey> = {
  INSUFFICIENT_BALANCE: "orderErrors.insufficientBalance",
  INSUFFICIENT_MARGIN: "orderErrors.insufficientMargin",
  SIGNING_FAILED: "orderErrors.signingFailed",
  NOT_REGISTERED: "orderErrors.notRegistered",
  MIN_NOTIONAL: "orderErrors.minNotional",
  PRICE_OUT_OF_BAND: "orderErrors.priceOutOfBand",
  REDUCE_ONLY_VIOLATION: "orderErrors.reduceOnlyViolation",
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
  t: TradeT,
): string | null {
  const hasSl = slPx.trim() !== "";
  const hasTp = tpPx.trim() !== "";
  if (!hasSl && !hasTp) return null;
  const markN = mark ? Number(mark) : NaN;
  if (!Number.isFinite(markN) || markN <= 0) {
    return t("markUnavailable");
  }
  const sl = hasSl ? normalizeDecimal(slPx) : null;
  const tp = hasTp ? normalizeDecimal(tpPx) : null;
  // Format errors are handled by the decimal check; skip direction until valid.
  if (hasSl && !sl) return null;
  if (hasTp && !tp) return null;
  if (side === "buy") {
    if (sl && !(Number(sl) < markN)) {
      return t("tpslLong");
    }
    if (tp && !(Number(tp) > markN)) {
      return t("tpslLong");
    }
  } else {
    if (sl && !(Number(sl) > markN)) {
      return t("tpslShort");
    }
    if (tp && !(Number(tp) < markN)) {
      return t("tpslShort");
    }
  }
  return null;
}

function mapOrderError(res: { error: string; errorCode?: string; suggestion?: string }, t: TradeT): string {
  if (res.errorCode && ORDER_ERROR_KEYS[res.errorCode]) {
    const mapped = t(ORDER_ERROR_KEYS[res.errorCode]);
    return res.suggestion ? `${mapped} ${res.suggestion}` : mapped;
  }
  console.error("Order failed", res);
  return t("orderFailed");
}

const UNREACHABLE = "Could not reach the server. Try again.";

async function apiGet<T>(url: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url);
    return (await res.json()) as ApiResult<T>;
  } catch {
    // No answer, or not JSON (a gateway error page): say so plainly, in the page's language.
    return { success: false, error: translateApiMessage(UNREACHABLE, documentLocale()) };
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
  } catch {
    // No answer, or not JSON (a gateway error page): say so plainly, in the page's language.
    return { success: false, error: translateApiMessage(UNREACHABLE, documentLocale()) };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function TradePage() {
  const t = useT("trade");
  const tc = useT("common");
  const f = useFormat();
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
  // Start low: at 2x a position is liquidated by a move of about 50% against
  // it, at 10x by about 10%. The slider raises it up to the market's maximum.
  const [orderLeverage, setOrderLeverage] = useState(2);
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
      setOrderError(t("invalidMarket"));
      return;
    }
    const size = normalizeDecimal(orderSize);
    if (!size || Number(size) <= 0) {
      setOrderError(t("enterSize"));
      return;
    }
    let price: string | undefined;
    if (orderType === "limit") {
      const p = normalizeDecimal(orderPrice);
      if (!p || Number(p) <= 0) {
        setOrderError(t("limitNeedsPrice"));
        return;
      }
      price = p;
    }
    const sl = orderSlPx.trim() ? normalizeDecimal(orderSlPx) : null;
    if (orderSlPx.trim() && (!sl || Number(sl) <= 0)) {
      setOrderError(t("slInvalid"));
      return;
    }
    const tp = orderTpPx.trim() ? normalizeDecimal(orderTpPx) : null;
    if (orderTpPx.trim() && (!tp || Number(tp) <= 0)) {
      setOrderError(t("tpInvalid"));
      return;
    }
    const dirErr = tpslDirectionError(orderSide, currentMark, orderSlPx, orderTpPx, t);
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
      setOrderError(mapOrderError(res, t));
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
        t(params.side === "buy" ? "orderSentLong" : "orderSentShort", { size: formatExactNumber(params.size, f.locale), coin: params.coin })
      );
      setOrderPreview(null);
      setOrderSize("");
      setOrderPrice("");
      setOrderSlPx("");
      setOrderTpPx("");
      bootstrap();
    } else {
      setOrderError(mapOrderError(res, t));
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
      setCloseError(t("invalidMarket"));
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
      setCloseError(mapOrderError(res, t));
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
      setFundError(t("enterValidAmount"));
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
      setFundError(t("enterValidAmount"));
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
          ? t("depositSent", { amount: formatExactNumber(fundAmount, f.locale) })
          : t("withdrawalSent", { amount: formatExactNumber(fundAmount, f.locale) })
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
        <Empty icon="bar-chart" title={t("signInTitle")} text={t("signInText")} />
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
            <strong>{t("setupFailedTitle")}</strong>
            <p>{registerErr ?? t("setupFailedText")}</p>
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
            {tc("tryAgain")}
          </button>
        </div>
      ) : stage === "needs_agent" && register ? (
        <div className="note warn msg-note">
          <LineIcon name="alert" size={16} />
          <div>
            <strong>{t("finishSetupTitle")}</strong>
            <p>{register.message ?? t("finishSetupText")}</p>
          </div>
        </div>
      ) : stage === "needs_arb_funds" && quickstart ? (
        <div className="note warn msg-note">
          <LineIcon name="wallet" size={16} />
          <div>
            <strong>{t("fundArbTitle")}</strong>
            <p>{t("fundArbText", { balance: f.usd(quickstart.assets.arb_usdc_balance) })}</p>
            <p className="num conf-recipient">{quickstart.wallet}</p>
          </div>
        </div>
      ) : stage === "needs_hl_deposit" && quickstart ? (
        <div className="note msg-note">
          <HyperliquidLogo size={16} />
          <div>
            <strong>{t("depositHlTitle")}</strong>
            <p>{t("depositHlText", { balance: f.usd(quickstart.assets.arb_usdc_balance) })}</p>
          </div>
          <button type="button" className="btn btn--sm btn--primary" onClick={() => openFund("deposit", String(Math.floor(quickstart.assets.arb_usdc_balance)))}>
            {t("depositNow")}
          </button>
        </div>
      ) : null;

  return (
    <div className="page">
      <PageHead
        title={t("title")}
        lede={
          <span className="hl-lede">
            <HyperliquidLogo size={18} />
            {t("lede")}
          </span>
        }
        actions={
          <button type="button" className="btn" onClick={() => openFund("deposit")}>
            <LineIcon name="swap" size={16} />
            {t("depositOrWithdraw")}
          </button>
        }
      />

      <div className="metrics in" style={{ "--i": 1 } as React.CSSProperties}>
        <Metric label={t("accountValue")} value={f.usd(quickstart?.assets.hl_account_value_usd ?? positions?.accountValue)} />
        <Metric label={t("withdrawable")} value={f.usd(quickstart?.assets.hl_withdrawable_usd ?? positions?.withdrawable)} />
        <Metric label={t("marginUsed")} value={f.usd(positions?.totalMarginUsed)} />
        <Metric label={t("usdcOnArbitrum")} value={f.usd(quickstart?.assets.arb_usdc_balance)} sub={t("readyToDeposit")} />
      </div>

      {/* Markets ticker */}
      <div className="ticker in" style={{ "--i": 2 } as React.CSSProperties} role="group" aria-label={t("markets")}>
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
                <span className="c" title={p.coin} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <CoinIcon coin={p.coin} size={16} />
                  {p.label || coinName(p.coin)}
                </span>
                <span className="num">{f.price(p.price)}</span>
              </button>
            ))}
      </div>

      <div className="bento">
        <Panel
          className="span-7"
          flush
          index={3}
          title={t("yourTrades")}
          action={
            <PillTabs
              id="trade-tabs"
              label={t("yourTrading")}
              value={tab === "trade" ? "positions" : tab}
              onChange={(v) => setTab(v)}
              options={[
                { value: "positions", label: t("positions"), count: positionCount || undefined },
                { value: "orders", label: t("openOrders"), count: orders.length || undefined },
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

        <Panel className="span-5 ticket" index={4} title={t("newOrder")}>
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

function Facts({ items }: { items: Array<[string, React.ReactNode]> }) {
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
  const t = useT("trade");
  const f = useFormat();
  if (!positions) {
    return (
      <div className="wal-pad" style={{ display: "grid", gap: 12 }}>
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    );
  }
  if (positions.positions.length === 0) {
    return <Empty icon="bar-chart" title={t("noPositionsTitle")} text={t("noPositionsText")} />;
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
              <span className="pos-coin" title={p.coin} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <CoinIcon coin={p.coin} size={24} />
                {coinName(p.coin)}
              </span>
              <span className={`side-tag ${isLong ? "long" : "short"}`}>
                {isLong ? t("long") : t("short")} {p.leverage?.value ?? 1}×
              </span>
              {leverageTypeLabel(p.leverage?.type, t) && <span className="muted pos-type">{leverageTypeLabel(p.leverage?.type, t)}</span>}
              <PnlBadge value={p.unrealizedPnl} />
            </header>
            <Facts
              items={[
                [t("size"), `${f.amount(p.size, { decimals: 6 })} ${p.coin}`],
                [t("entry"), f.price(p.entryPrice)],
                [t("liquidation"), formatLiquidation(p.liquidationPrice, f.locale)],
                [t("value"), f.usd(p.positionValue)],
                [t("margin"), f.usd(p.marginUsed)],
                [t("roe"), formatRoe(p.returnOnEquity, f.locale)],
              ]}
            />
            {confirmingThis ? (
              <div className="close-confirm">
                <dl className="sum">
                  <div>
                    <dt>{t("markPrice")}</dt>
                    <dd className="num">{f.price(mark)}</dd>
                  </div>
                  <div>
                    <dt>{t("estimatedProceeds")}</dt>
                    <dd className="num">{proceeds === null ? MISSING : f.usd(proceeds)}</dd>
                  </div>
                </dl>
                <p className="hint">{t("estimateNote")}</p>
                <div className="sheet-actions">
                  <button type="button" className="btn btn--sm" onClick={onCancelClose} disabled={inFlight}>
                    {t("keepOpen")}
                  </button>
                  <button type="button" className="btn btn--sm btn--primary" onClick={onConfirmClose} disabled={inFlight}>
                    {inFlight ? <span className="spin" aria-hidden="true" /> : t("closeCoin", { coin: p.coin })}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn btn--sm pos-close" disabled={closingCoin !== null} onClick={() => onRequestClose(p)}>
                {t("closePosition")}
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
  const t = useT("trade");
  const f = useFormat();
  const disabled = props.stage !== "ready";
  const locked = disabled || !!props.preview;
  const sizeOk = isPositiveDecimal(props.size);
  const priceOk = props.type !== "limit" || isPositiveDecimal(props.price);
  const slFormatOk = !props.slPx.trim() || isPositiveDecimal(props.slPx);
  const tpFormatOk = !props.tpPx.trim() || isPositiveDecimal(props.tpPx);
  const tpslErr = tpslDirectionError(props.side, props.mark, props.slPx, props.tpPx, t);
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
          <span>{t("ordersLocked")}</span>
        </p>
      )}

      <Segmented
        id="trade-side"
        label={t("direction")}
        className="side-seg"
        value={props.side}
        disabled={locked}
        onChange={props.setSide}
        options={[
          { value: "buy", label: t("long") },
          { value: "sell", label: t("short") },
        ]}
      />

      <div className="order-row">
        <div className="select select--chip">
          <label htmlFor="trade-coin" className="sr-only">
            {t("market")}
          </label>
          <span
            aria-hidden="true"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "inline-flex", pointerEvents: "none" }}
          >
            <CoinIcon coin={props.coin} size={20} />
          </span>
          <select
            id="trade-coin"
            className="input"
            style={{ paddingLeft: 40 }}
            disabled={locked}
            value={props.coin}
            onChange={(e) => props.setCoin(e.target.value)}
          >
            {FEATURED_MARKETS.map((m) => (
              <option key={m.coin} value={m.coin}>
                {m.label} ({m.coin})
              </option>
            ))}
          </select>
        </div>
        <Segmented
          id="trade-type"
          label={t("orderType")}
          value={props.type}
          disabled={locked}
          onChange={props.setType}
          options={[
            { value: "market", label: t("typeMarket") },
            { value: "limit", label: t("typeLimit") },
          ]}
        />
      </div>

      <div className="field">
        <div className="lbl">
          <label htmlFor="trade-size">{t("sizeIn", { coin: props.coin })}</label>
          <span className="num muted">{t("mark", { price: f.price(props.mark) })}</span>
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
          placeholder={t("sizePlaceholder")}
        />
        {props.size.trim() !== "" && !sizeOk ? (
          <p className="err">{t("sizeInvalid")}</p>
        ) : notional > 0 && notional < 10 ? (
          <p className="err">{t("belowMinimum")}</p>
        ) : (
          <p className="hint">
            {t.node("worth", { num: (s) => <span className="num">{s}</span> }, { value: Number.isFinite(markN) ? f.usd(notional) : MISSING })}
          </p>
        )}
      </div>

      {props.type === "limit" && (
        <div className="field">
          <label htmlFor="trade-price">{t("limitPriceInUsdc")}</label>
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
            placeholder={props.mark === undefined ? t("pricePlaceholder") : formatExactNumber(props.mark, f.locale)}
          />
          {props.price.trim() !== "" && !priceOk && <p className="err">{t("priceInvalid")}</p>}
        </div>
      )}

      <div className="field">
        <div className="lbl">
          <label htmlFor="trade-lev">{t("leverage")}</label>
          <span>
            <span className="num lev-v">{props.leverage}×</span> <span className="muted">{t("ofMax", { max: props.maxLeverage })}</span>
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
          <label htmlFor="trade-sl">{t("stopLossOptional")}</label>
          <input id="trade-sl" type="text" inputMode="decimal" autoComplete="off" className="input mono" disabled={locked} value={props.slPx} onChange={(e) => props.setSlPx(e.target.value)} placeholder={t("pricePlaceholder")} />
        </div>
        <div className="field">
          <label htmlFor="trade-tp">{t("takeProfitOptional")}</label>
          <input id="trade-tp" type="text" inputMode="decimal" autoComplete="off" className="input mono" disabled={locked} value={props.tpPx} onChange={(e) => props.setTpPx(e.target.value)} placeholder={t("pricePlaceholder")} />
        </div>
      </div>
      {(!slFormatOk || !tpFormatOk) && <p className="err">{t("tpslInvalid")}</p>}
      {tpslErr && slFormatOk && tpFormatOk && <p className="err">{tpslErr}</p>}

      <dl className="sum">
        <div>
          <dt>{t("estimatedLiquidation")}</dt>
          <dd className="num">{f.price(liq)}</dd>
        </div>
      </dl>

      {!props.preview ? (
        <button type="button" className={`btn btn--primary sheet-cta side-cta ${sideWord}`} onClick={props.onPreview} disabled={!canPreview}>
          {props.loading ? <span className="spin" aria-hidden="true" /> : t(props.side === "buy" ? "previewLong" : "previewShort")}
        </button>
      ) : (
        <div className="conf-quote in">
          <strong>{t("orderPreview")}</strong>
          <Facts
            items={[
              [
                t("market"),
                <span key="market" title={props.preview.params.coin} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <CoinIcon coin={props.preview.params.coin} size={16} />
                  {coinName(props.preview.params.coin)}
                </span>,
              ],
              [t("side"), props.preview.params.side === "buy" ? t("long") : t("short")],
              // Size and prices exactly as they are sent, not rounded.
              [t("size"), `${formatExactNumber(props.preview.params.size, f.locale)} ${props.preview.params.coin}`],
              [t("type"), props.preview.params.type === "limit" && props.preview.params.price ? t("limitAt", { price: formatExactPrice(props.preview.params.price, f.locale) }) : props.preview.params.type === "limit" ? t("typeLimit") : t("typeMarket")],
              [t("leverage"), `${props.preview.params.leverage}×`],
              [t("liquidation"), props.preview.estimatedLiq === null ? MISSING : f.price(props.preview.estimatedLiq)],
              [t("takeProfit"), props.preview.params.tpPx ? formatExactPrice(props.preview.params.tpPx, f.locale) : t("none")],
              [t("stopLoss"), props.preview.params.slPx ? formatExactPrice(props.preview.params.slPx, f.locale) : t("none")],
            ]}
          />
          <p className="hint">{t("estimatesNote")}</p>
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={props.onModify} disabled={props.confirming}>
              {t("edit")}
            </button>
            <button type="button" className="btn btn--primary" onClick={props.onConfirm} disabled={props.confirming}>
              {props.confirming ? <span className="spin" aria-hidden="true" /> : t(props.side === "buy" ? "placeLong" : "placeShort")}
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
  const t = useT("trade");
  const tc = useT("common");
  const f = useFormat();
  if (orders.length === 0) {
    return <Empty icon="file" title={t("noOrdersTitle")} text={t("noOrdersText")} />;
  }
  return (
    <ul className="rows wal-pad">
      {orders.map((o) => (
        <li key={o.oid}>
          <div className="row">
            <span className={`side-tag ${o.side === "buy" ? "long" : "short"}`}>{o.side === "buy" ? t("buy") : t("sell")}</span>
            <div style={{ minWidth: 0 }}>
              <div className="t" title={o.coin} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CoinIcon coin={o.coin} size={18} />
                {coinName(o.coin)} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>{orderTypeLabel(o, t)}</span>
              </div>
              <div className="sub num">
                {t("orderAt", { size: f.amount(o.size, { decimals: 6 }), coin: o.coin, price: formatExactPrice(o.limitPrice, f.locale) })}
              </div>
            </div>
            <button type="button" className="btn btn--sm" onClick={() => onCancel(o.coin, o.oid)}>
              {tc("cancel")}
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
  const t = useT("trade");
  const tc = useT("common");
  const f = useFormat();
  const isDeposit = props.mode === "deposit";
  const maxBalance = isDeposit ? props.arbBalance : props.hlWithdrawable;
  const amountOk = isPositiveDecimal(props.amount);
  // A curated summary of the preview; the raw payload never reaches the screen.
  const previewRows = props.preview ? fundPreviewRows(props.mode, props.preview, t, f.locale) : [];

  return (
    <Sheet open={props.open} onClose={props.onClose} title={t("fundTitle")}>
      <div className="sheet-body">
        <Segmented
          id="fund-mode"
          label={t("direction")}
          value={props.mode}
          disabled={!!props.preview || props.loading}
          onChange={(m) => {
            props.setMode(m);
            props.setAmount("");
          }}
          options={[
            { value: "deposit", label: t("deposit") },
            { value: "withdraw", label: t("withdraw") },
          ]}
        />

        <div className="field">
          <div className="lbl">
            <label htmlFor="fund-amount">{t("amountInUsdc")}</label>
            <span className="num muted">{t("upTo", { amount: f.usd(maxBalance) })}</span>
          </div>
          <input
            id="fund-amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className="input num-in"
            value={props.amount}
            onChange={(e) => props.setAmount(e.target.value)}
            placeholder={isDeposit ? t("depositPlaceholder") : t("withdrawPlaceholder")}
            disabled={!!props.preview || props.loading}
          />
          <div className="quick">
            {[0.25, 0.5, 1].map((frac) => (
              <button key={frac} type="button" className="chip" disabled={!!props.preview} onClick={() => props.setAmount((maxBalance * frac).toFixed(2))}>
                {frac === 1 ? t("max") : f.percent(frac * 100)}
              </button>
            ))}
          </div>
        </div>

        {/* The preview summary replaces these general terms once it is shown. */}
        {!props.preview && (
        <dl className="sum">
          {isDeposit ? (
            <>
              <div>
                <dt>{t("minimum")}</dt>
                <dd className="num">5 USDC</dd>
              </div>
              <div>
                <dt>{t("route")}</dt>
                <dd>{t("arbitrumToHyperliquid")}</dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt>{t("fee")}</dt>
                <dd className="num">1 USDC</dd>
              </div>
              <div>
                <dt>{t("arrivesAt")}</dt>
                <dd>{t("yourArbitrumWallet")}</dd>
              </div>
            </>
          )}
          <div>
            <dt>{t("time")}</dt>
            <dd>{isDeposit ? t("aboutAMinute") : t("twoToFiveMinutes")}</dd>
          </div>
        </dl>
        )}

        {props.success ? (
          <>
            <p className="note gain" role="status">
              <LineIcon name="check" size={16} />
              <span>{props.success}</span>
            </p>
            <button type="button" className="btn sheet-cta" onClick={props.onClose}>
              {tc("close")}
            </button>
          </>
        ) : props.preview ? (
          <>
            {previewRows.length > 0 && <Facts items={previewRows} />}
            <div className="sheet-actions">
              <button type="button" className="btn" onClick={props.onClose}>
                {tc("cancel")}
              </button>
              <button type="button" className="btn btn--primary" onClick={props.onConfirm} disabled={props.loading}>
                {props.loading ? <span className="spin" aria-hidden="true" /> : isDeposit ? t("confirmDeposit") : t("confirmWithdrawal")}
              </button>
            </div>
          </>
        ) : (
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={props.onClose}>
              {tc("cancel")}
            </button>
            <button type="button" className="btn btn--primary" onClick={props.onPreview} disabled={props.loading || !amountOk}>
              {props.loading ? <span className="spin" aria-hidden="true" /> : t("preview")}
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
