import { NextRequest, NextResponse } from "next/server";
import { walletBalance } from "@/lib/okx/cli";
import { currentSession, withSession } from "@/lib/session/session";
import { allBalances, chainSlice } from "@/lib/wallet/balances";
import { z } from "zod";
import {
  apiError,
  badRequest,
  chainId,
  tokenAddress,
} from "@/lib/api/validation";

const querySchema = z.object({
  chain: chainId.optional(),
  tokenAddress: tokenAddress.optional(),
});

export const GET = withSession(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.parse({
      chain: searchParams.get("chain") ?? undefined,
      tokenAddress: searchParams.get("tokenAddress") ?? undefined,
    });

    const all = searchParams.get("all") === "true";
    const force = searchParams.get("force") === "true";

    // A plain per-chain request is cut from one all-chains call (lib/wallet/balances).
    if (parsed.chain !== undefined && !parsed.tokenAddress && !all && !force) {
      const data = chainSlice(await allBalances(currentSession().sid), String(parsed.chain));
      return NextResponse.json({ success: true, data });
    }

    const result = await walletBalance(
      parsed.chain !== undefined ? String(parsed.chain) : undefined,
      parsed.tokenAddress,
      all,
      force
    );

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("wallet/balances", error, "Request failed");
  }
});
