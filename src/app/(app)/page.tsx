"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAllChainBalances } from "@/hooks/use-balances";
import { useFluidMarkets } from "@/hooks/use-fluid-markets";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CHAINS } from "@/lib/chains";
import { formatUsd } from "@/lib/utils";
import Link from "next/link";
import { TokenIcon } from "@/components/token-icon";

const CHAIN_COLORS: Record<number, string> = {
  1: "#627EEA",     // Ethereum
  42161: "#28A0F0",  // Arbitrum
  8453: "#0052FF",   // Base
  56: "#F0B90B",     // BNB
  137: "#8247E5",    // Polygon
  10: "#FF0420",     // Optimism
};

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

export default function DashboardPage() {
  const { authenticated, accountName, walletAddress, isLoading: authLoading } = useAuth();
  const { balancesByChain, isLoading: balLoading } = useAllChainBalances();
  const { markets, isLoading: marketsLoading } = useFluidMarkets();

  const [pnl, setPnl] = useState<PnlOverview | null>(null);
  const [pnlLoading, setPnlLoading] = useState(false);

  // Fetch Portfolio PnL
  useEffect(() => {
    if (!authenticated || !walletAddress) return;
    setPnlLoading(true);
    fetch(`/api/portfolio/pnl?address=${walletAddress}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setPnl(data.data.overview);
      })
      .catch(() => {})
      .finally(() => setPnlLoading(false));
  }, [authenticated, walletAddress]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="DeFi Agent" width={64} height={64} className="rounded-2xl shadow-lg" />
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome to DeFi Agent</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Connect your wallet to start managing your portfolio
          </p>
        </div>
        <Link href="/auth">
          <Button className="rounded-full px-8 h-10 text-sm font-medium shadow-sm">
            Connect Wallet
          </Button>
        </Link>
      </div>
    );
  }

  // Calculate total portfolio value
  const totalUsd = Object.values(balancesByChain).reduce(
    (sum, b) => sum + parseFloat(b.totalValueUsd || "0"),
    0
  );

  // Aggregate all tokens across chains for top holdings
  const allTokens: Array<{
    symbol: string;
    balance: number;
    usdValue: number;
    chainIndex: number;
    chainName: string;
  }> = [];

  for (const chain of Object.values(CHAINS)) {
    const bal = balancesByChain[chain.chainIndex];
    if (!bal) continue;
    for (const t of bal.tokens) {
      const balance = parseFloat(t.balance || "0");
      const price = parseFloat(t.tokenPrice || "0");
      allTokens.push({
        symbol: t.symbol,
        balance,
        usdValue: balance * price,
        chainIndex: chain.chainIndex,
        chainName: chain.name,
      });
    }
  }

  // Top holdings sorted by USD value
  const topHoldings = [...allTokens]
    .sort((a, b) => b.usdValue - a.usdValue)
    .slice(0, 8);

  // Chain allocation data
  const chainAlloc = Object.values(CHAINS)
    .map((c) => ({
      name: c.name,
      chainIndex: c.chainIndex,
      value: parseFloat(balancesByChain[c.chainIndex]?.totalValueUsd || "0"),
      color: CHAIN_COLORS[c.chainIndex] || "#8B5CF6",
    }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Good{" "}
          {new Date().getHours() < 12
            ? "morning"
            : new Date().getHours() < 18
              ? "afternoon"
              : "evening"}
          , {accountName || "there"}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Here&apos;s your portfolio overview
        </p>
      </div>

      {/* Portfolio Value Card */}
      <Card className="overflow-hidden">
        <div className="gradient-bg px-5 py-5 sm:px-6">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-1">
            Total Portfolio Value
          </p>
          <p className="text-3xl font-semibold tracking-tight">
            {balLoading ? "..." : formatUsd(String(totalUsd.toFixed(2)))}
          </p>
          {/* Chain allocation bar */}
          {!balLoading && totalUsd > 0 && (
            <div className="mt-4">
              <div className="flex h-2.5 rounded-full overflow-hidden bg-muted/40">
                {chainAlloc.map((c) => (
                  <div
                    key={c.chainIndex}
                    className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                    style={{
                      width: `${Math.max((c.value / totalUsd) * 100, 1)}%`,
                      backgroundColor: c.color,
                    }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
                {chainAlloc.map((c) => (
                  <div key={c.chainIndex} className="flex items-center gap-1.5">
                    <div
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: c.color }}
                    />
                    <span className="text-[11px] text-muted-foreground">
                      {c.name}
                    </span>
                    <span className="text-[11px] font-medium">
                      {formatUsd(String(c.value.toFixed(2)))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Portfolio PnL */}
      {!pnlLoading && pnl && (pnl.totalTrades > 0 || pnl.totalPnl !== 0) && (
        <Card>
          <CardContent className="pt-4 pb-4 sm:pt-5 sm:pb-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500/10 to-violet-500/10 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                  <polyline points="16 7 22 7 22 13" />
                </svg>
              </div>
              <h2 className="text-sm font-semibold">Trading Performance</h2>
              <Badge variant="outline" className="ml-auto text-[10px] border-muted-foreground/20 text-muted-foreground">
                DEX PnL
              </Badge>
            </div>

            {/* PnL Summary Row */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-xl bg-slate-50/80 p-3 text-center">
                <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1">Total PnL</p>
                <p className={`text-lg font-bold tabular-nums ${pnl.totalPnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {pnl.totalPnl >= 0 ? "+" : ""}{formatUsd(pnl.totalPnl.toFixed(2))}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50/80 p-3 text-center">
                <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1">Realized</p>
                <p className={`text-lg font-bold tabular-nums ${pnl.realizedPnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {pnl.realizedPnl >= 0 ? "+" : ""}{formatUsd(pnl.realizedPnl.toFixed(2))}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50/80 p-3 text-center">
                <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1">Unrealized</p>
                <p className={`text-lg font-bold tabular-nums ${pnl.unrealizedPnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {pnl.unrealizedPnl >= 0 ? "+" : ""}{formatUsd(pnl.unrealizedPnl.toFixed(2))}
                </p>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="flex items-center gap-2.5 rounded-xl border border-border/40 px-3 py-2.5">
                <div className="h-7 w-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <span className="text-xs">📊</span>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground/70">Win Rate</p>
                  <p className="text-sm font-semibold tabular-nums">{(pnl.winRate * 100).toFixed(1)}%</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl border border-border/40 px-3 py-2.5">
                <div className="h-7 w-7 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                  <span className="text-xs">🔄</span>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground/70">Total Trades</p>
                  <p className="text-sm font-semibold tabular-nums">{pnl.totalTrades}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl border border-border/40 px-3 py-2.5">
                <div className="h-7 w-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                  <span className="text-xs">💰</span>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground/70">Buy Volume</p>
                  <p className="text-sm font-semibold tabular-nums">{formatUsd(pnl.buyVolume.toFixed(0))}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl border border-border/40 px-3 py-2.5">
                <div className="h-7 w-7 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                  <span className="text-xs">🪙</span>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground/70">Tokens Traded</p>
                  <p className="text-sm font-semibold tabular-nums">{pnl.tokenCount}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        {[
          { href: "/wallet", label: "Wallet", desc: "Balances & send", icon: "wallet" },
          { href: "/earn", label: "Earn", desc: "Supply on Fluid", icon: "trending-up" },
          { href: "/swap", label: "Swap", desc: "Trade tokens", icon: "repeat" },
          { href: "/ai", label: "AI Assistant", desc: "Get suggestions", icon: "sparkles" },
          { href: "/security", label: "Security", desc: "Scan & approvals", icon: "shield" },
          { href: "/signals", label: "Intelligence", desc: "Smart money signals", icon: "signal" },
        ].map((action) => (
          <Link key={action.href} href={action.href}>
            <Card className="hover-lift cursor-pointer h-full">
              <CardContent className="pt-4 pb-3 sm:pt-5 sm:pb-4">
                <div className="h-9 w-9 rounded-xl bg-primary/8 flex items-center justify-center mb-2.5">
                  <ActionIcon name={action.icon} />
                </div>
                <p className="text-sm font-medium">{action.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{action.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Top Holdings */}
      {!balLoading && topHoldings.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Top Holdings</h2>
            <Link href="/wallet" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          <Card>
            <CardContent className="p-0 divide-y divide-border/50">
              {topHoldings.map((t, i) => (
                <div
                  key={`${t.chainIndex}-${t.symbol}-${i}`}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <TokenIcon symbol={t.symbol} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{t.symbol}</p>
                    <p className="text-[11px] text-muted-foreground">{t.chainName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums">
                      {t.balance.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                    </p>
                    {t.usdValue > 0 && (
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {formatUsd(String(t.usdValue.toFixed(2)))}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top Fluid Markets */}
      {!marketsLoading && markets.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Top Fluid Markets</h2>
            <Link href="/earn" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {[...markets]
              .sort((a, b) => b.totalAprPercent - a.totalAprPercent)
              .slice(0, 4)
              .map((m) => (
                <Card
                  key={`${m.chainIndex}-${m.fTokenAddress}`}
                  className="hover-lift"
                >
                  <CardContent className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <TokenIcon symbol={m.underlyingSymbol} size={32} />
                      <div>
                        <p className="text-sm font-medium">
                          {m.underlyingSymbol}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {m.chainName}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className="text-xs font-semibold text-emerald-600 bg-emerald-50"
                    >
                      {m.totalAprPercent.toFixed(2)}% APY
                    </Badge>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionIcon({ name }: { name: string }) {
  const props = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "text-primary",
  };
  switch (name) {
    case "wallet":
      return (
        <svg {...props}>
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
          <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
        </svg>
      );
    case "trending-up":
      return (
        <svg {...props}>
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      );
    case "repeat":
      return (
        <svg {...props}>
          <path d="m17 2 4 4-4 4" />
          <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
          <path d="m7 22-4-4 4-4" />
          <path d="M21 13v1a4 4 0 0 1-4 4H3" />
        </svg>
      );
    case "sparkles":
      return (
        <svg {...props}>
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
        </svg>
      );
    case "shield":
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "signal":
      return (
        <svg {...props}>
          <path d="M2 20h.01" />
          <path d="M7 20v-4" />
          <path d="M12 20v-8" />
          <path d="M17 20V8" />
          <path d="M22 4v16" />
        </svg>
      );
    default:
      return null;
  }
}
