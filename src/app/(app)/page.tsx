"use client";

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

export default function DashboardPage() {
  const { authenticated, accountName, isLoading: authLoading } = useAuth();
  const { balancesByChain, isLoading: balLoading } = useAllChainBalances();
  const { markets, isLoading: marketsLoading } = useFluidMarkets();

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
        <div className="h-16 w-16 rounded-3xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
          </svg>
        </div>
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

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"},{" "}
          {accountName || "there"}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Here&apos;s your portfolio overview
        </p>
      </div>

      {/* Portfolio Value */}
      <Card className="overflow-hidden">
        <div className="gradient-bg px-6 py-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-1">
            Total Portfolio Value
          </p>
          <p className="text-3xl font-semibold tracking-tight">
            {balLoading ? "..." : formatUsd(String(totalUsd.toFixed(2)))}
          </p>
          <div className="flex items-center gap-4 mt-3">
            {Object.values(CHAINS).map((chain) => {
              const bal = balancesByChain[chain.chainIndex];
              const val = parseFloat(bal?.totalValueUsd || "0");
              return (
                <div key={chain.chainIndex} className="text-xs">
                  <span className="text-muted-foreground">{chain.name}</span>
                  <span className="ml-1 font-medium">{formatUsd(String(val.toFixed(2)))}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: "/wallet", label: "Wallet", desc: "View balances & send", icon: "wallet" },
          { href: "/earn", label: "Earn", desc: "Supply on Fluid", icon: "trending-up" },
          { href: "/swap", label: "Swap", desc: "Trade tokens", icon: "repeat" },
          { href: "/ai", label: "AI Assistant", desc: "Get suggestions", icon: "sparkles" },
        ].map((action) => (
          <Link key={action.href} href={action.href}>
            <Card className="hover-lift cursor-pointer h-full">
              <CardContent className="pt-5 pb-4">
                <div className="h-9 w-9 rounded-xl bg-primary/8 flex items-center justify-center mb-3">
                  <ActionIcon name={action.icon} />
                </div>
                <p className="text-sm font-medium">{action.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{action.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Top Markets */}
      {!marketsLoading && markets.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Top Fluid Markets</h2>
            <Link href="/earn" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {[...markets].sort((a, b) => b.totalAprPercent - a.totalAprPercent).slice(0, 4).map((m) => (
              <Card key={`${m.chainIndex}-${m.fTokenAddress}`} className="hover-lift">
                <CardContent className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <TokenIcon symbol={m.underlyingSymbol} size={32} />
                    <div>
                      <p className="text-sm font-medium">{m.underlyingSymbol}</p>
                      <p className="text-[11px] text-muted-foreground">{m.chainName}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs font-semibold text-emerald-600 bg-emerald-50">
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
  const props = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: "text-primary" };
  switch (name) {
    case "wallet":
      return <svg {...props}><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>;
    case "trending-up":
      return <svg {...props}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>;
    case "repeat":
      return <svg {...props}><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>;
    case "sparkles":
      return <svg {...props}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /></svg>;
    default:
      return null;
  }
}
