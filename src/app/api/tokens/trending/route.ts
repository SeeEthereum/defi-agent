import { NextRequest, NextResponse } from "next/server";
import { tokenHotTokens } from "@/lib/okx/cli";
import { memoTTL, cacheKey } from "@/lib/cache";
import { withSession } from "@/lib/session/session";

// `token hot-tokens` is Basic ($0.0001/req post-quota). The trending list
// rotates slowly (the time frame is at least 5m); 30s is plenty.
const TRENDING_TTL_MS = 30_000;

export const GET = withSession(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const chain = searchParams.get("chain") || undefined;
    const rankBy = searchParams.get("rankBy") || undefined;
    const timeFrame = searchParams.get("timeFrame") || "4"; // default 24h

    const key = cacheKey(["trending", chain, rankBy, timeFrame]);
    const cleaned = await memoTTL(key, TRENDING_TTL_MS, async () => {
      const result = await tokenHotTokens({
        chain,
        rankBy,
        timeFrame,
        riskFilter: "true", // hide risky tokens by default
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tokens = (result.data as any[]) ?? [];

      // Map to clean format
      return tokens.slice(0, 20).map((t) => ({
        symbol: t.tokenSymbol ?? t.symbol ?? "?",
        name: t.tokenName ?? t.name ?? "",
        address: t.tokenContractAddress ?? t.address ?? "",
        chainIndex: t.chainIndex ?? "",
        price: t.price ?? "0",
        change24h: t.change ?? "0",
        marketCap: t.marketCap ?? "0",
        volume: t.volume ?? t.tradeAmount ?? "0",
        liquidity: t.liquidity ?? "0",
        holders: t.holders ?? "0",
        logo: t.tokenLogoUrl ?? t.logo ?? "",
      }));
    });

    return NextResponse.json({ success: true, data: cleaned });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch trending tokens";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
