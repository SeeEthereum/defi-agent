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
import { Fade } from "@/components/motion";
import { GasStationModal } from "@/components/gas-station-modal";
import { LineIcon } from "@/components/line-icon";
import { Empty, Panel } from "@/components/premium";
import { CHAINS } from "@/lib/chains";
import { formatUnits, getAddress } from "viem";
import { TokenIcon } from "@/components/token-icon";
import { useFormat, useT } from "@/i18n/client";
import { displayToken } from "@/lib/tokens/display";
import { checkRecipient } from "@/lib/near-intents/recipient";
import { translateApiMessage } from "@/i18n/api-messages";
import type { GasStationConfirming } from "@/lib/okx/types";
import { isStaleQuote } from "@/lib/api/send-state";

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
  /** Display symbols, kept for the status note after the form resets. */
  fromSymbol: string;
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

/** A base-unit amount at full precision, for display only. */
function fromBaseUnits(value: string, decimals: number): string | null {
  const d = Number(decimals);
  if (typeof value !== "string" || !/^\d+$/.test(value) || !Number.isInteger(d) || d < 0) return null;
  return formatUnits(BigInt(value), d);
}

/** "About 40 s", "About 3 min", as a dictionary key (bridge.*) and count. */
function secondsLabel(seconds: number): { key: "aboutSeconds" | "aboutMinutes"; count: number } {
  const s = Math.max(1, Math.round(Number(seconds) || 0));
  return s < 60 ? { key: "aboutSeconds", count: s } : { key: "aboutMinutes", count: Math.ceil(s / 60) };
}

/** The symbol people know ("ETH", "USDT"), from the token's own fields. */
function tokenSymbol(symbol: string, address: string, chainIndex: number): string {
  return displayToken({ symbol, address, chainIndex }).symbol;
}

/** The network's name; the panel says "unknown network" when it is not in the list. */
function chainName(chainIndex: number): string | undefined {
  return CHAIN_LIST.find((c) => c.chainIndex === chainIndex)?.name;
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
  const t = useT("bridge.confidential");
  const tb = useT("bridge");
  const f = useFormat();
  const network = (chainIndex: number) => chainName(chainIndex) ?? t("unknownNetwork");
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
  // The quoteAt whose TTL ran out. A newer quote has a newer quoteAt, so it
  // starts fresh without a reset.
  const [expiredQuoteAt, setExpiredQuoteAt] = useState<number | null>(null);
  const quoteExpired = quoteAt != null && expiredQuoteAt === quoteAt;
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
        else setTokensError(res.error ?? t("tokensError"));
      })
      .catch(() => !cancelled && setTokensError(t("tokensError")));
    return () => {
      cancelled = true;
    };
    // t only changes with the language, so this still fetches once per page.
  }, [t]);

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
  // Symbols as people know them (the list may carry chain-specific spellings).
  const fromSymbol = fromToken ? tokenSymbol(fromToken.symbol, fromToken.address, fromToken.chainIndex) : "";
  const toSymbol = toToken ? tokenSymbol(toToken.symbol, toToken.address, toToken.chainIndex) : "";

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
    const id = window.setTimeout(() => setExpiredQuoteAt(quoteAt), Math.max(0, remaining));
    return () => window.clearTimeout(id);
  }, [quoteAt]);

  const resetQuote = () => {
    setQuote(null);
    setQuoteKey(null);
    setQuoteAt(null);
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
        setError(data.error ?? t("quoteError"));
      }
    } catch {
      setError(t("quoteError"));
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
    // The timer can fire late in a background tab: check the clock here too.
    if (quoteAt != null && Date.now() - quoteAt >= QUOTE_TTL_MS) {
      setExpiredQuoteAt(quoteAt);
      return;
    }
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
        setExecution({
          ...data.data,
          fromChain,
          toChain,
          fromSymbol,
          toSymbol,
        });
        setStatus(null);
        resetQuote();
        setAmount("");
        startPolling(data.data.depositAddress);
      } else if (data.requiresGasStation) {
        setGasStation(data.gasStation);
      } else if (isStaleQuote(data)) {
        resetQuote();
        setError(t("staleQuote", { reason: data.error ?? t("quoteChanged") }));
      } else {
        setError(data.error ?? t("swapFailed"));
      }
    } catch {
      setError(t("noResponse"));
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
    return <Empty icon="lock" title={t("unavailableTitle")} text={tokensError} />;
  }

  const minOut = activeQuote ? fromBaseUnits(activeQuote.minAmountOut, activeQuote.toDecimals) : null;
  const costUsd =
    activeQuote?.amountInUsd && activeQuote.amountOutUsd
      ? Math.max(0, Number(activeQuote.amountInUsd) - Number(activeQuote.amountOutUsd))
      : null;
  const finished = status && TERMINAL.includes(status.status);
  const payUsd = fromToken?.priceUsd && amountBase ? Number(amount.replace(",", ".")) * fromToken.priceUsd : null;
  const statusKey = status?.status ?? "PENDING_DEPOSIT";
  const statusText = { title: t(`status.${statusKey}.title`), body: t(`status.${statusKey}.body`) };
  const timeLabel = activeQuote ? secondsLabel(activeQuote.timeEstimate) : null;
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
                label={tb("fromNetwork")}
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
              {fromToken && (
                <TokenIcon symbol={fromSymbol} size={24} chainIndex={fromChain} className="self-center" />
              )}
              <ChipSelect
                id="conf-from-token"
                label={t("tokenToSend")}
                value={fromAddress}
                disabled={fromTokens.length === 0}
                onChange={(v) => {
                  setFromAddr(v);
                  setBalance(null);
                  resetQuote();
                }}
              >
                {fromTokens.length === 0 && <option value="">{tb("loading")}</option>}
                {fromTokens.map((t) => (
                  <option key={t.address} value={t.address}>
                    {tokenSymbol(t.symbol, t.address, t.chainIndex)}
                  </option>
                ))}
              </ChipSelect>
            </div>
            {balance !== null && (
              <span className="leg-bal">
                <span className="num">{f.amount(balance)}</span> {tb("available")}
                {Number(balance) > 0 && (
                  <button type="button" className="max" onClick={handleMax}>
                    {tb("max")}
                  </button>
                )}
              </span>
            )}
          </div>
          <div className="leg-main">
            <label htmlFor="conf-amount" className="sr-only">
              {tb("amountToSend")}
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
            <span className="leg-sym">{fromSymbol}</span>
          </div>
          <div className="leg-foot">
            {amount.trim() !== "" && amountBase === null ? (
              <span className="err">{tb("invalidAmount")}</span>
            ) : insufficient ? (
              <span className="err">{t("notEnough", { symbol: fromSymbol, chain: network(fromChain) })}</span>
            ) : (
              <span className="num">{payUsd != null ? f.usd(payUsd) : "\u00a0"}</span>
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
                label={tb("toNetwork")}
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
              {toToken && <TokenIcon symbol={toSymbol} size={24} chainIndex={toChain} className="self-center" />}
              <ChipSelect
                id="conf-to-token"
                label={t("tokenToReceive")}
                value={toAddress}
                disabled={toTokens.length === 0}
                onChange={(v) => {
                  setToAddr(v);
                  resetQuote();
                }}
              >
                {toTokens.length === 0 && <option value="">{tb("loading")}</option>}
                {toTokens.map((t) => (
                  <option key={t.address} value={t.address}>
                    {tokenSymbol(t.symbol, t.address, t.chainIndex)}
                  </option>
                ))}
              </ChipSelect>
            </div>
          </div>
          <div className="field" style={{ marginTop: 6 }}>
            <label htmlFor="conf-recipient">{t("recipientAddress")}</label>
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
              <p className="err">{translateApiMessage(recipientCheck.error, f.locale)}</p>
            ) : (
              <p className="hint">{t("recipientHint")}</p>
            )}
          </div>
        </div>

        {sameAsset && (
          <p className="note warn">
            <LineIcon name="alert" size={16} />
            <span>{t("sameAsset")}</span>
          </p>
        )}

        {activeQuote && (
          <div className="conf-quote in">
            <div className="conf-out">
              <span className="muted">{t("recipientGets")}</span>
              <span className="num">
                {f.amount(activeQuote.amountOutFormatted)} {toSymbol}
              </span>
              <span className="muted">{t("onChain", { chain: network(toChain) })}</span>
            </div>
            <dl className="sum quote-sum">
              <div>
                <dt>{t("youSend")}</dt>
                <dd className="num">
                  {t("amountOnChain", { amount: f.amount(activeQuote.amountInFormatted), symbol: fromSymbol, chain: network(fromChain) })}
                </dd>
              </div>
              {minOut && (
                <div>
                  <dt>{tb("minimumReceived")}</dt>
                  <dd className="num">
                    {f.amount(minOut)} {toSymbol}
                  </dd>
                </div>
              )}
              {costUsd !== null && (
                <div>
                  <dt>{t("cost")}</dt>
                  <dd className="num">{f.usd(costUsd)}</dd>
                </div>
              )}
              <div>
                <dt>{t("time")}</dt>
                <dd>{timeLabel && t("timeAfterDeposit", { time: tb(timeLabel.key, { count: timeLabel.count }) })}</dd>
              </div>
              <div>
                <dt>{t("recipient")}</dt>
                <dd className="num conf-recipient">{getAddress(activeQuote.recipient)}</dd>
              </div>
            </dl>
            <label className="check">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span className="box" aria-hidden="true">
                <LineIcon name="check" size={13} strokeWidth={2.6} />
              </span>
              <span>{t("confirmRecipient")}</span>
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
              <button type="button" className="icon-btn" onClick={() => setError(null)} aria-label={tb("dismiss")}>
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
                  {status?.status === "SUCCESS" &&
                    status.amountOutFormatted &&
                    ` ${t("amountOnChain", { amount: f.amount(status.amountOutFormatted), symbol: execution.toSymbol, chain: network(execution.toChain) })}.`}
                  {status?.status === "REFUNDED" &&
                    status.refundedAmountFormatted &&
                    ` ${t("refunded", { amount: f.amount(status.refundedAmountFormatted), symbol: execution.fromSymbol, chain: network(execution.fromChain) })}`}
                </p>
                <p className="conf-links">
                  {execution.txHash && (
                    <a className="tx-link" target="_blank" rel="noopener noreferrer" href={`${explorer(execution.fromChain)}/tx/${execution.txHash}`}>
                      {t("yourDeposit")} <LineIcon name="arrow-up-right" size={13} />
                    </a>
                  )}
                  {status?.destinationTxHash && (
                    <a className="tx-link" target="_blank" rel="noopener noreferrer" href={`${explorer(execution.toChain)}/tx/${status.destinationTxHash}`}>
                      {t("payoutOn", { chain: network(execution.toChain) })} <LineIcon name="arrow-up-right" size={13} />
                    </a>
                  )}
                  <a className="tx-link" target="_blank" rel="noopener noreferrer" href="https://explorer.near-intents.org">
                    {t("explorer")} <LineIcon name="arrow-up-right" size={13} />
                  </a>
                </p>
                <p>
                  {t("depositAddress")} <span className="num conf-recipient">{execution.depositAddress}</span>
                </p>
              </div>
              {finished && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={tb("dismiss")}
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
                {tb("gettingQuote")}
              </>
            ) : activeQuote && quoteExpired ? (
              tb("refreshQuote")
            ) : (
              tb("getQuote")
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
                {t("sending")}
              </>
            ) : (
              <>
                <LineIcon name="lock" size={16} />
                {t("swapPrivately")}
              </>
            )}
          </button>
        </div>
      </Panel>

      <Panel className="span-5" index={2} title={t("howTitle")}>
        <ol className="steps-list">
          <li>
            <span className="n num">1</span>
            <span>{t("step1")}</span>
          </li>
          <li>
            <span className="n num">2</span>
            <span>{t("step2")}</span>
          </li>
          <li>
            <span className="n num">3</span>
            <span>{t("step3")}</span>
          </li>
        </ol>
        <p className="note" style={{ marginTop: 16 }}>
          <LineIcon name="lock" size={16} />
          <span>{t("privacyNote")}</span>
        </p>
      </Panel>
    </div>
  );
}
