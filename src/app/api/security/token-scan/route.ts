import { NextRequest, NextResponse } from "next/server";
import { securityTokenScan } from "@/lib/okx/cli";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tokens = searchParams.get("tokens") ?? undefined;
    const address = searchParams.get("address") ?? undefined;
    const chain = searchParams.get("chain") ?? undefined;

    if (!tokens && !address) {
      // Default: scan logged-in wallet tokens
      const result = await securityTokenScan({ chain });
      return NextResponse.json({ success: true, data: result.data });
    }

    const result = await securityTokenScan({ tokens, address, chain });
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Token security scan failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
