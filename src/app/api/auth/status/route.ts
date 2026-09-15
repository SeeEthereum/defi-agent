import { NextResponse } from "next/server";
import { walletStatus } from "@/lib/okx/cli";
import type { WalletStatus } from "@/lib/okx/types";
import { withSession } from "@/lib/session/session";

export const GET = withSession(async () => {
  try {
    const result = await walletStatus();
    const data = result.data as WalletStatus;

    return NextResponse.json({
      success: true,
      authenticated: data.loggedIn,
      email: data.email || null,
      accountId: data.currentAccountId || null,
      accountName: data.currentAccountName || null,
      accountCount: data.accountCount || 0,
    });
  } catch {
    return NextResponse.json({
      success: true,
      authenticated: false,
      email: null,
      accountId: null,
      accountName: null,
      accountCount: 0,
    });
  }
});
