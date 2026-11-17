import { NextRequest, NextResponse } from "next/server";
import { currentSession, withSession } from "@/lib/session/session";
import { allBalances, supportedTotals } from "@/lib/wallet/balances";
import { MAX_UTC_OFFSET_MINUTES, isHistoryRange, readHistory } from "@/lib/portfolio/history";
import { rateLimit } from "@/lib/api/rate-limit";
import { apiError } from "@/lib/api/validation";

/**
 * GET /api/portfolio/history?range=1d|1w|1m|all
 *
 * The signed-in account's stored totals (lib/portfolio/history) and the
 * total right now. The account comes from the session's own balance
 * reading, never from the request, so nobody can ask for someone else's
 * history. The balance reading is the dashboard's: same cache, no extra
 * call to OKX when both load together.
 */
export const GET = withSession(async (request: NextRequest) => {
  const { ok, retryAfter } = rateLimit("history:" + currentSession().sid, 30, 60_000);
  if (!ok) {
    return NextResponse.json(
      { success: false, error: "Too many requests, slow down.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const params = new URL(request.url).searchParams;
  const range = params.get("range") ?? "1w";
  if (!isHistoryRange(range)) {
    return NextResponse.json({ success: false, error: "Unknown range", code: "invalid_request" }, { status: 400 });
  }
  // The viewer's UTC offset in minutes, so days start at their midnight.
  // Anything odd falls back to UTC rather than failing the chart.
  const offset = Number(params.get("offset") ?? "0");
  const utcOffset = Number.isInteger(offset) && Math.abs(offset) <= MAX_UTC_OFFSET_MINUTES ? offset : 0;

  try {
    const now = Date.now();
    const all = await allBalances(currentSession().sid);
    const accountId = typeof all?.accountId === "string" ? all.accountId : "";
    if (!accountId) {
      return NextResponse.json({ success: false, error: "Not logged in. Please sign in first.", code: "not_signed_in" }, { status: 401 });
    }
    const { points, since } = await readHistory(accountId, range, now, utcOffset);
    return NextResponse.json({
      success: true,
      data: { range, points, since, current: { t: now, usd: supportedTotals(all).total } },
    });
  } catch (error) {
    return apiError("portfolio/history", error, "Could not load your value history.");
  }
});
