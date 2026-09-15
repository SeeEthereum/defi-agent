import { NextRequest } from "next/server";
import { hlPrices } from "@/lib/hyperliquid/cli";
import { respond, respondBinError } from "@/lib/hyperliquid/route-helper";
import { withSession } from "@/lib/session/session";

export const GET = withSession(async (request: NextRequest) => {
  try {
    const { searchParams } = request.nextUrl;
    const coin = searchParams.get("coin") ?? undefined;
    const result = await hlPrices(coin);
    return respond(result);
  } catch (error) {
    return respondBinError(error, "Failed to fetch prices");
  }
});
