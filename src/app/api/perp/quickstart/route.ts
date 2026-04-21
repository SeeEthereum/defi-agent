import { NextRequest } from "next/server";
import { hlQuickstart } from "@/lib/hyperliquid/cli";
import { respond, respondBinError } from "@/lib/hyperliquid/route-helper";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const address = searchParams.get("address") ?? undefined;
    const result = await hlQuickstart(address);
    return respond(result);
  } catch (error) {
    return respondBinError(error, "Quickstart failed");
  }
}
