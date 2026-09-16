import { NextRequest, NextResponse } from "next/server";
import { marketKline } from "@/lib/okx/cli";
import { memoTTL, cacheKey } from "@/lib/cache";
import { withSession } from "@/lib/session/session";

// `market kline` is Basic ($0.0001/req post-quota). Candle data is
// inherently discretized — a 30s memo aligns reasonably with intraday bar
// granularities (1m+) and only causes one-bar-of-staleness at the edge.
const KLINE_TTL_MS = 30_000;

export const GET = withSession(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    const chain = searchParams.get("chain");
    const bar = searchParams.get("bar") ?? undefined;
    const limit = searchParams.get("limit") ?? undefined;

    if (!address || !chain) {
      return NextResponse.json(
        { success: false, error: "address and chain parameters are required" },
        { status: 400 }
      );
    }

    const key = cacheKey(["kline", chain, address.toLowerCase(), bar, limit]);
    const data = await memoTTL(key, KLINE_TTL_MS, async () => {
      const result = await marketKline({ address, chain, bar, limit });
      return result.data;
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kline query failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
