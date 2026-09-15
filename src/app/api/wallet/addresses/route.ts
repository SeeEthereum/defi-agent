import { NextResponse } from "next/server";
import { walletAddresses } from "@/lib/okx/cli";
import { withSession } from "@/lib/session/session";

export const GET = withSession(async () => {
  try {
    const result = await walletAddresses();
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch addresses";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
