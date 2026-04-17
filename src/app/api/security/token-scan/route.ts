import { NextRequest, NextResponse } from "next/server";
import { securityTokenScan } from "@/lib/okx/cli";

// `chainId:address` list, comma-separated (max 10). Case-insensitive on address.
const TOKENS_FORMAT = /^\d+:0x[0-9a-fA-F]{40}(,\d+:0x[0-9a-fA-F]{40})*$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tokens = searchParams.get("tokens") ?? undefined;
    const address = searchParams.get("address") ?? undefined;
    const chain = searchParams.get("chain") ?? undefined;

    if (tokens) {
      if (!TOKENS_FORMAT.test(tokens)) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Invalid tokens format. Expected comma-separated 'chainId:0x<40-hex>' entries, e.g. '1:0xa0b8...eb48,42161:0xaf88...6831'.",
          },
          { status: 400 }
        );
      }
      const entries = tokens.split(",");
      if (entries.length > 10) {
        return NextResponse.json(
          {
            success: false,
            error: "Too many tokens (max 10 per scan).",
          },
          { status: 400 }
        );
      }
    }

    if (address && !EVM_ADDRESS.test(address)) {
      return NextResponse.json(
        { success: false, error: "Invalid wallet address format." },
        { status: 400 }
      );
    }

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
