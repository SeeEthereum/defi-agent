import { NextRequest, NextResponse } from "next/server";
import { walletHistory } from "@/lib/okx/cli";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const result = await walletHistory({
      txHash: searchParams.get("txHash") ?? undefined,
      chain: searchParams.get("chain") ?? undefined,
      address: searchParams.get("address") ?? undefined,
      limit: searchParams.get("limit") ?? "20",
      pageNum: searchParams.get("pageNum") ?? undefined,
    });

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch history";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
