import { NextResponse } from "next/server";
import { currentSession, sessionHomeExists, withSession } from "@/lib/session/session";
import { POLICY_SETTINGS_URL, readSavedPolicy } from "@/lib/okx/security-policy";

/** The user's OKX protections as reported at sign-in (lib/okx/security-policy). */
export const GET = withSession(async () => {
  const session = currentSession();
  const saved = sessionHomeExists(session) ? readSavedPolicy(session) : null;
  return NextResponse.json({
    success: true,
    data: { policy: saved?.policy ?? null, savedAt: saved?.savedAt ?? null, settingsUrl: POLICY_SETTINGS_URL },
  });
});
