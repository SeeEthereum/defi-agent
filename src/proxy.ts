import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  mintSessionToken,
  verifySessionToken,
} from "@/lib/session/token";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isLocalizablePath,
  isLocale,
  localeOfPath,
  negotiateLocale,
  type Locale,
} from "@/i18n/config";

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

/** The language for a page without one: the last one used, else the browser's, else English. */
function preferredLocale(request: NextRequest): Locale {
  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  return negotiateLocale(request.headers.get("accept-language")) ?? DEFAULT_LOCALE;
}

function rememberLocale(response: NextResponse, locale: Locale): void {
  response.cookies.set({
    name: LOCALE_COOKIE,
    value: locale,
    // Read by the offline page's script too: not httpOnly, and nothing secret.
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
  });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/") && !SAFE_METHODS.has(request.method) && !isTrustedOrigin(request)) {
    return NextResponse.json(
      { success: false, error: "Cross-origin request rejected", code: "bad_origin" },
      { status: 403 }
    );
  }

  // A page without a language (an old link, the installed app's "/",
  // a shortcut): send it to the same page in the visitor's language.
  // 307 keeps the method and is not cached.
  const pathLocale = localeOfPath(pathname);
  if (!pathLocale && isLocalizablePath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${preferredLocale(request)}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url, 307);
  }

  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  const sessionOk = await verifySessionToken(existing);

  let response: NextResponse;
  if (sessionOk) {
    response = NextResponse.next();
  } else {
    // First visit (or a tampered cookie): give this browser its own session,
    // visible to the route handling this same request and persisted on the
    // response.
    const token = await mintSessionToken();
    request.cookies.set(SESSION_COOKIE, token);
    response = NextResponse.next({ request: { headers: new Headers(request.headers) } });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  }

  // The language of the page opened is the one to come back to.
  if (pathLocale && request.cookies.get(LOCALE_COOKIE)?.value !== pathLocale) rememberLocale(response, pathLocale);
  return response;
}

export const config = {
  // No session for the health check (uptime monitors, Render), the public
  // metadata files or the service worker and its offline page: they need
  // no cookie, and none is set.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|robots\\.txt|sitemap\\.xml|sw\\.js|offline\\.html|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?|css|js|webmanifest|html|txt|xml)$).*)",
  ],
};
