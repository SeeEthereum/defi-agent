import { NextRequest, NextResponse } from "next/server";
import { hlClose } from "@/lib/hyperliquid/cli";
import { respond, respondBinError, positiveDecimalString } from "@/lib/hyperliquid/route-helper";
import { z } from "zod";

const schema = z.object({
  coin: z.string().min(1).max(20).regex(/^[A-Z0-9]+$/),
  // If size is omitted, hlClose closes the full position.
  size: positiveDecimalString.optional(),
  confirm: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const params = schema.parse(await request.json());
    const result = await hlClose(params);
    return respond(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message ?? "Invalid close parameters" },
        { status: 400 }
      );
    }
    return respondBinError(error, "Close failed");
  }
}
