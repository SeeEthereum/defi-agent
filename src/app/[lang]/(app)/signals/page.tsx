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
import { MISSING } from "@/lib/format";
import { useFormat, useT } from "@/i18n/client";
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
  const f = useFormat();
  if (value === null) return <span className="glp flat">{MISSING}</span>;
  const cls = value > 0 ? "pos" : value < 0 ? "neg" : "flat";
  return <span className={`glp ${cls}`}>{f.percent(value, { sign: true, decimals: Math.abs(value) >= 100 ? 0 : 1 })}</span>;
}

function ChainSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const t = useT("signals");
  return (
    <div className="select select--chip">
      <label htmlFor={id} className="sr-only">
        {t("chain")}
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

// Why a list is missing: the server's own words, or one of our messages
// (a key of "signals.errors", put in words when shown).
type Failure = { message: string } | { key: "loadSignals" | "loadLeaderboard" | "unreachable" };

// A list from the API, or the reason there is none.
type Loaded<T> = { list: T[] } | { error: Failure };

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
    if (!data.success) return { error: data.error ? { message: data.error } : { key: "loadSignals" } };
    const raw = data.data;
    const list: SignalItem[] = Array.isArray(raw)
      ? raw
      : raw?.signals ?? raw?.results ?? raw?.data ?? (raw ? [raw] : []);
    return { list };
  } catch {
    return { error: { key: "unreachable" } };
  }
}

function SignalsTab() {
  const t = useT("signals");
  const f = useFormat();
  const [chain, setChain] = useState(DEFAULT_CHAIN);
  const [walletType, setWalletType] = useState(DEFAULT_WALLET_TYPE);
  // True from the start: the default view is on its way (effect below).
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [error, setError] = useState<Failure | null>(null);
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
      title={t("signalsTitle")}
      sub={t("signalsSub")}
      action={
        <div className="filter-bar">
          <ChainSelect id="signals-chain" value={chain} onChange={setChain} />
          <Segmented
            id="sig-type"
            label={t("walletType")}
            value={walletType || "all"}
            onChange={(v) => setWalletType(v === "all" ? "" : v)}
            options={[
              { value: "all", label: t("filterAll") },
              { value: "1", label: t("filterSmartMoney") },
              { value: "2", label: t("filterInfluencers") },
              { value: "3", label: t("filterWhales") },
            ]}
          />
          <button type="button" className="btn btn--sm btn--primary" onClick={handleFetch} disabled={loading}>
            {loading ? <span className="spin" aria-hidden="true" /> : <LineIcon name="refresh" size={15} />}
            {fetched ? t("refresh") : t("showSignals")}
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
            <span>{"message" in error ? error.message : t(`errors.${error.key}`)}</span>
          </p>
        </div>
      ) : !fetched ? (
        <Empty icon="signal" title={t("signalsIdleTitle")} text={t("signalsIdleText")} />
      ) : signals.length === 0 ? (
        <Empty icon="signal" title={t("noSignalsTitle")} text={t("noSignalsText")} />
      ) : (
        <ul className="rows wal-pad sig-rows">
          {signals.slice(0, 20).map((s, i) => {
            const r = signalRow(s, t);

            return (
              <li key={`${r.address}-${i}`}>
                <div className="row sig-row">
                  <TokenIcon symbol={r.token.symbol} size={36} chainIndex={r.chainIndex} logoUrl={r.logo} />
                  <div style={{ minWidth: 0 }}>
                    <div className="t trunc">
                      {r.title} {r.subtitle && <span className="muted sig-name">{r.subtitle}</span>}
                    </div>
                    <div className="sub sig-sub">
                      {r.walletTypes.map((w) => (
                        <span key={w} className="tag">
                          {w}
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
                    <span className="num">{r.wallets !== null && r.wallets > 0 ? f.number(r.wallets) : MISSING}</span>
                    <span className="sub">{t("wallets")}</span>
                  </div>
                  <div className="sig-col">
                    <span className="num">{r.boughtUsd !== null && r.boughtUsd > 0 ? f.compactUsd(r.boughtUsd) : MISSING}</span>
                    <span className="sub">{t("bought")}</span>
                  </div>
                  <div className="sig-col">
                    <span className="num">{r.marketCapUsd !== null && r.marketCapUsd > 0 ? f.compactUsd(r.marketCapUsd) : MISSING}</span>
                    <span className="sub">{t("marketCap")}</span>
                  </div>
                  <div className="end">
                    <div className="num">{r.price !== null && r.price > 0 ? f.price(r.price) : MISSING}</div>
                    {r.soldPercent !== null && (
                      <span
                        className={`num sold${r.soldPercent > 80 ? " text-loss-ink" : " muted"}`}
                        title={t("soldHint")}
                      >
                        {t("sold", { percent: f.percent(r.soldPercent, { decimals: 0 }) })}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="sig-foot">{t("disclaimer")}</p>
    </Panel>
  );
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

// Labels are keys of "signals.periods" and "signals.sorts".
const TIME_FRAMES = [
  { value: "1", label: "d1" },
  { value: "2", label: "d3" },
  { value: "3", label: "d7" },
  { value: "4", label: "m1" },
  { value: "5", label: "m3" },
] as const;

// Plain words: "PnL" and "ROI" mean nothing to most people.
const SORTS = [
  { value: "1", label: "profit" },
  { value: "2", label: "winRate" },
  { value: "3", label: "trades" },
  { value: "4", label: "volume" },
  { value: "5", label: "return" },
] as const;

async function requestLeaderboard(chain: string, timeFrame: string, sortBy: string): Promise<Loaded<LeaderboardEntry>> {
  try {
    const params = new URLSearchParams({ chain, timeFrame, sortBy });
    const res = await fetch(`/api/leaderboard?${params.toString()}`);
    const data = await res.json();
    if (!data.success) return { error: data.error ? { message: data.error } : { key: "loadLeaderboard" } };
    const raw = data.data;
    const list: LeaderboardEntry[] = Array.isArray(raw)
      ? raw
      : raw?.leaderboard ?? raw?.results ?? raw?.data ?? (raw ? [raw] : []);
    return { list };
  } catch {
    return { error: { key: "unreachable" } };
  }
}

function LeaderboardTab() {
  const t = useT("signals");
  const f = useFormat();
  const [chain, setChain] = useState(DEFAULT_CHAIN);
  const [timeFrame, setTimeFrame] = useState(DEFAULT_TIME_FRAME);
  const [sortBy, setSortBy] = useState(DEFAULT_SORT);
  // True from the start: the default ranking is on its way (effect below).
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState<Failure | null>(null);
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
      title={t("leaderTitle")}
      sub={t("leaderSub")}
      action={
        <div className="filter-bar">
          <ChainSelect id="leaderboard-chain" value={chain} onChange={setChain} />
          <Segmented
            id="lb-time"
            label={t("period")}
            value={timeFrame}
            onChange={setTimeFrame}
            options={TIME_FRAMES.map((o) => ({ value: o.value, label: t(`periods.${o.label}`) }))}
          />
          <div className="select select--chip">
            <label htmlFor="lb-sort" className="sr-only">
              {t("sortBy")}
            </label>
            <select id="lb-sort" className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {SORTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(`sorts.${o.label}`)}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn btn--sm btn--primary" onClick={handleFetch} disabled={loading}>
            {loading ? <span className="spin" aria-hidden="true" /> : <LineIcon name="refresh" size={15} />}
            {fetched ? t("refresh") : t("showRanking")}
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
            <span>{"message" in error ? error.message : t(`errors.${error.key}`)}</span>
          </p>
        </div>
      ) : !fetched ? (
        <Empty icon="bar-chart" title={t("leaderIdleTitle")} text={t("leaderIdleText")} />
      ) : entries.length === 0 ? (
        <Empty icon="bar-chart" title={t("noRankingTitle")} text={t("noRankingText")} />
      ) : (
        <ol className="rows wal-pad lb-rows">
          {entries.slice(0, 20).map((e, i) => {
            const r = leaderRow(e, t);
            const trades = tradesLabel(r.trades, t, f);

            return (
              <li key={`${r.address}-${i}`}>
                <div className="row lb-row">
                  <span className={`rank num${i < 3 ? " top" : ""}`}>{i + 1}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="t num" title={r.address || undefined}>
                      {r.address ? abbreviate(r.address) : t("unknownWallet")}
                    </div>
                    <div className="sub">
                      {r.walletTypes.map((w) => (
                        <span key={w} className="tag">
                          {w}
                        </span>
                      ))}
                      {trades && <span>{trades}</span>}
                    </div>
                  </div>
                  <div className="sig-col">
                    <span className="num">{r.winRatePercent !== null ? f.percent(r.winRatePercent, { decimals: 0 }) : MISSING}</span>
                    <span className="sub">{t("winRate")}</span>
                  </div>
                  <div className="sig-col">
                    <span className="num">{r.volumeUsd !== null && r.volumeUsd > 0 ? f.compactUsd(r.volumeUsd) : MISSING}</span>
                    <span className="sub">{t("volume")}</span>
                  </div>
                  <div className="end">
                    <div className={`num ${r.pnlUsd !== null ? (r.pnlUsd >= 0 ? "text-gain-ink" : "text-loss-ink") : ""}`}>
                      {f.usd(r.pnlUsd, { sign: true })}
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
  const t = useT("signals");
  const [tab, setTab] = useState<"signals" | "leaderboard">("signals");

  return (
    <div className="page">
      <PageHead title={t("title")} lede={t("lede")} />
      <PillTabs
        id="intel-tabs"
        label={t("views")}
        value={tab}
        onChange={setTab}
        options={[
          { value: "signals", label: t("tabSignals") },
          { value: "leaderboard", label: t("tabLeaderboard") },
        ]}
      />
      {tab === "signals" ? <SignalsTab /> : <LeaderboardTab />}
    </div>
  );
}
