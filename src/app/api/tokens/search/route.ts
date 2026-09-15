import { NextRequest, NextResponse } from "next/server";
import { tokenSearch } from "@/lib/okx/cli";
import { memoTTL, cacheKey } from "@/lib/cache";
import { withSession } from "@/lib/session/session";

// `token search` is Basic ($0.0001/req post-quota). Search results for a
// given query string are stable — the same "USDC" lookup returns the same
// token list for hours. 60s is conservative; a higher TTL would be safe.
const TOKEN_SEARCH_TTL_MS = 60_000;

export const GET = withSession(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const chain = searchParams.get("chain") ?? undefined;

    if (!query || query.length < 1) {
      return NextResponse.json(
        { success: false, error: "query parameter 'q' is required" },
        { status: 400 }
      );
    }

    const key = cacheKey(["tokenSearch", query.toLowerCase(), chain]);
    const data = await memoTTL(key, TOKEN_SEARCH_TTL_MS, async () => {
      const result = await tokenSearch(query, chain);
      return result.data;
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Token search failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
