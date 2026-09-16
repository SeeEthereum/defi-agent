import { NextRequest, NextResponse } from "next/server";
import { signalList } from "@/lib/okx/cli";
import { memoTTL, cacheKey } from "@/lib/cache";
import { withSession } from "@/lib/session/session";

// `signal list` is a Premium-tier Market API endpoint ($0.0005/req post-quota
// from 2026-06-01). Public deterministic data → safe to cache aggressively.
// 30s matches the smart-money refresh cadence the UI implies.
const SIGNALS_TTL_MS = 30_000;

export const GET = withSession(async (request: NextRequest) => {
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
    const message =
      error instanceof Error ? error.message : "Signal query failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
