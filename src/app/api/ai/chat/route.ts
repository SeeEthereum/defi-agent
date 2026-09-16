import { NextRequest, NextResponse } from "next/server";
import { runAiChat } from "@/lib/ai/orchestrator";
import { withSession, currentSession } from "@/lib/session/session";
import { rateLimit } from "@/lib/api/rate-limit";
import { apiError, badRequest } from "@/lib/api/validation";
import { z } from "zod";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
});

const schema = z
  .object({
    messages: z.array(messageSchema).max(40),
  })
  .refine((body) => body.messages.at(-1)?.role === "user", {
    message: "Last message must be from the user",
    path: ["messages"],
  });

export const POST = withSession(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { messages } = schema.parse(body);

    const limited = rateLimit("ai:" + currentSession().sid, 20, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { success: false, error: "Too many requests, slow down." },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfter) },
        }
      );
    }

    const result = await runAiChat(messages);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("ai/chat", error, "The assistant is unavailable right now");
  }
});
