import { NextRequest, NextResponse } from "next/server";
import { walletBalance } from "@/lib/okx/cli";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chain = searchParams.get("chain") ?? undefined;
    const tokenAddress = searchParams.get("tokenAddress") ?? undefined;

    // CLI --chain only accepts numeric chain IDs (e.g. "1", "56", "42161")
    if (chain && !/^\d+$/.test(chain)) {
      return NextResponse.json(
        { success: false, error: "chain must be a numeric chain ID (e.g. 1, 56, 42161)" },
        { status: 400 }
      );
    }

    const force = searchParams.get("force") === "true";
    const all = searchParams.get("all") === "true";

    const result = await walletBalance(chain, tokenAddress, all, force);

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch balances";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
