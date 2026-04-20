import { NextRequest, NextResponse } from "next/server";
import { hlQuickstart } from "@/lib/hyperliquid/cli";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const address = searchParams.get("address") ?? undefined;
    const data = await hlQuickstart(address);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run quickstart";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
