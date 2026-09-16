import { NextResponse } from "next/server";
import { getFluidMarkets } from "@/lib/fluid/resolver";
import { withSession } from "@/lib/session/session";
import { badRequest, apiError } from "@/lib/api/validation";
import { z } from "zod";

export const GET = withSession(async () => {
  try {
    const markets = await getFluidMarkets();
    return NextResponse.json({ success: true, data: markets });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("earn/markets", error, "Fetch markets failed");
  }
});
