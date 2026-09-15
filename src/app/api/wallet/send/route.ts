import { NextRequest, NextResponse } from "next/server";
import { walletSend } from "@/lib/okx/cli";
import { gasStationResponseFor } from "@/lib/okx/gas-station";
import { z } from "zod";
import { isValidEvmAddress, normalizeAddress } from "@/lib/utils";
import { SUPPORTED_CHAIN_IDS } from "@/lib/chains";
import { withSession } from "@/lib/session/session";

const schema = z.object({
  amount: z.string().min(1),
  recipient: z.string().min(1),
  chain: z.number().refine((n) => SUPPORTED_CHAIN_IDS.includes(n)),
  contractToken: z.string().optional(),
  force: z.boolean().optional(),
});

export const POST = withSession(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { amount, recipient, chain, contractToken, force } =
      schema.parse(body);

    // Validate EVM address
    if (!isValidEvmAddress(recipient)) {
      return NextResponse.json(
        { success: false, error: "Invalid recipient address" },
        { status: 400 }
      );
    }

    const result = await walletSend({
      amount,
      recipient: normalizeAddress(recipient),
      chain: String(chain),
      contractToken: contractToken
        ? normalizeAddress(contractToken)
        : undefined,
      force,
    });

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const gasStation = gasStationResponseFor(error);
    if (gasStation) return gasStation;

    const message =
      error instanceof Error ? error.message : "Send failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
