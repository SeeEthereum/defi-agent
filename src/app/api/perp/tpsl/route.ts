import { NextRequest, NextResponse } from "next/server";
import { hlTpSl } from "@/lib/hyperliquid/cli";
import { respond, respondBinError, positiveDecimalString } from "@/lib/hyperliquid/route-helper";
import { z } from "zod";

const schema = z.object({
  coin: z.string().min(1).max(20).regex(/^[A-Z0-9]+$/),
  slPx: positiveDecimalString.optional(),
  tpPx: positiveDecimalString.optional(),
  // If size is omitted, hlTpSl uses the full open position size.
  size: positiveDecimalString.optional(),
  confirm: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const params = schema.parse(await request.json());
    if (!params.slPx && !params.tpPx) {
      return NextResponse.json(
        { success: false, error: "At least one of slPx or tpPx is required" },
        { status: 400 }
      );
    }
    const result = await hlTpSl(params);
    return respond(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message ?? "Invalid TP/SL parameters" },
        { status: 400 }
      );
    }
    return respondBinError(error, "TP/SL failed");
  }
}
