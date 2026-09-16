import { NextRequest, NextResponse } from "next/server";
import { leaderboardList } from "@/lib/okx/cli";
import { memoTTL, cacheKey } from "@/lib/cache";
import { currentSession, withSession } from "@/lib/session/session";
import { rateLimit } from "@/lib/api/rate-limit";
import { apiError } from "@/lib/api/validation";

// `leaderboard list` is Premium ($0.0005/req post-quota). Time frames are
// 1d/3d/7d/1m/3m so the rankings move slowly — 60s is conservative.
const LEADERBOARD_TTL_MS = 60_000;

export const GET = withSession(async (request: NextRequest) => {
  const { ok, retryAfter } = rateLimit("leaderboard:" + currentSession().sid, 30, 60_000);
  if (!ok) {
    return NextResponse.json(
      { success: false, error: "Too many requests, slow down.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }
  try {
    const { searchParams } = new URL(request.url);
    const chain = searchParams.get("chain");
    const timeFrame = searchParams.get("timeFrame") ?? "3";
    const sortBy = searchParams.get("sortBy") ?? "1";
    const walletType = searchParams.get("walletType") ?? undefined;

    if (!chain) {
      return NextResponse.json(
        { success: false, error: "chain parameter is required" },
        { status: 400 }
      );
    }

    const key = cacheKey(["leaderboard", chain, timeFrame, sortBy, walletType]);
    const data = await memoTTL(key, LEADERBOARD_TTL_MS, async () => {
      const result = await leaderboardList({ chain, timeFrame, sortBy, walletType });
      return result.data;
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError("leaderboard", error, "Leaderboard query failed");
  }
});
