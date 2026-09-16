import { NextRequest, NextResponse } from "next/server";
import { securityApprovals } from "@/lib/okx/cli";
import { withSession } from "@/lib/session/session";
import { z } from "zod";
import {
  apiError,
  badRequest,
  chainId,
  evmAddress,
} from "@/lib/api/validation";

const querySchema = z.object({
  address: evmAddress,
  chain: chainId.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(256).regex(/^\S+$/).optional(),
});

export const GET = withSession(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.parse({
      address: searchParams.get("address") ?? undefined,
      chain: searchParams.get("chain") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
    });

    const result = await securityApprovals({
      address: parsed.address,
      chain: parsed.chain !== undefined ? String(parsed.chain) : undefined,
      limit: parsed.limit !== undefined ? String(parsed.limit) : undefined,
      cursor: parsed.cursor,
    });
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("security/approvals", error, "Request failed");
  }
});
