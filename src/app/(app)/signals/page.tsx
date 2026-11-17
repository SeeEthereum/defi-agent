"use client";

/**
 * Intelligence: what smart wallets are buying, and who trades best. Filters
 * sit in one bar; results are rows with the figures aligned, not loose cards.
 */

import { useState, useCallback, useEffect } from "react";
import { CHAINS } from "@/lib/chains";
import { LineIcon } from "@/components/line-icon";
import { TokenIcon } from "@/components/token-icon";
import { Empty, PageHead, Panel, PillTabs, Segmented, Skeleton } from "@/components/premium";
import { MISSING, formatCompactUsd, formatPercent, formatPrice, formatUsd } from "@/lib/format";
import { leaderRow, signalRow, tradesLabel } from "./display";

// ── Types ────────────────────────────────────────────────────────────────────

// OKX's records, read field by field in ./display (units documented there).
type SignalItem = Record<string, unknown>;
type LeaderboardEntry = Record<string, unknown>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function abbreviate(addr: string): string {
  if (!addr || addr.length <= 14) return addr;
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

/** A percentage in a gain/loss pill, "–" when unknown. */
function ReturnPill({ value }: { value: number | null }) {
  if (value === null) return <span className="glp flat">{MISSING}</span>;
  const cls = value > 0 ? "pos" : value < 0 ? "neg" : "flat";
  return <span className={`glp ${cls}`}>{formatPercent(value, { sign: true, decimals: Math.abs(value) >= 100 ? 0 : 1 })}</span>;
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

// A list from the API, or the reason there is none.
type Loaded<T> = { list: T[] } | { error: string };

// The default views, loaded on arrival: the server caches OKX's market data,
// so opening the page costs one cheap request, and it never looks empty.
const DEFAULT_CHAIN = "ethereum";
const DEFAULT_WALLET_TYPE = ""; // all wallet types
const DEFAULT_TIME_FRAME = "3"; // 7D
const DEFAULT_SORT = "1"; // by profit

// ── Smart Money Signals ──────────────────────────────────────────────────────

async function requestSignals(chain: string, walletType: string): Promise<Loaded<SignalItem>> {
  try {
    const params = new URLSearchParams({ chain });
    if (walletType) params.set("walletType", walletType);
    const res = await fetch(`/api/signals?${params.toString()}`);
    const data = await res.json();
    if (!data.success) return { error: data.error || "Could not load signals" };
    const raw = data.data;
    const list: SignalItem[] = Array.isArray(raw)
      ? raw
      : raw?.signals ?? raw?.results ?? raw?.data ?? (raw ? [raw] : []);
    return { list };
  } catch {
    return { error: "Could not reach the server" };
  }
}

function SignalsTab() {
  const [chain, setChain] = useState(DEFAULT_CHAIN);
  const [walletType, setWalletType] = useState(DEFAULT_WALLET_TYPE);
  // True from the start: the default view is on its way (effect below).
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const apply = useCallback((r: Loaded<SignalItem>) => {
    if ("error" in r) setError(r.error);
    else {
      setSignals(r.list);
      setFetched(true);
    }
    setLoading(false);
  }, []);

  const handleFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSignals([]);
    setFetched(false);
    apply(await requestSignals(chain, walletType));
  }, [chain, walletType, apply]);

  // First visit: the default view loads by itself. State is set only when
  // the answer arrives, never during the effect.
  useEffect(() => {
    let live = true;
    void requestSignals(DEFAULT_CHAIN, DEFAULT_WALLET_TYPE).then((r) => {
      if (live) apply(r);
    });
    return () => {
      live = false;
    };
  }, [apply]);

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
        <Empty icon="signal" title="Pick a chain and a wallet type" text="Then press Show signals." />
      ) : signals.length === 0 ? (
        <Empty icon="signal" title="No signals right now" text="Try another chain or wallet type." />
      ) : (
        <ul className="rows wal-pad sig-rows">
          {signals.slice(0, 20).map((s, i) => {
            const r = signalRow(s);

            return (
              <li key={`${r.address}-${i}`}>
                <div className="row sig-row">
                  <TokenIcon symbol={r.token.symbol} size={36} chainIndex={r.chainIndex} logoUrl={r.logo} />
                  <div style={{ minWidth: 0 }}>
                    <div className="t trunc">
                      {r.title} {r.subtitle && <span className="muted sig-name">{r.subtitle}</span>}
                    </div>
                    <div className="sub sig-sub">
                      {r.walletTypes.map((t) => (
                        <span key={t} className="tag">
                          {t}
                        </span>
                      ))}
                      {r.address && (
                        <span className="num muted" title={r.address}>
                          {abbreviate(r.address)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="sig-col">
                    <span className="num">{r.wallets !== null && r.wallets > 0 ? r.wallets.toLocaleString("en-US") : MISSING}</span>
                    <span className="sub">wallets</span>
                  </div>
                  <div className="sig-col">
                    <span className="num">{r.boughtUsd !== null && r.boughtUsd > 0 ? formatCompactUsd(r.boughtUsd) : MISSING}</span>
                    <span className="sub">bought</span>
                  </div>
                  <div className="sig-col">
                    <span className="num">{r.marketCapUsd !== null && r.marketCapUsd > 0 ? formatCompactUsd(r.marketCapUsd) : MISSING}</span>
                    <span className="sub">market cap</span>
                  </div>
                  <div className="end">
                    <div className="num">{r.price !== null && r.price > 0 ? formatPrice(r.price) : MISSING}</div>
                    {r.soldPercent !== null && (
                      <span
                        className={`num sold${r.soldPercent > 80 ? " text-loss-ink" : " muted"}`}
                        title="Share of what these wallets bought that they have sold since"
                      >
                        {formatPercent(r.soldPercent, { decimals: 0 })} sold
                      </span>
                    )}
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

// Plain words: "PnL" and "ROI" mean nothing to most people.
const SORTS = [
  { value: "1", label: "By profit" },
  { value: "2", label: "By win rate" },
  { value: "3", label: "By number of trades" },
  { value: "4", label: "By volume" },
  { value: "5", label: "By return" },
];

async function requestLeaderboard(chain: string, timeFrame: string, sortBy: string): Promise<Loaded<LeaderboardEntry>> {
  try {
    const params = new URLSearchParams({ chain, timeFrame, sortBy });
    const res = await fetch(`/api/leaderboard?${params.toString()}`);
    const data = await res.json();
    if (!data.success) return { error: data.error || "Could not load the leaderboard" };
    const raw = data.data;
    const list: LeaderboardEntry[] = Array.isArray(raw)
      ? raw
      : raw?.leaderboard ?? raw?.results ?? raw?.data ?? (raw ? [raw] : []);
    return { list };
  } catch {
    return { error: "Could not reach the server" };
  }
}

function LeaderboardTab() {
  const [chain, setChain] = useState(DEFAULT_CHAIN);
  const [timeFrame, setTimeFrame] = useState(DEFAULT_TIME_FRAME);
  const [sortBy, setSortBy] = useState(DEFAULT_SORT);
  // True from the start: the default ranking is on its way (effect below).
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const apply = useCallback((r: Loaded<LeaderboardEntry>) => {
    if ("error" in r) setError(r.error);
    else {
      setEntries(r.list);
      setFetched(true);
    }
    setLoading(false);
  }, []);

  const handleFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEntries([]);
    setFetched(false);
    apply(await requestLeaderboard(chain, timeFrame, sortBy));
  }, [chain, timeFrame, sortBy, apply]);

  // Opening the tab loads the default ranking (this component mounts then).
  useEffect(() => {
    let live = true;
    void requestLeaderboard(DEFAULT_CHAIN, DEFAULT_TIME_FRAME, DEFAULT_SORT).then((r) => {
      if (live) apply(r);
    });
    return () => {
      live = false;
    };
  }, [apply]);

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
                  {o.label}
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
            const r = leaderRow(e);
            const trades = tradesLabel(r.trades);

            return (
              <li key={`${r.address}-${i}`}>
                <div className="row lb-row">
                  <span className={`rank num${i < 3 ? " top" : ""}`}>{i + 1}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="t num" title={r.address || undefined}>
                      {r.address ? abbreviate(r.address) : "Unknown wallet"}
                    </div>
                    <div className="sub">
                      {r.walletTypes.map((t) => (
                        <span key={t} className="tag">
                          {t}
                        </span>
                      ))}
                      {trades && <span>{trades}</span>}
                    </div>
                  </div>
                  <div className="sig-col">
                    <span className="num">{r.winRatePercent !== null ? formatPercent(r.winRatePercent, { decimals: 0 }) : MISSING}</span>
                    <span className="sub">win rate</span>
                  </div>
                  <div className="sig-col">
                    <span className="num">{r.volumeUsd !== null && r.volumeUsd > 0 ? formatCompactUsd(r.volumeUsd) : MISSING}</span>
                    <span className="sub">volume</span>
                  </div>
                  <div className="end">
                    <div className={`num ${r.pnlUsd !== null ? (r.pnlUsd >= 0 ? "text-gain-ink" : "text-loss-ink") : ""}`}>
                      {formatUsd(r.pnlUsd, { sign: true })}
                    </div>
                    <ReturnPill value={r.returnPercent} />
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

// Public data from OKX's API (lib/okx/market-data): no sign-in needed.
export default function SignalsPage() {
  const [tab, setTab] = useState<"signals" | "leaderboard">("signals");

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
