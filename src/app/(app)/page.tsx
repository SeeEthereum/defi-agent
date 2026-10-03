"use client";

/**
 * Dashboard: one figure (total value), one strip of facts, two lists.
 * Navigation lives in the island, so this page no longer repeats it as cards.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { useAllChainBalances } from "@/hooks/use-balances";
import { useFluidMarkets } from "@/hooks/use-fluid-markets";
import { CHAINS } from "@/lib/chains";
import { CHAIN_COLORS } from "@/lib/chain-colors";
import { formatUsd } from "@/lib/utils";
import { TokenIcon } from "@/components/token-icon";
import { BrandMark } from "@/components/brand-mark";
import { LineIcon } from "@/components/line-icon";
import { CountUp, Empty, Metric, Panel, Skeleton } from "@/components/premium";


interface PnlOverview {
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  buyVolume: number;
  sellVolume: number;
  buyCount: number;
  sellCount: number;
  tokenCount: number;
  winRate: number;
  totalTrades: number;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signedUsd = (n: number) => `${n >= 0 ? "+" : "−"}${usd.format(Math.abs(n))}`;

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const { authenticated, accountName, walletAddress, isLoading: authLoading } = useAuth();
  const { balancesByChain, isLoading: balLoading } = useAllChainBalances();
  const { markets, isLoading: marketsLoading } = useFluidMarkets();
  const [pnl, setPnl] = useState<PnlOverview | null>(null);

  // Portfolio PnL. setState only in async callbacks (React 19 lint).
  useEffect(() => {
    if (!authenticated || !walletAddress) return;
    let cancelled = false;
    fetch(`/api/portfolio/pnl?address=${walletAddress}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.success) setPnl(data.data.overview);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authenticated, walletAddress]);

  if (authLoading) {
    return (
      <div className="page" aria-busy="true">
        <Skeleton height={56} width="40%" />
        <Skeleton height={260} />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="page" style={{ alignItems: "center", textAlign: "center", paddingBlock: "12vh" }}>
        <BrandMark size={40} />
        <h1 className="page-title" style={{ fontSize: "clamp(32px, 4vw, 48px)" }}>
          Welcome to albicocca
        </h1>
        <p className="page-lede">Connect your wallet to start managing your&nbsp;portfolio.</p>
        <Link href="/auth" className="btn btn--primary btn--well">
          Sign in
          <span className="well" aria-hidden="true">
            <LineIcon name="arrow-up-right" size={16} />
          </span>
        </Link>
      </div>
    );
  }

  const totalUsd = Object.values(balancesByChain).reduce((sum, b) => sum + parseFloat(b.totalValueUsd || "0"), 0);

  const tokens: Array<{ symbol: string; balance: number; usdValue: number; chainIndex: number; chainName: string }> = [];
  for (const chain of Object.values(CHAINS)) {
    const bal = balancesByChain[chain.chainIndex];
    if (!bal) continue;
    for (const t of bal.tokens) {
      const balance = parseFloat(t.balance || "0");
      const price = parseFloat(t.tokenPrice || "0");
      if (balance > 0) tokens.push({ symbol: t.symbol, balance, usdValue: balance * price, chainIndex: chain.chainIndex, chainName: chain.name });
    }
  }
  const holdings = [...tokens].sort((a, b) => b.usdValue - a.usdValue).slice(0, 6);

  const allocation = Object.values(CHAINS)
    .map((c) => ({ name: c.name, chainIndex: c.chainIndex, value: parseFloat(balancesByChain[c.chainIndex]?.totalValueUsd || "0") }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);

  const topMarkets = [...markets].sort((a, b) => b.totalAprPercent - a.totalAprPercent).slice(0, 5);
  const bestApy = topMarkets[0]?.totalAprPercent ?? null;
  const hasTrades = pnl != null && (pnl.totalTrades > 0 || pnl.totalPnl !== 0);

  return (
    <div className="page">
      {/* ───────── Total value ───────── */}
      <section className="bezel in" style={{ borderRadius: 34 }} aria-labelledby="total-label">
        <div className="core" style={{ borderRadius: 28, padding: "clamp(24px, 3.6vw, 48px)" }}>
          <div className="dash-hero">
            <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
              <p id="total-label" className="page-lede" style={{ fontSize: 16 }}>
                {greeting()}, {accountName || "trader"}. Total value
              </p>
              <p className="hero-figure" aria-live="polite">
                {balLoading ? <Skeleton height={88} width={320} /> : <CountUp value={totalUsd} format={(n) => usd.format(n)} />}
              </p>
              <div className="page-actions" style={{ marginTop: 6 }}>
                <Link href="/ai" className="btn btn--primary btn--well">
                  Ask the assistant
                  <span className="well" aria-hidden="true">
                    <LineIcon name="arrow-up-right" size={16} />
                  </span>
                </Link>
                <Link href="/wallet?tab=receive" className="btn">
                  Add funds
                </Link>
              </div>
            </div>

            {!balLoading && totalUsd > 0 && (
              <div className="alloc" aria-label="Value by chain">
                <div className="alloc-bar" aria-hidden="true">
                  {allocation.map((c) => (
                    <span key={c.chainIndex} style={{ flexGrow: Math.max(c.value / totalUsd, 0.015), background: CHAIN_COLORS[c.chainIndex] }} />
                  ))}
                </div>
                <ul className="alloc-legend">
                  {allocation.map((c) => (
                    <li key={c.chainIndex}>
                      <span className="sw" style={{ background: CHAIN_COLORS[c.chainIndex] }} aria-hidden="true" />
                      <span>{c.name}</span>
                      <span className="num">{usd.format(c.value)}</span>
                      <span className="num muted">{((c.value / totalUsd) * 100).toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ───────── Facts ───────── */}
      <div className="metrics in" style={{ "--i": 1 } as React.CSSProperties}>
        <Metric label="Chains with funds" value={balLoading ? "…" : allocation.length} sub={`of ${Object.keys(CHAINS).length} supported`} />
        <Metric label="Assets held" value={balLoading ? "…" : tokens.length} sub="across all chains" />
        <Metric
          label="Best Fluid yield"
          value={marketsLoading ? "…" : bestApy != null ? `${bestApy.toFixed(2)}%` : "n/a"}
          sub={topMarkets[0] ? `${topMarkets[0].underlyingSymbol} on ${topMarkets[0].chainName}` : undefined}
        />
        <Metric
          label="Trading PnL"
          value={pnl == null ? "…" : hasTrades ? <span className={pnl.totalPnl >= 0 ? "text-gain-ink" : "text-loss-ink"}>{signedUsd(pnl.totalPnl)}</span> : "n/a"}
          sub={pnl == null ? undefined : hasTrades ? `${pnl.totalTrades} trades, ${(pnl.winRate * 100).toFixed(1)}% won` : "No DEX trades yet on Ethereum, Base or BNB Chain"}
        />
      </div>

      {/* ───────── Lists ───────── */}
      <div className="bento">
        <Panel
          className="span-7"
          index={2}
          title="Holdings"
          sub="Largest positions by value"
          action={
            <Link href="/wallet" className="chip">
              All balances <LineIcon name="arrow-up-right" size={13} />
            </Link>
          }
        >
          {balLoading ? (
            <div style={{ display: "grid", gap: 12 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={44} />
              ))}
            </div>
          ) : holdings.length === 0 ? (
            <Empty
              icon="wallet"
              title="Nothing here yet"
              text="Send crypto to your address on any supported chain, then ask the assistant what to do with it."
              action={
                <Link href="/wallet?tab=receive" className="btn btn--sm">
                  Show my address
                </Link>
              }
            />
          ) : (
            <ul className="rows">
              {holdings.map((t, i) => (
                <li key={`${t.chainIndex}-${t.symbol}-${i}`}>
                  <div className="row">
                    <TokenIcon symbol={t.symbol} size={36} />
                    <div style={{ minWidth: 0 }}>
                      <div className="t">{t.symbol}</div>
                      <div className="sub">{t.chainName}</div>
                    </div>
                    <div className="end">
                      <div className="num" style={{ fontSize: 15 }}>
                        {usd.format(t.usdValue)}
                      </div>
                      <div className="sub num">{t.balance.toLocaleString("en-US", { maximumFractionDigits: 6 })}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          className="span-5"
          index={3}
          title="Earn on Fluid"
          sub="Highest supply yields right now"
          action={
            <Link href="/earn" className="chip">
              All markets <LineIcon name="arrow-up-right" size={13} />
            </Link>
          }
        >
          {marketsLoading ? (
            <div style={{ display: "grid", gap: 12 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={44} />
              ))}
            </div>
          ) : topMarkets.length === 0 ? (
            <Empty icon="trending-up" title="Markets unavailable" text="Fluid markets could not be loaded. Try again in a moment." />
          ) : (
            <ul className="rows">
              {topMarkets.map((m) => (
                <li key={`${m.chainIndex}-${m.fTokenAddress}`}>
                  <Link className="row" href="/earn">
                    <TokenIcon symbol={m.underlyingSymbol} size={36} />
                    <div style={{ minWidth: 0 }}>
                      <div className="t">{m.underlyingSymbol}</div>
                      <div className="sub">{m.chainName}</div>
                    </div>
                    <span className="glp pos">{m.totalAprPercent.toFixed(2)}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {hasTrades && pnl && (
          <Panel className="span-12" index={4} title="Trading performance" sub="DEX trades on Ethereum, Base and BNB Chain">
            <div className="metrics">
              <Metric label="Total PnL" value={<span className={pnl.totalPnl >= 0 ? "text-gain-ink" : "text-loss-ink"}>{signedUsd(pnl.totalPnl)}</span>} />
              <Metric label="Realized" value={signedUsd(pnl.realizedPnl)} />
              <Metric label="Unrealized" value={signedUsd(pnl.unrealizedPnl)} />
              <Metric label="Win rate" value={`${(pnl.winRate * 100).toFixed(1)}%`} sub={`${pnl.totalTrades} trades`} />
              <Metric label="Buy volume" value={formatUsd(pnl.buyVolume)} sub={`${pnl.tokenCount} tokens traded`} />
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
