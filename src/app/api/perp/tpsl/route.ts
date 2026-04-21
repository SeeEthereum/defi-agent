import { NextRequest, NextResponse } from "next/server";
import { hlTpSl } from "@/lib/hyperliquid/cli";
import { respond, respondBinError } from "@/lib/hyperliquid/route-helper";
import { z } from "zod";

const schema = z.object({
  coin: z.string().min(1),
  slPx: z.string().optional(),
  tpPx: z.string().optional(),
  size: z.string().optional(),
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
