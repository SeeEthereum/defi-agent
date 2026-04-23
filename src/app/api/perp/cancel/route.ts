import { NextRequest, NextResponse } from "next/server";
import { hlCancel } from "@/lib/hyperliquid/cli";
import { respond, respondBinError, nonNegativeIntegerString } from "@/lib/hyperliquid/route-helper";
import { z } from "zod";

const schema = z.object({
  coin: z.string().min(1).max(20).regex(/^[A-Z0-9]+$/),
  // HL order IDs are uint64; validate as a whole-number string.
  orderId: nonNegativeIntegerString,
  confirm: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const params = schema.parse(await request.json());
    const result = await hlCancel(params);
    return respond(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message ?? "Invalid cancel parameters" },
        { status: 400 }
      );
    }
    return respondBinError(error, "Cancel failed");
  }
}
