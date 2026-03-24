import { NextRequest, NextResponse } from "next/server";
import { runCli } from "@/lib/okx/cli";

// GET /api/wallet/accounts — list all accounts (wallet status gives accountCount)
// POST /api/wallet/accounts — add a new wallet account
// PATCH /api/wallet/accounts — switch to a different account

export async function POST() {
  try {
    const result = await runCli(["wallet", "add"]);
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add wallet";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId } = body;
    if (!accountId) {
      return NextResponse.json(
        { success: false, error: "accountId is required" },
        { status: 400 }
      );
    }
    const result = await runCli(["wallet", "switch", accountId]);
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to switch account";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
