"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <svg className={`animate-spin ${className}`} width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="15" strokeLinecap="round" />
    </svg>
  );
}

function PnlBadge({ value }: { value: string }) {
  const n = parseFloat(value);
  const pos = n >= 0;
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${pos ? "bg-green-500/15 text-green-500" : "bg-red-500/15 text-red-500"}`}>
      {pos ? "+" : ""}{n.toFixed(2)} USDC
    </span>
  );
}

function fmtUsd(v: string | number | undefined, digits = 2): string {
  const n = typeof v === "string" ? parseFloat(v) : v ?? 0;
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function fmtPrice(v: string | undefined): string {
  const n = typeof v === "string" ? parseFloat(v) : undefined;
  if (n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(3);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
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
  const [orderPreview, setOrderPreview] = useState<Record<string, unknown> | null>(null);
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

  // Close position loading state
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
      apiGet<{ markets: typeof FEATURED_MARKETS; prices: MarketPrice[] }>("/api/perp/markets"),
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
    if (mkts.success) setPrices(mkts.data.prices ?? []);
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
        apiGet<{ markets: typeof FEATURED_MARKETS; prices: MarketPrice[] }>("/api/perp/markets"),
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
      if (mkts.success) setPrices(mkts.data.prices ?? []);
    })();
    return () => { cancelled = true; };
  }, [authenticated]);

  // Live refresh: positions every 5s, prices every 10s
  const refreshTimer = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!authenticated) return;
    const pulse = async () => {
      const [pos, ord, mkts, qs] = await Promise.all([
        apiGet<PositionsData>("/api/perp/positions"),
        apiGet<{ orders: OrderRow[] }>("/api/perp/orders"),
        apiGet<{ markets: typeof FEATURED_MARKETS; prices: MarketPrice[] }>("/api/perp/markets"),
        apiGet<QuickstartData>("/api/perp/quickstart"),
      ]);
      if (pos.success) setPositions(pos.data);
      if (ord.success) setOrders(ord.data.orders ?? []);
      if (mkts.success) setPrices(mkts.data.prices ?? []);
      if (qs.success) setQuickstart(qs.data);
    };
    refreshTimer.current = setInterval(pulse, 8000);
    return () => {
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

  // ── Order flow: preview → confirm ──────────────────────────────────────────
  async function submitOrderPreview() {
    setOrderError(null);
    setOrderSuccess(null);
    setOrderPreview(null);
    if (!orderSize) {
      setOrderError("Inserisci la size");
      return;
    }
    if (orderType === "limit" && !orderPrice) {
      setOrderError("I limit order richiedono un prezzo");
      return;
    }
    setOrderLoading(true);
    const res = await apiPost<Record<string, unknown>>("/api/perp/order", {
      coin: orderCoin,
      side: orderSide,
      size: orderSize,
      type: orderType,
      price: orderType === "limit" ? orderPrice : undefined,
      leverage: orderLeverage,
      slPx: orderSlPx || undefined,
      tpPx: orderTpPx || undefined,
      confirm: false,
    });
    setOrderLoading(false);
    if (res.success) {
      setOrderPreview(res.data);
    } else {
      setOrderError(res.suggestion ? `${res.error} — ${res.suggestion}` : res.error);
    }
  }

  async function submitOrderConfirm() {
    setOrderError(null);
    setOrderConfirming(true);
    const res = await apiPost<Record<string, unknown>>("/api/perp/order", {
      coin: orderCoin,
      side: orderSide,
      size: orderSize,
      type: orderType,
      price: orderType === "limit" ? orderPrice : undefined,
      leverage: orderLeverage,
      slPx: orderSlPx || undefined,
      tpPx: orderTpPx || undefined,
      confirm: true,
    });
    setOrderConfirming(false);
    if (res.success) {
      setOrderSuccess(
        `Ordine ${orderSide === "buy" ? "LONG" : "SHORT"} ${orderSize} ${orderCoin} inviato`
      );
      setOrderPreview(null);
      setOrderSize("");
      setOrderPrice("");
      setOrderSlPx("");
      setOrderTpPx("");
      bootstrap();
    } else {
      setOrderError(res.suggestion ? `${res.error} — ${res.suggestion}` : res.error);
    }
  }

  async function closePosition(coin: string) {
    setCloseError(null);
    setClosingCoin(coin);
    const res = await apiPost<Record<string, unknown>>("/api/perp/close", {
      coin,
      confirm: true,
    });
    setClosingCoin(null);
    if (!res.success) {
      setCloseError(res.suggestion ? `${res.error} — ${res.suggestion}` : res.error);
    } else {
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
    const n = Number(fundAmount);
    if (!n || n <= 0) {
      setFundError("Importo non valido");
      return;
    }
    setFundLoading(true);
    const res = await apiPost<Record<string, unknown>>(
      `/api/perp/${fundMode}`,
      { amount: fundAmount, confirm: false }
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
    setFundLoading(true);
    const res = await apiPost<Record<string, unknown>>(
      `/api/perp/${fundMode}`,
      { amount: fundAmount, confirm: true }
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
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <HyperliquidLogo size={48} />
        <h1 className="text-2xl font-bold mt-4">Hyperliquid Perpetuals</h1>
        <p className="text-muted-foreground mt-2">Accedi per tradare perpetual con leva fino a 50×.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-28 md:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <HyperliquidLogo size={36} />
        <div className="flex-1">
          <h1 className="text-xl font-bold">Trade</h1>
          <p className="text-[11px] text-muted-foreground">Hyperliquid perpetual DEX · settled in USDC</p>
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

      {/* State-machine banner */}
      {stage === "register_error" && (
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
      )}
      {stage === "needs_agent" && register && (
        <Banner tone="amber" title="Completa setup Hyperliquid">
          {register.message ?? "È necessaria la registrazione del signing agent."}
        </Banner>
      )}
      {stage === "needs_arb_funds" && quickstart && (
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
      )}
      {stage === "needs_hl_deposit" && quickstart && (
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
      )}

      {/* Live prices strip */}
      <div className="mb-5">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Mercati popolari</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
          {prices.length === 0 && <Spinner />}
          {prices.slice(0, 12).map((p) => (
            <button
              key={p.coin}
              onClick={() => { setOrderCoin(p.coin); setTab("trade"); }}
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

      {/* Tab content */}
      {tab === "positions" && (
        <PositionsTab
          positions={positions}
          closingCoin={closingCoin}
          closeError={closeError}
          onClose={closePosition}
        />
      )}
      {tab === "trade" && (
        <TradeTab
          stage={stage}
          side={orderSide}
          setSide={setOrderSide}
          type={orderType}
          setType={setOrderType}
          coin={orderCoin}
          setCoin={setOrderCoin}
          size={orderSize}
          setSize={setOrderSize}
          price={orderPrice}
          setPrice={setOrderPrice}
          leverage={orderLeverage}
          setLeverage={setOrderLeverage}
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
          onCancelPreview={() => setOrderPreview(null)}
        />
      )}
      {tab === "orders" && (
        <OrdersTab orders={orders} onCancel={cancelOrder} />
      )}

      {/* Funding modal */}
      {showFund && (
        <FundModal
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
      )}
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
  closingCoin,
  closeError,
  onClose,
}: {
  positions: PositionsData | null;
  closingCoin: string | null;
  closeError: string | null;
  onClose: (coin: string) => void;
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
      {closeError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-xs text-red-500">
          {closeError}
        </div>
      )}
      {positions.positions.map((p) => {
        const isLong = p.side === "long";
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
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs"
              disabled={closingCoin === p.coin}
              onClick={() => onClose(p.coin)}
            >
              {closingCoin === p.coin ? <Spinner /> : "Chiudi posizione"}
            </Button>
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
  slPx: string;
  setSlPx: (v: string) => void;
  tpPx: string;
  setTpPx: (v: string) => void;
  mark: string | undefined;
  preview: Record<string, unknown> | null;
  loading: boolean;
  confirming: boolean;
  error: string | null;
  success: string | null;
  onPreview: () => void;
  onConfirm: () => void;
  onCancelPreview: () => void;
}) {
  const disabled = props.stage !== "ready";
  const notional = props.mark && props.size
    ? parseFloat(props.size) * parseFloat(props.mark)
    : 0;

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
            disabled={disabled}
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
          disabled={disabled}
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
              disabled={disabled}
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
          disabled={disabled}
          value={props.size}
          onChange={(e) => props.setSize(e.target.value)}
          placeholder="0.01"
          className="font-mono"
        />
        <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
          <span>Mark: {fmtPrice(props.mark)}</span>
          <span>Notional: {fmtUsd(notional)}</span>
        </div>
        {notional > 0 && notional < 10 && (
          <div className="text-[11px] text-amber-500 mt-0.5">
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
            disabled={disabled}
            value={props.price}
            onChange={(e) => props.setPrice(e.target.value)}
            placeholder={fmtPrice(props.mark)}
            className="font-mono"
          />
        </div>
      )}

      {/* Leverage */}
      <div>
        <div className="flex items-center justify-between text-xs">
          <label className="text-muted-foreground">Leva</label>
          <span className="font-bold" style={{ color: HL_GREEN }}>{props.leverage}×</span>
        </div>
        <input
          type="range"
          min="1"
          max="50"
          disabled={disabled}
          value={props.leverage}
          onChange={(e) => props.setLeverage(Number(e.target.value))}
          className="w-full disabled:opacity-50"
          style={{ accentColor: HL_GREEN }}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>1×</span><span>10×</span><span>25×</span><span>50×</span>
        </div>
      </div>

      {/* SL/TP */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Stop-loss (opt.)</label>
          <Input
            type="text"
            inputMode="decimal"
            disabled={disabled}
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
            disabled={disabled}
            value={props.tpPx}
            onChange={(e) => props.setTpPx(e.target.value)}
            placeholder="—"
            className="font-mono"
          />
        </div>
      </div>

      {/* Submit / Preview */}
      {!props.preview ? (
        <Button
          onClick={props.onPreview}
          disabled={disabled || props.loading}
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
          <pre className="text-[10px] overflow-x-auto max-h-32 text-muted-foreground">
            {JSON.stringify(props.preview, null, 2)}
          </pre>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={props.onCancelPreview} disabled={props.confirming}>
              Annulla
            </Button>
            <Button
              size="sm"
              onClick={props.onConfirm}
              disabled={props.confirming}
              style={{
                background: props.side === "buy" ? HL_GREEN : "#ef4444",
                color: props.side === "buy" ? "#000" : "#fff",
              }}
            >
              {props.confirming ? <Spinner /> : "Conferma"}
            </Button>
          </div>
        </div>
      )}

      {props.error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-xs text-red-500">
          {props.error}
        </div>
      )}
      {props.success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 text-xs text-green-500">
          {props.success}
        </div>
      )}
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
              <span className={`text-[10px] font-bold ${o.side === "buy" ? "text-green-500" : "text-red-500"}`}>
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
  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={props.onClose}
    >
      <div
        className="bg-card border rounded-xl w-full max-w-sm p-4"
        onClick={(e) => e.stopPropagation()}
      >
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

        {!props.preview && !props.success && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={props.onClose}>Annulla</Button>
            <Button
              onClick={props.onPreview}
              disabled={props.loading || !props.amount}
              style={{ background: HL_GREEN, color: "#000" }}
            >
              {props.loading ? <Spinner /> : "Anteprima"}
            </Button>
          </div>
        )}

        {props.preview && !props.success && (
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
        )}

        {props.success && (
          <>
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 text-xs text-green-500 mb-3">
              {props.success}
            </div>
            <Button variant="outline" className="w-full" onClick={props.onClose}>Chiudi</Button>
          </>
        )}

        {props.error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-xs text-red-500 mt-3">
            {props.error}
          </div>
        )}
      </div>
    </div>
  );
}
