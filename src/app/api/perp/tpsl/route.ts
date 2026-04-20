import { NextRequest, NextResponse } from "next/server";
import { hlTpSl } from "@/lib/hyperliquid/cli";
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
    const body = await request.json();
    const params = schema.parse(body);
    if (!params.slPx && !params.tpPx) {
      return NextResponse.json(
        { success: false, error: "At least one of slPx or tpPx is required" },
        { status: 400 }
      );
    }
    const data = await hlTpSl(params);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TP/SL update failed";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
