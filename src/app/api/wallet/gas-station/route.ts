import { NextRequest, NextResponse } from "next/server";
import {
  gasStationStatus,
  gasStationSetup,
  gasStationEnable,
  gasStationDisable,
  gasStationUpdateDefaultToken,
} from "@/lib/okx/cli";
import { z } from "zod";
import { SUPPORTED_CHAIN_IDS } from "@/lib/chains";
import { withSession } from "@/lib/session/session";

const chainSchema = z
  .string()
  .min(1)
  .refine(
    (c) => SUPPORTED_CHAIN_IDS.includes(Number(c)),
    "Unsupported chain"
  );

// GET /api/wallet/gas-station?chain=42161 — read-only pre-flight.
// Returns recommendation + tokenList + gasStationActivated; never broadcasts.
export const GET = withSession(async (request: NextRequest) => {
  try {
    const chain = chainSchema.parse(
      request.nextUrl.searchParams.get("chain") ?? ""
    );
    const result = await gasStationStatus(chain);
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gas Station status failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    // First-time activation: EIP-7702 delegation + default token pinning.
    // Irreversible on-chain step — the UI must collect explicit consent
    // before calling this.
    action: z.literal("setup"),
    chain: chainSchema,
    gasTokenAddress: z.string().min(1),
    relayerId: z.string().min(1),
  }),
  z.object({
    action: z.literal("update-default-token"),
    chain: chainSchema,
    gasTokenAddress: z.string().min(1),
  }),
  z.object({ action: z.literal("enable"), chain: chainSchema }),
  z.object({ action: z.literal("disable"), chain: chainSchema }),
]);

export const POST = withSession(async (request: NextRequest) => {
  try {
    const body = actionSchema.parse(await request.json());

    switch (body.action) {
      case "setup": {
        const result = await gasStationSetup({
          chain: body.chain,
          gasTokenAddress: body.gasTokenAddress,
          relayerId: body.relayerId,
        });
        return NextResponse.json({ success: true, data: result.data });
      }
      case "update-default-token": {
        const result = await gasStationUpdateDefaultToken(
          body.chain,
          body.gasTokenAddress
        );
        return NextResponse.json({ success: true, data: result.data });
      }
      case "enable": {
        const result = await gasStationEnable(body.chain);
        return NextResponse.json({ success: true, data: result.data });
      }
      case "disable": {
        const result = await gasStationDisable(body.chain);
        return NextResponse.json({ success: true, data: result.data });
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gas Station action failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
