"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAllChainBalances } from "@/hooks/use-balances";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CHAINS } from "@/lib/chains";
import { formatUsd } from "@/lib/utils";
import { toast } from "sonner";

interface TxEntry {
  txHash: string;
  txTime: string;
  direction?: string;
  txStatus?: string;
  chainSymbol?: string;
  symbol?: string;
  amount?: string;
  isApprove?: boolean;
  gasFeeEth?: string;
  from?: string;
  to?: string;
  failReason?: string;
  contractName?: string;
}

export default function WalletPage() {
  const { authenticated, walletAddress, accountName, accountId, accountCount, mutate: mutateAuth } = useAuth();
  const { balancesByChain, isLoading, mutateAll } = useAllChainBalances();

  const [sendForm, setSendForm] = useState({
    recipient: "",
    amount: "",
    chain: "1",
    // tokenKey = "native" or "CONTRACT_ADDRESS"
    tokenKey: "native",
  });
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);

  // History state
  const [history, setHistory] = useState<TxEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/wallet/history?limit=20");
      const data = await res.json();
      if (data.success) {
        const entries = Array.isArray(data.data)
          ? data.data
          : Array.isArray(data.data?.data)
          ? data.data.data
          : [];
        setHistory(entries);
      }
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
      setHistoryLoaded(true);
    }
  }, []);

  const handleAddAccount = async () => {
    setAddingAccount(true);
    try {
      const res = await fetch("/api/wallet/accounts", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success("New wallet account created!");
        mutateAuth();
        mutateAll();
      } else {
        toast.error(data.error || "Failed to add account");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setAddingAccount(false);
    }
  };

  const handleSwitchAccount = async (targetAccountId: string) => {
    setSwitchingAccount(true);
    try {
      const res = await fetch("/api/wallet/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: targetAccountId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Switched account!");
        mutateAuth();
        mutateAll();
      } else {
        toast.error(data.error || "Failed to switch account");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSwitchingAccount(false);
    }
  };

  const handleForceRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/wallet/balances?force=true");
      mutateAll();
      toast.success("Balances refreshed");
    } catch {
      toast.error("Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-[15px]">
          Please connect your wallet first.
        </p>
      </div>
    );
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    const contractToken = sendForm.tokenKey !== "native" ? sendForm.tokenKey : undefined;
    try {
      const res = await fetch("/api/wallet/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: sendForm.amount,
          recipient: sendForm.recipient.toLowerCase(),
          chain: parseInt(sendForm.chain),
          contractToken,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Transaction sent! Hash: ${data.data?.txHash || "pending"}`);
        setSendForm({ recipient: "", amount: "", chain: "1", tokenKey: "native" });
      } else {
        toast.error(data.error || "Send failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSending(false);
    }
  };

  const evmAddress = walletAddress;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-eyebrow">MULTI-CHAIN</p>
        <h1 className="mt-1.5 text-display-lg text-foreground">Wallet</h1>
        <p className="text-[13px] text-muted-foreground mt-2">Manage your assets across all chains</p>
      </div>

      {/* Account card */}
      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary font-bold text-[15px] shrink-0">
            {accountName ? accountName.slice(0, 2).toUpperCase() : "W1"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-foreground">{accountName ?? "Wallet 1"}</p>
            <p className="text-[12px] text-muted-foreground font-mono truncate">{walletAddress ?? "—"}</p>
          </div>
          <div className="flex items-center gap-2">
            {accountCount > 1 && (
              <button
                onClick={() => {
                  const id = prompt(`Switch to account ID (current: ${accountId ?? "—"})`);
                  if (id) handleSwitchAccount(id);
                }}
                disabled={switchingAccount}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border/60 bg-secondary text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
              >
                {switchingAccount ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>
                  </svg>
                )}
                Switch ({accountCount})
              </button>
            )}
            <button
              onClick={handleAddAccount}
              disabled={addingAccount}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-white text-[12px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {addingAccount ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              )}
              Add Account
            </button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="balances">
        <div className="overflow-x-auto pb-1 -mx-1 px-1">
        <TabsList className="h-10 rounded-full bg-muted/60 p-1 w-max min-w-full">
          <TabsTrigger value="balances" className="rounded-full px-3 sm:px-5 text-[13px] font-medium data-[state=active]:bg-secondary data-[state=active]:shadow-sm">
            Balances
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-full px-3 sm:px-5 text-[13px] font-medium data-[state=active]:bg-secondary data-[state=active]:shadow-sm" onClick={() => { if (!historyLoaded) loadHistory(); }}>
            History
          </TabsTrigger>
          <TabsTrigger value="deposit" className="rounded-full px-3 sm:px-5 text-[13px] font-medium data-[state=active]:bg-secondary data-[state=active]:shadow-sm">
            Deposit
          </TabsTrigger>
          <TabsTrigger value="send" className="rounded-full px-3 sm:px-5 text-[13px] font-medium data-[state=active]:bg-secondary data-[state=active]:shadow-sm">
            Send
          </TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="balances" className="mt-6 space-y-4">
          {/* Refresh button */}
          <div className="flex justify-end">
            <button
              onClick={handleForceRefresh}
              disabled={refreshing || isLoading}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={refreshing ? "animate-spin" : ""}>
                <path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16"/>
              </svg>
              {refreshing ? "Refreshing..." : "Refresh balances"}
            </button>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {Object.values(CHAINS).map((chain) => {
                const chainBal = balancesByChain[chain.chainIndex];
                return (
                  <Card
                    key={chain.chainIndex}
                    className="hover-lift rounded-2xl border-border/60 shadow-sm"
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-[13px] font-medium text-muted-foreground flex items-center justify-between">
                        {chain.name}
                        {!chain.hasFluid && (
                          <Badge
                            variant="outline"
                            className="text-[11px] font-normal border-border/60 text-muted-foreground/70"
                          >
                            No Lending
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl font-semibold tracking-tight">
                        {chainBal?.isLoading ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          </span>
                        ) : (
                          formatUsd(chainBal?.totalValueUsd ?? "0")
                        )}
                      </p>
                      {chainBal?.tokens && chainBal.tokens.length > 0 ? (
                        <div className="mt-3 space-y-0">
                          {chainBal.tokens.map((t, i) => (
                            <div
                              key={`${t.tokenAddress}-${i}`}
                              className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0"
                            >
                              <span className="text-[13px] text-muted-foreground">
                                {t.symbol}
                              </span>
                              <span className="text-[13px] font-mono font-medium">
                                {parseFloat(t.balance).toFixed(4)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[13px] text-muted-foreground/60 mt-2">
                          No tokens found
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold tracking-tight flex items-center justify-between">
                Transaction History
                <button
                  onClick={loadHistory}
                  disabled={historyLoading}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={historyLoading ? "animate-spin" : ""}>
                    <path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16"/>
                  </svg>
                  Refresh
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : history.length === 0 ? (
                <p className="text-[13px] text-muted-foreground/60 text-center py-8">
                  No transactions found
                </p>
              ) : (
                <div className="space-y-0">
                  {history.map((tx, i) => {
                    const isReceive = tx.direction === "IN";
                    const isSuccess = tx.txStatus === "SUCCESS";
                    const isError = tx.txStatus === "ERROR";
                    const stateColor = isSuccess ? "text-emerald-400" : isError ? "text-red-500" : "text-amber-500";
                    const stateLabel = isSuccess ? "Success" : isError ? "Failed" : "Pending";
                    const dateStr = tx.txTime
                      ? new Date(parseInt(tx.txTime)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                      : "—";

                    // Action label: Approve / Receive / Send / Contract
                    const hasAmount = tx.amount && parseFloat(tx.amount) > 0;
                    let actionLabel: string;
                    let iconType: "approve" | "in" | "out" | "contract";
                    if (tx.isApprove) {
                      actionLabel = `Approve ${tx.symbol ?? ""}`.trim();
                      iconType = "approve";
                    } else if (hasAmount && isReceive) {
                      actionLabel = `Receive ${tx.symbol ?? ""}`.trim();
                      iconType = "in";
                    } else if (hasAmount && !isReceive) {
                      actionLabel = `Send ${tx.symbol ?? ""}`.trim();
                      iconType = "out";
                    } else {
                      actionLabel = tx.contractName ? `Contract · ${tx.contractName}` : "Contract Call";
                      iconType = "contract";
                    }

                    // Amount display
                    const amountDisplay = hasAmount
                      ? `${parseFloat(tx.amount!).toFixed(4)} ${tx.symbol ?? ""}`
                      : tx.gasFeeEth
                      ? `Gas ${tx.gasFeeEth} ETH`
                      : "—";

                    const explorerBase = tx.chainSymbol === "MATIC"
                      ? "https://polygonscan.com"
                      : tx.chainSymbol === "BSC"
                      ? "https://bscscan.com"
                      : tx.chainSymbol === "SOL"
                      ? "https://solscan.io"
                      : "https://etherscan.io";

                    const iconBg = iconType === "in" ? "bg-emerald-950/30" : iconType === "approve" ? "bg-amber-950/30" : iconType === "contract" ? "bg-secondary" : "bg-primary/15";
                    const iconColor = iconType === "in" ? "text-emerald-400" : iconType === "approve" ? "text-amber-400" : iconType === "contract" ? "text-violet-400" : "text-primary";

                    return (
                      <div key={`${tx.txHash}-${i}`} className="flex items-center gap-3 py-3 border-b border-border/40 last:border-0">
                        {/* Icon */}
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
                          {iconType === "approve" ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconColor}>
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                            </svg>
                          ) : iconType === "contract" ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconColor}>
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconColor}>
                              {iconType === "in"
                                ? <><path d="M12 5v14"/><path d="m5 12 7 7 7-7"/></>
                                : <><path d="M12 19V5"/><path d="m19 12-7-7-7 7"/></>
                              }
                            </svg>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium truncate">{actionLabel}</span>
                            <span className={`text-[11px] font-medium shrink-0 ${stateColor}`}>{stateLabel}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[11px] text-muted-foreground">{tx.chainSymbol ?? "—"}</span>
                            <span className="text-[11px] text-muted-foreground">·</span>
                            <span className="text-[11px] text-muted-foreground">{dateStr}</span>
                            {tx.failReason && (
                              <>
                                <span className="text-[11px] text-muted-foreground">·</span>
                                <span className="text-[11px] text-red-400 truncate max-w-[100px]">{tx.failReason}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Amount + link */}
                        <div className="text-right shrink-0">
                          <p className="text-[12px] font-medium tabular-nums text-foreground/80">{amountDisplay}</p>
                          {tx.txHash && (
                            <a
                              href={`${explorerBase}/tx/${tx.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-primary hover:text-primary font-mono"
                            >
                              {tx.txHash.slice(0, 6)}…{tx.txHash.slice(-4)}
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deposit" className="mt-6 space-y-4">
          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold tracking-tight">
                Deposit Address
              </CardTitle>
              <p className="text-[13px] text-muted-foreground">
                Send assets to this address on any supported EVM chain
              </p>
            </CardHeader>
            <CardContent>
              {evmAddress ? (
                <div className="space-y-4">
                  <div className="gradient-bg rounded-xl p-5 font-mono text-[13px] break-all leading-relaxed text-foreground/80 border border-border/40">
                    {evmAddress}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full px-5 text-[13px]"
                    onClick={() => {
                      navigator.clipboard.writeText(evmAddress);
                      toast.success("Address copied!");
                    }}
                  >
                    Copy Address
                  </Button>
                  <p className="text-[12px] text-muted-foreground/70">
                    This address works on Ethereum, Arbitrum, Base, and BNB
                    Chain.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-center h-20">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="send" className="mt-6 space-y-4">
          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold tracking-tight">
                Send Tokens
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSend} className="space-y-5">
                {/* Chain selector */}
                <div className="space-y-2">
                  <Label htmlFor="send-chain" className="text-[13px] font-medium">
                    Chain
                  </Label>
                  <select
                    id="send-chain"
                    className="flex h-11 w-full rounded-xl border border-border/60 bg-transparent px-3 py-1 text-[14px] outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
                    value={sendForm.chain}
                    onChange={(e) =>
                      setSendForm({ ...sendForm, chain: e.target.value, tokenKey: "native" })
                    }
                  >
                    {Object.values(CHAINS).map((c) => (
                      <option key={c.chainIndex} value={c.chainIndex}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Token selector from owned balances */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="send-token" className="text-[13px] font-medium">Token</Label>
                    <button
                      type="button"
                      onClick={async () => {
                        setRefreshing(true);
                        try {
                          await fetch(`/api/wallet/balances?chain=${sendForm.chain}&force=true`);
                          mutateAll();
                        } finally {
                          setRefreshing(false);
                        }
                      }}
                      disabled={refreshing || isLoading}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={refreshing ? "animate-spin" : ""}>
                        <path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16"/>
                      </svg>
                      Refresh
                    </button>
                  </div>
                  {(() => {
                    const chainBal = balancesByChain[parseInt(sendForm.chain)];
                    const tokens = chainBal?.tokens ?? [];
                    const chainInfo = Object.values(CHAINS).find(c => String(c.chainIndex) === sendForm.chain);
                    const nativeSymbol = tokens.find(t => t.isNative)?.symbol ?? chainInfo?.nativeSymbol ?? "ETH";
                    const selectedBalance = sendForm.tokenKey === "native"
                      ? tokens.find(t => t.isNative)?.balance ?? "0"
                      : tokens.find(t => t.tokenAddress === sendForm.tokenKey)?.balance ?? "0";
                    return (
                      <div className="space-y-1.5">
                        <select
                          id="send-token"
                          className="flex h-11 w-full rounded-xl border border-border/60 bg-transparent px-3 py-1 text-[14px] outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
                          value={sendForm.tokenKey}
                          onChange={(e) =>
                            setSendForm({ ...sendForm, tokenKey: e.target.value, amount: "" })
                          }
                        >
                          <option value="native">{nativeSymbol} (native)</option>
                          {tokens
                            .filter(t => !t.isNative && t.tokenAddress)
                            .map(t => (
                              <option key={t.tokenAddress} value={t.tokenAddress!}>
                                {t.symbol} — {parseFloat(t.balance).toFixed(4)}
                              </option>
                            ))}
                          {tokens.length === 0 && (
                            <option disabled value="">No tokens found on this chain</option>
                          )}
                        </select>
                        {parseFloat(selectedBalance) > 0 && (
                          <p className="text-[12px] text-muted-foreground">
                            Balance: {parseFloat(selectedBalance).toFixed(6)}{" "}
                            {sendForm.tokenKey === "native"
                              ? nativeSymbol
                              : tokens.find(t => t.tokenAddress === sendForm.tokenKey)?.symbol ?? ""}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Amount + MAX */}
                <div className="space-y-2">
                  <Label htmlFor="send-amount" className="text-[13px] font-medium">
                    Amount
                  </Label>
                  <div className="relative">
                    <Input
                      id="send-amount"
                      type="text"
                      placeholder="0.00"
                      className="h-11 rounded-xl text-[14px] pr-16"
                      value={sendForm.amount}
                      onChange={(e) =>
                        setSendForm({ ...sendForm, amount: e.target.value })
                      }
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-primary hover:text-primary transition-colors"
                      onClick={() => {
                        const chainBal = balancesByChain[parseInt(sendForm.chain)];
                        const tokens = chainBal?.tokens ?? [];
                        const bal = sendForm.tokenKey === "native"
                          ? tokens.find(t => t.isNative)?.balance
                          : tokens.find(t => t.tokenAddress === sendForm.tokenKey)?.balance;
                        if (bal) setSendForm({ ...sendForm, amount: bal });
                      }}
                    >
                      MAX
                    </button>
                  </div>
                </div>

                {/* Recipient */}
                <div className="space-y-2">
                  <Label htmlFor="recipient" className="text-[13px] font-medium">
                    Recipient Address
                  </Label>
                  <Input
                    id="recipient"
                    placeholder="0x..."
                    className="h-11 rounded-xl text-[14px]"
                    value={sendForm.recipient}
                    onChange={(e) =>
                      setSendForm({ ...sendForm, recipient: e.target.value })
                    }
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={sending}
                  className="h-11 rounded-xl px-8 text-[14px] font-medium"
                >
                  {sending ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Sending…
                    </span>
                  ) : (
                    "Send"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
