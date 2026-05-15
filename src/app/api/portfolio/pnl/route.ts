import { NextRequest, NextResponse } from "next/server";
import { marketPortfolioOverview, marketPortfolioRecentPnl } from "@/lib/okx/cli";
import { memoTTL, cacheKey } from "@/lib/cache";

// PnL supported chains (from onchainos market portfolio-supported-chains)
const PNL_CHAINS = ["1", "8453", "56"]; // Ethereum, Base, BNB Chain

// `portfolio-overview` is Premium ($0.0005/req post-quota) AND we fan out to
// 3 chains + 1 recent-pnl per request = up to 4 premium calls per dashboard
// load. This is by far our most expensive route per request — caching here
// is the single biggest spend cut. Aggregate result is keyed by address.
// 60s matches the dashboard refresh cadence and bounds the worst-case
// per-user spend to 1 premium call/min/chain (instead of 4/load).
const PORTFOLIO_TTL_MS = 60_000;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    if (!address) {
      return NextResponse.json(
        { success: false, error: "Missing address parameter" },
        { status: 400 }
      );
    }

    const key = cacheKey(["portfolioPnl", address.toLowerCase()]);
    const payload = await memoTTL(key, PORTFOLIO_TTL_MS, () => computePnl(address));
    return NextResponse.json({ success: true, data: payload });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch portfolio PnL";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

async function computePnl(address: string) {
    // Fetch PnL overview for all supported chains in parallel
    const overviewResults = await Promise.allSettled(
      PNL_CHAINS.map(async (chainId) => {
        const result = await marketPortfolioOverview(chainId, address);
        return { chainId, data: result.data };
      })
    );

    // Aggregate PnL across chains
    let totalRealizedPnl = 0;
    let totalUnrealizedPnl = 0;
    let totalBuyVolume = 0;
    let totalSellVolume = 0;
    let totalBuyCount = 0;
    let totalSellCount = 0;
    let totalTokenCount = 0;
    let weightedWinRate = 0;
    let totalTrades = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chainBreakdown: Array<Record<string, any>> = [];

    for (const result of overviewResults) {
      if (result.status !== "fulfilled") continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = result.value.data as any;
      if (!data) continue;

      const realized = parseFloat(data.realizedPnlUsd || "0");
      const unrealized = parseFloat(data.unrealizedPnlUsd || "0");
      const buyVol = parseFloat(data.buyTxVolume || "0");
      const sellVol = parseFloat(data.sellTxVolume || "0");
      const buys = parseInt(data.buyTxCount || "0");
      const sells = parseInt(data.sellTxCount || "0");
      const tokens = parseInt(data.totalTokenCount || "0");
      const winRate = parseFloat(data.winRate || "0");
      const trades = buys + sells;

      totalRealizedPnl += realized;
      totalUnrealizedPnl += unrealized;
      totalBuyVolume += buyVol;
      totalSellVolume += sellVol;
      totalBuyCount += buys;
      totalSellCount += sells;
      totalTokenCount += tokens;
      weightedWinRate += winRate * trades;
      totalTrades += trades;

      chainBreakdown.push({
        chainId: result.value.chainId,
        realizedPnl: realized,
        unrealizedPnl: unrealized,
        buyVolume: buyVol,
        sellVolume: sellVol,
        buyCount: buys,
        sellCount: sells,
        tokenCount: tokens,
        winRate,
      });
    }

    // Fetch recent token PnL for the most active chain
    let recentPnl: unknown[] = [];
    const activeChain = chainBreakdown.sort(
      (a, b) => (b.buyCount + b.sellCount) - (a.buyCount + a.sellCount)
    )[0];

    if (activeChain && (activeChain.buyCount + activeChain.sellCount) > 0) {
      try {
        const recent = await marketPortfolioRecentPnl(
          activeChain.chainId,
          address,
          "10"
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recentPnl = (recent.data as any) ?? [];
      } catch {
        // non-critical
      }
    }

    return {
      overview: {
        realizedPnl: totalRealizedPnl,
        unrealizedPnl: totalUnrealizedPnl,
        totalPnl: totalRealizedPnl + totalUnrealizedPnl,
        buyVolume: totalBuyVolume,
        sellVolume: totalSellVolume,
        buyCount: totalBuyCount,
        sellCount: totalSellCount,
        tokenCount: totalTokenCount,
        winRate: totalTrades > 0 ? weightedWinRate / totalTrades : 0,
        totalTrades,
      },
      chainBreakdown,
      recentPnl,
      supportedChains: PNL_CHAINS,
    };
}
