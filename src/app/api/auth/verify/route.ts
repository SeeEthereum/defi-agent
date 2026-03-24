import { NextRequest, NextResponse } from "next/server";
import { walletVerify } from "@/lib/okx/cli";
import { z } from "zod";

const schema = z.object({
  otp: z.string().length(6),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { otp } = schema.parse(body);

    const result = await walletVerify(otp);

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Verification failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
