import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { walletApprovalCodeCancel, walletApprovalCodeResend } from "@/lib/okx/cli";
import { approvalPromptResponseFor } from "@/lib/okx/approval-code";
import { currentSession, withSession } from "@/lib/session/session";
import { apiError, badRequest } from "@/lib/api/validation";
import { rateLimit } from "@/lib/api/rate-limit";

/**
 * The approval OKX is holding for an email code (lib/okx/approval-code):
 * email a new code, or drop the approval without sending it. The code
 * itself goes back with the original request, which sends the approval.
 */

const schema = z.object({ action: z.enum(["resend", "cancel"]) });

export const POST = withSession(async (request: NextRequest) => {
  try {
    const { action } = schema.parse(await request.json());

    if (action === "cancel") {
      const result = await walletApprovalCodeCancel();
      return NextResponse.json({ success: true, data: { cancelled: result.data?.cancelled === true } });
    }

    // OKX limits resends too; this keeps a stuck page from hammering it.
    const { ok, retryAfter } = rateLimit("approval-code-resend:" + currentSession().sid, 5, 10 * 60_000);
    if (!ok) {
      return NextResponse.json(
        { success: false, code: "rate_limited", error: "Too many new codes. Wait a few minutes." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
    await walletApprovalCodeResend();
    return NextResponse.json({ success: true, data: { sent: true } });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    const prompt = approvalPromptResponseFor(error);
    if (prompt) return prompt;
    return apiError("wallet/approval-code", error, "The code could not be sent. Try again.");
  }
});
