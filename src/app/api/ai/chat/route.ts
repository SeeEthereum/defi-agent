import { NextRequest, NextResponse } from "next/server";
import { runAiChat } from "@/lib/ai/orchestrator";
import { withSession } from "@/lib/session/session";
import { z } from "zod";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const schema = z.object({
  messages: z.array(messageSchema),
  walletAddress: z.string().optional(),
});

export const POST = withSession(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { messages, walletAddress } = schema.parse(body);

    const result = await runAiChat(messages, walletAddress);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI chat failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
