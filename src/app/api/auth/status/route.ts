import { NextResponse } from "next/server";
import { walletStatus } from "@/lib/okx/cli";
import type { WalletStatus } from "@/lib/okx/types";
import { currentSession, withSession } from "@/lib/session/session";
import { ownerKey } from "@/lib/session/identity";
import { getLabels } from "@/lib/accounts/labels";
import { clearIdleSignOut, wasSignedOutIdle } from "@/lib/session/activity";
import { SealedSessionError } from "@/lib/session/keyring-seal";

/** Why a browser that was signed in is not any more, when the server knows. */
function signedOutReason(loggedIn: boolean): "idle" | null {
  const sid = currentSession().sid;
  if (loggedIn) {
    clearIdleSignOut(sid);
    return null;
  }
  return wasSignedOutIdle(sid) ? "idle" : null;
}

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
      signedOutReason: signedOutReason(Boolean(data.loggedIn)),
    });
  } catch (error) {
    // A session whose keyring no longer opens is signed out for good.
    if (error instanceof SealedSessionError) {
      return NextResponse.json({
        success: true,
        authenticated: false,
        email: null,
        accountId: null,
        accountName: null,
        accountCount: 0,
        signedOutReason: signedOutReason(false),
      });
    }
    // Anything else (OKX slow, the session's queue full, a timeout) says
    // nothing about the sign-in. Answering "signed out" here made a slow
    // server show "Sign in first" to people who were signed in.
    return NextResponse.json(
      { success: false, code: "status_unknown", error: "Could not check your sign-in right now." },
      { status: 503, headers: { "Retry-After": "5" } }
    );
  }
});
