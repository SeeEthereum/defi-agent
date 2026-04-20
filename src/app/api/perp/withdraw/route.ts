import { NextRequest, NextResponse } from "next/server";
import { hlWithdraw } from "@/lib/hyperliquid/cli";
import { z } from "zod";

const schema = z.object({
  amount: z.string().min(1),
  destination: z.string().optional(),
  confirm: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const params = schema.parse(body);
    const data = await hlWithdraw(params);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Withdrawal failed";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
