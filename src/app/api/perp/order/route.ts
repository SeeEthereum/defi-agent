import { NextRequest, NextResponse } from "next/server";
import { hlOrder } from "@/lib/hyperliquid/cli";
import { z } from "zod";

const schema = z.object({
  coin: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  size: z.string().min(1),
  type: z.enum(["market", "limit"]).optional(),
  price: z.string().optional(),
  leverage: z.number().int().min(1).max(100).optional(),
  isolated: z.boolean().optional(),
  slPx: z.string().optional(),
  tpPx: z.string().optional(),
  confirm: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const params = schema.parse(body);
    const data = await hlOrder(params);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Order placement failed";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
