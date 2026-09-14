import { NextResponse } from "next/server";
import { getLoginSession, clearLoginSession } from "@/lib/okx/login-session";

/**
 * Report progress of the in-flight browser login.
 *
 * Reads in-memory state only — no CLI spawn — so the login screen can poll
 * this every couple of seconds without touching the keystore mutex or
 * burning a process per check. Replaces the removed /api/auth/verify
 * (the OTP endpoint), which has no equivalent since CLI v4.
 */
export async function GET() {
  const session = getLoginSession();

  if (!session) {
    return NextResponse.json({ success: true, data: { phase: "idle" } });
  }

  return NextResponse.json({
    success: true,
    data: {
      phase: session.phase,
      loginUrl: session.loginUrl,
      error: session.error ?? null,
    },
  });
}

/** Abandon the current login attempt (user cancelled / navigated away). */
export async function DELETE() {
  clearLoginSession();
  return NextResponse.json({ success: true });
}
