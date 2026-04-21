import { NextRequest, NextResponse } from "next/server";
import { hlOrder } from "@/lib/hyperliquid/cli";
import { respond, respondBinError } from "@/lib/hyperliquid/route-helper";
import { z } from "zod";

const schema = z.object({
  coin: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  size: z.string().min(1),
  type: z.enum(["market", "limit"]).optional().default("market"),
  price: z.string().optional(),
  leverage: z.number().int().min(1).max(50).optional(),
  isolated: z.boolean().optional(),
  slPx: z.string().optional(),
  tpPx: z.string().optional(),
  reduceOnly: z.boolean().optional(),
  slippage: z.number().min(0.1).max(10).optional(),
  confirm: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const params = schema.parse(body);

    if (params.type === "limit" && !params.price) {
      return NextResponse.json(
        { success: false, error: "Limit orders require a price" },
        { status: 400 }
      );
    }

    const result = await hlOrder(params);
    return respond(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message ?? "Invalid order parameters" },
        { status: 400 }
      );
    }
    return respondBinError(error, "Order failed");
  }
}
