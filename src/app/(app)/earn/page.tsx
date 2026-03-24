"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useFluidMarkets, useFluidPositions } from "@/hooks/use-fluid-markets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";
import { TokenIcon } from "@/components/token-icon";
import type { FluidMarket } from "@/lib/fluid/resolver";

const CHAIN_TABS = [
  { id: "all", label: "All Chains" },
  { id: "1", label: "Ethereum" },
  { id: "42161", label: "Arbitrum" },
  { id: "8453", label: "Base" },
] as const;

type SupplyStep = "idle" | "approving" | "approved" | "supplying" | "done";

interface SupplyDialogProps {
  market: FluidMarket;
  walletAddress: string;
}

function SupplyDialog({ market, walletAddress }: SupplyDialogProps) {
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<SupplyStep>("idle");
  const [approveTxHash, setApproveTxHash] = useState("");
  const [depositTxHash, setDepositTxHash] = useState("");
  const [open, setOpen] = useState(false);

  const baseBody = {
    fTokenSymbol: market.symbol,
    amount,
    chainIndex: market.chainIndex,
    walletAddress,
  };

  const handleApprove = async () => {
    if (!amount) return;
    setStep("approving");
    try {
      const res = await fetch("/api/earn/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(baseBody),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Approve failed");
      setApproveTxHash(data.data?.approveTxHash ?? "");
      setStep("approved");
      toast.success("Approval confirmed! Now click Supply.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
      setStep("idle");
    }
  };

  const handleSupply = async () => {
    setStep("supplying");
    try {
      const res = await fetch("/api/earn/supply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(baseBody),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Supply failed");
      setDepositTxHash(data.data?.depositTxHash ?? "");
      setStep("done");
      toast.success(`Deposited! Tx: ${data.data?.depositTxHash ?? "pending"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Supply failed");
      setStep("approved"); // allow retry
    }
  };

  const reset = () => {
    setAmount("");
    setStep("idle");
    setApproveTxHash("");
    setDepositTxHash("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger
        className="inline-flex shrink-0 items-center justify-center rounded-xl h-9 px-5 text-[13px] font-medium bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 cursor-pointer transition-colors"
        onClick={() => setOpen(true)}
      >
        Supply
      </DialogTrigger>
      <DialogContent className="rounded-2xl sm:rounded-2xl border-border/60 shadow-lg p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-lg font-semibold tracking-tight flex items-center gap-2.5">
            <TokenIcon symbol={market.underlyingSymbol} size={28} />
            Supply {market.underlyingSymbol} on {market.chainName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-6 pb-6 pt-4">
          {/* APY card */}
          <div className="rounded-xl bg-emerald-50/60 p-4">
            <p className="text-[13px] text-emerald-600/80 font-medium">Estimated APY</p>
            <p className="text-2xl font-semibold tracking-tight text-emerald-600 mt-0.5">
              {market.totalAprPercent.toFixed(2)}%
            </p>
          </div>

          {/* Amount input — locked after approve */}
          <div className="space-y-2">
            <Label className="text-[13px] font-medium text-foreground/80">
              Amount ({market.underlyingSymbol})
            </Label>
            <Input
              type="text"
              placeholder="100"
              className="h-11 rounded-xl border-border/60 text-[15px] placeholder:text-muted-foreground/50"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={step !== "idle"}
            />
          </div>

          {/* 2-step progress */}
          <div className="flex items-center gap-3">
            {/* Step 1 */}
            <div className={`flex items-center gap-1.5 text-[12px] font-medium ${
              step === "approved" || step === "supplying" || step === "done"
                ? "text-emerald-600"
                : "text-foreground/60"
            }`}>
              {step === "approved" || step === "supplying" || step === "done"
                ? <CheckCircle2 className="h-3.5 w-3.5" />
                : <span className="h-3.5 w-3.5 rounded-full border-2 border-current flex items-center justify-center text-[9px]">1</span>
              }
              Approve
            </div>
            <div className="h-px flex-1 bg-border/50" />
            {/* Step 2 */}
            <div className={`flex items-center gap-1.5 text-[12px] font-medium ${
              step === "done" ? "text-emerald-600" : "text-foreground/60"
            }`}>
              {step === "done"
                ? <CheckCircle2 className="h-3.5 w-3.5" />
                : <span className="h-3.5 w-3.5 rounded-full border-2 border-current flex items-center justify-center text-[9px]">2</span>
              }
              Supply
            </div>
          </div>

          {/* Done state */}
          {step === "done" ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200/60 p-4 space-y-1">
              <p className="text-[13px] font-semibold text-emerald-700">Supply complete!</p>
              {depositTxHash && (
                <p className="text-[11px] text-emerald-600 font-mono break-all">
                  Tx: {depositTxHash.slice(0, 10)}…{depositTxHash.slice(-8)}
                </p>
              )}
              <Button size="sm" variant="outline" className="mt-2 h-8 rounded-lg text-[12px]"
                onClick={() => { reset(); setOpen(false); }}>
                Close
              </Button>
            </div>
          ) : step === "idle" || step === "approving" ? (
            /* Step 1 button */
            <Button
              className="w-full h-11 rounded-xl text-[14px] font-medium"
              disabled={step === "approving" || !amount}
              onClick={handleApprove}
            >
              {step === "approving" ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Approving…
                </span>
              ) : `1. Approve ${amount || "0"} ${market.underlyingSymbol}`}
            </Button>
          ) : (
            /* Step 2 button */
            <div className="space-y-3">
              {approveTxHash && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <p className="text-[12px] text-emerald-700">
                    Approved — tx{" "}
                    <span className="font-mono">
                      {approveTxHash.slice(0, 8)}…{approveTxHash.slice(-6)}
                    </span>
                  </p>
                </div>
              )}
              <Button
                className="w-full h-11 rounded-xl text-[14px] font-medium"
                disabled={step === "supplying"}
                onClick={handleSupply}
              >
                {step === "supplying" ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Supplying…
                  </span>
                ) : `2. Supply ${amount} ${market.underlyingSymbol}`}
              </Button>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
            Step 1 authorises Fluid to spend your {market.underlyingSymbol}.
            Step 2 deposits into the {market.symbol} vault.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function EarnPage() {
  const { authenticated, walletAddress } = useAuth();
  const { markets, isLoading } = useFluidMarkets();
  const { positions, isLoading: positionsLoading } = useFluidPositions(walletAddress);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [activeChain, setActiveChain] = useState<string>("all");

  const handleWithdraw = async (fTokenSymbol: string, chainIndex: number, amount: string) => {
    setWithdrawLoading(true);
    try {
      const res = await fetch("/api/earn/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fTokenSymbol, amount, chainIndex, walletAddress: walletAddress ?? "" }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Withdrawal successful! Tx: ${data.data.txHash}`);
      } else {
        toast.error(data.error || "Withdrawal failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setWithdrawLoading(false);
    }
  };

  const chainNames: Record<number, string> = { 1: "Ethereum", 42161: "Arbitrum", 8453: "Base" };

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-[15px]">Please connect your wallet first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Earn</h1>
        <p className="text-muted-foreground text-[15px]">Supply assets to Fluid lending protocol and earn yield</p>
      </div>

      {/* Positions */}
      {positionsLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-[13px]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Loading positions</span>
        </div>
      )}

      {positions.length > 0 && (
        <div className="space-y-4">
          <div className="space-y-0.5">
            <h2 className="text-lg font-semibold tracking-tight">Your Positions</h2>
            <p className="text-[13px] text-muted-foreground">Active Fluid lending positions</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {positions.map((pos) => (
              <Card key={`${pos.chainIndex}-${pos.fTokenAddress}`} className="rounded-2xl border-border/60 shadow-sm hover-lift">
                <CardContent className="pt-5 pb-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <TokenIcon symbol={pos.underlyingSymbol} size={28} />
                      <span className="font-medium text-[15px]">{pos.underlyingSymbol}</span>
                    </div>
                    <Badge variant="outline" className="rounded-lg text-[11px] font-medium border-border/60 text-muted-foreground">
                      {chainNames[pos.chainIndex] ?? `Chain ${pos.chainIndex}`}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tracking-tight">
                      {parseFloat(pos.underlyingAssetsUi).toFixed(4)}
                    </p>
                    <p className="text-[13px] text-muted-foreground mt-0.5">
                      {pos.underlyingSymbol} supplied via {pos.symbol}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full rounded-xl h-9 text-[13px] font-medium border-border/60"
                    disabled={withdrawLoading}
                    onClick={() => handleWithdraw(pos.symbol, pos.chainIndex, pos.underlyingAssetsUi)}
                  >
                    {withdrawLoading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Withdrawing
                      </span>
                    ) : "Withdraw All"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Markets */}
      <div className="space-y-5">
        <div className="flex items-end justify-between">
          <div className="space-y-0.5">
            <h2 className="text-lg font-semibold tracking-tight">Fluid Lending Markets</h2>
            <p className="text-[13px] text-muted-foreground">Live APY rates from on-chain data</p>
          </div>
        </div>

        {/* Chain tabs */}
        <div className="flex items-center gap-1.5 rounded-full bg-muted/60 p-1 w-fit">
          {CHAIN_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveChain(tab.id)}
              className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 cursor-pointer ${
                activeChain === tab.id ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <p className="text-[13px] text-muted-foreground">Loading markets</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {markets
                  .filter((m) => activeChain === "all" || String(m.chainIndex) === activeChain)
                  .map((market) => (
                    <div key={`${market.chainIndex}-${market.fTokenAddress}`}
                      className="flex items-center justify-between px-5 py-4 hover:bg-accent/30 transition-colors">
                      <div className="flex items-center gap-3.5">
                        <TokenIcon symbol={market.underlyingSymbol} size={36} />
                        <div>
                          <p className="text-[14px] font-semibold leading-tight">{market.underlyingSymbol}</p>
                          <p className="text-[12px] text-muted-foreground mt-0.5">{market.chainName}</p>
                        </div>
                      </div>

                      <div className="hidden sm:flex items-center gap-6 text-right">
                        <div>
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Supply</p>
                          <p className="text-[13px] font-medium tabular-nums mt-0.5">{market.supplyRatePercent.toFixed(2)}%</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Rewards</p>
                          <p className="text-[13px] font-medium tabular-nums mt-0.5">{market.rewardsRatePercent.toFixed(2)}%</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right mr-1">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">APY</p>
                          <p className="text-[15px] font-semibold tabular-nums text-emerald-600 mt-0.5">
                            {market.totalAprPercent.toFixed(2)}%
                          </p>
                        </div>
                        <SupplyDialog market={market} walletAddress={walletAddress ?? ""} />
                      </div>
                    </div>
                  ))}
                {markets.filter((m) => activeChain === "all" || String(m.chainIndex) === activeChain).length === 0 && !isLoading && (
                  <div className="py-12 text-center text-[13px] text-muted-foreground">No markets available on this chain</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
