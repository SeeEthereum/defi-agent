import { NextRequest, NextResponse } from "next/server";
import { hlClose } from "@/lib/hyperliquid/cli";
import { z } from "zod";

const schema = z.object({
  coin: z.string().min(1),
  size: z.string().optional(),
  confirm: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const params = schema.parse(body);
    const data = await hlClose(params);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Close position failed";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
