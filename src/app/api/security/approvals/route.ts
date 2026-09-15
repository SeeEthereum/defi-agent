import { NextRequest, NextResponse } from "next/server";
import { securityApprovals } from "@/lib/okx/cli";
import { withSession } from "@/lib/session/session";

export const GET = withSession(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    const chain = searchParams.get("chain") ?? undefined;
    const limit = searchParams.get("limit") ?? undefined;
    const cursor = searchParams.get("cursor") ?? undefined;

    if (!address) {
      return NextResponse.json(
        { success: false, error: "address parameter is required" },
        { status: 400 }
      );
    }

    const result = await securityApprovals({ address, chain, limit, cursor });
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Approvals query failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
