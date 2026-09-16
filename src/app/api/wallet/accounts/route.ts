import { NextRequest, NextResponse } from "next/server";
import { runCli } from "@/lib/okx/cli";
import { withSession } from "@/lib/session/session";
import { z } from "zod";
import { apiError, badRequest } from "@/lib/api/validation";

// GET /api/wallet/accounts — list all accounts (wallet status gives accountCount)
// POST /api/wallet/accounts — add a new wallet account
// PATCH /api/wallet/accounts — switch to a different account

const patchSchema = z.object({
  accountId: z.string().regex(/^\d+$/),
});

export const POST = withSession(async () => {
  try {
    const result = await runCli(["wallet", "add"]);
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("wallet/accounts", error, "Request failed");
  }
});

export const PATCH = withSession(async (request: NextRequest) => {
  try {
    const { accountId } = patchSchema.parse(await request.json());
    const result = await runCli(["wallet", "switch", accountId]);
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("wallet/accounts", error, "Request failed");
  }
});
