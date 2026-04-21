import { NextRequest } from "next/server";
import { hlOrders } from "@/lib/hyperliquid/cli";
import { respond, respondBinError } from "@/lib/hyperliquid/route-helper";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const coin = searchParams.get("coin") ?? undefined;
    const result = await hlOrders(coin);
    return respond(result);
  } catch (error) {
    return respondBinError(error, "Failed to fetch orders");
  }
}
