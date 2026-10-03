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
import { Fade, NumberDisplay } from "@/components/motion";
import { GasStationModal } from "@/components/gas-station-modal";
import { LineIcon } from "@/components/line-icon";
import { Empty, Panel } from "@/components/premium";
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
  return CHAIN_LIST.find((c) => c.chainIndex === chainIndex)?.name ?? "unknown network";
}

function explorer(chainIndex: number): string {
  return CHAIN_LIST.find((c) => c.chainIndex === chainIndex)?.explorer ?? "https://etherscan.io";
}

/** A compact select shown as a chip; the label is for screen readers. */
function ChipSelect({
  id,
  label,
  value,
  disabled,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string | number;
  disabled?: boolean;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="select select--chip">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select id={id} className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
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
    return <Empty icon="lock" title="Confidential swaps are unavailable" text={tokensError} />;
  }

  const minOut = activeQuote ? fromBaseUnits(activeQuote.minAmountOut, activeQuote.toDecimals) : null;
  const costUsd =
    activeQuote?.amountInUsd && activeQuote.amountOutUsd
      ? Math.max(0, Number(activeQuote.amountInUsd) - Number(activeQuote.amountOutUsd))
      : null;
  const finished = status && TERMINAL.includes(status.status);
  const payUsd = fromToken?.priceUsd && amountBase ? Number(amount.replace(",", ".")) * fromToken.priceUsd : null;
  const statusText = STATUS_TEXT[status?.status ?? "PENDING_DEPOSIT"];
  const statusBad = status?.status === "FAILED" || status?.status === "INCOMPLETE_DEPOSIT";

  return (
    <div className="bento">
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

      <Panel className="span-7 ticket" index={1}>
        {/* source */}
        <div className="leg">
          <div className="leg-top">
            <div className="chip-pair">
              <ChipSelect
                id="conf-from-chain"
                label="From network"
                value={fromChain}
                onChange={(v) => {
                  setFromChain(Number(v));
                  setBalance(null);
                  resetQuote();
                }}
              >
                {CHAIN_LIST.map((c) => (
                  <option key={c.chainIndex} value={c.chainIndex}>
                    {c.name}
                  </option>
                ))}
              </ChipSelect>
              <ChipSelect
                id="conf-from-token"
                label="Token to send"
                value={fromAddress}
                disabled={fromTokens.length === 0}
                onChange={(v) => {
                  setFromAddr(v);
                  setBalance(null);
                  resetQuote();
                }}
              >
                {fromTokens.length === 0 && <option value="">Loading…</option>}
                {fromTokens.map((t) => (
                  <option key={t.address} value={t.address}>
                    {t.symbol}
                  </option>
                ))}
              </ChipSelect>
            </div>
            {balance !== null && (
              <span className="leg-bal">
                <span className="num">{Number(balance).toLocaleString("en-US", { maximumFractionDigits: 6 })}</span> available
                {Number(balance) > 0 && (
                  <button type="button" className="max" onClick={handleMax}>
                    Max
                  </button>
                )}
              </span>
            )}
          </div>
          <div className="leg-main">
            <label htmlFor="conf-amount" className="sr-only">
              Amount to send
            </label>
            <input
              id="conf-amount"
              className="amount-in"
              placeholder="0"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              aria-invalid={(amount.trim() !== "" && amountBase === null) || insufficient}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
            />
            <span className="leg-sym">{fromToken?.symbol}</span>
          </div>
          <div className="leg-foot">
            {amount.trim() !== "" && amountBase === null ? (
              <span className="err">Enter a valid amount</span>
            ) : insufficient ? (
              <span className="err">
                Not enough {fromToken?.symbol} on {chainName(fromChain)}.
              </span>
            ) : (
              <span className="num">{payUsd != null ? `$${payUsd.toFixed(2)}` : "\u00a0"}</span>
            )}
          </div>
        </div>

        <div className="flip-wrap" aria-hidden="true">
          <span className="flip">
            <LineIcon name="arrow-down" size={18} />
          </span>
        </div>

        {/* destination */}
        <div className="leg">
          <div className="leg-top">
            <div className="chip-pair">
              <ChipSelect
                id="conf-to-chain"
                label="To network"
                value={toChain}
                onChange={(v) => {
                  setToChain(Number(v));
                  resetQuote();
                }}
              >
                {CHAIN_LIST.map((c) => (
                  <option key={c.chainIndex} value={c.chainIndex}>
                    {c.name}
                  </option>
                ))}
              </ChipSelect>
              <ChipSelect
                id="conf-to-token"
                label="Token to receive"
                value={toAddress}
                disabled={toTokens.length === 0}
                onChange={(v) => {
                  setToAddr(v);
                  resetQuote();
                }}
              >
                {toTokens.length === 0 && <option value="">Loading…</option>}
                {toTokens.map((t) => (
                  <option key={t.address} value={t.address}>
                    {t.symbol}
                  </option>
                ))}
              </ChipSelect>
            </div>
          </div>
          <div className="field" style={{ marginTop: 6 }}>
            <label htmlFor="conf-recipient">Recipient address</label>
            <input
              id="conf-recipient"
              className="input mono"
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
              value={recipient}
              aria-invalid={recipientCheck != null && !recipientCheck.ok}
              onChange={(e) => {
                setRecipient(e.target.value);
                setError(null);
              }}
            />
            {recipientCheck && !recipientCheck.ok ? (
              <p className="err">{recipientCheck.error}</p>
            ) : (
              <p className="hint">Use an address that has never received funds from this&nbsp;wallet.</p>
            )}
          </div>
        </div>

        {sameAsset && (
          <p className="note warn">
            <LineIcon name="alert" size={16} />
            <span>Pick a different token or network to receive.</span>
          </p>
        )}

        {activeQuote && (
          <div className="conf-quote in">
            <div className="conf-out">
              <span className="muted">Recipient gets</span>
              <span className="num">
                <NumberDisplay value={activeQuote.amountOutFormatted} decimals={6} minDecimals={0} /> {toToken?.symbol}
              </span>
              <span className="muted">on {chainName(toChain)}</span>
            </div>
            <dl className="sum quote-sum">
              <div>
                <dt>You send</dt>
                <dd className="num">
                  {activeQuote.amountInFormatted} {fromToken?.symbol} on {chainName(fromChain)}
                </dd>
              </div>
              {minOut && (
                <div>
                  <dt>Minimum received</dt>
                  <dd className="num">
                    {minOut} {toToken?.symbol}
                  </dd>
                </div>
              )}
              {costUsd !== null && (
                <div>
                  <dt>Cost, fees and spread</dt>
                  <dd className="num">{costUsd < 0.01 ? "under $0.01" : `$${costUsd.toFixed(2)}`}</dd>
                </div>
              )}
              <div>
                <dt>Time</dt>
                <dd>About {Math.max(1, Math.round(activeQuote.timeEstimate))} s after your deposit confirms</dd>
              </div>
              <div>
                <dt>Recipient</dt>
                <dd className="num conf-recipient">{getAddress(activeQuote.recipient)}</dd>
              </div>
            </dl>
            <label className="check">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span className="box" aria-hidden="true">
                <LineIcon name="check" size={13} strokeWidth={2.6} />
              </span>
              <span>I checked every character of the recipient address. Funds sent to a wrong address cannot be&nbsp;recovered.</span>
            </label>
          </div>
        )}

        <Fade in={!!error}>
          {error && (
            <div className="note loss msg-note" role="alert">
              <LineIcon name="alert" size={16} />
              <div>
                <p>{error}</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setError(null)} aria-label="Dismiss">
                <LineIcon name="x" size={15} />
              </button>
            </div>
          )}
        </Fade>

        <Fade in={!!execution}>
          {execution && (
            <div className={`note msg-note ${statusBad ? "loss" : "gain"}`} role="status">
              {status?.status === "SUCCESS" ? <LineIcon name="check" size={16} /> : finished ? <LineIcon name="alert" size={16} /> : <span className="spin" aria-hidden="true" />}
              <div>
                <strong>{statusText.title}</strong>
                <p>
                  {statusText.body}
                  {status?.status === "SUCCESS" && status.amountOutFormatted && ` ${status.amountOutFormatted} ${execution.toSymbol} on ${chainName(execution.toChain)}.`}
                  {status?.status === "REFUNDED" && status.refundedAmountFormatted && ` Refunded: ${status.refundedAmountFormatted}.`}
                </p>
                <p className="conf-links">
                  {execution.txHash && (
                    <a className="tx-link" target="_blank" rel="noopener noreferrer" href={`${explorer(execution.fromChain)}/tx/${execution.txHash}`}>
                      Your deposit <LineIcon name="arrow-up-right" size={13} />
                    </a>
                  )}
                  {status?.destinationTxHash && (
                    <a className="tx-link" target="_blank" rel="noopener noreferrer" href={`${explorer(execution.toChain)}/tx/${status.destinationTxHash}`}>
                      Payout on {chainName(execution.toChain)} <LineIcon name="arrow-up-right" size={13} />
                    </a>
                  )}
                  <a className="tx-link" target="_blank" rel="noopener noreferrer" href="https://explorer.near-intents.org">
                    NEAR Intents explorer <LineIcon name="arrow-up-right" size={13} />
                  </a>
                </p>
                <p>
                  Deposit address, to search on the explorer: <span className="num conf-recipient">{execution.depositAddress}</span>
                </p>
              </div>
              {finished && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Dismiss"
                  onClick={() => {
                    setExecution(null);
                    setStatus(null);
                  }}
                >
                  <LineIcon name="x" size={15} />
                </button>
              )}
            </div>
          )}
        </Fade>

        <div className="ticket-actions">
          <button type="button" className="btn" onClick={getQuote} disabled={quoteLoading || !liveKey || sameAsset}>
            {quoteLoading ? (
              <>
                <span className="spin" aria-hidden="true" />
                Getting quote…
              </>
            ) : activeQuote && quoteExpired ? (
              "Refresh quote"
            ) : (
              "Get quote"
            )}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={execute}
            disabled={executing || !activeQuote || quoteExpired || !confirmed || insufficient}
          >
            {executing ? (
              <>
                <span className="spin" aria-hidden="true" />
                Sending…
              </>
            ) : (
              <>
                <LineIcon name="lock" size={16} />
                Swap privately
              </>
            )}
          </button>
        </div>
      </Panel>

      <Panel className="span-5" index={2} title="How it stays private">
        <ol className="steps-list">
          <li>
            <span className="n num">1</span>
            <span>Your wallet pays a one-time deposit address.</span>
          </li>
          <li>
            <span className="n num">2</span>
            <span>Solvers fill the swap on NEAR&rsquo;s private network.</span>
          </li>
          <li>
            <span className="n num">3</span>
            <span>The recipient is paid from an address that is not yours.</span>
          </li>
        </ol>
        <p className="note" style={{ marginTop: 16 }}>
          <LineIcon name="lock" size={16} />
          <span>
            Both transfers stay public; the link between them does not. Round amounts and a pause before you move the funds again make them harder to&nbsp;match.
          </span>
        </p>
      </Panel>
    </div>
  );
}
