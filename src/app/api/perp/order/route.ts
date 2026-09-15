import { NextRequest, NextResponse } from "next/server";
import { hlOrder } from "@/lib/hyperliquid/cli";
import { respond, respondBinError, positiveDecimalString } from "@/lib/hyperliquid/route-helper";
import { withSession } from "@/lib/session/session";
import { z } from "zod";

const schema = z.object({
  coin: z.string().min(1).max(20).regex(/^[A-Z0-9]+$/, "coin must be uppercase alphanumeric"),
  side: z.enum(["buy", "sell"]),
  size: positiveDecimalString,
  type: z.enum(["market", "limit"]).optional().default("market"),
  price: positiveDecimalString.optional(),
  // HL per-asset max leverage varies (up to 50x for BTC/ETH, lower for
  // most alts). We cap at 50 at the edge; the SDK's updateLeverage will
  // reject per-asset overrides server-side.
  leverage: z.number().int().min(1).max(50).optional(),
  isolated: z.boolean().optional(),
  slPx: positiveDecimalString.optional(),
  tpPx: positiveDecimalString.optional(),
  reduceOnly: z.boolean().optional(),
  slippage: z.number().min(0.1).max(10).optional(),
  confirm: z.boolean().optional().default(false),
});

export const POST = withSession(async (request: NextRequest) => {
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
});
