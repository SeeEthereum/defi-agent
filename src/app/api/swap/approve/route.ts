import { NextRequest, NextResponse } from "next/server";
import { swapApprove } from "@/lib/okx/cli";
import { z } from "zod";
import { normalizeAddress } from "@/lib/utils";

const schema = z.object({
  token: z.string().min(1),
  amount: z.string().min(1), // minimal units
  chain: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, amount, chain } = schema.parse(body);

    const result = await swapApprove({
      token: normalizeAddress(token),
      amount,
      chain,
    });

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Approve failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
