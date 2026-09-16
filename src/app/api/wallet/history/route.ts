import { NextRequest, NextResponse } from "next/server";
import { walletHistory } from "@/lib/okx/cli";
import { withSession } from "@/lib/session/session";
import { formatEther } from "viem";
import { z } from "zod";
import {
  apiError,
  badRequest,
  chainId,
  evmAddress,
} from "@/lib/api/validation";

const pageSize = z.coerce.number().int().min(1).max(100);

const querySchema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  chain: chainId.optional(),
  address: evmAddress.optional(),
  limit: pageSize.optional(),
  pageNum: pageSize.optional(),
});

// Normalize a raw orderList entry to a consistent shape the UI can consume
function normalizeEntry(raw: Record<string, unknown>, fallbackChainIndex?: string) {
  const isApprove = !!raw.approveSymbol;
  const rawValue = raw.serviceCharge;
  let gasFeeEth = "";
  if (rawValue != null && rawValue !== "" && rawValue !== "0") {
    try {
      const wei = BigInt(String(rawValue));
      if (wei !== 0n) gasFeeEth = formatEther(wei);
    } catch {
      gasFeeEth = "";
    }
  }

  return {
    txHash: (raw.txHash ?? "") as string,
    txTime: (raw.txTime ?? raw.txCreateTime ?? "") as string,
    direction: (raw.direction ?? "OUT") as string,    // "IN" | "OUT"
    txStatus: (raw.txStatus ?? "PENDING") as string,  // "SUCCESS" | "ERROR" | "PENDING"
    chainSymbol: (raw.chainSymbol ?? "") as string,
    // The wallet page picks the block explorer from this.
    chainIndex: String(raw.chainIndex ?? raw.chainId ?? fallbackChainIndex ?? ""),
    // For approve txs use approveSymbol; for transfers use coinSymbol
    symbol: (raw.approveSymbol ?? raw.coinSymbol ?? "") as string,
    amount: (raw.coinAmount ?? "0") as string,
    isApprove,
    gasFeeEth,
    from: (raw.from ?? "") as string,
    to: (raw.to ?? "") as string,
    failReason: (raw.failReason ?? "") as string,
    contractName: (raw.contractName ?? "") as string,
  };
}

export const GET = withSession(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.parse({
      txHash: searchParams.get("txHash") ?? undefined,
      chain: searchParams.get("chain") ?? undefined,
      address: searchParams.get("address") ?? undefined,
      limit: searchParams.get("limit") ?? "20",
      pageNum: searchParams.get("pageNum") ?? undefined,
    });

    const result = await walletHistory({
      txHash: parsed.txHash,
      chain: parsed.chain !== undefined ? String(parsed.chain) : undefined,
      address: parsed.address,
      limit: parsed.limit !== undefined ? String(parsed.limit) : "20",
      pageNum: parsed.pageNum !== undefined ? String(parsed.pageNum) : undefined,
    });

    // CLI returns [{cursor, orderList: [tx, ...]}] — flatten all pages
    const pages = Array.isArray(result.data)
      ? (result.data as Array<{ cursor?: string; orderList?: Record<string, unknown>[] }>)
      : [];

    const transactions = pages
      .flatMap((page) => page.orderList ?? [])
      .map((entry) =>
        normalizeEntry(
          entry,
          parsed.chain !== undefined ? String(parsed.chain) : undefined
        )
      );

    return NextResponse.json({ success: true, data: transactions });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("wallet/history", error, "Request failed");
  }
});
