import { NextRequest, NextResponse } from "next/server";
import {
  gasStationStatus,
  gasStationSetup,
  gasStationEnable,
  gasStationDisable,
  gasStationUpdateDefaultToken,
} from "@/lib/okx/cli";
import { z } from "zod";
import { withSession } from "@/lib/session/session";
import {
  apiError,
  badRequest,
  chainId,
  evmAddress,
} from "@/lib/api/validation";

const relayerId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

function tokenListFromStatus(data: unknown): Array<{
  feeTokenAddress?: unknown;
  relayerId?: unknown;
}> {
  if (!data || typeof data !== "object") return [];
  const rec = data as Record<string, unknown>;
  const list = rec.tokenList ?? rec.gasStationTokenList;
  return Array.isArray(list) ? list : [];
}

async function requireKnownGasToken(
  chain: number,
  gasTokenAddress: string,
  relayerIdValue: string
): Promise<NextResponse | null> {
  const status = await gasStationStatus(String(chain));
  const known = tokenListFromStatus(status.data).some(
    (t) =>
      typeof t.feeTokenAddress === "string" &&
      t.feeTokenAddress.toLowerCase() === gasTokenAddress &&
      t.relayerId === relayerIdValue
  );
  if (!known) {
    return NextResponse.json(
      { success: false, error: "Unknown gas token for this chain" },
      { status: 400 }
    );
  }
  return null;
}

// GET /api/wallet/gas-station?chain=42161 — read-only pre-flight.
// Returns recommendation + tokenList + gasStationActivated; never broadcasts.
export const GET = withSession(async (request: NextRequest) => {
  try {
    const chain = chainId.parse(request.nextUrl.searchParams.get("chain"));
    const result = await gasStationStatus(String(chain));
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("wallet/gas-station", error, "Request failed");
  }
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    // First-time activation: EIP-7702 delegation + default token pinning.
    // Irreversible on-chain step — the UI must collect explicit consent
    // before calling this.
    action: z.literal("setup"),
    chain: chainId,
    gasTokenAddress: evmAddress,
    relayerId,
  }),
  z.object({
    action: z.literal("update-default-token"),
    chain: chainId,
    gasTokenAddress: evmAddress,
  }),
  z.object({ action: z.literal("enable"), chain: chainId }),
  z.object({ action: z.literal("disable"), chain: chainId }),
]);

export const POST = withSession(async (request: NextRequest) => {
  try {
    const body = actionSchema.parse(await request.json());
    const chain = String(body.chain);

    switch (body.action) {
      case "setup": {
        const unknown = await requireKnownGasToken(
          body.chain,
          body.gasTokenAddress,
          body.relayerId
        );
        if (unknown) return unknown;
        const result = await gasStationSetup({
          chain,
          gasTokenAddress: body.gasTokenAddress,
          relayerId: body.relayerId,
        });
        return NextResponse.json({ success: true, data: result.data });
      }
      case "update-default-token": {
        const result = await gasStationUpdateDefaultToken(
          chain,
          body.gasTokenAddress
        );
        return NextResponse.json({ success: true, data: result.data });
      }
      case "enable": {
        const result = await gasStationEnable(chain);
        return NextResponse.json({ success: true, data: result.data });
      }
      case "disable": {
        const result = await gasStationDisable(chain);
        return NextResponse.json({ success: true, data: result.data });
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("wallet/gas-station", error, "Request failed");
  }
});
