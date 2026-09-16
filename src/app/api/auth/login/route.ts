import { NextResponse } from "next/server";
import { walletLoginInit } from "@/lib/okx/cli";
import { startLoginPoll } from "@/lib/okx/login-session";
import { withSession } from "@/lib/session/session";

/**
 * Start a browser login (CLI v4 social login).
 *
 * Mints the login URL and kicks off the background poll that persists the
 * session once the operator finishes in their browser. Takes no body: the
 * pre-v4 email + OTP flow is gone (`wallet verify` was removed upstream),
 * and the provider is chosen on OKX's page, not here.
 *
 * The client shows `loginUrl`, then watches GET /api/auth/poll.
 */
export const POST = withSession(async () => {
  try {
    const result = await walletLoginInit();
    const { authSessionId, loginUrl } = result.data ?? {};

    if (!authSessionId || !loginUrl) {
      return NextResponse.json(
        { success: false, error: "Login service did not return a sign-in link." },
        { status: 502 }
      );
    }

    startLoginPoll(authSessionId, loginUrl);

    return NextResponse.json({ success: true, data: { loginUrl, authSessionId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
