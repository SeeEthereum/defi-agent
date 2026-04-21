import { NextRequest, NextResponse } from "next/server";
import { hlDeposit } from "@/lib/hyperliquid/cli";
import { respond, respondBinError } from "@/lib/hyperliquid/route-helper";
import { z } from "zod";

const schema = z.object({
  amount: z.string().min(1),
  confirm: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const params = schema.parse(await request.json());
    // HL deposit minimum is $5
    const n = Number(params.amount);
    if (!Number.isFinite(n) || n < 5) {
      return NextResponse.json(
        { success: false, error: "Minimum deposit is 5 USDC" },
        { status: 400 }
      );
    }
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
