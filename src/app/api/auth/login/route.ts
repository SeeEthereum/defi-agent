import { NextRequest, NextResponse } from "next/server";
import { walletLogin } from "@/lib/okx/cli";
import { z } from "zod";

const schema = z.object({
  email: z.string().email().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = schema.parse(body);

    const result = await walletLogin(email, "en-US");

    if (email) {
      return NextResponse.json({
        success: true,
        message: `Verification code sent to ${email}. Please check your inbox.`,
        requiresOtp: true,
      });
    }

    // Silent API key login
    return NextResponse.json({
      success: true,
      data: result.data,
      requiresOtp: false,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Login failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
