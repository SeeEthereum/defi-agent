import { NextRequest, NextResponse } from "next/server";
import { tokenSearch } from "@/lib/okx/cli";

export async function GET(request: NextRequest) {
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

    const result = await tokenSearch(query, chain);
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Token search failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
