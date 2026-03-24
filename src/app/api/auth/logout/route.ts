import { NextResponse } from "next/server";
import { walletLogout } from "@/lib/okx/cli";

export async function POST() {
  try {
    await walletLogout();
    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Logout failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
