import { NextRequest, NextResponse } from "next/server";
import { bridgeTokens } from "@/lib/bridge/lifi";
import { withSession } from "@/lib/session/session";
import { z } from "zod";
import { apiError, badRequest, chainId } from "@/lib/api/validation";

const schema = z.object({
  fromChain: chainId,
  toChain: chainId,
});

export const GET = withSession(async (request: NextRequest) => {
  try {
    const { searchParams } = request.nextUrl;
    const { fromChain, toChain } = schema.parse({
      fromChain: searchParams.get("fromChain"),
      toChain: searchParams.get("toChain"),
    });

    const tokens = await bridgeTokens(String(fromChain), String(toChain));

    return NextResponse.json({ success: true, data: tokens });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("bridge/tokens", error, "Failed to get bridge tokens");
  }
});
