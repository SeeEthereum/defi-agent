"use client";

/**
 * Dashboard: one figure (total value), one strip of facts, two lists.
 * Navigation lives in the island, so this page no longer repeats it as cards.
 * An empty wallet gets three first steps instead of the facts and holdings.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useAllChainBalances } from "@/hooks/use-balances";
import { useFluidMarkets } from "@/hooks/use-fluid-markets";
import { CHAINS } from "@/lib/chains";
import { CHAIN_COLORS } from "@/lib/chain-colors";
import { formatAmount, formatPercent, formatUsd } from "@/lib/format";
import { chainName, displayToken } from "@/lib/tokens/display";
import { isNativeUnderlying } from "@/lib/fluid/constants";
import { TokenIcon } from "@/components/token-icon";
import { BrandMark } from "@/components/brand-mark";
import { LineIcon } from "@/components/line-icon";
import { CountUp, Empty, Metric, Panel, Skeleton } from "@/components/premium";
import { ValueChart } from "@/components/portfolio/value-chart";


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

/** A number from the API, or 0 when it is missing or broken (never NaN in a sum). */
function num(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

/** Fluid lends the wrapped coin, but deposits and withdrawals use the chain's own: show ETH / POL, not WETH / WPOL. */
function fluidAsset(m: { chainIndex: number; symbol: string; underlyingSymbol: string }) {
  return displayToken({ symbol: m.underlyingSymbol, chainIndex: m.chainIndex, isNative: isNativeUnderlying(m.chainIndex, m.symbol) });
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** OKX names accounts "Account 1", "Account 2"…: a cold default, so the greeting goes without it. */
function friendlyName(name: string | null): string | null {
  const n = name?.trim();
  return n && !/^Account \d+$/.test(n) ? n : null;
}

/**
 * Allocation colours: each chain's own, except Optimism's red, which next to
 * money reads as a loss. Chain colours stay as they are everywhere else.
 */
const ALLOC_COLORS: Record<number, string> = { ...CHAIN_COLORS, 10: "var(--muted-foreground)" };

const NETWORK_NAMES = Object.values(CHAINS).map((c) => c.name);

// Two of the assistant's own suggestions, so the same words wait on its first screen.
const FIRST_QUESTIONS = ["Show my portfolio balance", "What are the best Fluid APRs right now?"];

/** First visit with nothing in the wallet: the address, how to fund it, what to ask. */
function FirstSteps({ address }: { address: string | null }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Copy blocked by the browser. Select the address instead.");
    }
  };

  return (
    <Panel index={1} title="Add funds to start" sub="Your wallet is ready and empty. Three steps to your first&nbsp;request.">
      <ol className="first-steps">
        <li>
          <span className="n num" aria-hidden="true">
            1
          </span>
          <div>
            <h3>Copy your address</h3>
            <p>One address for every network listed below.</p>
            {address ? (
              <div className="first-addr">
                <code className="num">{address}</code>
                <div className="page-actions">
                  <button type="button" className="btn btn--sm btn--primary" onClick={copy}>
                    <LineIcon name={copied ? "check" : "copy"} size={15} />
                    {copied ? "Copied" : "Copy address"}
                  </button>
                  <Link href="/wallet?tab=receive" className="btn btn--sm">
                    QR code
                  </Link>
                </div>
              </div>
            ) : (
              <div className="first-addr">
                <Skeleton height={44} />
              </div>
            )}
          </div>
        </li>
        <li>
          <span className="n num" aria-hidden="true">
            2
          </span>
          <div>
            <h3>Send crypto to it</h3>
            <p>On an exchange or another wallet, choose Withdraw or Send, paste the address and pick one of these networks:</p>
            <ul className="first-nets" aria-label="Supported networks">
              {NETWORK_NAMES.map((n) => (
                <li key={n} className="chip">
                  {n}
                </li>
              ))}
            </ul>
            <p className="muted">Funds sent on another network may not reach this&nbsp;wallet.</p>
          </div>
        </li>
        <li>
          <span className="n num" aria-hidden="true">
            3
          </span>
          <div>
            <h3>Ask the assistant</h3>
            <p>Once the funds arrive, ask in plain words. For example:</p>
            <ul className="first-asks">
              {FIRST_QUESTIONS.map((q) => (
                <li key={q}>
                  <Link href="/ai">
                    <span>&ldquo;{q}&rdquo;</span>
                    <LineIcon name="arrow-up-right" size={15} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </li>
      </ol>
    </Panel>
  );
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

  const totalUsd = Object.values(balancesByChain).reduce((sum, b) => sum + num(b.totalValueUsd), 0);

  const tokens: Array<{ symbol: string; balance: number; usdValue: number; chainIndex: number; chainName: string }> = [];
  for (const chain of Object.values(CHAINS)) {
    const bal = balancesByChain[chain.chainIndex];
    if (!bal) continue;
    for (const t of bal.tokens) {
      const balance = num(t.balance);
      const price = num(t.tokenPrice);
      // OKX's machine symbols (ARB_ETH, USD₮0) as people know them: ETH, USDT.
      const shown = displayToken({ ...t, chainIndex: chain.chainIndex });
      if (balance > 0) tokens.push({ symbol: shown.symbol, balance, usdValue: balance * price, chainIndex: chain.chainIndex, chainName: chain.name });
    }
  }
  const holdings = [...tokens].sort((a, b) => b.usdValue - a.usdValue).slice(0, 6);

  const allocation = Object.values(CHAINS)
    .map((c) => ({ name: c.name, chainIndex: c.chainIndex, value: num(balancesByChain[c.chainIndex]?.totalValueUsd) }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);

  // Nothing of value, and every chain answered: a first visit, not a failed load.
  const balancesFailed = Object.values(balancesByChain).some((b) => b.error);
  const isEmpty = !balLoading && !balancesFailed && totalUsd < 0.01;
  const name = friendlyName(accountName);

  const topMarkets = [...markets].sort((a, b) => b.totalAprPercent - a.totalAprPercent).slice(0, 5);
  const bestApy = topMarkets[0]?.totalAprPercent ?? null;
  const hasTrades = pnl != null && (num(pnl.totalTrades) > 0 || num(pnl.totalPnl) !== 0);
  const bestAsset = topMarkets[0] ? fluidAsset(topMarkets[0]) : null;

  return (
    <div className="page">
      {/* ───────── Total value ───────── */}
      <section className="bezel in" style={{ borderRadius: 34 }} aria-labelledby="total-label">
        <div className="core" style={{ borderRadius: 28, padding: "clamp(24px, 3.6vw, 48px)" }}>
          <div className="dash-hero">
            <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
              <p id="total-label" className="page-lede" style={{ fontSize: 16 }}>
                {greeting()}
                {name ? `, ${name}` : ""}. Total value
              </p>
              <p className="hero-figure" aria-live="polite">
                {balLoading ? (
                  // Same text, same box: the figure takes its final size before the number arrives.
                  <span className="skel skel-text" aria-label="Loading">
                    {formatUsd(0)}
                  </span>
                ) : (
                  // While counting up from 0, skip the "< $0.01" crumb a real total never shows.
                  <CountUp value={totalUsd} format={(n) => formatUsd(n < 0.01 && totalUsd >= 0.01 ? 0 : n)} />
                )}
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

            {balLoading && (
              <div className="alloc" aria-hidden="true">
                <Skeleton height={10} />
                <div style={{ display: "grid", gap: 8 }}>
                  <Skeleton height={25} />
                  <Skeleton height={25} />
                </div>
              </div>
            )}
            {!balLoading && totalUsd > 0 && (
              <div className="alloc" aria-label="Value by chain">
                <div className="alloc-bar" aria-hidden="true">
                  {allocation.map((c) => (
                    <span key={c.chainIndex} style={{ flexGrow: Math.max(c.value / totalUsd, 0.015), background: ALLOC_COLORS[c.chainIndex] }} />
                  ))}
                </div>
                <ul className="alloc-legend">
                  {allocation.map((c) => (
                    <li key={c.chainIndex}>
                      <span className="sw" style={{ background: ALLOC_COLORS[c.chainIndex] }} aria-hidden="true" />
                      <span>{c.name}</span>
                      <span className="num">{formatUsd(c.value)}</span>
                      <span className="num muted">{formatPercent((c.value / totalUsd) * 100, { decimals: 1 })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      {isEmpty && <FirstSteps address={walletAddress} />}

      {/* ───────── Value over time ───────── */}
      {!isEmpty && <ValueChart index={1} />}

      {/* ───────── Facts ───────── */}
      {!isEmpty && (
        <div className="metrics in" style={{ "--i": 1 } as React.CSSProperties}>
          <Metric label="Chains with funds" value={balLoading ? "…" : allocation.length} sub={`of ${Object.keys(CHAINS).length} supported`} />
          <Metric label="Assets held" value={balLoading ? "…" : tokens.length} sub="across all chains" />
          <Metric
            label="Best Fluid yield"
            value={marketsLoading ? "…" : bestApy != null ? formatPercent(bestApy) : "n/a"}
            sub={topMarkets[0] && bestAsset ? `${bestAsset.symbol} on ${chainName(topMarkets[0].chainIndex) ?? topMarkets[0].chainName}` : undefined}
          />
          <Metric
            label="Trading PnL"
            value={pnl == null ? "…" : hasTrades ? <span className={num(pnl.totalPnl) >= 0 ? "text-gain-ink" : "text-loss-ink"}>{formatUsd(pnl.totalPnl, { sign: true })}</span> : "n/a"}
            sub={pnl == null ? undefined : hasTrades ? `${num(pnl.totalTrades)} trades, ${formatPercent(num(pnl.winRate) * 100, { decimals: 1 })} won` : "No trades yet"}
          />
        </div>
      )}

      {/* ───────── Lists ───────── */}
      <div className="bento">
        {!isEmpty && (
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
                  <Skeleton key={i} height={60} />
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
                      <TokenIcon symbol={t.symbol} size={36} chainIndex={t.chainIndex} />
                      <div style={{ minWidth: 0 }}>
                        <div className="t">{t.symbol}</div>
                        <div className="sub">{t.chainName}</div>
                      </div>
                      <div className="end">
                        <div className="num" style={{ fontSize: 15 }}>
                          {formatUsd(t.usdValue)}
                        </div>
                        <div className="sub num">
                          {formatAmount(t.balance)} {t.symbol}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        <Panel
          className={isEmpty ? "span-12" : "span-5"}
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
              {topMarkets.map((m) => {
                const asset = fluidAsset(m);
                return (
                  <li key={`${m.chainIndex}-${m.fTokenAddress}`}>
                    <Link className="row" href="/earn">
                      <TokenIcon symbol={asset.symbol} size={36} chainIndex={m.chainIndex} />
                      <div style={{ minWidth: 0 }}>
                        <div className="t">{asset.symbol}</div>
                        <div className="sub">{asset.chainName ?? m.chainName}</div>
                      </div>
                      <span className="glp apr">{formatPercent(m.totalAprPercent)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {hasTrades && pnl && (
          <Panel className="span-12" index={4} title="Trading performance" sub="DEX trades on Ethereum, Base and BNB Chain">
            <div className="metrics">
              <Metric label="Total PnL" value={<span className={num(pnl.totalPnl) >= 0 ? "text-gain-ink" : "text-loss-ink"}>{formatUsd(pnl.totalPnl, { sign: true })}</span>} />
              <Metric label="Realized" value={formatUsd(pnl.realizedPnl, { sign: true })} />
              <Metric label="Unrealized" value={formatUsd(pnl.unrealizedPnl, { sign: true })} />
              <Metric label="Win rate" value={formatPercent(num(pnl.winRate) * 100, { decimals: 1 })} sub={`${num(pnl.totalTrades)} trades`} />
              <Metric label="Buy volume" value={formatUsd(pnl.buyVolume)} sub={`${num(pnl.tokenCount)} tokens traded`} />
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
