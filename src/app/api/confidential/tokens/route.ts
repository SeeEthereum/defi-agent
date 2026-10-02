import { NextResponse } from "next/server";
import { withSession } from "@/lib/session/session";
import { listConfidentialTokens } from "@/lib/near-intents/oneclick";
import { confidentialError } from "@/lib/near-intents/route-helpers";

// GET /api/confidential/tokens — tokens NEAR Intents can swap on our chains.
export const GET = withSession(async () => {
  try {
    const tokens = await listConfidentialTokens();
    return NextResponse.json({
      success: true,
      // assetId stays on the server; the client only deals in chain + address.
      data: tokens.map(({ chainIndex, address, symbol, decimals, priceUsd }) => ({
        chainIndex,
        address,
        symbol,
        decimals,
        priceUsd,
      })),
    });
  } catch (error) {
    return confidentialError("confidential/tokens", error, "Could not load tokens");
  }
});
