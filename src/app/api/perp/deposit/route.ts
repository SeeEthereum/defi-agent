import { NextRequest, NextResponse } from "next/server";
import { hlDeposit } from "@/lib/hyperliquid/cli";
import { respond, respondBinError, positiveDecimalString } from "@/lib/hyperliquid/route-helper";
import { z } from "zod";

// HL deposit minimum is $5 — enforce here so a bad client doesn't even hit
// the keystore. hlDeposit() re-validates server-side as belt-and-braces.
const schema = z.object({
  amount: positiveDecimalString.refine((v) => Number(v) >= 5, "minimum deposit is 5 USDC"),
  confirm: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const params = schema.parse(await request.json());
    const result = await hlDeposit(params);
    return respond(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message ?? "Invalid deposit parameters" },
        { status: 400 }
      );
    }
    return respondBinError(error, "Deposit failed");
  }
}
