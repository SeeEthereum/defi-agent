import { NextResponse } from "next/server";
import { walletAddresses } from "@/lib/okx/cli";
import { withSession } from "@/lib/session/session";
import { z } from "zod";
import { apiError, badRequest } from "@/lib/api/validation";

export const GET = withSession(async () => {
  try {
    const result = await walletAddresses();
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("wallet/addresses", error, "Request failed");
  }
});
