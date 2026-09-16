import { NextRequest, NextResponse } from "next/server";
import { addressTrackerActivities } from "@/lib/okx/cli";
import { memoTTL, cacheKey } from "@/lib/cache";
import { withSession } from "@/lib/session/session";

// `address-tracker-activities` is Premium ($0.0005/req post-quota). More
// time-sensitive than leaderboard (it's a live trade feed) — 15s keeps
// the UI feeling fresh while still cutting most call volume.
const TRACKER_TTL_MS = 15_000;

export const GET = withSession(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const trackerType = searchParams.get("trackerType") ?? "smart_money";
    const walletAddress = searchParams.get("walletAddress") ?? undefined;
    const tradeType = searchParams.get("tradeType") ?? undefined;
    const chain = searchParams.get("chain") ?? undefined;
    const minVolume = searchParams.get("minVolume") ?? undefined;
    const maxVolume = searchParams.get("maxVolume") ?? undefined;
    const minMarketCap = searchParams.get("minMarketCap") ?? undefined;
    const maxMarketCap = searchParams.get("maxMarketCap") ?? undefined;

    const key = cacheKey([
      "tracker", trackerType, walletAddress, tradeType, chain,
      minVolume, maxVolume, minMarketCap, maxMarketCap,
    ]);
    const data = await memoTTL(key, TRACKER_TTL_MS, async () => {
      const result = await addressTrackerActivities({
        trackerType,
        walletAddress,
        tradeType,
        chain,
        minVolume,
        maxVolume,
        minMarketCap,
        maxMarketCap,
      });
      return result.data;
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tracker query failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
