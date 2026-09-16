import { NextResponse } from "next/server";
import { walletLogout } from "@/lib/okx/cli";
import { clearLoginSession } from "@/lib/okx/login-session";
import { invalidateHlClients } from "@/lib/hyperliquid/http";
import { invalidateHlSigningAddressCache } from "@/lib/hyperliquid/probe";
import { destroySessionHome, withSession } from "@/lib/session/session";
import { SESSION_COOKIE } from "@/lib/session/token";

export const POST = withSession(async () => {
  // Stop an in-flight login poll first, so it cannot persist a fresh
  // session into the keystore after we wipe it.
  clearLoginSession();
  try {
    await walletLogout();
  } catch (error) {
    console.warn("[auth/logout] wallet logout failed, wiping session keystore anyway", error);
  }

  try {
    invalidateHlClients();
    invalidateHlSigningAddressCache();
    destroySessionHome();
    const response = NextResponse.json({ success: true });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  } catch (error) {
    console.error("[auth/logout] logout failed", error);
    return NextResponse.json({ success: false, error: "Logout failed" }, { status: 500 });
  }
});
