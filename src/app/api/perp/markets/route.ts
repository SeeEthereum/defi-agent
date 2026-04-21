import { NextResponse } from "next/server";
import { hlPrices } from "@/lib/hyperliquid/cli";
import { filterFeaturedPrices, FEATURED_MARKETS } from "@/lib/hyperliquid/markets";
import { respondBinError } from "@/lib/hyperliquid/route-helper";

/**
 * Curated perp markets with live mid prices.
 * Used by the Trade page ticker. Avoids exposing the 500+ raw price feed.
 */
export async function GET() {
  try {
    const result = await hlPrices();
    if (!result.ok) {
      return NextResponse.json({
        success: true,
        data: { markets: FEATURED_MARKETS, prices: [] },
      });
    }
    const prices = filterFeaturedPrices(result.data.prices ?? {});
    return NextResponse.json({
      success: true,
      data: { markets: FEATURED_MARKETS, prices },
    });
  } catch (error) {
    return respondBinError(error, "Failed to load markets");
  }
}
