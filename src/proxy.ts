import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  mintSessionToken,
  verifySessionToken,
} from "@/lib/session/token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * State-changing API calls must come from this app's own pages. Browsers
 * always send Origin on cross-site and same-origin POST/PATCH/DELETE, so a
 * missing or foreign Origin is rejected (CSRF).
 */
function isTrustedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (allowed.includes(origin)) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    !SAFE_METHODS.has(request.method) &&
    !isTrustedOrigin(request)
  ) {
    return NextResponse.json(
      { success: false, error: "Cross-origin request rejected", code: "bad_origin" },
      { status: 403 }
    );
  }

  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(existing)) return NextResponse.next();

  // First visit (or a tampered cookie): give this browser its own session,
  // visible to the route handling this same request and persisted on the
  // response.
  const token = await mintSessionToken();
  request.cookies.set(SESSION_COOKIE, token);
  const response = NextResponse.next({ request: { headers: new Headers(request.headers) } });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?|css|js)$).*)"],
};
