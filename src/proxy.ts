import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  COOKIE_NAME,
  isGateConfigured,
  isGateRequired,
  verifySessionToken,
} from "@/lib/auth/app-gate";

/**
 * Access gate for the whole app (Next 16 renamed `middleware.ts` to
 * `proxy.ts`; the function must be named `proxy` or be the default export).
 *
 * Until now every route — including the ones that move funds, like
 * /api/wallet/send, /api/swap/execute and /api/perp/withdraw — was
 * reachable by anyone who knew the deployment URL, because the app's own
 * "authenticated" flag only ever described whether the server-side OKX
 * keystore had a session, not who was asking.
 *
 * Two layers, deliberately distinct:
 *   1. this gate — may you use this deployment at all;
 *   2. the OKX wallet login (/auth) — does the server hold a wallet session.
 *
 * Runs on the Node.js runtime (the default for proxy in this version), so
 * node:crypto is available for real HMAC verification. Per the proxy docs
 * this file must not rely on shared module state, so it only does stateless
 * cookie verification — rate limiting lives in /api/gate instead.
 */

// Paths that must stay reachable while locked, or the gate can't be passed.
const PUBLIC_PATHS = ["/gate", "/api/gate"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isPublic(pathname)) return NextResponse.next();

  // Misconfigured production: refuse everything rather than serve an open
  // wallet. A missing password must never silently mean "no gate".
  if (!isGateConfigured()) {
    if (isGateRequired()) {
      const message =
        "APP_PASSWORD is not set. Refusing to serve an ungated deployment.";
      return isApi
        ? NextResponse.json({ success: false, error: message }, { status: 503 })
        : new NextResponse(message, {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
    }
    // Local dev with no password configured — stay out of the way.
    return NextResponse.next();
  }

  if (verifySessionToken(request.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.next();
  }

  if (isApi) {
    return NextResponse.json(
      { success: false, error: "Locked. Unlock the app to continue." },
      { status: 401 }
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = "/gate";
  url.search = "";
  // Send the visitor back where they were headed once unlocked.
  if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except framework internals and static assets.
  //
  // All of `_next` is excluded, not just `_next/static`: it also carries the
  // image optimizer and, in dev, the HMR websocket (gating that one breaks
  // hot reload). Nothing under `_next` exposes app data — App Router fetches
  // server data for a page through the page's own path with an RSC header,
  // e.g. `GET /wallet?_rsc=…`, which this matcher still covers, so gated
  // routes stay gated during client-side navigation too.
  matcher: [
    "/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$).*)",
  ],
};
