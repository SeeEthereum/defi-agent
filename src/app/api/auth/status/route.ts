import { NextResponse } from "next/server";
import { walletStatus } from "@/lib/okx/cli";
import type { WalletStatus } from "@/lib/okx/types";
import { currentSession, withSession } from "@/lib/session/session";
import { ownerKey } from "@/lib/session/identity";
import { getLabels } from "@/lib/accounts/labels";

export const GET = withSession(async () => {
  try {
    const result = await walletStatus();
    const data = result.data as WalletStatus;
    // The name the user gave this account, if any (OKX has no rename).
    let accountName = data.currentAccountName || null;
    if (data.loggedIn && data.currentAccountId) {
      try {
        const labels = await getLabels(ownerKey(data.email, currentSession().sid));
        accountName = labels[String(data.currentAccountId)] ?? accountName;
      } catch {
        // names are cosmetic: fall back to the OKX name
      }
    }

    return NextResponse.json({
      success: true,
      authenticated: data.loggedIn,
      email: data.email || null,
      accountId: data.currentAccountId || null,
      accountName,
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
