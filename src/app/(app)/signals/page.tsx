"use client";

/**
 * Intelligence: what smart wallets are buying, and who trades best. Filters
 * sit in one bar; results are rows with the figures aligned, not loose cards.
 */

import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CHAINS } from "@/lib/chains";
import { LineIcon } from "@/components/line-icon";
import { TokenIcon } from "@/components/token-icon";
import { Change, Empty, PageHead, Panel, PillTabs, Segmented, Skeleton } from "@/components/premium";

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
  if (!addr || addr.length <= 14) return addr || "unknown";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function formatUsd(v: number | string | undefined): string {
  if (v == null) return "n/a";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "n/a";
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  return `${sign}$${a.toFixed(2)}`;
}

/** Ratios may come as 0.42 or as 42; both mean 42%. */
function toPct(v: number | string | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return null;
  return Math.abs(n) <= 1 ? n * 100 : n;
}

function formatPrice(price: number): string {
  return `$${price >= 1 ? price.toLocaleString("en-US", { maximumFractionDigits: 2 }) : price >= 0.0001 ? price.toFixed(6) : price.toExponential(2)}`;
}

function ChainSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="select select--chip">
      <label htmlFor={id} className="sr-only">
        Chain
      </label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.values(CHAINS).map((c) => (
          <option key={c.swapName} value={c.swapName}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function Loading() {
  return (
    <div className="wal-pad" style={{ display: "grid", gap: 12 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} height={56} />
      ))}
    </div>
  );
}

const WALLET_TYPE_LABELS: Record<string, string> = {
  "1": "Smart money",
  "2": "Influencer",
  "3": "Whale",
  smart_money: "Smart money",
  kol: "Influencer",
  whale: "Whale",
  sniper: "Sniper",
  dev: "Dev",
  fresh: "Fresh",
  pump: "Pump",
  smartMoney: "Smart money",
  influencer: "Influencer",
};

// ── Smart Money Signals ──────────────────────────────────────────────────────

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
        setError(data.error || "Could not load signals");
      }
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }, [chain, walletType]);

  return (
    <Panel
      flush
      index={2}
      title="What smart wallets are buying"
      sub="Tokens bought by several tracked wallets at once"
      action={
        <div className="filter-bar">
          <ChainSelect id="signals-chain" value={chain} onChange={setChain} />
          <Segmented
            id="sig-type"
            label="Wallet type"
            value={walletType || "all"}
            onChange={(v) => setWalletType(v === "all" ? "" : v)}
            options={[
              { value: "all", label: "All" },
              { value: "1", label: "Smart money" },
              { value: "2", label: "Influencers" },
              { value: "3", label: "Whales" },
            ]}
          />
          <button type="button" className="btn btn--sm btn--primary" onClick={handleFetch} disabled={loading}>
            {loading ? <span className="spin" aria-hidden="true" /> : <LineIcon name="refresh" size={15} />}
            {fetched ? "Refresh" : "Show signals"}
          </button>
        </div>
      }
    >
      {loading ? (
        <Loading />
      ) : error ? (
        <div className="wal-pad">
          <p className="note loss" role="alert">
            <LineIcon name="alert" size={16} />
            <span>{error}</span>
          </p>
        </div>
      ) : !fetched ? (
        <Empty icon="signal" title="Pick a chain and a wallet type" text="Then press Show signals. Nothing loads until you ask." />
      ) : signals.length === 0 ? (
        <Empty icon="signal" title="No signals right now" text="Try another chain or wallet type." />
      ) : (
        <ul className="rows wal-pad sig-rows">
          {signals.slice(0, 20).map((s, i) => {
            // Signal data has nested token object: s.token.symbol, s.token.tokenAddress, etc.
            const tokenObj = s.token as Record<string, unknown> | undefined;
            const symbol = (tokenObj?.symbol as string) ?? s.tokenSymbol ?? s.symbol ?? "???";
            const addr = (tokenObj?.tokenAddress as string) ?? s.tokenContractAddress ?? s.tokenAddress ?? s.address ?? "";
            const addressCount = s.triggerWalletCount ?? s.addressCount ?? s.address_count ?? 0;
            const totalAmt = s.amountUsd ?? s.amount_usd ?? s.totalAmountUsd ?? s.total_amount_usd;
            const mcap = (tokenObj?.marketCapUsd as string) ?? s.marketCap ?? s.market_cap;
            const price = s.price;
            const change = s.priceChange24h ?? s.price_change_24h;
            const soldRatio = s.soldRatioPercent;
            const types: string[] = [...(s.walletTypes ?? s.wallet_types ?? [])];
            const wType = s.walletType;
            if (wType && types.length === 0) types.push(wType);
            const logo = (tokenObj?.logo as string) ?? s.logo;
            const tokenName = (tokenObj?.name as string) ?? "";

            return (
              <li key={`${addr}-${i}`}>
                <div className="row sig-row">
                  {typeof logo === "string" && logo.startsWith("https://") ? (
                    // eslint-disable-next-line @next/next/no-img-element -- token logos come from many hosts
                    <img src={logo} alt="" width={36} height={36} className="tok-logo" onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                  ) : (
                    <TokenIcon symbol={symbol} size={36} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div className="t trunc">
                      {symbol} {tokenName && <span className="muted sig-name">{tokenName}</span>}
                    </div>
                    <div className="sub sig-sub">
                      <span className="num">{abbreviate(addr)}</span>
                      {types.map((t, j) => (
                        <span key={j} className="tag">
                          {WALLET_TYPE_LABELS[t] ?? t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="sig-col">
                    <span className="num">{Number(addressCount) > 0 ? Number(addressCount) : "n/a"}</span>
                    <span className="sub">wallets</span>
                  </div>
                  <div className="sig-col">
                    <span className="num">{totalAmt != null && Number(totalAmt) > 0 ? formatUsd(totalAmt) : "n/a"}</span>
                    <span className="sub">bought</span>
                  </div>
                  <div className="sig-col">
                    <span className="num">{mcap != null && Number(mcap) > 0 ? formatUsd(mcap) : "n/a"}</span>
                    <span className="sub">market cap</span>
                  </div>
                  <div className="end">
                    <div className="num">{price != null && Number(price) > 0 ? formatPrice(Number(price)) : ""}</div>
                    {change != null ? <Change value={Number(change)} /> : soldRatio != null ? <span className={`num sold${Number(soldRatio) > 80 ? " text-loss-ink" : " muted"}`}>{Number(soldRatio).toFixed(0)}% sold</span> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="sig-foot">Signals show what others did. They are information, not investment advice; past results do not repeat on&nbsp;cue.</p>
    </Panel>
  );
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

const TIME_FRAMES = [
  { value: "1", label: "1D" },
  { value: "2", label: "3D" },
  { value: "3", label: "7D" },
  { value: "4", label: "1M" },
  { value: "5", label: "3M" },
];

const SORTS = [
  { value: "1", label: "PnL" },
  { value: "2", label: "Win rate" },
  { value: "3", label: "Trades" },
  { value: "4", label: "Volume" },
  { value: "5", label: "ROI" },
];

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
        setError(data.error || "Could not load the leaderboard");
      }
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }, [chain, timeFrame, sortBy]);

  return (
    <Panel
      flush
      index={2}
      title="Top traders"
      sub="Wallets ranked on the chain you pick"
      action={
        <div className="filter-bar">
          <ChainSelect id="leaderboard-chain" value={chain} onChange={setChain} />
          <Segmented id="lb-time" label="Period" value={timeFrame} onChange={setTimeFrame} options={TIME_FRAMES} />
          <div className="select select--chip">
            <label htmlFor="lb-sort" className="sr-only">
              Sort by
            </label>
            <select id="lb-sort" className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {SORTS.map((o) => (
                <option key={o.value} value={o.value}>
                  By {o.label.toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn btn--sm btn--primary" onClick={handleFetch} disabled={loading}>
            {loading ? <span className="spin" aria-hidden="true" /> : <LineIcon name="refresh" size={15} />}
            {fetched ? "Refresh" : "Show ranking"}
          </button>
        </div>
      }
    >
      {loading ? (
        <Loading />
      ) : error ? (
        <div className="wal-pad">
          <p className="note loss" role="alert">
            <LineIcon name="alert" size={16} />
            <span>{error}</span>
          </p>
        </div>
      ) : !fetched ? (
        <Empty icon="bar-chart" title="Choose a chain and a period" text="Then press Show ranking." />
      ) : entries.length === 0 ? (
        <Empty icon="bar-chart" title="No ranking for this period" text="Try another chain or a longer period." />
      ) : (
        <ol className="rows wal-pad lb-rows">
          {entries.slice(0, 20).map((e, i) => {
            const addr = e.walletAddress ?? e.wallet_address ?? e.address ?? "";
            const pnl = e.realizedPnl ?? e.realized_pnl ?? e.pnl;
            const winRate = toPct(e.winRate ?? e.win_rate);
            const txCount = e.txCount ?? e.tx_count ?? e.txNumber;
            const roi = toPct(e.roi ?? e.profitRate ?? e.profit_rate);
            const wType = e.walletType ?? e.wallet_type;

            return (
              <li key={`${addr}-${i}`}>
                <div className="row lb-row">
                  <span className={`rank num${i < 3 ? " top" : ""}`}>{i + 1}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="t num">{abbreviate(addr)}</div>
                    <div className="sub">
                      {wType ? <span className="tag">{WALLET_TYPE_LABELS[wType] ?? wType}</span> : null}
                      {txCount != null && <span>{Number(txCount)} trades</span>}
                    </div>
                  </div>
                  <div className="sig-col">
                    <span className="num">{winRate != null ? `${winRate.toFixed(0)}%` : "n/a"}</span>
                    <span className="sub">win rate</span>
                  </div>
                  <div className="sig-col">
                    <span className="num">{e.volume != null && Number(e.volume) > 0 ? formatUsd(e.volume) : "n/a"}</span>
                    <span className="sub">volume</span>
                  </div>
                  <div className="end">
                    <div className={`num ${pnl != null ? (Number(pnl) >= 0 ? "text-gain-ink" : "text-loss-ink") : ""}`}>{formatUsd(pnl)}</div>
                    <Change value={roi} digits={1} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SignalsPage() {
  const { authenticated } = useAuth();
  const [tab, setTab] = useState<"signals" | "leaderboard">("signals");

  if (!authenticated) {
    return (
      <div className="page">
        <Empty icon="signal" title="Sign in first" text="Connect your wallet to see smart money signals." />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHead title="Intelligence" lede="Follow what experienced wallets buy, and see who trades best on each&nbsp;chain." />
      <PillTabs
        id="intel-tabs"
        label="Intelligence views"
        value={tab}
        onChange={setTab}
        options={[
          { value: "signals", label: "Smart money" },
          { value: "leaderboard", label: "Leaderboard" },
        ]}
      />
      {tab === "signals" ? <SignalsTab /> : <LeaderboardTab />}
    </div>
  );
}
