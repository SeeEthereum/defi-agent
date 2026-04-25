"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { CHAINS } from "@/lib/chains";

// ── Types ────────────────────────────────────────────────────────────────────

interface SignalItem {
  tokenSymbol?: string;
  symbol?: string;
  tokenContractAddress?: string;
  tokenAddress?: string;
  address?: string;
  chainIndex?: string | number;
  chainId?: string | number;
  addressCount?: number;
  address_count?: number;
  totalAmountUsd?: number | string;
  total_amount_usd?: number | string;
  amountUsd?: number | string;
  amount_usd?: number | string;
  marketCap?: number | string;
  market_cap?: number | string;
  liquidityUsd?: number | string;
  liquidity_usd?: number | string;
  price?: number | string;
  priceChange24h?: number | string;
  price_change_24h?: number | string;
  walletTypes?: string[];
  wallet_types?: string[];
  logo?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface LeaderboardEntry {
  walletAddress?: string;
  wallet_address?: string;
  address?: string;
  realizedPnl?: number | string;
  realized_pnl?: number | string;
  pnl?: number | string;
  winRate?: number | string;
  win_rate?: number | string;
  txCount?: number | string;
  tx_count?: number | string;
  txNumber?: number | string;
  volume?: number | string;
  roi?: number | string;
  profitRate?: number | string;
  profit_rate?: number | string;
  walletType?: string;
  wallet_type?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function abbreviate(addr: string): string {
  if (!addr || addr.length <= 14) return addr || "—";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function formatUsd(v: number | string | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function formatPct(v: number | string | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${(n * (Math.abs(n) <= 1 ? 100 : 1)).toFixed(1)}%`;
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin-breathe ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="16" height="16">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

const WALLET_TYPE_LABELS: Record<string, string> = {
  "1": "Smart Money",
  "2": "KOL",
  "3": "Whale",
  smart_money: "Smart Money",
  kol: "KOL",
  whale: "Whale",
  sniper: "Sniper",
  dev: "Dev",
  fresh: "Fresh",
  pump: "Pump",
  smartMoney: "Smart Money",
  influencer: "KOL",
};

// ── Smart Money Signals Tab ──────────────────────────────────────────────────

function SignalsTab() {
  const [chain, setChain] = useState("ethereum");
  const [walletType, setWalletType] = useState("");
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const handleFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSignals([]);
    setFetched(false);
    try {
      const params = new URLSearchParams({ chain });
      if (walletType) params.set("walletType", walletType);

      const res = await fetch(`/api/signals?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        const raw = data.data;
        const list: SignalItem[] = Array.isArray(raw)
          ? raw
          : raw?.signals ?? raw?.results ?? raw?.data ?? (raw ? [raw] : []);
        setSignals(list);
        setFetched(true);
      } else {
        setError(data.error || "Failed to fetch signals");
      }
    } catch {
      setError("Failed to connect to the server");
    } finally {
      setLoading(false);
    }
  }, [chain, walletType]);

  return (
    <div className="space-y-5">
      {/* Chain + type selectors */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[13px] font-medium text-muted-foreground mb-2">Chain</p>
          <select
            className="flex h-10 w-full rounded-xl border border-border/60 bg-white px-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-3 focus:ring-indigo-500/20 appearance-none cursor-pointer"
            value={chain}
            onChange={(e) => setChain(e.target.value)}
          >
            {Object.values(CHAINS).map((c) => (
              <option key={c.swapName} value={c.swapName}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <p className="text-[13px] font-medium text-muted-foreground mb-2">Wallet Type</p>
          <select
            className="flex h-10 w-full rounded-xl border border-border/60 bg-white px-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-3 focus:ring-indigo-500/20 appearance-none cursor-pointer"
            value={walletType}
            onChange={(e) => setWalletType(e.target.value)}
          >
            <option value="">All</option>
            <option value="1">Smart Money</option>
            <option value="2">KOL / Influencer</option>
            <option value="3">Whales</option>
          </select>
        </div>
      </div>

      <Button
        onClick={handleFetch}
        disabled={loading}
        className="w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold"
      >
        {loading ? (
          <span className="flex items-center gap-2"><Spinner /> Loading signals...</span>
        ) : (
          "Get Signals"
        )}
      </Button>

      {/* Disclaimer */}
      <div className="rounded-lg bg-amber-950/30 border border-amber-800/40 px-3 py-2">
        <p className="text-[11px] text-amber-300 leading-relaxed">
          Signals are for informational purposes only and are <strong>NOT investment advice</strong>. Past performance does not guarantee future results.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-950/30 border border-red-800/40 p-4 text-[13px] text-red-300">{error}</div>
      )}

      {fetched && signals.length === 0 && !error && (
        <div className="rounded-xl bg-secondary border border-border/60 p-6 text-center">
          <p className="text-[13px] text-muted-foreground">No signals found for this chain. Try a different chain or filter.</p>
        </div>
      )}

      {/* Signal cards */}
      {signals.length > 0 && (
        <div className="space-y-3">
          <p className="text-[13px] font-medium text-muted-foreground">
            {signals.length} signal{signals.length !== 1 ? "s" : ""}
          </p>
          {signals.slice(0, 20).map((s, i) => {
            // Signal data has nested token object: s.token.symbol, s.token.tokenAddress, etc.
            const tokenObj = s.token as Record<string, unknown> | undefined;
            const symbol = (tokenObj?.symbol as string) ?? s.tokenSymbol ?? s.symbol ?? "???";
            const addr = (tokenObj?.tokenAddress as string) ?? s.tokenContractAddress ?? s.tokenAddress ?? s.address ?? "";
            const addressCount = s.triggerWalletCount ?? s.addressCount ?? s.address_count ?? 0;
            const totalAmt = s.amountUsd ?? s.amount_usd ?? s.totalAmountUsd ?? s.total_amount_usd;
            const mcap = (tokenObj?.marketCapUsd as string) ?? s.marketCap ?? s.market_cap;
            const liq = s.liquidityUsd ?? s.liquidity_usd;
            const price = s.price;
            const change = s.priceChange24h ?? s.price_change_24h;
            const soldRatio = s.soldRatioPercent;
            const types = s.walletTypes ?? s.wallet_types ?? [];
            const wType = s.walletType;
            if (wType && types.length === 0) types.push(wType);
            const logo = (tokenObj?.logo as string) ?? s.logo;
            const tokenName = (tokenObj?.name as string) ?? "";
            const holders = tokenObj?.holders as string | undefined;

            return (
              <div key={`${addr}-${i}`} className="rounded-xl border border-border/60 bg-white p-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {logo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logo} alt={symbol} width={24} height={24} className="rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    )}
                    <span className="text-[14px] font-semibold">{symbol}</span>
                    {tokenName && <span className="text-[11px] text-muted-foreground/60 truncate max-w-[120px]">{tokenName}</span>}
                    <span className="text-[11px] text-muted-foreground/60 font-mono">{abbreviate(addr)}</span>
                  </div>
                  {change != null && (
                    <span className={`text-[12px] font-semibold tabular-nums ${Number(change) >= 0 ? "text-emerald-400" : "text-red-500"}`}>
                      {Number(change) >= 0 ? "+" : ""}{Number(change).toFixed(2)}%
                    </span>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                  {Number(addressCount) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Wallets</span>
                      <span className="font-medium">{Number(addressCount)}</span>
                    </div>
                  )}
                  {totalAmt != null && Number(totalAmt) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Volume</span>
                      <span className="font-medium">{formatUsd(totalAmt)}</span>
                    </div>
                  )}
                  {price != null && Number(price) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Price</span>
                      <span className="font-medium tabular-nums">
                        ${Number(price) >= 1 ? Number(price).toLocaleString(undefined, { maximumFractionDigits: 2 }) : Number(price) >= 0.0001 ? Number(price).toFixed(6) : Number(price).toExponential(2)}
                      </span>
                    </div>
                  )}
                  {mcap != null && Number(mcap) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Market Cap</span>
                      <span className="font-medium">{formatUsd(mcap)}</span>
                    </div>
                  )}
                  {liq != null && Number(liq) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Liquidity</span>
                      <span className="font-medium">{formatUsd(liq)}</span>
                    </div>
                  )}
                  {holders != null && Number(holders) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Holders</span>
                      <span className="font-medium">{Number(holders).toLocaleString()}</span>
                    </div>
                  )}
                  {soldRatio != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sold Ratio</span>
                      <span className={`font-medium ${Number(soldRatio) > 80 ? "text-red-500" : ""}`}>{Number(soldRatio).toFixed(1)}%</span>
                    </div>
                  )}
                </div>

                {/* Wallet type badges */}
                {types.length > 0 && (
                  <div className="flex gap-1.5 mt-2.5 flex-wrap">
                    {types.map((t, j) => (
                      <span key={j} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                        {WALLET_TYPE_LABELS[t] ?? t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Leaderboard Tab ──────────────────────────────────────────────────────────

function LeaderboardTab() {
  const [chain, setChain] = useState("ethereum");
  const [timeFrame, setTimeFrame] = useState("3");
  const [sortBy, setSortBy] = useState("1");
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const handleFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEntries([]);
    setFetched(false);
    try {
      const params = new URLSearchParams({ chain, timeFrame, sortBy });
      const res = await fetch(`/api/leaderboard?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        const raw = data.data;
        const list: LeaderboardEntry[] = Array.isArray(raw)
          ? raw
          : raw?.leaderboard ?? raw?.results ?? raw?.data ?? (raw ? [raw] : []);
        setEntries(list);
        setFetched(true);
      } else {
        setError(data.error || "Failed to fetch leaderboard");
      }
    } catch {
      setError("Failed to connect to the server");
    } finally {
      setLoading(false);
    }
  }, [chain, timeFrame, sortBy]);

  const timeFrameLabels: Record<string, string> = {
    "1": "1 Day",
    "2": "3 Days",
    "3": "7 Days",
    "4": "1 Month",
    "5": "3 Months",
  };

  const sortLabels: Record<string, string> = {
    "1": "PnL",
    "2": "Win Rate",
    "3": "Tx Count",
    "4": "Volume",
    "5": "ROI",
  };

  return (
    <div className="space-y-5">
      {/* Selectors */}
      <div>
        <p className="text-[13px] font-medium text-muted-foreground mb-2">Chain</p>
        <select
          className="flex h-10 w-full rounded-xl border border-border/60 bg-white px-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-3 focus:ring-indigo-500/20 appearance-none cursor-pointer"
          value={chain}
          onChange={(e) => setChain(e.target.value)}
        >
          {Object.values(CHAINS).map((c) => (
            <option key={c.swapName} value={c.swapName}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[13px] font-medium text-muted-foreground mb-2">Time Frame</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(timeFrameLabels).map(([k, v]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTimeFrame(k)}
                className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold transition-colors ${
                  timeFrame === k
                    ? "bg-indigo-600 text-white"
                    : "bg-white border border-border/60 text-muted-foreground hover:border-indigo-300 hover:text-indigo-600"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[13px] font-medium text-muted-foreground mb-2">Sort By</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(sortLabels).map(([k, v]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSortBy(k)}
                className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold transition-colors ${
                  sortBy === k
                    ? "bg-indigo-600 text-white"
                    : "bg-white border border-border/60 text-muted-foreground hover:border-indigo-300 hover:text-indigo-600"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button
        onClick={handleFetch}
        disabled={loading}
        className="w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold"
      >
        {loading ? (
          <span className="flex items-center gap-2"><Spinner /> Loading...</span>
        ) : (
          "Get Leaderboard"
        )}
      </Button>

      {error && (
        <div className="rounded-xl bg-red-950/30 border border-red-800/40 p-4 text-[13px] text-red-300">{error}</div>
      )}

      {fetched && entries.length === 0 && !error && (
        <div className="rounded-xl bg-secondary border border-border/60 p-6 text-center">
          <p className="text-[13px] text-muted-foreground">No leaderboard data for this chain/period.</p>
        </div>
      )}

      {/* Leaderboard list */}
      {entries.length > 0 && (
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-muted-foreground">
            Top {entries.length} traders
          </p>
          {entries.slice(0, 20).map((e, i) => {
            const addr = e.walletAddress ?? e.wallet_address ?? e.address ?? "";
            const pnl = e.realizedPnl ?? e.realized_pnl ?? e.pnl;
            const winRate = e.winRate ?? e.win_rate;
            const txCount = e.txCount ?? e.tx_count ?? e.txNumber;
            const vol = e.volume;
            const roi = e.roi ?? e.profitRate ?? e.profit_rate;
            const wType = e.walletType ?? e.wallet_type;

            return (
              <div key={`${addr}-${i}`} className="rounded-xl border border-border/60 bg-white px-4 py-3">
                <div className="flex items-center gap-3">
                  {/* Rank */}
                  <span className={`text-[13px] font-bold w-6 text-center tabular-nums shrink-0 ${
                    i < 3 ? "text-indigo-600" : "text-muted-foreground/50"
                  }`}>
                    {i + 1}
                  </span>

                  {/* Address + type */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold font-mono">{abbreviate(addr)}</span>
                      {wType && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600">
                          {WALLET_TYPE_LABELS[wType] ?? wType}
                        </span>
                      )}
                    </div>
                    {/* Stats row */}
                    <div className="flex gap-3 mt-1 text-[11px]">
                      {pnl != null && (
                        <span className={Number(pnl) >= 0 ? "text-emerald-400" : "text-red-500"}>
                          PnL: {formatUsd(pnl)}
                        </span>
                      )}
                      {winRate != null && (
                        <span className="text-muted-foreground">
                          WR: {formatPct(winRate)}
                        </span>
                      )}
                      {txCount != null && (
                        <span className="text-muted-foreground">
                          Txs: {Number(txCount)}
                        </span>
                      )}
                      {vol != null && Number(vol) > 0 && (
                        <span className="text-muted-foreground">
                          Vol: {formatUsd(vol)}
                        </span>
                      )}
                      {roi != null && (
                        <span className={Number(roi) >= 0 ? "text-emerald-400" : "text-red-500"}>
                          ROI: {formatPct(roi)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Signals Page ────────────────────────────────────────────────────────

export default function SignalsPage() {
  const { authenticated } = useAuth();
  const [tab, setTab] = useState<"signals" | "leaderboard">("signals");

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-[15px]">
          Please connect your wallet first.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-5 py-2">
      {/* Header */}
      <div>
        <p className="text-eyebrow">SMART MONEY · LEADERBOARD</p>
        <h1 className="mt-1.5 text-display-lg text-foreground">
          Intelligence
        </h1>
        <p className="text-[13px] text-muted-foreground mt-2">
          Smart money signals and top trader leaderboard
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-secondary">
        <button
          type="button"
          onClick={() => setTab("signals")}
          className={`flex-1 h-9 rounded-lg text-[13px] font-semibold transition-all ${
            tab === "signals"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Smart Money Signals
        </button>
        <button
          type="button"
          onClick={() => setTab("leaderboard")}
          className={`flex-1 h-9 rounded-lg text-[13px] font-semibold transition-all ${
            tab === "leaderboard"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Leaderboard
        </button>
      </div>

      {/* Content */}
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        {tab === "signals" ? <SignalsTab /> : <LeaderboardTab />}
      </div>
    </div>
  );
}
