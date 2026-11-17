import { NextResponse, type NextRequest } from "next/server";
import { walletLoginInit } from "@/lib/okx/cli";
import { canStartLogin, startLoginPoll } from "@/lib/okx/login-session";
import { currentSession, withSession } from "@/lib/session/session";
import { rateLimit } from "@/lib/api/rate-limit";
import { markActive } from "@/lib/session/activity";
import { clientIp } from "@/lib/api/client-ip";
import { apiError } from "@/lib/api/validation";

const WINDOW_MS = 10 * 60_000;
/** Login starts per address and per browser session in 10 minutes. */
const PER_IP = 10;
const PER_SESSION = 5;

/**
 * Start a browser login (CLI v4 social login).
 *
 * Mints the login URL and kicks off the background poll that persists the
 * session once the operator finishes in their browser. Takes no body: the
 * pre-v4 email + OTP flow is gone (`wallet verify` was removed upstream),
 * and the provider is chosen on OKX's page, not here.
 *
 * Each start costs a CLI call and a poll process that can live 10 minutes,
 * and needs nothing but a cookie, so starts are limited per address and per
 * session, and the number of polls running at once is capped.
 *
 * The client shows `loginUrl`, then watches GET /api/auth/poll.
 */
export const POST = withSession(async (request: NextRequest) => {
  const byIp = rateLimit("login-ip:" + clientIp(request), PER_IP, WINDOW_MS);
  const bySession = rateLimit("login-sid:" + currentSession().sid, PER_SESSION, WINDOW_MS);
  const limited = [byIp, bySession].find((r) => !r.ok);
  if (limited) {
    const minutes = Math.max(1, Math.ceil(limited.retryAfter / 60));
    return NextResponse.json(
      {
        success: false,
        code: "rate_limited",
        error: `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }
  if (!canStartLogin()) {
    return NextResponse.json(
      { success: false, code: "busy", error: "Too many sign-ins are in progress right now. Try again in a minute." },
      { status: 503, headers: { "Retry-After": "60" } }
    );
  }

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
    markActive(currentSession());

    return NextResponse.json({ success: true, data: { loginUrl, authSessionId } });
  } catch (error) {
    // The raw CLI message can carry paths and internals; only safe ones pass.
    return apiError("auth/login", error, "Sign-in could not start. Please try again.");
  }
});
