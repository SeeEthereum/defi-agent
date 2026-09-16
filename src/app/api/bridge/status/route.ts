import { NextRequest, NextResponse } from "next/server";
import { bridgeStatus } from "@/lib/bridge/lifi";
import { withSession } from "@/lib/session/session";
import { z } from "zod";
import { apiError, badRequest, chainId } from "@/lib/api/validation";

const schema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  fromChain: chainId,
  toChain: chainId,
  bridge: z.string().min(1).optional(),
});

export const GET = withSession(async (request: NextRequest) => {
  try {
    const { searchParams } = request.nextUrl;
    const { txHash, fromChain, toChain, bridge } = schema.parse({
      txHash: searchParams.get("txHash"),
      fromChain: searchParams.get("fromChain"),
      toChain: searchParams.get("toChain"),
      bridge: searchParams.get("bridge") ?? undefined,
    });

    const status = await bridgeStatus(
      txHash,
      String(fromChain),
      String(toChain),
      bridge
    );

    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("bridge/status", error, "Failed to get bridge status");
  }
});
