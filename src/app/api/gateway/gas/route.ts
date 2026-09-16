import { NextRequest, NextResponse } from "next/server";
import { gatewayGas } from "@/lib/okx/cli";
import { withSession } from "@/lib/session/session";
import { z } from "zod";
import { apiError, badRequest, chainId } from "@/lib/api/validation";

export const GET = withSession(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const chain = chainId.parse(searchParams.get("chain"));
    const result = await gatewayGas(String(chain));
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("gateway/gas", error, "Request failed");
  }
});
