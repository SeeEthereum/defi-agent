"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ── Hyperliquid brand colors ──────────────────────────────────────────────────
const HL_GREEN = "#96FF94";
const HL_GREEN_DIM = "#4ADE80";

// ── HL Official Logo SVG ──────────────────────────────────────────────────────
function HyperliquidLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="20" fill="#000000" />
      {/* H */}
      <rect x="12" y="20" width="10" height="60" fill={HL_GREEN} rx="2" />
      <rect x="12" y="44" width="28" height="12" fill={HL_GREEN} rx="2" />
      <rect x="30" y="20" width="10" height="60" fill={HL_GREEN} rx="2" />
      {/* L */}
      <rect x="52" y="20" width="10" height="60" fill={HL_GREEN} rx="2" />
      <rect x="52" y="68" width="36" height="12" fill={HL_GREEN} rx="2" />
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Position {
  coin: string;
  side: "long" | "short";
  size: string;
  entryPrice: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  liquidationPrice: string;
  marginUsed: string;
  positionValue: string;
  leverage: { type: "cross" | "isolated"; value: number };
  cumulativeFunding: string;
}

interface PositionsData {
  address: string;
  accountValue: string;
  totalMarginUsed: string;
  totalNotionalPosition: string;
  withdrawable: string;
  positions: Position[];
}

interface OrderData {
  oid: number;
  coin: string;
  side: string;
  limitPrice: string;
  size: string;
  origSize: string;
  type: string;
  timestamp: number;
}

interface PriceMap {
  [coin: string]: string;
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
  suggestion: string;
  next_command: string;
}

interface RegisterData {
  status: "ready" | "setup_required";
  hl_address?: string;
  hl_signing_address?: string;
  options?: {
    option_1_recommended?: { description: string; command: string };
  };
  message?: string;
}

const POPULAR_COINS = ["BTC", "ETH", "SOL", "ARB", "AVAX", "MATIC", "LINK", "HYPE"];

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

export default function TradePage() {
  const { authenticated, walletAddress } = useAuth();

  const [tab, setTab] = useState<"positions" | "trade" | "orders">("positions");
  const [positions, setPositions] = useState<PositionsData | null>(null);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [prices, setPrices] = useState<PriceMap>({});
  const [quickstart, setQuickstart] = useState<QuickstartData | null>(null);
  const [registerInfo, setRegisterInfo] = useState<RegisterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [pricesLoading, setPricesLoading] = useState(false);

  // Order form state
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

  // Deposit / Withdraw modal
  const [showFundModal, setShowFundModal] = useState(false);
  const [fundMode, setFundMode] = useState<"deposit" | "withdraw">("deposit");
  const [fundAmount, setFundAmount] = useState("");
  const [fundLoading, setFundLoading] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);
  const [fundResult, setFundResult] = useState<Record<string, unknown> | null>(null);

  const fetchPositions = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    try {
      const res = await fetch("/api/perp/positions");
      const data = await res.json();
      if (data.success) setPositions(data.data as PositionsData);
    } catch { /* ignore */ }
    setLoading(false);
  }, [authenticated]);

  const fetchOrders = useCallback(async () => {
    if (!authenticated) return;
    try {
      const res = await fetch("/api/perp/orders");
      const data = await res.json();
      if (data.success && Array.isArray(data.data?.orders)) {
        setOrders(data.data.orders as OrderData[]);
      }
    } catch { /* ignore */ }
  }, [authenticated]);

  const fetchPrices = useCallback(async () => {
    setPricesLoading(true);
    try {
      const res = await fetch("/api/perp/prices");
      const data = await res.json();
      if (data.success && data.data?.prices) {
        setPrices(data.data.prices as PriceMap);
      }
    } catch { /* ignore */ }
    setPricesLoading(false);
  }, []);

  const fetchQuickstart = useCallback(async () => {
    if (!authenticated || !walletAddress) return;
    try {
      const res = await fetch(`/api/perp/quickstart?address=${walletAddress}`);
      const data = await res.json();
      if (data.success) setQuickstart(data.data as QuickstartData);
    } catch { /* ignore */ }
  }, [authenticated, walletAddress]);

  const fetchRegister = useCallback(async () => {
    if (!authenticated) return;
    try {
      const res = await fetch("/api/perp/register");
      const data = await res.json();
      if (data.success) setRegisterInfo(data.data as RegisterData);
    } catch { /* ignore */ }
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    fetchPrices();
    fetchPositions();
    fetchOrders();
    fetchQuickstart();
    fetchRegister();
    const interval = setInterval(fetchPrices, 10_000);
    return () => clearInterval(interval);
  }, [authenticated, fetchPrices, fetchPositions, fetchOrders, fetchQuickstart, fetchRegister]);

  // ── Order preview ────────────────────────────────────────────────────────────
  const handlePreviewOrder = async () => {
    setOrderError(null);
    setOrderPreview(null);
    setOrderLoading(true);
    try {
      const res = await fetch("/api/perp/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coin: orderCoin,
          side: orderSide,
          size: orderSize,
          type: orderType,
          price: orderType === "limit" ? orderPrice : undefined,
          leverage: orderLeverage,
          slPx: orderSlPx || undefined,
          tpPx: orderTpPx || undefined,
          confirm: false,
        }),
      });
      const data = await res.json();
      if (data.success) setOrderPreview(data.data as Record<string, unknown>);
      else setOrderError(data.error);
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : "Preview failed");
    }
    setOrderLoading(false);
  };

  // ── Order confirm ────────────────────────────────────────────────────────────
  const handleConfirmOrder = async () => {
    setOrderError(null);
    setOrderConfirming(true);
    try {
      const res = await fetch("/api/perp/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coin: orderCoin,
          side: orderSide,
          size: orderSize,
          type: orderType,
          price: orderType === "limit" ? orderPrice : undefined,
          leverage: orderLeverage,
          slPx: orderSlPx || undefined,
          tpPx: orderTpPx || undefined,
          confirm: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOrderSuccess(`Order placed for ${orderSize} ${orderCoin} (${orderSide.toUpperCase()})`);
        setOrderPreview(null);
        setOrderSize("");
        setOrderPrice("");
        setOrderSlPx("");
        setOrderTpPx("");
        setTimeout(() => {
          setOrderSuccess(null);
          fetchPositions();
          fetchOrders();
        }, 3000);
      } else {
        setOrderError(data.error);
      }
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : "Order failed");
    }
    setOrderConfirming(false);
  };

  // ── Close position ───────────────────────────────────────────────────────────
  const handleClosePosition = async (coin: string) => {
    try {
      const res = await fetch("/api/perp/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coin, confirm: true }),
      });
      const data = await res.json();
      if (data.success) {
        fetchPositions();
        fetchOrders();
      }
    } catch { /* ignore */ }
  };

  // ── Cancel order ──────────────────────────────────────────────────────────────
  const handleCancelOrder = async (coin: string, orderId: string) => {
    try {
      const res = await fetch("/api/perp/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coin, orderId, confirm: true }),
      });
      const data = await res.json();
      if (data.success) fetchOrders();
    } catch { /* ignore */ }
  };

  // ── Deposit / Withdraw ───────────────────────────────────────────────────────
  const handleFund = async (preview: boolean) => {
    setFundError(null);
    setFundResult(null);
    setFundLoading(true);
    try {
      const endpoint = fundMode === "deposit" ? "/api/perp/deposit" : "/api/perp/withdraw";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: fundAmount, confirm: !preview }),
      });
      const data = await res.json();
      if (data.success) {
        setFundResult(data.data as Record<string, unknown>);
        if (!preview) {
          setTimeout(() => {
            setShowFundModal(false);
            setFundResult(null);
            setFundAmount("");
            fetchPositions();
            fetchQuickstart();
          }, 4000);
        }
      } else {
        setFundError(data.error);
      }
    } catch (e) {
      setFundError(e instanceof Error ? e.message : "Operation failed");
    }
    setFundLoading(false);
  };

  const currentPrice = prices[orderCoin] ? parseFloat(prices[orderCoin]).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground text-sm">Please log in to access the Trade section.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <HyperliquidLogo size={40} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Perpetuals</h1>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full text-black" style={{ background: HL_GREEN }}>
                Powered by Hyperliquid
              </span>
            </div>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              High-performance on-chain perpetuals DEX — CEX speed, full on-chain settlement
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowFundModal(true)}
          className="gap-2 text-xs border-green-500/30 hover:border-green-500/60 hover:bg-green-500/5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12l7-7 7 7" />
          </svg>
          Deposit / Withdraw
        </Button>
      </div>

      {/* ── Account summary strip ──────────────────────────────────────────── */}
      {quickstart && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Account Value", value: `$${quickstart.assets.hl_account_value_usd.toFixed(2)}` },
            { label: "Withdrawable", value: `$${quickstart.assets.hl_withdrawable_usd.toFixed(2)}` },
            { label: "Open Positions", value: String(quickstart.assets.hl_open_positions) },
            { label: "ARB USDC", value: `$${quickstart.assets.arb_usdc_balance.toFixed(2)}` },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border/60 bg-card px-4 py-3">
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
              <p className="text-[17px] font-semibold mt-0.5">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Register notice ────────────────────────────────────────────────── */}
      {registerInfo?.status === "setup_required" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3 items-start">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
            <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-700">One-time setup required</p>
            <p className="text-xs text-amber-600 mt-1">
              Your OKX AA wallet uses a separate signing address for Hyperliquid. Deposit USDC directly to your signing address{" "}
              {registerInfo.hl_signing_address && (
                <code className="font-mono bg-amber-500/10 px-1 rounded">
                  {registerInfo.hl_signing_address.slice(0, 6)}…{registerInfo.hl_signing_address.slice(-4)}
                </code>
              )}{" "}
              to activate trading.
            </p>
            <p className="text-xs text-amber-600 mt-1 font-medium">
              → Run: <code className="font-mono bg-amber-500/10 px-1 rounded">hyperliquid deposit --amount &lt;USDC&gt; --confirm</code>
            </p>
          </div>
        </div>
      )}

      {/* ── Live price ticker ──────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {POPULAR_COINS.map((coin) => {
            const p = prices[coin];
            return (
              <button
                key={coin}
                onClick={() => { setOrderCoin(coin); setTab("trade"); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-left shrink-0 ${
                  orderCoin === coin
                    ? "border-green-500/50 bg-green-500/8"
                    : "border-border/60 hover:border-green-500/30 hover:bg-green-500/5"
                }`}
              >
                <span className="text-[12px] font-bold text-foreground">{coin}</span>
                <span className="text-[12px] text-muted-foreground">
                  {p ? `$${parseFloat(p).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : (pricesLoading ? "…" : "—")}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-border/60 pb-0">
        {(["positions", "trade", "orders"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize rounded-t-lg transition-colors ${
              tab === t
                ? "border-b-2 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            style={tab === t ? { borderColor: HL_GREEN, color: HL_GREEN } : {}}
          >
            {t === "trade" ? "New Order" : t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "positions" && positions?.positions.length ? (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: HL_GREEN + "22", color: HL_GREEN }}>
                {positions.positions.length}
              </span>
            ) : null}
            {t === "orders" && orders.length ? (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: HL_GREEN + "22", color: HL_GREEN }}>
                {orders.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── POSITIONS TAB ──────────────────────────────────────────────────── */}
      {tab === "positions" && (
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner className="text-green-500" />
            </div>
          ) : !positions || positions.positions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <HyperliquidLogo size={48} />
              <p className="text-muted-foreground text-sm">No open positions</p>
              <Button size="sm" variant="outline" onClick={() => setTab("trade")} className="text-xs gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Open a position
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Account summary */}
              {positions.totalMarginUsed && parseFloat(positions.totalMarginUsed) > 0 && (
                <div className="rounded-xl border border-border/60 bg-card/50 px-4 py-3 flex flex-wrap gap-4 text-sm">
                  <span className="text-muted-foreground">Account Value: <strong className="text-foreground">${parseFloat(positions.accountValue).toFixed(2)}</strong></span>
                  <span className="text-muted-foreground">Margin Used: <strong className="text-foreground">${parseFloat(positions.totalMarginUsed).toFixed(2)}</strong></span>
                  <span className="text-muted-foreground">Notional: <strong className="text-foreground">${parseFloat(positions.totalNotionalPosition).toFixed(2)}</strong></span>
                  <span className="text-muted-foreground">Withdrawable: <strong className="text-foreground">${parseFloat(positions.withdrawable).toFixed(2)}</strong></span>
                </div>
              )}

              {positions.positions.map((pos, i) => {
                const pnl = parseFloat(pos.unrealizedPnl);
                const roe = parseFloat(pos.returnOnEquity) * 100;
                const isLong = pos.side === "long";
                return (
                  <div
                    key={i}
                    className="rounded-xl border bg-card overflow-hidden"
                    style={{ borderColor: isLong ? HL_GREEN + "40" : "#f87171" + "40" }}
                  >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isLong ? "bg-green-500/15 text-green-500" : "bg-red-500/15 text-red-500"}`}>
                          {pos.side.toUpperCase()}
                        </span>
                        <span className="text-sm font-bold">{pos.coin}-PERP</span>
                        <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {pos.leverage.value}×{pos.leverage.type === "isolated" ? " ISO" : ""}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleClosePosition(pos.coin)}
                        className="text-xs text-red-500 hover:bg-red-500/10 hover:text-red-600 h-7"
                      >
                        Close
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-border/40">
                      {[
                        { label: "Size", value: pos.size },
                        { label: "Entry", value: `$${parseFloat(pos.entryPrice).toLocaleString()}` },
                        { label: "Liq. Price", value: `$${parseFloat(pos.liquidationPrice || "0").toLocaleString()}` },
                        { label: "Margin Used", value: `$${parseFloat(pos.marginUsed).toFixed(2)}` },
                      ].map(({ label, value }) => (
                        <div key={label} className="px-4 py-3">
                          <p className="text-[10px] text-muted-foreground">{label}</p>
                          <p className="text-[13px] font-medium mt-0.5">{value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="px-4 py-3 bg-muted/30 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Unrealized PnL</span>
                        <PnlBadge value={pos.unrealizedPnl} />
                      </div>
                      <span className={`text-xs font-medium ${roe >= 0 ? "text-green-500" : "text-red-500"}`}>
                        ROE {roe >= 0 ? "+" : ""}{roe.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TRADE TAB ──────────────────────────────────────────────────────── */}
      {tab === "trade" && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Order form */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            {/* Coin selector + current price */}
            <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <select
                  value={orderCoin}
                  onChange={(e) => setOrderCoin(e.target.value)}
                  className="bg-transparent text-sm font-bold border-none outline-none cursor-pointer"
                >
                  {POPULAR_COINS.map((c) => <option key={c} value={c}>{c}-PERP</option>)}
                </select>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-muted-foreground">Mark Price</p>
                <p className="text-sm font-semibold">${currentPrice}</p>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Long / Short */}
              <div className="grid grid-cols-2 gap-2">
                {(["buy", "sell"] as const).map((side) => (
                  <button
                    key={side}
                    onClick={() => setOrderSide(side)}
                    className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                      orderSide === side
                        ? side === "buy"
                          ? "text-black shadow-lg"
                          : "bg-red-500 text-white shadow-lg"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                    style={orderSide === side && side === "buy" ? { background: HL_GREEN } : {}}
                  >
                    {side === "buy" ? "Long" : "Short"}
                  </button>
                ))}
              </div>

              {/* Market / Limit */}
              <div className="flex gap-2">
                {(["market", "limit"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setOrderType(t)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                      orderType === t ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Limit price */}
              {orderType === "limit" && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Limit Price (USDC)</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={orderPrice}
                    onChange={(e) => setOrderPrice(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              )}

              {/* Size */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Size ({orderCoin})</label>
                <Input
                  type="number"
                  placeholder="0.000"
                  value={orderSize}
                  onChange={(e) => setOrderSize(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              {/* Leverage */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-muted-foreground">Leverage</label>
                  <span className="text-xs font-bold" style={{ color: HL_GREEN }}>{orderLeverage}×</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={orderLeverage}
                  onChange={(e) => setOrderLeverage(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-muted"
                  style={{ accentColor: HL_GREEN }}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>1×</span><span>10×</span><span>25×</span><span>50×</span>
                </div>
              </div>

              {/* SL / TP */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Stop Loss</label>
                  <Input type="number" placeholder="Optional" value={orderSlPx} onChange={(e) => setOrderSlPx(e.target.value)} className="h-8 text-xs" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Take Profit</label>
                  <Input type="number" placeholder="Optional" value={orderTpPx} onChange={(e) => setOrderTpPx(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>

              {/* Notional estimate */}
              {orderSize && prices[orderCoin] && (
                <div className="rounded-lg bg-muted/50 px-3 py-2 flex justify-between text-xs">
                  <span className="text-muted-foreground">Est. Notional</span>
                  <span className="font-medium">${(parseFloat(orderSize) * parseFloat(prices[orderCoin]) * orderLeverage).toFixed(2)} USDC</span>
                </div>
              )}

              {/* Error / Success */}
              {orderError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{orderError}</div>
              )}
              {orderSuccess && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700 font-medium">✓ {orderSuccess}</div>
              )}

              {/* Buttons */}
              {!orderPreview ? (
                <Button
                  className="w-full font-bold text-sm"
                  disabled={!orderSize || orderLoading}
                  onClick={handlePreviewOrder}
                  style={{ background: orderSide === "buy" ? HL_GREEN : "#ef4444", color: orderSide === "buy" ? "#000" : "#fff" }}
                >
                  {orderLoading ? <Spinner className="mx-auto" /> : `Preview ${orderSide === "buy" ? "Long" : "Short"}`}
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs space-y-1">
                    <p className="font-semibold text-foreground mb-1.5">Order Preview</p>
                    {Object.entries(orderPreview).filter(([k]) => !["ok", "action"].includes(k)).slice(0, 6).map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                        <span className="font-medium">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => setOrderPreview(null)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      disabled={orderConfirming}
                      onClick={handleConfirmOrder}
                      className="text-xs font-bold"
                      style={{ background: orderSide === "buy" ? HL_GREEN : "#ef4444", color: orderSide === "buy" ? "#000" : "#fff" }}
                    >
                      {orderConfirming ? <Spinner className="mx-auto" /> : "Confirm & Place"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Info panel */}
          <div className="space-y-4">
            {/* How it works */}
            <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <HyperliquidLogo size={24} />
                <h3 className="text-sm font-semibold">How Hyperliquid works</h3>
              </div>
              <div className="space-y-2 text-xs text-muted-foreground">
                {[
                  { icon: "⚡", text: "Trades settle on Hyperliquid L1 — a custom chain built for perps with ~20k TPS" },
                  { icon: "💵", text: "All positions are margined in USDC. Deposit from Arbitrum via the official bridge (2-5 min)" },
                  { icon: "🔒", text: "Your OKX TEE wallet signs EIP-712 actions — keys never leave the secure enclave" },
                  { icon: "⚙️", text: "Preview order → review details → confirm execution. Exactly like the native HL interface" },
                  { icon: "🛡️", text: "Set Stop Loss and Take Profit in the same order. No extra steps" },
                ].map(({ icon, text }, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="shrink-0">{icon}</span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Market stats for selected coin */}
            {prices[orderCoin] && (
              <div className="rounded-xl border border-border/60 bg-card p-4">
                <h3 className="text-sm font-semibold mb-3">{orderCoin}-PERP Stats</h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Mark Price</p>
                    <p className="font-semibold mt-0.5">${parseFloat(prices[orderCoin]).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Max Leverage</p>
                    <p className="font-semibold mt-0.5">50×</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Min Notional</p>
                    <p className="font-semibold mt-0.5">$10 USDC</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Settlement</p>
                    <p className="font-semibold mt-0.5">USDC</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ORDERS TAB ─────────────────────────────────────────────────────── */}
      {tab === "orders" && (
        <div>
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <p className="text-muted-foreground text-sm">No open orders</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    {["Coin", "Side", "Type", "Size", "Limit Price", "Filled", "Time", ""].map((h) => (
                      <th key={h} className="text-left text-xs text-muted-foreground font-medium pb-3 pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {orders.map((o) => (
                    <tr key={o.oid} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 pr-4 font-medium">{o.coin}</td>
                      <td className="py-3 pr-4">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${o.side === "B" ? "text-green-600 bg-green-500/10" : "text-red-600 bg-red-500/10"}`}>
                          {o.side === "B" ? "LONG" : "SHORT"}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground capitalize">{o.type}</td>
                      <td className="py-3 pr-4">{o.size}</td>
                      <td className="py-3 pr-4">${parseFloat(o.limitPrice).toLocaleString()}</td>
                      <td className="py-3 pr-4 text-muted-foreground text-xs">{o.origSize}</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{new Date(o.timestamp).toLocaleTimeString()}</td>
                      <td className="py-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs text-red-500 hover:bg-red-500/10 px-2"
                          onClick={() => handleCancelOrder(o.coin, String(o.oid))}
                        >
                          Cancel
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Deposit / Withdraw Modal ────────────────────────────────────────── */}
      {showFundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <HyperliquidLogo size={28} />
                <h3 className="text-sm font-semibold">Fund Account</h3>
              </div>
              <button onClick={() => { setShowFundModal(false); setFundResult(null); setFundError(null); setFundAmount(""); }} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-accent">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Mode switch */}
              <div className="grid grid-cols-2 gap-2">
                {(["deposit", "withdraw"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setFundMode(m); setFundResult(null); setFundError(null); }}
                    className={`py-2 rounded-xl text-sm font-semibold capitalize transition-all ${
                      fundMode === m ? "text-black" : "bg-muted text-muted-foreground"
                    }`}
                    style={fundMode === m ? { background: HL_GREEN } : {}}
                  >
                    {m}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">
                  {fundMode === "deposit" ? "Amount (USDC from Arbitrum)" : "Amount to withdraw (USDC, min $2, $1 fee)"}
                </label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>

              {/* Info */}
              <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground space-y-1">
                {fundMode === "deposit" ? (
                  <>
                    <p>• USDC bridged from your Arbitrum wallet via official HL bridge</p>
                    <p>• Takes 2–5 minutes to credit your HL account</p>
                    <p>• ETH on Arbitrum required for gas (~$0.01)</p>
                  </>
                ) : (
                  <>
                    <p>• Fixed $1 USDC withdrawal fee deducted from your HL balance</p>
                    <p>• Funds arrive on Arbitrum in 2–5 minutes</p>
                    <p>• Minimum withdrawal: $2 USDC</p>
                  </>
                )}
              </div>

              {fundError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{fundError}</div>
              )}

              {fundResult && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 text-xs space-y-1">
                  <p className="font-semibold text-green-800">
                    {fundMode === "deposit" ? "✓ Deposit initiated" : "✓ Withdrawal submitted"}
                  </p>
                  {fundMode === "deposit" && (fundResult as { depositTxHash?: string }).depositTxHash && (
                    <p className="text-green-700 font-mono">{String((fundResult as { depositTxHash?: string }).depositTxHash).slice(0, 20)}…</p>
                  )}
                  <p className="text-green-700">Funds will arrive in ~2-5 minutes.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!fundAmount || fundLoading}
                  onClick={() => handleFund(true)}
                  className="text-xs"
                >
                  {fundLoading ? <Spinner className="mx-auto" /> : "Preview"}
                </Button>
                <Button
                  size="sm"
                  disabled={!fundAmount || fundLoading}
                  onClick={() => handleFund(false)}
                  className="text-xs font-bold text-black"
                  style={{ background: HL_GREEN }}
                >
                  {fundLoading ? <Spinner className="mx-auto text-black" /> : `Confirm ${fundMode === "deposit" ? "Deposit" : "Withdraw"}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
