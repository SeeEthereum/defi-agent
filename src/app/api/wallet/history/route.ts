import { NextRequest, NextResponse } from "next/server";
import { walletHistory } from "@/lib/okx/cli";

// Normalize a raw orderList entry to a consistent shape the UI can consume
function normalizeEntry(raw: Record<string, unknown>) {
  const isApprove = !!raw.approveSymbol;
  // serviceCharge is in raw wei — convert to ETH for display
  const gasFeeWei = parseInt((raw.serviceCharge as string) ?? "0", 10);
  const gasFeeEth = gasFeeWei > 0 ? (gasFeeWei / 1e18).toFixed(6) : "";

  return {
    txHash: (raw.txHash ?? "") as string,
    txTime: (raw.txTime ?? raw.txCreateTime ?? "") as string,
    direction: (raw.direction ?? "OUT") as string,    // "IN" | "OUT"
    txStatus: (raw.txStatus ?? "PENDING") as string,  // "SUCCESS" | "ERROR" | "PENDING"
    chainSymbol: (raw.chainSymbol ?? "") as string,
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const result = await walletHistory({
      txHash: searchParams.get("txHash") ?? undefined,
      chain: searchParams.get("chain") ?? undefined,
      address: searchParams.get("address") ?? undefined,
      limit: searchParams.get("limit") ?? "20",
      pageNum: searchParams.get("pageNum") ?? undefined,
    });

    // CLI returns [{cursor, orderList: [tx, ...]}] — flatten all pages
    const pages = Array.isArray(result.data)
      ? (result.data as Array<{ cursor?: string; orderList?: Record<string, unknown>[] }>)
      : [];

    const transactions = pages
      .flatMap((page) => page.orderList ?? [])
      .map(normalizeEntry);

    return NextResponse.json({ success: true, data: transactions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch history";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
