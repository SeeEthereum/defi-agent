import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/session/session";
import { EVM_ADDRESS_RE } from "@/lib/api/validation";
import { getSwapStatus } from "@/lib/near-intents/oneclick";
import { ownsDeposit } from "@/lib/near-intents/deposits";
import { confidentialError } from "@/lib/near-intents/route-helpers";

// GET /api/confidential/status?depositAddress=0x… — progress of this session's swap.
export const GET = withSession(async (request: NextRequest) => {
  const depositAddress = request.nextUrl.searchParams.get("depositAddress") ?? "";
  if (!EVM_ADDRESS_RE.test(depositAddress) || !ownsDeposit(depositAddress)) {
    return NextResponse.json({ success: false, error: "Unknown swap." }, { status: 404 });
  }
  try {
    return NextResponse.json({ success: true, data: await getSwapStatus(depositAddress) });
  } catch (error) {
    return confidentialError("confidential/status", error, "Could not read the swap status");
  }
});
