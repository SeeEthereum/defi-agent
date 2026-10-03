import { NextRequest, NextResponse } from "next/server";
import { runAiChat } from "@/lib/ai/orchestrator";
import { checkScope, MAX_QUESTION_CHARS, refusalText } from "@/lib/ai/guard";
import { consumeQuestion, refundQuestion } from "@/lib/ai/quota";
import { withSession } from "@/lib/session/session";
import { currentIdentity, NotSignedInError } from "@/lib/session/identity";
import { isSameOrigin } from "@/lib/api/same-origin";
import { apiError, badRequest } from "@/lib/api/validation";
import { z } from "zod";

/** Older turns beyond this are dropped: enough context, bounded cost. */
const HISTORY_TURNS = 16;
const HISTORY_CHARS = 24_000;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
});

const schema = z
  .object({
    messages: z.array(messageSchema).min(1).max(60),
  })
  .refine((body) => body.messages.at(-1)?.role === "user", {
    message: "Last message must be from the user",
    path: ["messages"],
  });

/** Keep the newest turns that fit; the newest user question always stays. */
function trimHistory(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  const recent = messages.slice(-HISTORY_TURNS);
  const out: typeof recent = [];
  let chars = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    chars += recent[i].content.length;
    if (out.length > 0 && chars > HISTORY_CHARS) break;
    out.unshift(recent[i]);
  }
  // The model expects the conversation to start with the user.
  while (out.length > 1 && out[0].role !== "user") out.shift();
  return out;
}

export const POST = withSession(async (request: NextRequest) => {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, error: "Requests must come from the albicocca app." }, { status: 403 });
  }

  let owner: string | null = null;
  let spent = false;
  try {
    const { messages } = schema.parse(await request.json());
    const question = messages[messages.length - 1].content.trim();
    if (!question) return NextResponse.json({ success: false, error: "Write a question first." }, { status: 400 });
    if (question.length > MAX_QUESTION_CHARS) {
      return NextResponse.json(
        { success: false, error: `Keep questions under ${MAX_QUESTION_CHARS} characters.` },
        { status: 413 }
      );
    }

    owner = (await currentIdentity()).owner;

    const quota = await consumeQuestion(owner);
    if (!quota.ok) {
      return NextResponse.json(
        { success: false, code: "quota_exhausted", error: "You have used today's questions.", quota },
        { status: 429, headers: quota.resetAt ? { "Retry-After": String(Math.max(1, Math.ceil((Date.parse(quota.resetAt) - Date.now()) / 1000))) } : {} }
      );
    }
    spent = true;
    const { ok: _ok, ...quotaState } = quota;
    void _ok;

    const previous = [...messages].reverse().find((m, i) => i > 0 && m.role === "assistant");
    const verdict = await checkScope(question, previous?.content);
    if (!verdict.inScope) {
      return NextResponse.json({
        success: true,
        data: { text: refusalText(verdict), proposedActions: [], refused: true },
        quota: quotaState,
      });
    }

    const result = await runAiChat(trimHistory(messages));
    return NextResponse.json({ success: true, data: result, quota: quotaState });
  } catch (error) {
    // A failure on our side should not cost the user a question.
    if (spent && owner) await refundQuestion(owner).catch(() => {});
    if (error instanceof z.ZodError) return badRequest(error);
    if (error instanceof NotSignedInError) {
      return NextResponse.json({ success: false, error: "Sign in to use the assistant." }, { status: 401 });
    }
    return apiError("ai/chat", error, "The assistant is unavailable right now. This question was not counted.");
  }
});
