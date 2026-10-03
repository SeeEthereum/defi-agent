import { NextResponse } from "next/server";
import { readQuota } from "@/lib/ai/quota";
import { MAIN_MODEL_LABEL } from "@/lib/ai/models";
import { withSession } from "@/lib/session/session";
import { currentIdentity, NotSignedInError } from "@/lib/session/identity";
import { apiError } from "@/lib/api/validation";

/** The assistant allowance of the signed-in person, plus the model in use. */
export const GET = withSession(async () => {
  try {
    const { owner } = await currentIdentity();
    const quota = await readQuota(owner);
    return NextResponse.json({ success: true, data: { ...quota, model: MAIN_MODEL_LABEL } });
  } catch (error) {
    if (error instanceof NotSignedInError) {
      return NextResponse.json({ success: false, error: "Sign in to use the assistant." }, { status: 401 });
    }
    return apiError("ai/quota", error, "Could not read your allowance");
  }
});
