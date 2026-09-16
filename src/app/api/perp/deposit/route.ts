import { NextRequest } from "next/server";
import { hlDeposit } from "@/lib/hyperliquid/cli";
import { respond, respondBinError } from "@/lib/hyperliquid/route-helper";
import { withSession } from "@/lib/session/session";
import { badRequest, decimalAmount } from "@/lib/api/validation";
import { z } from "zod";

// HL deposit minimum is $5 — enforce here so a bad client doesn't even hit
// the keystore. hlDeposit() re-validates server-side as belt-and-braces.
const schema = z.object({
  amount: decimalAmount.refine((v) => Number(v) >= 5, "minimum deposit is 5 USDC"),
  confirm: z.boolean().optional().default(false),
});

export const POST = withSession(async (request: NextRequest) => {
  try {
    const params = schema.parse(await request.json());
    const result = await hlDeposit(params);
    return respond(result);
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return respondBinError(error, "Deposit failed");
  }
});
