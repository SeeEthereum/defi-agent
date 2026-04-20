import { NextResponse } from "next/server";
import { hlRegister } from "@/lib/hyperliquid/cli";

export async function GET() {
  try {
    const data = await hlRegister();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to check register status";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
