import { NextRequest, NextResponse } from "next/server";
import { leaderboardList } from "@/lib/okx/cli";
import { memoTTL, cacheKey } from "@/lib/cache";
import { withSession } from "@/lib/session/session";

// `leaderboard list` is Premium ($0.0005/req post-quota). Time frames are
// 1d/3d/7d/1m/3m so the rankings move slowly — 60s is conservative.
const LEADERBOARD_TTL_MS = 60_000;

export const GET = withSession(async (request: NextRequest) => {
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
    const message =
      error instanceof Error ? error.message : "Leaderboard query failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
