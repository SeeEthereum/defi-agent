/**
 * Only the app's own pages may call costly routes such as the assistant.
 * Browsers send Sec-Fetch-Site and Origin on POSTs; a script on another site,
 * or a page embedding ours, shows up as cross-site and is turned away.
 * Requests without either header (curl) still need the session cookie,
 * which only a signed-in browser has.
 */

import type { NextRequest } from "next/server";

export function isSameOrigin(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
