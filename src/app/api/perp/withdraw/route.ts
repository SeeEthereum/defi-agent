import { NextRequest } from "next/server";
import { hlWithdraw } from "@/lib/hyperliquid/cli";
import { respond, respondBinError } from "@/lib/hyperliquid/route-helper";
import { withSession } from "@/lib/session/session";
import { badRequest, decimalAmount } from "@/lib/api/validation";
import { z } from "zod";

// HL withdraw minimum is > $1 — the bridge deducts a flat $1 fee, so anything
// <= 1 USDC nets the user zero. hlWithdraw() re-checks internally too.
// Withdrawals go to the session's own address; the library layer resolves it.
const schema = z.object({
  amount: decimalAmount.refine(
    (v) => Number(v) > 1,
    "withdraw amount must be > 1 USDC (covers $1 flat fee)"
  ),
  confirm: z.boolean().optional().default(false),
});

export const POST = withSession(async (request: NextRequest) => {
  try {
    const params = schema.parse(await request.json());
    const result = await hlWithdraw(params);
    return respond(result);
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return respondBinError(error, "Withdraw failed");
  }
});
