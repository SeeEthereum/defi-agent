"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, Fade, Swap } from "@/components/motion";
import { FEATURED_MARKETS } from "@/lib/hyperliquid/markets";

// ── Hyperliquid brand colors ──────────────────────────────────────────────────
const HL_GREEN = "#97FCE4";

function HyperliquidLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 144 144" fill="none" xmlns="http://www.w3.org/2000/svg">
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

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin-breathe ${className}`} width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="15" strokeLinecap="round" />
    </svg>
  );
}

function PnlBadge({ value }: { value: string }) {
  const n = parseFloat(value);
  const pos = n >= 0;
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${pos ? "bg-green-500/15 text-green-600" : "bg-red-500/15 text-red-600"}`}>
      {pos ? "+" : ""}{n.toFixed(2)} USDC
    </span>
  );
}

function fmtUsd(v: string | number | undefined, digits = 2): string {
  const n = typeof v === "string" ? parseFloat(v) : v ?? 0;
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function fmtPrice(v: string | number | undefined): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (n === undefined || !Number.isFinite(n)) return "—";
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
    "Saldo USDC su Arbitrum insufficiente. Deposita USDC sul tuo indirizzo Arbitrum prima di riprovare.",
  INSUFFICIENT_MARGIN:
    "Margine insufficiente per questa posizione. Riduci la size o aumenta il deposito HL.",
  SIGNING_FAILED:
    "La firma del wallet è fallita. Verifica che onchainos sia autenticato (aggiorna se necessario).",
  NOT_REGISTERED:
    "Hyperliquid non è stato ancora configurato. Esegui prima la registrazione del wallet.",
  MIN_NOTIONAL:
    "L'ordine è sotto il minimo notional di $10 USDC. Aumenta la size.",
  PRICE_OUT_OF_BAND:
    "Prezzo limite troppo lontano dal mid. Usa un prezzo più vicino al market.",
  REDUCE_ONLY_VIOLATION:
    "L'ordine reduce-only non può aprire o aumentare una posizione esistente.",
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
    return "Mark non disponibile: impossibile validare TP/SL.";
  }
  const sl = hasSl ? normalizeDecimal(slPx) : null;
  const tp = hasTp ? normalizeDecimal(tpPx) : null;
  // Format errors are handled by the decimal check; skip direction until valid.
  if (hasSl && !sl) return null;
  if (hasTp && !tp) return null;
  if (side === "buy") {
    if (sl && !(Number(sl) < markN)) {
      return "Per un LONG lo stop-loss deve essere sotto il mark e il take-profit sopra.";
    }
    if (tp && !(Number(tp) > markN)) {
      return "Per un LONG lo stop-loss deve essere sotto il mark e il take-profit sopra.";
    }
  } else {
    if (sl && !(Number(sl) > markN)) {
      return "Per un SHORT lo stop-loss deve essere sopra il mark e il take-profit sotto.";
    }
    if (tp && !(Number(tp) < markN)) {
      return "Per un SHORT lo stop-loss deve essere sopra il mark e il take-profit sotto.";
    }
  }
  return null;
}

function mapOrderError(res: { error: string; errorCode?: string; suggestion?: string }): string {
  if (res.errorCode && ORDER_ERROR_MESSAGES[res.errorCode]) {
    const mapped = ORDER_ERROR_MESSAGES[res.errorCode];
    return res.suggestion ? `${mapped} — ${res.suggestion}` : mapped;
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
      setOrderError("Coin non valida");
      return;
    }
    const size = normalizeDecimal(orderSize);
    if (!size || Number(size) <= 0) {
      setOrderError("Inserisci la size");
      return;
    }
    let price: string | undefined;
    if (orderType === "limit") {
      const p = normalizeDecimal(orderPrice);
      if (!p || Number(p) <= 0) {
        setOrderError("I limit order richiedono un prezzo");
        return;
      }
      price = p;
    }
    const sl = orderSlPx.trim() ? normalizeDecimal(orderSlPx) : null;
    if (orderSlPx.trim() && (!sl || Number(sl) <= 0)) {
      setOrderError("Stop-loss non valido");
      return;
    }
    const tp = orderTpPx.trim() ? normalizeDecimal(orderTpPx) : null;
    if (orderTpPx.trim() && (!tp || Number(tp) <= 0)) {
      setOrderError("Take-profit non valido");
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
        `Ordine ${params.side === "buy" ? "LONG" : "SHORT"} ${params.size} ${params.coin} inviato`
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
      setCloseError("Coin non valida");
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
      setFundError("Importo non valido");
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
      setFundError(res.suggestion ? `${res.error} — ${res.suggestion}` : res.error);
    }
  }

  async function submitFundConfirm() {
    setFundError(null);
    const amount = normalizeDecimal(fundAmount);
    if (!amount || Number(amount) <= 0) {
      setFundError("Importo non valido");
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
          ? `Deposito di ${fundAmount} USDC inviato. Arrivo in 2–5 minuti.`
          : `Prelievo di ${fundAmount} USDC inviato. Arrivo in 2–5 minuti (fee $1).`
      );
      setFundPreview(null);
      bootstrap();
    } else {
      setFundError(res.suggestion ? `${res.error} — ${res.suggestion}` : res.error);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div className="voxr-halo flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <HyperliquidLogo size={48} />
        <p className="text-eyebrow mt-6 animate-kinetic-in">PERPETUAL DEX · 50× LEVERAGE</p>
        <h1 className="mt-4 text-display-xl text-foreground animate-kinetic-in stagger-1">
          Hyperliquid <span className="text-iridescent">Perps</span>
        </h1>
        <p className="text-muted-foreground mt-4 max-w-sm animate-kinetic-in stagger-2">
          Sign in to trade perpetuals with leverage up to 50×.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-28 md:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <HyperliquidLogo size={36} />
        <div className="flex-1 min-w-0">
          <p className="text-eyebrow">HYPERLIQUID · USDC</p>
          <h1 className="text-display-lg text-foreground">Trade</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setShowFund(true); setFundMode("deposit"); setFundPreview(null); setFundError(null); setFundSuccess(null); }}
        >
          Deposita / Preleva
        </Button>
      </div>

      {/* Account summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
        <Stat
          label="Account value"
          value={fmtUsd(quickstart?.assets.hl_account_value_usd ?? positions?.accountValue)}
        />
        <Stat
          label="Withdrawable"
          value={fmtUsd(quickstart?.assets.hl_withdrawable_usd ?? positions?.withdrawable)}
        />
        <Stat
          label="Margin used"
          value={fmtUsd(positions?.totalMarginUsed)}
        />
        <Stat
          label="USDC su Arbitrum"
          value={fmtUsd(quickstart?.assets.arb_usdc_balance)}
          hint="Disponibile per depositi"
        />
      </div>

      {/* State-machine banner — crossfades when the stage changes */}
      <Swap tokenKey={stage}>
        {stage === "register_error" ? (
          <Banner tone="red" title="Setup Hyperliquid fallito">
            {registerErr ?? "Impossibile configurare HL"}
            <button
              className="ml-2 underline text-xs"
              onClick={async () => {
                setRegisterErr(null);
                const r = await apiGet<RegisterData>("/api/perp/register?force=true");
                if (r.success) setRegister(r.data);
                else setRegisterErr(r.error);
              }}
            >
              Riprova
            </button>
          </Banner>
        ) : stage === "needs_agent" && register ? (
          <Banner tone="amber" title="Completa setup Hyperliquid">
            {register.message ?? "È necessaria la registrazione del signing agent."}
          </Banner>
        ) : stage === "needs_arb_funds" && quickstart ? (
          <Banner tone="amber" title="Fondi il tuo wallet Arbitrum">
            <p className="mb-2">
              Per iniziare a tradare servono almeno <strong>$5 USDC</strong> sul tuo wallet Arbitrum.
              Attualmente hai <strong>{fmtUsd(quickstart.assets.arb_usdc_balance)}</strong>.
            </p>
            <p className="text-xs">
              Invia USDC a questo indirizzo su Arbitrum:
            </p>
            <code className="mt-1 block text-xs bg-background/40 px-2 py-1 rounded break-all select-all">
              {quickstart.wallet}
            </code>
          </Banner>
        ) : stage === "needs_hl_deposit" && quickstart ? (
          <Banner tone="blue" title="Deposita USDC su Hyperliquid">
            <p className="mb-2">
              Hai <strong>{fmtUsd(quickstart.assets.arb_usdc_balance)}</strong> USDC su Arbitrum.
              Depositali su HL per iniziare a tradare (minimo $5, arrivo in 2–5 min).
            </p>
            <Button
              size="sm"
              onClick={() => {
                setFundMode("deposit");
                setFundAmount(String(Math.floor(quickstart.assets.arb_usdc_balance)));
                setShowFund(true);
              }}
            >
              Deposita ora
            </Button>
          </Banner>
        ) : null}
      </Swap>

      {/* Live prices strip */}
      <div className="mb-5">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Mercati popolari</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
          {prices.length === 0 && <Spinner />}
          {prices.slice(0, 12).map((p) => (
            <button
              key={p.coin}
              onClick={() => {
                if (!previewOpen) setCoinAndClamp(p.coin);
                setTab("trade");
              }}
              className={`text-left bg-card border rounded-lg px-2 py-1.5 hover:border-[${HL_GREEN}] transition-colors`}
              style={orderCoin === p.coin ? { borderColor: HL_GREEN } : {}}
            >
              <div className="text-[10px] text-muted-foreground">{p.coin}</div>
              <div className="text-sm font-mono font-semibold">{fmtPrice(p.price)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-4">
        {(["positions", "trade", "orders"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? "text-foreground" : "text-muted-foreground border-transparent"}`}
            style={tab === t ? { borderColor: HL_GREEN, color: HL_GREEN } : {}}
          >
            {t === "positions" && (
              <>Posizioni
                {positions && positions.positions.length > 0 && (
                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: HL_GREEN + "22", color: HL_GREEN }}>
                    {positions.positions.length}
                  </span>
                )}
              </>
            )}
            {t === "trade" && "Nuovo ordine"}
            {t === "orders" && (
              <>Aperti
                {orders.length > 0 && (
                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: HL_GREEN + "22", color: HL_GREEN }}>
                    {orders.length}
                  </span>
                )}
              </>
            )}
          </button>
        ))}
      </div>

      {/* Tab content — <Swap> crossfades between tabs */}
      <Swap tokenKey={tab}>
        {tab === "positions" ? (
          <PositionsTab
            positions={positions}
            pendingClose={pendingClose}
            closingCoin={closingCoin}
            closeError={closeError}
            markForCoin={markForCoin}
            onRequestClose={requestClose}
            onCancelClose={() => { setPendingClose(null); setCloseError(null); }}
            onConfirmClose={confirmClose}
          />
        ) : tab === "trade" ? (
          <TradeTab
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
        ) : (
          <OrdersTab orders={orders} onCancel={cancelOrder} />
        )}
      </Swap>

      {/* Funding modal — always mounted so <Modal> can play exit animation */}
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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card border rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-base font-mono font-semibold mt-0.5">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: "red" | "amber" | "blue";
  title: string;
  children: React.ReactNode;
}) {
  const colors = {
    red: "bg-red-500/10 border-red-500/30 text-red-900 dark:text-red-200",
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200",
    blue: "bg-blue-500/10 border-blue-500/30 text-blue-900 dark:text-blue-200",
  };
  return (
    <div className={`border rounded-lg p-3 mb-4 text-sm ${colors[tone]}`}>
      <div className="font-semibold mb-1">{title}</div>
      <div className="text-[13px]">{children}</div>
    </div>
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
  if (!positions) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (positions.positions.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p className="text-sm">Nessuna posizione aperta.</p>
        <p className="text-xs mt-1">Apri una posizione dal tab &ldquo;Nuovo ordine&rdquo;.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Fade in={!!closeError}>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-xs text-red-600">
          {closeError}
        </div>
      </Fade>
      {positions.positions.map((p) => {
        const isLong = p.side === "long";
        const confirmingThis = pendingClose?.coin === p.coin;
        const inFlight = closingCoin === p.coin;
        const mark = p.markPrice ?? markForCoin(p.coin);
        const sizeN = Math.abs(Number(p.size));
        const markN = mark ? Number(mark) : NaN;
        const proceeds =
          Number.isFinite(sizeN) && Number.isFinite(markN) ? sizeN * markN : null;
        return (
          <div
            key={p.coin}
            className="bg-card border rounded-lg p-3"
            style={{ borderColor: (isLong ? HL_GREEN : "#f87171") + "40" }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-base">{p.coin}</span>
                <span
                  className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                  style={{ background: isLong ? HL_GREEN : "#f87171", color: isLong ? "#000" : "#fff" }}
                >
                  {isLong ? "LONG" : "SHORT"} {p.leverage?.value ?? 1}×
                </span>
                <span className="text-[10px] text-muted-foreground">{p.leverage?.type}</span>
              </div>
              <PnlBadge value={p.unrealizedPnl} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs mb-2">
              <Field label="Size" value={`${p.size} ${p.coin}`} />
              <Field label="Entry" value={fmtPrice(p.entryPrice)} />
              <Field label="Liq" value={fmtPrice(p.liquidationPrice)} />
              <Field label="Value" value={fmtUsd(p.positionValue)} />
              <Field label="Margin" value={fmtUsd(p.marginUsed)} />
              <Field label="ROE" value={`${parseFloat(p.returnOnEquity).toFixed(2)}%`} />
            </div>
            {confirmingThis ? (
              <div className="border rounded-lg p-2 space-y-2">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Conferma chiusura
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Field label="Coin" value={p.coin} />
                  <Field label="Position size" value={`${p.size} ${p.coin}`} />
                  <Field label="Current mark" value={fmtPrice(mark)} />
                  <Field
                    label="Estimated proceeds"
                    value={proceeds === null ? "—" : fmtUsd(proceeds)}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Estimate only — ignores fees and funding.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onCancelClose}
                    disabled={inFlight}
                  >
                    Annulla
                  </Button>
                  <Button
                    size="sm"
                    onClick={onConfirmClose}
                    disabled={inFlight}
                  >
                    {inFlight ? <Spinner /> : "Conferma chiusura"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs"
                disabled={closingCoin !== null}
                onClick={() => onRequestClose(p)}
              >
                Chiudi posizione
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
      <div className="font-mono font-medium">{value}</div>
    </div>
  );
}

function TradeTab(props: {
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
  const canPreview =
    !locked &&
    !props.loading &&
    sizeOk &&
    priceOk &&
    slFormatOk &&
    tpFormatOk &&
    !tpslErr &&
    coinOk;

  const sizeN = sizeOk ? Number(normalizeDecimal(props.size)) : NaN;
  const markN = props.mark ? Number(props.mark) : NaN;
  const notional =
    Number.isFinite(sizeN) && Number.isFinite(markN) ? sizeN * markN : 0;
  const entry = entryPrice(props.type, props.price, props.mark);
  const liq = entry ? estimatedLiqPrice(entry, props.leverage, props.side) : null;

  return (
    <div className="space-y-3">
      {disabled && (
        <div className="bg-muted/40 border rounded-lg p-3 text-xs text-muted-foreground">
          Completa il deposito per abilitare gli ordini.
        </div>
      )}

      {/* Long/Short */}
      <div className="grid grid-cols-2 gap-2">
        {(["buy", "sell"] as const).map((side) => (
          <button
            key={side}
            disabled={locked}
            onClick={() => props.setSide(side)}
            className="py-2 rounded-lg text-sm font-semibold border disabled:opacity-50"
            style={
              props.side === side
                ? {
                    background: side === "buy" ? HL_GREEN : "#ef4444",
                    color: side === "buy" ? "#000" : "#fff",
                    borderColor: "transparent",
                  }
                : {}
            }
          >
            {side === "buy" ? "LONG" : "SHORT"}
          </button>
        ))}
      </div>

      {/* Coin + type */}
      <div className="grid grid-cols-2 gap-2">
        <select
          disabled={locked}
          value={props.coin}
          onChange={(e) => props.setCoin(e.target.value)}
          className="h-10 rounded-lg border bg-background px-3 text-sm font-semibold disabled:opacity-50"
        >
          {FEATURED_MARKETS.map((m) => (
            <option key={m.coin} value={m.coin}>{m.coin} — {m.label}</option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-1">
          {(["market", "limit"] as const).map((t) => (
            <button
              key={t}
              disabled={locked}
              onClick={() => props.setType(t)}
              className={`rounded-lg text-xs font-medium border ${props.type === t ? "bg-foreground text-background" : "bg-background"} disabled:opacity-50`}
            >
              {t === "market" ? "Market" : "Limit"}
            </button>
          ))}
        </div>
      </div>

      {/* Size */}
      <div>
        <label className="text-xs text-muted-foreground">Size ({props.coin})</label>
        <Input
          type="text"
          inputMode="decimal"
          disabled={locked}
          value={props.size}
          onChange={(e) => props.setSize(e.target.value)}
          placeholder="0.01"
          className="font-mono"
        />
        <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
          <span>Mark: {fmtPrice(props.mark)}</span>
          <span>Notional: {fmtUsd(notional)}</span>
        </div>
        {props.size.trim() !== "" && !sizeOk && (
          <div className="text-[11px] text-red-600 mt-0.5">
            Size deve essere un decimale positivo (es. 0.01).
          </div>
        )}
        {notional > 0 && notional < 10 && (
          <div className="text-[11px] text-amber-700 mt-0.5">
            Minimo $10 notional. Aumenta la size.
          </div>
        )}
      </div>

      {/* Price (limit only) */}
      {props.type === "limit" && (
        <div>
          <label className="text-xs text-muted-foreground">Limit price (USDC)</label>
          <Input
            type="text"
            inputMode="decimal"
            disabled={locked}
            value={props.price}
            onChange={(e) => props.setPrice(e.target.value)}
            placeholder={fmtPrice(props.mark)}
            className="font-mono"
          />
          {props.price.trim() !== "" && !priceOk && (
            <div className="text-[11px] text-red-600 mt-0.5">
              Prezzo deve essere un decimale positivo.
            </div>
          )}
        </div>
      )}

      {/* Leverage */}
      <div>
        <div className="flex items-center justify-between text-xs">
          <label className="text-muted-foreground">Leva</label>
          <span className="font-bold" style={{ color: HL_GREEN }}>
            {props.leverage}× <span className="font-medium text-muted-foreground">/ max {props.maxLeverage}×</span>
          </span>
        </div>
        <input
          type="range"
          min="1"
          max={props.maxLeverage}
          disabled={locked}
          value={Math.min(props.leverage, props.maxLeverage)}
          onChange={(e) => props.setLeverage(Number(e.target.value))}
          className="w-full disabled:opacity-50"
          style={{ accentColor: HL_GREEN }}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>1×</span><span>Max {props.maxLeverage}×</span>
        </div>
      </div>

      {/* Est. liquidation */}
      <div className="bg-muted/30 border rounded-lg px-3 py-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Est. liquidation</span>
          <span className="font-mono font-semibold">{fmtPrice(liq ?? undefined)}</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Estimate only — ignores fees and funding.
        </p>
      </div>

      {/* SL/TP */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Stop-loss (opt.)</label>
          <Input
            type="text"
            inputMode="decimal"
            disabled={locked}
            value={props.slPx}
            onChange={(e) => props.setSlPx(e.target.value)}
            placeholder="—"
            className="font-mono"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Take-profit (opt.)</label>
          <Input
            type="text"
            inputMode="decimal"
            disabled={locked}
            value={props.tpPx}
            onChange={(e) => props.setTpPx(e.target.value)}
            placeholder="—"
            className="font-mono"
          />
        </div>
      </div>
      {(!slFormatOk || !tpFormatOk) && (
        <div className="text-[11px] text-red-600">
          TP/SL devono essere decimali positivi (es. 64000.5).
        </div>
      )}
      {tpslErr && slFormatOk && tpFormatOk && (
        <div className="text-[11px] text-red-600">{tpslErr}</div>
      )}

      {/* Submit / Preview */}
      {!props.preview ? (
        <Button
          onClick={props.onPreview}
          disabled={!canPreview}
          className="w-full h-11"
          style={{
            background: props.side === "buy" ? HL_GREEN : "#ef4444",
            color: props.side === "buy" ? "#000" : "#fff",
          }}
        >
          {props.loading ? <Spinner /> : `Anteprima ${props.side === "buy" ? "LONG" : "SHORT"}`}
        </Button>
      ) : (
        <div className="bg-card border rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Anteprima ordine</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Field label="Coin" value={props.preview.params.coin} />
            <Field label="Side" value={props.preview.params.side === "buy" ? "LONG" : "SHORT"} />
            <Field label="Size" value={`${props.preview.params.size} ${props.preview.params.coin}`} />
            <Field label="Order type" value={props.preview.params.type} />
            {props.preview.params.type === "limit" && props.preview.params.price && (
              <Field label="Limit price" value={props.preview.params.price} />
            )}
            <Field label="Leverage" value={`${props.preview.params.leverage}×`} />
            <Field
              label="Est. liquidation"
              value={
                props.preview.estimatedLiq === null
                  ? "—"
                  : fmtPrice(props.preview.estimatedLiq)
              }
            />
            <Field label="Take-profit" value={props.preview.params.tpPx ?? "—"} />
            <Field label="Stop-loss" value={props.preview.params.slPx ?? "—"} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Estimate only — ignores fees and funding.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={props.onModify} disabled={props.confirming}>
              Modify
            </Button>
            <Button
              size="sm"
              onClick={props.onConfirm}
              disabled={props.confirming}
              style={{
                background: props.preview.params.side === "buy" ? HL_GREEN : "#ef4444",
                color: props.preview.params.side === "buy" ? "#000" : "#fff",
              }}
            >
              {props.confirming ? <Spinner /> : "Conferma"}
            </Button>
          </div>
        </div>
      )}

      <Fade in={!!props.error}>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-xs text-red-600">
          {props.error}
        </div>
      </Fade>
      <Fade in={!!props.success}>
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 text-xs text-green-600">
          {props.success}
        </div>
      </Fade>
    </div>
  );
}

function OrdersTab({
  orders,
  onCancel,
}: {
  orders: OrderRow[];
  onCancel: (coin: string, oid: number) => void;
}) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p className="text-sm">Nessun ordine aperto.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {orders.map((o) => (
        <div key={o.oid} className="bg-card border rounded-lg p-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold">{o.coin}</span>
              <span className="text-[10px] uppercase text-muted-foreground">{o.type ?? "limit"}</span>
              <span className={`text-[10px] font-bold ${o.side === "buy" ? "text-green-600" : "text-red-600"}`}>
                {o.side === "buy" ? "BUY" : "SELL"}
              </span>
            </div>
            <div className="text-xs font-mono text-muted-foreground mt-0.5">
              {o.size} @ {fmtPrice(o.limitPrice)}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => onCancel(o.coin, o.oid)}>
            Cancella
          </Button>
        </div>
      ))}
    </div>
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
  return (
    <Modal open={props.open} onClose={props.onClose} contentClassName="max-w-sm">
      <div className="bg-card border rounded-xl w-full p-4">
        <div className="flex items-center gap-3 mb-4">
          <HyperliquidLogo size={28} />
          <h2 className="text-lg font-semibold">Hyperliquid</h2>
        </div>

        {/* Mode tabs */}
        <div className="grid grid-cols-2 gap-1 bg-muted/30 p-1 rounded-lg mb-4">
          {(["deposit", "withdraw"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { props.setMode(m); props.setAmount(""); }}
              className="py-2 rounded-md text-sm font-medium transition-colors"
              style={props.mode === m ? { background: HL_GREEN, color: "#000" } : {}}
            >
              {m === "deposit" ? "Deposita" : "Preleva"}
            </button>
          ))}
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Importo USDC</span>
            <span className="text-muted-foreground">
              Max: {fmtUsd(maxBalance)}
            </span>
          </div>
          <Input
            type="text"
            inputMode="decimal"
            value={props.amount}
            onChange={(e) => props.setAmount(e.target.value)}
            placeholder={isDeposit ? "5.00" : "10.00"}
            disabled={!!props.preview || props.loading}
            className="font-mono text-lg"
          />
          <div className="flex gap-1 mt-1">
            {[0.25, 0.5, 1].map((frac) => (
              <button
                key={frac}
                type="button"
                disabled={!!props.preview}
                onClick={() => props.setAmount((maxBalance * frac).toFixed(2))}
                className="flex-1 text-[10px] py-1 border rounded disabled:opacity-50"
              >
                {frac === 1 ? "Max" : `${frac * 100}%`}
              </button>
            ))}
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground mb-3 space-y-0.5">
          {isDeposit ? (
            <>
              <p>· Minimo: <strong>5 USDC</strong></p>
              <p>· Bridge da Arbitrum a Hyperliquid</p>
              <p>· Tempo: 2–5 minuti</p>
            </>
          ) : (
            <>
              <p>· Fee fissa: <strong>$1 USDC</strong></p>
              <p>· Destinazione: il tuo wallet Arbitrum</p>
              <p>· Tempo: 2–5 minuti</p>
            </>
          )}
        </div>

        <Swap tokenKey={props.success ? "success" : props.preview ? "preview" : "idle"}>
          {props.success ? (
            <>
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 text-xs text-green-600 mb-3">
                {props.success}
              </div>
              <Button variant="outline" className="w-full" onClick={props.onClose}>Chiudi</Button>
            </>
          ) : props.preview ? (
            <>
              <pre className="text-[10px] bg-muted/30 p-2 rounded overflow-x-auto max-h-32 mb-3">
                {JSON.stringify(props.preview, null, 2)}
              </pre>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={props.onClose}>Annulla</Button>
                <Button
                  onClick={props.onConfirm}
                  disabled={props.loading}
                  style={{ background: HL_GREEN, color: "#000" }}
                >
                  {props.loading ? <Spinner /> : "Conferma"}
                </Button>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={props.onClose}>Annulla</Button>
              <Button
                onClick={props.onPreview}
                disabled={props.loading || !amountOk}
                style={{ background: HL_GREEN, color: "#000" }}
              >
                {props.loading ? <Spinner /> : "Anteprima"}
              </Button>
            </div>
          )}
        </Swap>

        <Fade in={!!props.error} className="mt-3">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-xs text-red-600">
            {props.error}
          </div>
        </Fade>
      </div>
    </Modal>
  );
}
