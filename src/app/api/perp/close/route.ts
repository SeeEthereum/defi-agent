import { NextRequest } from "next/server";
import { hlClose } from "@/lib/hyperliquid/cli";
import { respond, respondBinError } from "@/lib/hyperliquid/route-helper";
import { withSession } from "@/lib/session/session";
import { badRequest, decimalAmount } from "@/lib/api/validation";
import { z } from "zod";

const schema = z.object({
  coin: // Hyperliquid tickers are case-sensitive (kPEPE, @107): do not upper-case.
  z.string().trim().regex(/^[A-Za-z0-9@_-]{1,16}$/),
  // If size is omitted, hlClose closes the full position.
  size: decimalAmount.optional(),
  confirm: z.boolean().optional().default(false),
});

export const POST = withSession(async (request: NextRequest) => {
  try {
    const params = schema.parse(await request.json());
    const result = await hlClose(params);
    return respond(result);
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return respondBinError(error, "Close failed");
  }
});
