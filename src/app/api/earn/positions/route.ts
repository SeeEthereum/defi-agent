import { NextRequest, NextResponse } from "next/server";
import { getUserPositions } from "@/lib/fluid/resolver";
import { withSession } from "@/lib/session/session";
import { z } from "zod";

const schema = z.object({
  address: z.string().regex(/^0x[0-9a-f]{40}$/),
});

export const GET = withSession(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    if (!address) {
      return NextResponse.json(
        { success: false, error: "Address required" },
        { status: 400 }
      );
    }

    const { address: validAddress } = schema.parse({
      address: address.toLowerCase(),
    });

    const positions = await getUserPositions(validAddress as `0x${string}`);
    return NextResponse.json({ success: true, data: positions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
