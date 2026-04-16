import { NextRequest, NextResponse } from "next/server";
import { leaderboardList } from "@/lib/okx/cli";

export async function GET(request: NextRequest) {
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

    const result = await leaderboardList({ chain, timeFrame, sortBy, walletType });
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Leaderboard query failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
