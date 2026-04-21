import { NextRequest } from "next/server";
import { hlRegisterCached, invalidateRegisterCache } from "@/lib/hyperliquid/cli";
import { respond, respondBinError } from "@/lib/hyperliquid/route-helper";

export async function GET(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get("force") === "true";
    if (force) invalidateRegisterCache();
    const result = await hlRegisterCached(force);
    return respond(result);
  } catch (error) {
    return respondBinError(error, "Register check failed");
  }
}
