import { NextRequest, NextResponse } from "next/server";
import { hlWithdraw } from "@/lib/hyperliquid/cli";
import { respond, respondBinError, positiveDecimalString } from "@/lib/hyperliquid/route-helper";
import { z } from "zod";

// HL withdraw minimum is > $1 — the bridge deducts a flat $1 fee, so anything
// <= 1 USDC nets the user zero. hlWithdraw() re-checks internally too.
const schema = z.object({
  amount: positiveDecimalString.refine(
    (v) => Number(v) > 1,
    "withdraw amount must be > 1 USDC (covers $1 flat fee)"
  ),
  // EVM address: 0x + 40 hex chars. Case-insensitive.
  destination: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "destination must be a 0x-prefixed 20-byte EVM address")
    .optional(),
  confirm: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const params = schema.parse(await request.json());
    const result = await hlWithdraw(params);
    return respond(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message ?? "Invalid withdraw parameters" },
        { status: 400 }
      );
    }
    return respondBinError(error, "Withdraw failed");
  }
}
