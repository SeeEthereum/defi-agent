import { NextRequest, NextResponse } from "next/server";
import { signalList } from "@/lib/okx/cli";
import { memoTTL, cacheKey } from "@/lib/cache";
import { currentSession, withSession } from "@/lib/session/session";
import { rateLimit } from "@/lib/api/rate-limit";
import { apiError } from "@/lib/api/validation";

// `signal list` is a Premium-tier Market API endpoint ($0.0005/req post-quota
// from 2026-06-01). Public deterministic data → safe to cache aggressively.
// 30s matches the smart-money refresh cadence the UI implies.
const SIGNALS_TTL_MS = 30_000;

export const GET = withSession(async (request: NextRequest) => {
  const { ok, retryAfter } = rateLimit("signals:" + currentSession().sid, 30, 60_000);
  if (!ok) {
    return NextResponse.json(
      { success: false, error: "Too many requests, slow down.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }
  try {
    const { searchParams } = new URL(request.url);
    const chain = searchParams.get("chain");

    if (!chain) {
      return NextResponse.json(
        { success: false, error: "chain parameter is required" },
        { status: 400 }
      );
    }

    const walletType = searchParams.get("walletType") ?? undefined;
    const minAmountUsd = searchParams.get("minAmountUsd") ?? undefined;
    const maxAmountUsd = searchParams.get("maxAmountUsd") ?? undefined;
    const minAddressCount = searchParams.get("minAddressCount") ?? undefined;
    const tokenAddress = searchParams.get("tokenAddress") ?? undefined;
    const minMarketCapUsd = searchParams.get("minMarketCapUsd") ?? undefined;
    const maxMarketCapUsd = searchParams.get("maxMarketCapUsd") ?? undefined;
    const minLiquidityUsd = searchParams.get("minLiquidityUsd") ?? undefined;
    const maxLiquidityUsd = searchParams.get("maxLiquidityUsd") ?? undefined;

    const key = cacheKey([
      "signals", chain, walletType, minAmountUsd, maxAmountUsd,
      minAddressCount, tokenAddress, minMarketCapUsd, maxMarketCapUsd,
      minLiquidityUsd, maxLiquidityUsd,
    ]);
    const data = await memoTTL(key, SIGNALS_TTL_MS, async () => {
      const result = await signalList({
        chain,
        walletType,
        minAmountUsd,
        maxAmountUsd,
        minAddressCount,
        tokenAddress,
        minMarketCapUsd,
        maxMarketCapUsd,
        minLiquidityUsd,
        maxLiquidityUsd,
      });
      return result.data;
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError("signals", error, "Signal query failed");
  }
});
