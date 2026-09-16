import { NextRequest, NextResponse } from "next/server";
import { tokenHotTokens } from "@/lib/okx/cli";
import { memoTTL, cacheKey } from "@/lib/cache";
import { currentSession, withSession } from "@/lib/session/session";
import { rateLimit } from "@/lib/api/rate-limit";
import { apiError } from "@/lib/api/validation";

// `token hot-tokens` is Basic ($0.0001/req post-quota). The trending list
// rotates slowly (the time frame is at least 5m); 30s is plenty.
const TRENDING_TTL_MS = 30_000;

export const GET = withSession(async (request: NextRequest) => {
  const { ok, retryAfter } = rateLimit("trending:" + currentSession().sid, 30, 60_000);
  if (!ok) {
    return NextResponse.json(
      { success: false, error: "Too many requests, slow down.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }
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
        // The swap page needs the real decimals to convert amounts; it
        // refuses a token without them rather than assuming 18.
        decimals:
          t.decimals != null && t.decimals !== ""
            ? Number(t.decimals)
            : t.tokenDecimals != null && t.tokenDecimals !== ""
              ? Number(t.tokenDecimals)
              : null,
      }));
    });

    return NextResponse.json({ success: true, data: cleaned });
  } catch (error) {
    return apiError("tokens/trending", error, "Failed to fetch trending tokens");
  }
});
