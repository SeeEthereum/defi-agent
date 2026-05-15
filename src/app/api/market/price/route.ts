import { NextRequest, NextResponse } from "next/server";
import { marketPrice } from "@/lib/okx/cli";
import { memoTTL, cacheKey } from "@/lib/cache";

// `market price` is Basic ($0.0001/req post-quota). Token prices move
// fast but a 10s server-side memo cuts polling thunder — the UI's SWR
// poll interval is typically 30s+, so 10s rarely shows stale data.
const PRICE_TTL_MS = 10_000;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    const chain = searchParams.get("chain");

    if (!address || !chain) {
      return NextResponse.json(
        { success: false, error: "address and chain parameters are required" },
        { status: 400 }
      );
    }

    const key = cacheKey(["price", chain, address.toLowerCase()]);
    const data = await memoTTL(key, PRICE_TTL_MS, async () => {
      const result = await marketPrice({ address, chain });
      return result.data;
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Price query failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
