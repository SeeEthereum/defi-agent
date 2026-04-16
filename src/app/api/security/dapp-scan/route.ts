import { NextRequest, NextResponse } from "next/server";
import { securityDappScan } from "@/lib/okx/cli";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get("domain");

    if (!domain) {
      return NextResponse.json(
        { success: false, error: "domain parameter is required" },
        { status: 400 }
      );
    }

    const result = await securityDappScan(domain);
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "DApp scan failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
