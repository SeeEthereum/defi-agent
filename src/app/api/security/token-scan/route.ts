import { NextRequest, NextResponse } from "next/server";
import { securityTokenScan } from "@/lib/okx/cli";
import { withSession } from "@/lib/session/session";
import { z } from "zod";
import {
  apiError,
  badRequest,
  chainId,
  evmAddress,
} from "@/lib/api/validation";

const tokensSchema = z
  .string()
  .refine((raw) => raw.split(",").length <= 10, "Too many tokens (max 10 per scan).")
  .transform((raw, ctx) => {
    const entries = raw.split(",");
    const out: string[] = [];
    for (const entry of entries) {
      const parts = entry.split(":");
      if (parts.length !== 2) {
        ctx.addIssue({ code: "custom", message: "Invalid tokens format." });
        return z.NEVER;
      }
      const chainParsed = chainId.safeParse(parts[0]);
      const addrParsed = evmAddress.safeParse(parts[1]);
      if (!chainParsed.success || !addrParsed.success) {
        ctx.addIssue({ code: "custom", message: "Invalid tokens format." });
        return z.NEVER;
      }
      out.push(`${chainParsed.data}:${addrParsed.data}`);
    }
    return out.join(",");
  });

const querySchema = z.object({
  tokens: tokensSchema.optional(),
  address: evmAddress.optional(),
  chain: chainId.optional(),
});

export const GET = withSession(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.parse({
      tokens: searchParams.get("tokens") ?? undefined,
      address: searchParams.get("address") ?? undefined,
      chain: searchParams.get("chain") ?? undefined,
    });

    const chain = parsed.chain !== undefined ? String(parsed.chain) : undefined;

    if (!parsed.tokens && !parsed.address) {
      const result = await securityTokenScan({ chain });
      return NextResponse.json({ success: true, data: result.data });
    }

    const result = await securityTokenScan({
      tokens: parsed.tokens,
      address: parsed.address,
      chain,
    });
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("security/token-scan", error, "Request failed");
  }
});
