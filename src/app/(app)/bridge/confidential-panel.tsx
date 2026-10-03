"use client";

/**
 * Confidential swap via NEAR Intents.
 *
 * The user's wallet sends to a one-time deposit address; solvers settle on
 * NEAR's private shard and pay a different address the user chooses. The
 * server validates the recipient and binds it to the quote; the checks here
 * only exist to give feedback while typing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Fade, NumberDisplay } from "@/components/motion";
import { GasStationModal } from "@/components/gas-station-modal";
import { LineIcon } from "@/components/line-icon";
import { CHAINS } from "@/lib/chains";
import { getAddress } from "viem";
import { checkRecipient } from "@/lib/near-intents/recipient";
import type { GasStationConfirming } from "@/lib/okx/types";

const CHAIN_LIST = Object.values(CHAINS);
const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const QUOTE_TTL_MS = 60_000;
const POLL_MS = 8_000;
const POLL_MAX_MS = 30 * 60_000;

interface Token {
  chainIndex: number;
  address: string;
  symbol: string;
  decimals: number;
  priceUsd: number | null;
}

interface Quote {
  quoteId: string;
  recipient: string;
  amountInFormatted: string;
  amountInUsd: string | null;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd: string | null;
  minAmountOut: string;
  timeEstimate: number;
  toDecimals: number;
}

interface Execution {
  depositAddress: string;
  txHash: string | null;
  recipient: string;
  amountOutFormatted: string;
  fromChain: number;
  toChain: number;
  toSymbol: string;
}

type SwapStatus =
  | "PENDING_DEPOSIT"
  | "KNOWN_DEPOSIT_TX"
  | "INCOMPLETE_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "REFUNDED"
  | "FAILED";

interface StatusData {
  status: SwapStatus;
  amountOutFormatted?: string;
  refundedAmountFormatted?: string;
  destinationTxHash?: string;
}

const TERMINAL: SwapStatus[] = ["SUCCESS", "REFUNDED", "FAILED", "INCOMPLETE_DEPOSIT"];

const STATUS_TEXT: Record<SwapStatus, { title: string; body: string }> = {
  PENDING_DEPOSIT: { title: "Waiting for your deposit", body: "Your transfer is being confirmed on the source network." },
  KNOWN_DEPOSIT_TX: { title: "Deposit seen", body: "Waiting for enough confirmations to start the swap." },
  PROCESSING: { title: "Swapping privately", body: "Solvers are filling your swap on NEAR's private network." },
  SUCCESS: { title: "Delivered", body: "The recipient has been paid." },
  REFUNDED: { title: "Refunded", body: "The swap could not be filled. Your funds went back to your wallet." },
  INCOMPLETE_DEPOSIT: { title: "Deposit too small", body: "Less than the quoted amount arrived. Contact NEAR Intents support with your deposit address." },
  FAILED: { title: "Swap failed", body: "Your funds are refunded to your wallet. This can take a few minutes." },
};

function toBaseUnits(amount: string, decimals: number): string | null {
  const normalized = amount.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const [intPart, fracPart = ""] = normalized.split(".");
  try {
    const value = BigInt(intPart + fracPart.slice(0, decimals).padEnd(decimals, "0"));
    return value > 0n ? value.toString() : null;
  } catch {
    return null;
  }
}

function fromBaseUnits(value: string, decimals: number): string {
  const s = value.padStart(decimals + 1, "0");
  const intPart = s.slice(0, s.length - decimals) || "0";
  const frac = s.slice(s.length - decimals).slice(0, 6).replace(/0+$/, "");
  return frac ? `${intPart}.${frac}` : intPart;
}

function chainName(chainIndex: number): string {
  return CHAIN_LIST.find((c) => c.chainIndex === chainIndex)?.name ?? "—";
}

function explorer(chainIndex: number): string {
  return CHAIN_LIST.find((c) => c.chainIndex === chainIndex)?.explorer ?? "https://etherscan.io";
}

const SELECT_CLASS =
  "flex h-11 w-full rounded-xl border border-border/60 bg-secondary px-4 text-sm font-medium text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/25 appearance-none cursor-pointer";
const SELECT_STYLE = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' viewBox='0 0 24 24' stroke='%239ca3af' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 14px center",
} as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[13px] font-medium text-muted-foreground mb-2">{label}</p>
      {children}
    </div>
  );
}

export function ConfidentialPanel({ walletAddress }: { walletAddress: string }) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [tokensError, setTokensError] = useState<string | null>(null);
  const [fromChain, setFromChain] = useState(42161);
  const [toChain, setToChain] = useState(8453);
  const [fromAddr, setFromAddr] = useState<string>("");
  const [toAddr, setToAddr] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [balance, setBalance] = useState<string | null>(null);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteKey, setQuoteKey] = useState<string | null>(null);
  const [quoteAt, setQuoteAt] = useState<number | null>(null);
  const [quoteExpired, setQuoteExpired] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [execution, setExecution] = useState<Execution | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [gasStation, setGasStation] = useState<GasStationConfirming | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Token list ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetch("/api/confidential/tokens")
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res.success) setTokens(res.data);
        else setTokensError(res.error ?? "Could not load tokens");
      })
      .catch(() => !cancelled && setTokensError("Could not load tokens"));
    return () => {
      cancelled = true;
    };
  }, []);

  const fromTokens = useMemo(() => tokens.filter((t) => t.chainIndex === fromChain), [tokens, fromChain]);
  const toTokens = useMemo(() => tokens.filter((t) => t.chainIndex === toChain), [tokens, toChain]);

  // Default to USDC (else the first token) whenever a chain's list changes.
  const pickDefault = (list: Token[], current: string) =>
    list.some((t) => t.address === current)
      ? current
      : (list.find((t) => t.symbol === "USDC") ?? list[0])?.address ?? "";
  const fromAddress = pickDefault(fromTokens, fromAddr);
  const toAddress = pickDefault(toTokens, toAddr);
  const fromToken = fromTokens.find((t) => t.address === fromAddress) ?? null;
  const toToken = toTokens.find((t) => t.address === toAddress) ?? null;

  // ── Balance of the selected source token ────────────────────────────────
  useEffect(() => {
    if (!fromToken) return;
    let cancelled = false;
    fetch(`/api/wallet/balances?chain=${fromChain}`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        const raw = res.data;
        const list: Array<Record<string, string>> =
          raw?.details?.[0]?.tokenAssets ?? raw?.tokenAssets ?? (Array.isArray(raw) ? raw : []);
        const match = list.find((t) => {
          const addr = (t.tokenAddress || t.tokenContractAddress || "").toLowerCase();
          return fromToken.address === NATIVE ? addr === "" || addr === NATIVE : addr === fromToken.address;
        });
        setBalance(match?.balance ?? "0");
      })
      .catch(() => !cancelled && setBalance(null));
    return () => {
      cancelled = true;
    };
  }, [fromChain, fromToken]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  // ── Derived input state ─────────────────────────────────────────────────
  const amountBase = fromToken ? toBaseUnits(amount, fromToken.decimals) : null;
  const recipientCheck = recipient.trim() ? checkRecipient(recipient, walletAddress) : null;
  const liveKey =
    fromToken && toToken && amountBase && recipientCheck?.ok
      ? [fromChain, toChain, fromToken.address, toToken.address, amountBase, recipientCheck.address].join("|")
      : null;
  const activeQuote = quote && quoteKey === liveKey ? quote : null;
  const sameAsset = fromChain === toChain && fromAddress === toAddress;
  const balanceBase = balance !== null && fromToken ? toBaseUnits(balance, fromToken.decimals) ?? "0" : null;
  const insufficient = amountBase !== null && balanceBase !== null && BigInt(amountBase) > BigInt(balanceBase);

  useEffect(() => {
    if (quoteAt == null) return;
    const remaining = QUOTE_TTL_MS - (Date.now() - quoteAt);
    if (remaining <= 0) {
      setQuoteExpired(true);
      return;
    }
    setQuoteExpired(false);
    const id = window.setTimeout(() => setQuoteExpired(true), remaining);
    return () => window.clearTimeout(id);
  }, [quoteAt]);

  const resetQuote = () => {
    setQuote(null);
    setQuoteKey(null);
    setQuoteAt(null);
    setQuoteExpired(false);
    setConfirmed(false);
  };

  const requestBody = useCallback(
    () => ({
      fromChain,
      toChain,
      fromToken: fromAddress,
      toToken: toAddress,
      amount: amountBase,
      recipient: recipientCheck?.ok ? recipientCheck.address : recipient,
    }),
    [fromChain, toChain, fromAddress, toAddress, amountBase, recipientCheck, recipient]
  );

  const getQuote = async () => {
    if (!liveKey) return;
    const key = liveKey;
    setQuoteLoading(true);
    setError(null);
    resetQuote();
    try {
      const res = await fetch("/api/confidential/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody()),
      });
      const data = await res.json();
      if (data.success) {
        setQuote(data.data);
        setQuoteKey(key);
        setQuoteAt(Date.now());
      } else {
        setError(data.error ?? "Could not get a quote");
      }
    } catch {
      setError("Could not get a quote");
    } finally {
      setQuoteLoading(false);
    }
  };

  const startPolling = (depositAddress: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const startedAt = Date.now();
    const tick = async () => {
      if (Date.now() - startedAt > POLL_MAX_MS) {
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }
      try {
        const res = await fetch(`/api/confidential/status?depositAddress=${depositAddress}`);
        const data = await res.json();
        if (data.success) {
          setStatus(data.data);
          if (TERMINAL.includes(data.data.status) && pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // keep polling
      }
    };
    void tick();
    pollRef.current = setInterval(tick, POLL_MS);
  };

  const execute = async () => {
    if (!activeQuote || !toToken || !confirmed || quoteExpired) return;
    setExecuting(true);
    setError(null);
    try {
      const res = await fetch("/api/confidential/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestBody(), quoteId: activeQuote.quoteId }),
      });
      const data = await res.json();
      if (data.success) {
        setExecution({ ...data.data, fromChain, toChain, toSymbol: toToken.symbol });
        setStatus(null);
        resetQuote();
        setAmount("");
        startPolling(data.data.depositAddress);
      } else if (data.requiresGasStation) {
        setGasStation(data.gasStation);
      } else if (res.status === 409 && data.code !== "already_started") {
        resetQuote();
        setError(`${data.error ?? "The quote changed."} Get a new quote to continue.`);
      } else {
        setError(data.error ?? "Confidential swap failed");
      }
    } catch {
      setError("No response from the server. Check your wallet history before trying again.");
    } finally {
      setExecuting(false);
    }
  };

  const handleMax = () => {
    if (!balance || !fromToken) return;
    if (fromToken.address !== NATIVE) {
      setAmount(balance);
    } else {
      // Leave some native coin for gas.
      const reserve = fromChain === 1 ? 0.002 : 0.0005;
      const left = Number(balance) - reserve;
      setAmount(left > 0 ? left.toFixed(6) : "0");
    }
    resetQuote();
  };

  if (tokensError) {
    return (
      <div className="voxr-card p-5 text-[13px] text-muted-foreground">{tokensError}</div>
    );
  }

  const minOut = activeQuote ? fromBaseUnits(activeQuote.minAmountOut, activeQuote.toDecimals) : null;
  const costUsd =
    activeQuote?.amountInUsd && activeQuote.amountOutUsd
      ? Math.max(0, Number(activeQuote.amountInUsd) - Number(activeQuote.amountOutUsd))
      : null;
  const finished = status && TERMINAL.includes(status.status);

  return (
    <div className="space-y-5">
      <GasStationModal
        open={gasStation !== null}
        chain={String(fromChain)}
        payload={gasStation}
        onClose={() => setGasStation(null)}
        onResolved={() => {
          setGasStation(null);
          void execute();
        }}
      />

      <div className="voxr-card">
        <div className="p-5 space-y-5">
          {/* Source */}
          <div className="rounded-xl bg-secondary/80 border border-border/40 p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="From network">
                <select
                  className={SELECT_CLASS}
                  style={SELECT_STYLE}
                  value={fromChain}
                  onChange={(e) => {
                    setFromChain(Number(e.target.value));
                    setBalance(null);
                    resetQuote();
                  }}
                >
                  {CHAIN_LIST.map((c) => (
                    <option key={c.chainIndex} value={c.chainIndex}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Token">
                <select
                  className={SELECT_CLASS}
                  style={SELECT_STYLE}
                  value={fromAddress}
                  disabled={fromTokens.length === 0}
                  onChange={(e) => {
                    setFromAddr(e.target.value);
                    setBalance(null);
                    resetQuote();
                  }}
                >
                  {fromTokens.length === 0 && <option value="">Loading…</option>}
                  {fromTokens.map((t) => (
                    <option key={t.address} value={t.address}>{t.symbol}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[13px] font-medium text-muted-foreground">Amount</p>
                {balance !== null && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      Bal: {Number(balance).toFixed(Number(balance) < 1 ? 4 : 2)}
                    </span>
                    <button
                      type="button"
                      onClick={handleMax}
                      className="text-[11px] font-semibold text-primary px-1.5 py-0.5 rounded bg-primary/15"
                    >
                      MAX
                    </button>
                  </div>
                )}
              </div>
              <Input
                placeholder="0.00"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError(null);
                }}
                className="h-11 rounded-xl border-border/60 bg-secondary px-4 text-base font-medium tabular-nums"
              />
              {amount.trim() !== "" && amountBase === null && (
                <p className="text-[12px] text-loss-ink mt-1.5">Enter a valid amount</p>
              )}
              {insufficient && (
                <p className="text-[12px] text-loss-ink mt-1.5">
                  Not enough {fromToken?.symbol} on {chainName(fromChain)}.
                </p>
              )}
            </div>
          </div>

          {/* Destination */}
          <div className="rounded-xl bg-secondary/80 border border-border/40 p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="To network">
                <select
                  className={SELECT_CLASS}
                  style={SELECT_STYLE}
                  value={toChain}
                  onChange={(e) => {
                    setToChain(Number(e.target.value));
                    resetQuote();
                  }}
                >
                  {CHAIN_LIST.map((c) => (
                    <option key={c.chainIndex} value={c.chainIndex}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Token">
                <select
                  className={SELECT_CLASS}
                  style={SELECT_STYLE}
                  value={toAddress}
                  disabled={toTokens.length === 0}
                  onChange={(e) => {
                    setToAddr(e.target.value);
                    resetQuote();
                  }}
                >
                  {toTokens.length === 0 && <option value="">Loading…</option>}
                  {toTokens.map((t) => (
                    <option key={t.address} value={t.address}>{t.symbol}</option>
                  ))}
                </select>
              </Field>
            </div>
            {sameAsset && (
              <p className="text-[12px] text-warn-ink">Pick a different token or network to receive.</p>
            )}
            <Field label="Recipient address">
              <Input
                placeholder="0x…"
                spellCheck={false}
                autoComplete="off"
                value={recipient}
                onChange={(e) => {
                  setRecipient(e.target.value);
                  setError(null);
                }}
                className="h-11 rounded-xl border-border/60 bg-secondary px-4 font-mono text-[13px]"
              />
              {recipientCheck && !recipientCheck.ok && (
                <p className="text-[12px] text-loss-ink mt-1.5">{recipientCheck.error}</p>
              )}
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                Use an address that has never received funds from this wallet. Anything you later send back here links the two again.
              </p>
            </Field>
          </div>

          {/* What stays visible */}
          <div className="flex gap-2.5 rounded-xl border border-border/50 px-4 py-3">
            <LineIcon name="lock" size={16} className="text-primary shrink-0 mt-0.5" />
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Your deposit and the payout are still public transactions. NEAR Intents hides the link between them. Round amounts and waiting before you move the funds again make them harder to match.
            </p>
          </div>

          {/* Quote */}
          {activeQuote && (
            <div className="rounded-xl bg-gradient-to-br from-primary/12 via-primary/8 to-primary/12 border border-primary/20 overflow-hidden">
              <div className="p-4 pb-3">
                <p className="text-[11px] font-medium text-primary/80 uppercase tracking-wide mb-1">
                  Recipient gets
                </p>
                <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                  <NumberDisplay value={activeQuote.amountOutFormatted} decimals={6} minDecimals={0} />{" "}
                  <span className="text-base font-semibold text-primary">{toToken?.symbol}</span>
                </p>
                <p className="text-[12px] text-primary/80 mt-0.5">on {chainName(toChain)}</p>
              </div>
              <div className="border-t border-primary/20 bg-card/60 px-4 py-3 space-y-2.5 text-[12px]">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">You send</span>
                  <span className="font-medium tabular-nums">
                    {activeQuote.amountInFormatted} {fromToken?.symbol} on {chainName(fromChain)}
                  </span>
                </div>
                {minOut && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Minimum received</span>
                    <span className="font-medium tabular-nums">{minOut} {toToken?.symbol}</span>
                  </div>
                )}
                {costUsd !== null && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Cost (fees and spread)</span>
                    <span className="font-medium tabular-nums">
                      {costUsd < 0.01 ? "<$0.01" : `~$${costUsd.toFixed(2)}`}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Estimated time</span>
                  <span className="font-medium">~{Math.max(1, Math.round(activeQuote.timeEstimate))} s after your deposit confirms</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Route</span>
                  <span className="font-medium">Confidential · NEAR Intents</span>
                </div>
                <div className="pt-2 border-t border-primary/15">
                  <p className="text-muted-foreground mb-1">Recipient</p>
                  <p className="font-mono text-[12px] font-medium break-all text-foreground">
                    {getAddress(activeQuote.recipient)}
                  </p>
                </div>
                <label className="flex items-start gap-2.5 pt-2 border-t border-primary/15 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                  />
                  <span className="text-[12px] text-foreground leading-relaxed">
                    I checked every character of the recipient address. Funds sent to a wrong address cannot be recovered.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Error */}
          <Fade in={!!error}>
            {error && (
              <div className="rounded-xl bg-loss-soft border border-loss/30 p-4 flex gap-3 items-start">
                <LineIcon name="alert" size={16} className="text-loss-ink shrink-0 mt-0.5" />
                <p className="flex-1 text-[12px] text-loss-ink leading-relaxed">{error}</p>
                <button type="button" onClick={() => setError(null)} className="text-loss-ink p-0.5" aria-label="Dismiss">
                  <LineIcon name="close" size={14} />
                </button>
              </div>
            )}
          </Fade>

          {/* Progress */}
          <Fade in={!!execution}>
            {execution && (
              <div className="rounded-xl bg-gain-soft border border-gain/30 p-4 space-y-1.5">
                <p className="text-[13px] font-semibold text-gain-ink">
                  {STATUS_TEXT[status?.status ?? "PENDING_DEPOSIT"].title}
                </p>
                <p className="text-[12px] text-gain-ink leading-relaxed">
                  {STATUS_TEXT[status?.status ?? "PENDING_DEPOSIT"].body}
                  {status?.status === "SUCCESS" && status.amountOutFormatted &&
                    ` ${status.amountOutFormatted} ${execution.toSymbol} on ${chainName(execution.toChain)}.`}
                  {status?.status === "REFUNDED" && status.refundedAmountFormatted &&
                    ` Refunded: ${status.refundedAmountFormatted}.`}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[12px] font-medium">
                  {execution.txHash && (
                    <a className="text-gain-ink underline underline-offset-2" target="_blank" rel="noopener noreferrer"
                      href={`${explorer(execution.fromChain)}/tx/${execution.txHash}`}>
                      Your deposit
                    </a>
                  )}
                  {status?.destinationTxHash && (
                    <a className="text-gain-ink underline underline-offset-2" target="_blank" rel="noopener noreferrer"
                      href={`${explorer(execution.toChain)}/tx/${status.destinationTxHash}`}>
                      Payout on {chainName(execution.toChain)}
                    </a>
                  )}
                  <a className="text-gain-ink underline underline-offset-2" target="_blank" rel="noopener noreferrer"
                    href="https://explorer.near-intents.org">
                    NEAR Intents explorer
                  </a>
                </div>
                <p className="text-[11px] text-gain-ink/80 pt-1">
                  Deposit address (search it on the explorer):{" "}
                  <span className="font-mono break-all">{execution.depositAddress}</span>
                </p>
                {finished && (
                  <button
                    type="button"
                    className="text-[12px] text-gain-ink pt-1"
                    onClick={() => {
                      setExecution(null);
                      setStatus(null);
                    }}
                  >
                    Dismiss
                  </button>
                )}
              </div>
            )}
          </Fade>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button
              onClick={getQuote}
              disabled={quoteLoading || !liveKey || sameAsset}
              variant="outline"
              className="flex-1 h-11 rounded-xl text-[13px] font-semibold"
            >
              {quoteLoading ? "Getting quote…" : activeQuote && quoteExpired ? "Refresh quote" : "Get quote"}
            </Button>
            <Button
              onClick={execute}
              disabled={executing || !activeQuote || quoteExpired || !confirmed || insufficient}
              className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold"
            >
              {executing ? "Sending…" : "Swap privately"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
