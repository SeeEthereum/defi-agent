import { NextRequest, NextResponse } from "next/server";
import { hlWithdraw } from "@/lib/hyperliquid/cli";
import { respond, respondBinError } from "@/lib/hyperliquid/route-helper";
import { z } from "zod";

const schema = z.object({
  amount: z.string().min(1),
  destination: z.string().optional(),
  confirm: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const params = schema.parse(await request.json());
    // HL withdraw minimum is $1 (covers the fixed fee)
    const n = Number(params.amount);
    if (!Number.isFinite(n) || n <= 1) {
      return NextResponse.json(
        { success: false, error: "Withdraw amount must be > 1 USDC (covers $1 flat fee)" },
        { status: 400 }
      );
    }
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
