import { NextRequest } from "next/server";
import { hlPositions } from "@/lib/hyperliquid/cli";
import { respond, respondBinError } from "@/lib/hyperliquid/route-helper";
import { withSession } from "@/lib/session/session";

export const GET = withSession(async (request: NextRequest) => {
  try {
    const { searchParams } = request.nextUrl;
    const address = searchParams.get("address") ?? undefined;
    const showOrders = searchParams.get("showOrders") === "true";
    const result = await hlPositions(address, showOrders);
    return respond(result);
  } catch (error) {
    return respondBinError(error, "Failed to fetch positions");
  }
});
