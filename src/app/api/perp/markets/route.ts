import { NextResponse } from "next/server";
import { hlPrices, getMarketLimits } from "@/lib/hyperliquid/cli";
import { filterFeaturedPrices, FEATURED_MARKETS } from "@/lib/hyperliquid/markets";
import { respondBinError } from "@/lib/hyperliquid/route-helper";
import { withSession } from "@/lib/session/session";

/**
 * Curated perp markets with live mid prices.
 * Used by the Trade page ticker. Avoids exposing the 500+ raw price feed.
 */
export const GET = withSession(async () => {
  try {
    const result = await hlPrices();
    if (!result.ok) {
      return NextResponse.json({
        success: true,
        data: { markets: FEATURED_MARKETS, prices: [] },
      });
    }
    const prices = filterFeaturedPrices(result.data.prices ?? {});
    // The Trade page caps its leverage slider with maxLeverage.
    const limits = await getMarketLimits().catch(() => ({}) as Awaited<ReturnType<typeof getMarketLimits>>);
    const markets = FEATURED_MARKETS.map((m) => ({
      ...m,
      maxLeverage: limits[m.coin]?.maxLeverage ?? null,
      szDecimals: limits[m.coin]?.szDecimals ?? null,
    }));
    return NextResponse.json({
      success: true,
      data: { markets, prices },
    });
  } catch (error) {
    return respondBinError(error, "Failed to load markets");
  }
});
