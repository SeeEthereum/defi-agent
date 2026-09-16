import { NextRequest } from "next/server";
import { hlCancel } from "@/lib/hyperliquid/cli";
import { respond, respondBinError } from "@/lib/hyperliquid/route-helper";
import { withSession } from "@/lib/session/session";
import { badRequest } from "@/lib/api/validation";
import { z } from "zod";

const schema = z.object({
  coin: // Hyperliquid tickers are case-sensitive (kPEPE, @107): do not upper-case.
  z.string().trim().regex(/^[A-Za-z0-9@_-]{1,16}$/),
  // HL order IDs are uint64; keep as a string, do not coerce to number.
  orderId: z.string().regex(/^\d{1,20}$/),
  confirm: z.boolean().optional().default(false),
});

export const POST = withSession(async (request: NextRequest) => {
  try {
    const params = schema.parse(await request.json());
    const result = await hlCancel(params);
    return respond(result);
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return respondBinError(error, "Cancel failed");
  }
});
