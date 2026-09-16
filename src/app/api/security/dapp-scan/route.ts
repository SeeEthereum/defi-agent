import { NextRequest, NextResponse } from "next/server";
import { securityDappScan } from "@/lib/okx/cli";
import { withSession } from "@/lib/session/session";
import { z } from "zod";
import { apiError, badRequest } from "@/lib/api/validation";

const domainSchema = z.string().max(253).regex(/^[a-zA-Z0-9.-]+$/);

function stripLeadingScheme(value: string): string {
  return value.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
}

export const GET = withSession(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("domain") ?? "";
    const domain = domainSchema.parse(stripLeadingScheme(raw));

    const result = await securityDappScan(domain);
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("security/dapp-scan", error, "Request failed");
  }
});
