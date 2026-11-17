"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { motion, useReducedMotion } from "motion/react";
import useSWR from "swr";
import { LineIcon, type LineIconName } from "@/components/line-icon";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { getChainByIndex, getChainBySwapName, CHAINS } from "@/lib/chains";
import { cn } from "@/lib/utils";
import { Empty, Sheet } from "@/components/premium";
import { TokenIcon } from "@/components/token-icon";
import { isStaleQuote, sendStateCode, userFacingError } from "@/lib/api/send-state";
import { formatPrice, formatUsd } from "@/lib/format";
import { chainName, cleanSymbol } from "@/lib/tokens/display";
import { getFToken, isNativeUnderlying } from "@/lib/fluid/constants";
import {
  bridgeQuoteQuery,
  bridgeReview,
  reviewExpired,
  REVIEW_TTL_MS,
  swapQuoteBody,
  swapReview,
  type QuoteReview,
} from "@/lib/ai/quote-review";

const NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const CHAIN_RPC: Record<string, string> = Object.fromEntries(
  Object.values(CHAINS).map((c) => [c.swapName, c.rpcUrl])
);

/** Poll eth_getTransactionReceipt until confirmed or timeout */
async function waitForReceipt(txHash: string, chain: string): Promise<boolean> {
  const rpc = CHAIN_RPC[chain];
  if (!rpc || !txHash) return false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getTransactionReceipt", params: [txHash], id: 1 }),
      });
      const json = await res.json();
      if (json.result?.status === "0x1") return true;
      if (json.result?.status === "0x0") return false;
    } catch {}
  }
  return false;
}

function hasParam(value: unknown): boolean {
  return value != null && value !== "";
}

function actionParamsReady(action: ProposedAction): boolean {
  const p = action.params ?? {};
  switch (action.action) {
    case "swap":
      return hasParam(p.fromToken) && hasParam(p.toToken) && hasParam(p.amount) && hasParam(p.chain);
    case "send":
      return hasParam(p.recipient) && hasParam(p.amount) && hasParam(p.chainIndex);
    case "bridge":
      return (
        hasParam(p.fromChain) &&
        hasParam(p.toChain) &&
        hasParam(p.fromToken) &&
        hasParam(p.toToken) &&
        hasParam(p.fromAmount)
      );
    case "supply":
    case "withdraw":
      return hasParam(p.fTokenSymbol) && hasParam(p.amount) && hasParam(p.chainIndex);
    case "hl_order":
      return (
        hasParam(p.coin) &&
        hasParam(p.side) &&
        hasParam(p.size) &&
        hasParam(p.leverage) &&
        (p.type !== "limit" || hasParam(p.price))
      );
    case "hl_close":
      return hasParam(p.coin);
    default:
      return false;
  }
}

// ── Token symbol lookup ──────────────────────────────────────────────────────
/** Common tokens by contract address (the native coin depends on the chain: see knownSymbol). */
const TOKEN_MAP: Record<string, string> = {
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": "USDC",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
  "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": "USDC",
  "0x0b2c639c533813f4aa9d7837caf62653d097ff85": "USDC",
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": "USDC",
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": "USDT",
  "0xc2132d05d31c914a87c6611c10748aeb04b58e8f": "USDT",
  "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58": "USDT",
  "0x55d398326f99059ff775485246999027b3197955": "USDT",
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH",
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": "WETH",
  "0x4200000000000000000000000000000000000006": "WETH",
  "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270": "WPOL",
  "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": "WBNB",
};

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

/** A chain index from a card param ("42161" or 42161), or null. */
function chainIndexOf(raw: unknown): number | null {
  if (!hasParam(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** "Arbitrum", "Unknown network" for a chain we do not list, or "Not set". */
function networkLabel(raw: unknown): string {
  if (!hasParam(raw)) return MISSING;
  return chainName(chainIndexOf(raw)) ?? "Unknown network";
}

/** Symbol of a token by address: the chain's own coin (ETH, BNB, POL) for 0xeeee…, else a common token. */
function knownSymbol(addr: string | undefined, chainIndex: number | null): string | null {
  if (!addr) return null;
  const a = addr.toLowerCase();
  if (a === NATIVE_TOKEN) return chainIndex != null ? (getChainByIndex(chainIndex)?.nativeSymbol ?? null) : null;
  return TOKEN_MAP[a] ?? null;
}

interface CardToken {
  /** "USDT", or null for a token we cannot name. */
  symbol: string | null;
  /** What the row shows: the symbol, or "Unknown token (0x12…cdef)". */
  label: string;
}

/**
 * A token on a card: the server's symbol (read on-chain) cleaned up
 * ("USD₮0" → "USDT"), else a known address, else "Unknown token" with the
 * short address so the user can still tell which contract it is.
 */
function cardToken(serverSymbol: unknown, addr: unknown, chainIndex: number | null): CardToken {
  const address = typeof addr === "string" && addr ? addr : undefined;
  const fromServer = typeof serverSymbol === "string" ? cleanSymbol(serverSymbol) : "";
  // The server sends an address fragment when the contract has no readable symbol.
  const symbol = fromServer && !/^0x/i.test(fromServer) ? fromServer : knownSymbol(address, chainIndex);
  if (symbol) return { symbol, label: symbol };
  return { symbol: null, label: address ? `Unknown token (${shortAddr(address)})` : MISSING };
}

/** What a Fluid card supplies or withdraws: "USDC" for fUSDC, the chain's coin (ETH, POL) for fWETH / fWPOL. */
function fluidAsset(fTokenSymbol: unknown, chainIndex: number | null): CardToken {
  if (typeof fTokenSymbol !== "string" || !fTokenSymbol) return { symbol: null, label: MISSING };
  const native = chainIndex != null && isNativeUnderlying(chainIndex, fTokenSymbol) ? getChainByIndex(chainIndex)?.nativeSymbol : undefined;
  const underlying = chainIndex != null ? getFToken(chainIndex, fTokenSymbol)?.underlyingSymbol : undefined;
  const symbol = cleanSymbol(native ?? underlying ?? fTokenSymbol.replace(/^f(?=[A-Z])/, ""));
  return { symbol, label: symbol };
}

/** "1.5 USDT", or just the amount when the token has no name. */
function withSymbol(amount: unknown, symbol: string | null): string {
  return `${String(amount)} ${symbol ?? ""}`.trim();
}

const GAS_LEVELS: Record<string, string> = { slow: "Slow", average: "Standard", fast: "Fast" };

/**
 * An order price exactly as it will be sent, grouped for reading:
 * "$91,250.50", "$1.2345", "$0.00012345". formatPrice would round a limit
 * price the user must check digit by digit.
 */
function orderPrice(raw: unknown): string {
  const s = String(raw ?? "").trim();
  const n = Number(s);
  const decimals = s.split(".")[1]?.length ?? 0;
  if (!/^\d+(\.\d+)?$/.test(s) || n <= 0 || decimals > 8) return formatPrice(s);
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: n >= 1 ? 2 : Math.max(2, decimals),
    maximumFractionDigits: Math.max(2, decimals),
  })}`;
}

/** "[View transaction](https://arbiscan.io/tx/0x…)" for the chat, or "" without a valid hash or a known explorer. */
function txLinkMarkdown(chainIndex: number | null, hash: unknown): string {
  if (chainIndex == null || typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return "";
  const explorer = getChainByIndex(chainIndex)?.explorer;
  return explorer ? `[View transaction](${explorer}/tx/${hash})` : "";
}

/** The chain an action's transaction lands on (the source chain for a bridge). */
function actionChainIndex(action: ProposedAction): number | null {
  const p = action.params ?? {};
  switch (action.action) {
    case "swap":
      return getChainBySwapName(String(p.chain))?.chainIndex ?? null;
    case "bridge":
      return chainIndexOf(p.fromChain);
    case "send":
    case "supply":
    case "withdraw":
      return chainIndexOf(p.chainIndex);
    default:
      return null;
  }
}

const DONE_TITLES: Record<string, string> = {
  swap: "Swap sent.",
  bridge: "Bridge started.",
  send: "Transfer sent.",
  supply: "Supplied to Fluid.",
  withdraw: "Withdrawal sent.",
  hl_order: "Order placed.",
  hl_close: "Position closed.",
};

const FAILED_TITLES: Record<string, string> = {
  swap: "Swap failed.",
  bridge: "Bridge failed.",
  send: "Transfer failed.",
  supply: "Supply failed.",
  withdraw: "Withdrawal failed.",
  hl_order: "Order failed.",
  hl_close: "Closing the position failed.",
};

/**
 * A failure reason for the chat. The API already reduces errors to safe
 * sentences (lib/api/validation publicErrorMessage); this keeps those and
 * the send-state messages, and drops anything that still looks technical.
 */
function plainError(detail: unknown, fallback: string): string {
  const kept = userFacingError(detail, "");
  if (kept) return kept;
  if (typeof detail !== "string") return fallback;
  const text = detail.trim();
  const technical = text.length === 0 || text.length > 200 || /0x[0-9a-f]{16,}|[{}[\]<>`]|\n/i.test(text);
  return technical ? fallback : text;
}

// ── Types ────────────────────────────────────────────────────────────────────
interface Message {
  role: "user" | "assistant";
  content: string;
  /** Set on replies that are not the model's: off-topic refusals, errors. */
  kind?: "refusal" | "error";
}

interface Quota {
  limit: number;
  used: number;
  remaining: number;
  resetAt: string | null;
  model?: string;
}

const MAX_QUESTION_CHARS = 1500;

/**
 * What the model sees: refusals and errors are app messages, not its own
 * words, and the question that triggered a refusal goes with it.
 */
function historyForServer(msgs: Message[]): Array<{ role: Message["role"]; content: string }> {
  const out: Array<{ role: Message["role"]; content: string }> = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.kind) continue;
    const next = msgs[i + 1];
    if (m.role === "user" && next?.kind) continue;
    out.push({ role: m.role, content: m.content });
  }
  return out.slice(-16);
}

/** "5 h 12 min", "12 min 04 s" or "38 s" until `iso`, ticking every second. */
function useCountdown(iso: string | null): { left: number; label: string } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [iso]);
  const left = iso ? Math.max(0, Date.parse(iso) - now) : 0;
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const sec = Math.floor((left % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const label = h > 0 ? `${h} h ${pad(m)} min` : m > 0 ? `${m} min ${pad(sec)} s` : `${sec} s`;
  return { left, label };
}

interface ProposedAction {
  /** Client-side id, so a card keeps its quote review when others are removed. */
  id: string;
  action: string;
  params: Record<string, unknown>;
}

/** Swaps and bridges show the final quote before Confirm signs anything. */
function needsQuoteReview(action: ProposedAction): boolean {
  return action.action === "swap" || action.action === "bridge";
}

/**
 * Seconds left on a quote review, ticking while one is shown. Until the
 * first tick for a new review, the clock reading belongs to an older one,
 * so the full validity is shown instead.
 */
function useSecondsLeft(expiresAt: number | null): number {
  const [clock, setClock] = useState<{ for: number | null; now: number }>({ for: null, now: 0 });
  useEffect(() => {
    if (expiresAt == null) return;
    const id = window.setInterval(() => setClock({ for: expiresAt, now: Date.now() }), 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);
  if (expiresAt == null) return 0;
  if (clock.for !== expiresAt) return Math.ceil(REVIEW_TTL_MS / 1000);
  return Math.max(0, Math.ceil((expiresAt - clock.now) / 1000));
}

// ── Action Card ──────────────────────────────────────────────────────────────
/** Shown in place of a value the assistant has not filled in yet. */
const MISSING = "Not set";

function ActionCard({
  action,
  review,
  reviewing,
  onReview,
  onConfirm,
  onReject,
  executing,
}: {
  action: ProposedAction;
  review: QuoteReview | null;
  reviewing: boolean;
  onReview: () => void;
  onConfirm: () => void;
  onReject: () => void;
  executing: boolean;
}) {
  const secondsLeft = useSecondsLeft(review?.expiresAt ?? null);
  /** `token` puts the token's icon before the value. */
  const rows: { label: string; value: string; token?: { symbol: string; chainIndex: number | null } }[] = [];
  const iconFor = (t: CardToken, chainIndex: number | null) => (t.symbol ? { symbol: t.symbol, chainIndex } : undefined);
  let title = "";
  let icon: LineIconName = "swap";

  if (action.action === "swap") {
    const p = action.params;
    const chain = getChainBySwapName(p.chain as string);
    const chainIndex = chain?.chainIndex ?? null;
    // Symbols and the amount come from the server (read on-chain), not the model.
    const from = cardToken(p.fromSymbol, p.fromToken, chainIndex);
    const to = cardToken(p.toSymbol, p.toToken, chainIndex);
    title = "Token swap";
    icon = "swap";
    rows.push({
      label: "Amount",
      value: hasParam(p.amountDisplay) ? withSymbol(p.amountDisplay, from.symbol) : MISSING,
    });
    rows.push({ label: "From", value: from.label, token: iconFor(from, chainIndex) });
    rows.push({ label: "To", value: to.label, token: iconFor(to, chainIndex) });
    rows.push({ label: "Chain", value: chain?.name ?? (hasParam(p.chain) ? "Unknown network" : MISSING) });
    if (p.slippage) rows.push({ label: "Slippage", value: `${p.slippage}%` });
    if (p.gasLevel) rows.push({ label: "Network fee", value: GAS_LEVELS[String(p.gasLevel).toLowerCase()] ?? "Standard" });
    if (p.mevProtection) rows.push({ label: "MEV protection", value: "On" });
  } else if (action.action === "supply") {
    const p = action.params;
    const chainIndex = chainIndexOf(p.chainIndex);
    const asset = fluidAsset(p.fTokenSymbol, chainIndex);
    title = "Supply on Fluid";
    icon = "trending-up";
    rows.push({ label: "Asset", value: asset.label, token: iconFor(asset, chainIndex) });
    rows.push({ label: "Amount", value: hasParam(p.amount) ? withSymbol(p.amount, asset.symbol) : MISSING });
    rows.push({ label: "Chain", value: networkLabel(p.chainIndex) });
  } else if (action.action === "send") {
    const p = action.params;
    const chainIndex = chainIndexOf(p.chainIndex);
    const native = chainIndex != null ? (getChainByIndex(chainIndex)?.nativeSymbol ?? null) : null;
    const token: CardToken = p.contractToken
      ? cardToken(null, p.contractToken, chainIndex)
      : { symbol: native, label: native ?? "The network's own coin" };
    title = "Transfer";
    icon = "send";
    rows.push({ label: "Token", value: token.label, token: iconFor(token, chainIndex) });
    rows.push({ label: "Amount", value: hasParam(p.amount) ? withSymbol(p.amount, token.symbol) : MISSING });
    rows.push({
      label: "To",
      value: hasParam(p.recipient) ? shortAddr(String(p.recipient)) : MISSING,
    });
    rows.push({ label: "Chain", value: networkLabel(p.chainIndex) });
  } else if (action.action === "bridge") {
    const p = action.params;
    const fromChainIndex = chainIndexOf(p.fromChain);
    const toChainIndex = chainIndexOf(p.toChain);
    const from = cardToken(p.fromSymbol, p.fromToken, fromChainIndex);
    const to = cardToken(p.toSymbol, p.toToken, toChainIndex);
    title = "Bridge";
    icon = "bridge";
    rows.push({ label: "From chain", value: networkLabel(p.fromChain) });
    rows.push({ label: "To chain", value: networkLabel(p.toChain) });
    rows.push({
      label: "Amount",
      value: hasParam(p.amountDisplay) ? withSymbol(p.amountDisplay, from.symbol) : MISSING,
    });
    rows.push({ label: "From token", value: from.label, token: iconFor(from, fromChainIndex) });
    rows.push({ label: "To token", value: to.label, token: iconFor(to, toChainIndex) });
  } else if (action.action === "withdraw") {
    const p = action.params;
    const chainIndex = chainIndexOf(p.chainIndex);
    const asset = fluidAsset(p.fTokenSymbol, chainIndex);
    title = "Withdraw from Fluid";
    icon = "trending-down";
    rows.push({ label: "Asset", value: asset.label, token: iconFor(asset, chainIndex) });
    rows.push({
      label: "Amount",
      value: p.amount === "all" ? "Everything" : hasParam(p.amount) ? withSymbol(p.amount, asset.symbol) : MISSING,
    });
    rows.push({ label: "Chain", value: networkLabel(p.chainIndex) });
  } else if (action.action === "hl_order") {
    const p = action.params;
    const side = p.side === "buy" ? "Long" : p.side === "sell" ? "Short" : null;
    title = side ? `Hyperliquid ${side.toLowerCase()}` : "Hyperliquid order";
    icon = p.side === "buy" ? "long" : "short";
    rows.push({
      label: "Market",
      value: hasParam(p.coin) ? `${p.coin}-PERP` : MISSING,
      token: hasParam(p.coin) ? { symbol: String(p.coin), chainIndex: null } : undefined,
    });
    rows.push({ label: "Side", value: side ?? MISSING });
    rows.push({ label: "Size", value: hasParam(p.size) ? `${p.size} ${hasParam(p.coin) ? p.coin : ""}`.trim() : MISSING });
    rows.push({ label: "Type", value: p.type === "limit" ? "Limit" : "Market" });
    if (p.type === "limit") rows.push({ label: "Limit price", value: hasParam(p.price) ? orderPrice(p.price) : MISSING });
    rows.push({ label: "Leverage", value: hasParam(p.leverage) ? `${p.leverage}×` : MISSING });
    if (p.currentPrice) rows.push({ label: "Mark price", value: formatPrice(String(p.currentPrice)) });
    if (p.slPx) rows.push({ label: "Stop loss", value: orderPrice(p.slPx) });
    if (p.tpPx) rows.push({ label: "Take profit", value: orderPrice(p.tpPx) });
    rows.push({ label: "Settlement", value: "USDC on Hyperliquid L1" });
  } else if (action.action === "hl_close") {
    const p = action.params;
    title = "Close Hyperliquid position";
    icon = "close";
    rows.push({
      label: "Market",
      value: hasParam(p.coin) ? `${p.coin}-PERP` : MISSING,
      token: hasParam(p.coin) ? { symbol: String(p.coin), chainIndex: null } : undefined,
    });
    if (p.size) rows.push({ label: "Size", value: `${p.size} ${hasParam(p.coin) ? p.coin : ""}`.trim() });
    else rows.push({ label: "Size", value: "Full position" });
    if (p.unrealizedPnl) rows.push({ label: "Unrealized PnL", value: formatUsd(String(p.unrealizedPnl), { sign: true }) });
  }

  const ready = actionParamsReady(action);
  const reviewed = needsQuoteReview(action);
  const expired = review != null && secondsLeft === 0;
  const verb = action.action === "bridge" ? "bridge" : "swap";

  let subtitle = ready ? "Waiting for your confirmation" : "Some details are missing";
  if (ready && reviewed) {
    subtitle = !review
      ? "Get the final quote, then confirm"
      : expired
        ? "The quote expired: get a new one"
        : `Final quote, valid for ${secondsLeft} s`;
  }

  let primary: { label: string; onClick: () => void; disabled: boolean };
  if (!reviewed) {
    primary = { label: "Confirm", onClick: onConfirm, disabled: executing || !ready };
  } else if (!review || expired) {
    primary = {
      label: review ? "Get a new quote" : "Get final quote",
      onClick: onReview,
      disabled: executing || reviewing || !ready,
    };
  } else {
    primary = {
      label: `Confirm ${verb}`,
      onClick: onConfirm,
      disabled: executing || reviewing || review.blocked != null,
    };
  }

  return (
    <div className="bezel act">
      <div className="core">
        <div className="act-head">
          <span className="act-ico" aria-hidden="true">
            <LineIcon name={icon} size={18} />
          </span>
          <div>
            <div className="t">{title}</div>
            <div className="sub" role="status">{subtitle}</div>
          </div>
        </div>

        <dl className="act-rows">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd className={row.value === MISSING ? "missing" : undefined}>
                {row.token ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <TokenIcon symbol={row.token.symbol} size={18} chainIndex={row.token.chainIndex} />
                    {row.value}
                  </span>
                ) : (
                  row.value
                )}
              </dd>
            </div>
          ))}
        </dl>

        {review && (
          <>
            <h3 className={cn("act-quote-head", expired && "is-expired")}>Final quote</h3>
            <dl className={cn("act-rows act-quote", expired && "is-expired")}>
              {review.rows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            {(review.blocked ?? review.warning) && (
              <p className={cn("act-note", review.blocked && "is-blocked")} role="alert">
                {review.blocked ?? review.warning}
              </p>
            )}
          </>
        )}

        <div className="act-btns">
          <button type="button" className="btn btn--sm" onClick={onReject} disabled={executing}>
            Reject
          </button>
          <button type="button" className="btn btn--sm btn--primary" onClick={primary.onClick} disabled={primary.disabled}>
            {executing || reviewing ? (
              <>
                <span className="spin" aria-hidden="true" />
                {executing ? "Executing…" : "Getting quote…"}
              </>
            ) : (
              primary.label
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
const SUGGESTIONS = [
  "What are the best Fluid APRs right now?",
  "Show my portfolio balance",
  "Swap 0.1 ETH for USDC on Arbitrum",
  "Supply 100 USDC on Fluid Ethereum",
  "Show my Fluid positions",
  "Show my recent transactions",
];

const CHAT_STORAGE_KEY = "defi-agent-chat-history";

function loadMessages(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMessages(msgs: Message[]) {
  try {
    // Keep last 50 messages to avoid bloating localStorage
    const toSave = msgs.slice(-50);
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(toSave));
  } catch {}
}

const ENTER = { type: "spring" as const, stiffness: 380, damping: 32, mass: 0.8 };

/** Links in the chat (explorer pages, docs) open in a new tab, so the conversation stays put. */
const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

function AssistantMark({ size = 28 }: { size?: number }) {
  return (
    <span className="ai-mark" style={{ width: size, height: size }} aria-hidden="true">
      <LineIcon name="sparkle" size={Math.round(size * 0.5)} />
    </span>
  );
}

const AI_LIMIT_TEXT = "You have 20 questions every 24 hours, counted from your first one.";

/** What the assistant does and refuses, in two short lists. */
function Capabilities() {
  return (
    <div className="ai-caps">
      <div>
        <h2>It can</h2>
        <ul>
          <li>Read your balances, history and positions on six chains</li>
          <li>Find yields, prices, gas and what smart money is buying</li>
          <li>Prepare swaps, bridges, transfers, Fluid deposits and perps orders</li>
          <li>Check tokens and websites for scams before you trust them</li>
        </ul>
      </div>
      <div>
        <h2>It won&rsquo;t</h2>
        <ul>
          <li>Move money without your Confirm on the card</li>
          <li>Show or export keys: nobody can, they stay in OKX&rsquo;s enclave</li>
          <li>Promise returns or give personal investment advice</li>
          <li>Chat about topics outside your wallet and crypto</li>
        </ul>
      </div>
    </div>
  );
}

/** Questions left today, as ticks, with the real time of the refill. */
function Allowance({ quota, countdown }: { quota: Quota | null; countdown: string }) {
  if (!quota) return <span id="ai-allowance" className="allowance" />;
  const exhausted = quota.remaining <= 0;
  return (
    <span id="ai-allowance" className={cn("allowance", exhausted && "is-out")} role="status">
      <span className="ticks" aria-hidden="true">
        {Array.from({ length: quota.limit }, (_, i) => (
          <i key={i} data-on={i < quota.remaining || undefined} />
        ))}
      </span>
      {exhausted ? (
        <span>
          Questions refill in <span className="num">{countdown}</span>
        </span>
      ) : (
        <span>
          <span className="num">{quota.remaining}</span> of {quota.limit} left
          {quota.resetAt ? (
            <>
              , refill in <span className="num">{countdown}</span>
            </>
          ) : (
            " today"
          )}
        </span>
      )}
    </span>
  );
}

export default function AiPage() {
  const { authenticated } = useAuth();
  // The (app) layout renders pages only after hydration (it waits for the
  // disclaimer flag in localStorage), so reading storage here is safe.
  const [restored] = useState(loadMessages);
  const [messages, setMessages] = useState<Message[]>(restored);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [proposedActions, setProposedActions] = useState<ProposedAction[]>([]);
  const [executingIndex, setExecutingIndex] = useState<number | null>(null);
  const [reviews, setReviews] = useState<Record<string, QuoteReview>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reduce = useReducedMotion();
  const [aboutOpen, setAboutOpen] = useState(false);

  const { data: quotaRes, mutate: mutateQuotaRaw } = useSWR<{ success: boolean; data?: Quota }>(
    authenticated ? "/api/ai/quota" : null,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: true }
  );
  const quota = quotaRes?.success ? (quotaRes.data ?? null) : null;
  const mutateQuota = useCallback(
    (q: Quota, opts?: { revalidate?: boolean }) => mutateQuotaRaw({ success: true, data: q }, opts),
    [mutateQuotaRaw]
  );
  const countdown = useCountdown(quota?.resetAt ?? null);
  const exhausted = quota != null && quota.remaining <= 0;

  // The allowance refills on the server at resetAt: read it again then.
  useEffect(() => {
    if (exhausted && quota?.resetAt && countdown.left === 0) void mutateQuotaRaw();
  }, [exhausted, quota?.resetAt, countdown.left, mutateQuotaRaw]);

  // Save chat history whenever messages change
  useEffect(() => {
    if (messages.length > 0) saveMessages(messages);
  }, [messages]);

  // The page scrolls with the window; keep the newest message in view.
  useEffect(() => {
    if (messages.length === 0 && proposedActions.length === 0) return;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [messages, proposedActions, loading, reduce]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      if (quota && quota.remaining <= 0) return;
      const userMessage: Message = { role: "user", content: text.trim().slice(0, MAX_QUESTION_CHARS) };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "";
      setLoading(true);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: historyForServer(newMessages) }),
        });
        const data = await res.json();
        if (data.quota) void mutateQuota({ ...(quota ?? {}), ...data.quota }, { revalidate: false });

        if (data.success) {
          if (data.data.text) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: data.data.text, ...(data.data.refused ? { kind: "refusal" as const } : {}) },
            ]);
          }
          if (data.data.proposedActions?.length) {
            setProposedActions((prev) => [
              ...prev,
              ...(data.data.proposedActions as Omit<ProposedAction, "id">[]).map((a) => ({
                ...a,
                id: crypto.randomUUID(),
              })),
            ]);
          }
        } else if (data.code === "quota_exhausted") {
          // Nothing was asked: take the question back out of the thread.
          setMessages((prev) => prev.slice(0, -1));
          setInput(userMessage.content);
        } else {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `${data.error || "Something went wrong"}`, kind: "error" },
          ]);
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Network error. This question was not counted; try again.", kind: "error" },
        ]);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [messages, loading, quota, mutateQuota]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const say = (content: string) => setMessages((prev) => [...prev, { role: "assistant", content }]);

  const dropReview = (id: string) =>
    setReviews((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  /** Fetch the final quote for a swap or bridge card and show it on the card. */
  const reviewQuote = async (action: ProposedAction): Promise<QuoteReview | null> => {
    setReviewingId(action.id);
    try {
      const res =
        action.action === "swap"
          ? await fetch("/api/swap/quote", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(swapQuoteBody(action.params)),
            })
          : await fetch(`/api/bridge/quote?${bridgeQuoteQuery(action.params).toString()}`);
      const data = await res.json();
      const review = data.success
        ? action.action === "swap"
          ? swapReview(data.data ?? {}, action.params)
          : bridgeReview(data.data ?? {}, action.params)
        : null;
      if (!review) {
        dropReview(action.id);
        say(data.error ? `Could not get a quote: ${data.error}` : "Could not get a quote, try again");
        return null;
      }
      setReviews((prev) => ({ ...prev, [action.id]: review }));
      return review;
    } catch {
      say("Could not get a quote, try again");
      return null;
    } finally {
      setReviewingId(null);
    }
  };

  const executeAction = async (action: ProposedAction, idx: number) => {
    const review = reviews[action.id] ?? null;
    if (needsQuoteReview(action) && (!review || reviewExpired(review) || review.blocked)) return;
    setExecutingIndex(idx);
    let endpoint = "";
    let body: Record<string, unknown> = {};

    switch (action.action) {
      case "supply": {
        // Step 1: Approve fToken to spend underlying (e.g. USDC)
        setMessages((prev) => [...prev, { role: "assistant", content: "Approving the token for Fluid…" }]);
        const approveEarnRes = await fetch("/api/earn/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fTokenSymbol: action.params.fTokenSymbol,
            amount: action.params.amount,
            chainIndex: action.params.chainIndex,
          }),
        });
        const approveEarnData = await approveEarnRes.json();
        if (!approveEarnData.success) {
          setMessages((prev) => [...prev, { role: "assistant", content: `**Approval failed.** ${plainError(approveEarnData.error, "Try again in a moment.")}` }]);
          setExecutingIndex(null);
          return;
        }
        const earnApproveTxHash = approveEarnData.data?.txHash as string | undefined;
        // `alreadyApproved` means the allowance already covers this amount:
        // there is no transaction to wait for.
        if (!approveEarnData.data?.alreadyApproved) {
          if (earnApproveTxHash) {
            const link = txLinkMarkdown(chainIndexOf(action.params.chainIndex), earnApproveTxHash);
            setMessages((prev) => [...prev, { role: "assistant", content: `Approval sent. Waiting for it to confirm…${link ? ` ${link}` : ""}` }]);
          }
          const earnChain = getChainByIndex(action.params.chainIndex as number)?.swapName ?? "arbitrum";
          const confirmed = await waitForReceipt(earnApproveTxHash ?? "", earnChain);
          if (!confirmed) {
            setMessages((prev) => [...prev, { role: "assistant", content: "Approval not confirmed, try again" }]);
            setExecutingIndex(null);
            return;
          }
        }
        // Step 2: Deposit into fToken
        endpoint = "/api/earn/supply";
        body = {
          fTokenSymbol: action.params.fTokenSymbol,
          amount: action.params.amount,
          chainIndex: action.params.chainIndex,
        };
        break;
      }
      case "swap": {
        // Step 1: Approve DEX router for ERC-20 tokens (skip for native ETH/BNB)
        const fromAddr = (action.params.fromToken as string ?? "").toLowerCase();
        const isNative = fromAddr === NATIVE_TOKEN;
        if (!isNative && fromAddr) {
          setMessages((prev) => [...prev, { role: "assistant", content: "Approving the token for the swap…" }]);
          const approveRes = await fetch("/api/swap/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: fromAddr,
              amount: action.params.amount,
              chain: action.params.chain,
            }),
          });
          const approveData = await approveRes.json();
          if (!approveData.success) {
            setMessages((prev) => [...prev, { role: "assistant", content: `**Approval failed.** ${plainError(approveData.error, "Try again in a moment.")}` }]);
            setExecutingIndex(null);
            return;
          }
          const approveTxHash = approveData.data?.txHash as string | undefined;
          const alreadyApproved = Boolean(approveData.data?.alreadyApproved);
          if (!alreadyApproved) {
            if (approveTxHash) {
              const link = txLinkMarkdown(actionChainIndex(action), approveTxHash);
              setMessages((prev) => [...prev, { role: "assistant", content: `Approval sent. Waiting for it to confirm…${link ? ` ${link}` : ""}` }]);
            }
            const confirmed = await waitForReceipt(approveTxHash ?? "", action.params.chain as string);
            if (!confirmed) {
              setMessages((prev) => [...prev, { role: "assistant", content: "Approval not confirmed, try again" }]);
              setExecutingIndex(null);
              return;
            }
          }
        }
        // The approval can outlast the quote the user reviewed: show a new
        // one instead of signing against numbers they have not seen.
        if (review && reviewExpired(review)) {
          say("The approval is confirmed, but the quote expired while it was waiting. Check the new quote on the card and confirm again.");
          setExecutingIndex(null);
          await reviewQuote(action);
          return;
        }
        endpoint = "/api/swap/execute";
        body = {
          fromToken: action.params.fromToken,
          toToken: action.params.toToken,
          amount: action.params.amount,
          chain: action.params.chain,
          slippage: action.params.slippage,
          gasLevel: action.params.gasLevel,
          mevProtection: action.params.mevProtection,
          quoteId: review?.quoteId,
        };
        break;
      }
      case "send":
        endpoint = "/api/wallet/send";
        body = {
          amount: action.params.amount,
          recipient: action.params.recipient,
          chain: action.params.chainIndex,
          contractToken: action.params.contractToken,
        };
        break;
      case "withdraw":
        endpoint = "/api/earn/withdraw";
        body = action.params.amount === "all"
          ? {
              fTokenSymbol: action.params.fTokenSymbol,
              chainIndex: action.params.chainIndex,
              isAll: true,
            }
          : {
              fTokenSymbol: action.params.fTokenSymbol,
              amount: action.params.amount,
              chainIndex: action.params.chainIndex,
            };
        break;
      case "bridge":
        endpoint = "/api/bridge/execute";
        body = {
          fromChain: action.params.fromChain,
          toChain: action.params.toChain,
          fromToken: action.params.fromToken,
          toToken: action.params.toToken,
          fromAmount: action.params.fromAmount,
          quoteId: review?.quoteId,
        };
        break;
      case "hl_order":
        endpoint = "/api/perp/order";
        body = {
          coin: action.params.coin,
          side: action.params.side,
          size: action.params.size,
          type: action.params.type,
          price: action.params.price,
          leverage: action.params.leverage,
          slPx: action.params.slPx,
          tpPx: action.params.tpPx,
          confirm: true,
        };
        break;
      case "hl_close":
        endpoint = "/api/perp/close";
        body = {
          coin: action.params.coin,
          size: action.params.size,
          confirm: true,
        };
        break;
      default:
        setExecutingIndex(null);
        return;
    }

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (isStaleQuote(data) && needsQuoteReview(action)) {
        // Nothing was signed. Keep the card and show the new numbers.
        say("The price moved since the quote. Here is a new one on the card: check it and confirm again.");
        await reviewQuote(action);
        return;
      }
      if (data.requiresGasStation) {
        say("There is not enough native coin for gas on this chain. Open the Swap page to pay gas with a stablecoin (Gas Station), then try again.");
        return;
      }

      // A link to the explorer, never the bare 64-character hash.
      const link = data.success ? txLinkMarkdown(actionChainIndex(action), data.data?.txHash) : "";
      const resultMsg = data.success
        ? [
            `**${DONE_TITLES[action.action] ?? "Done."}**`,
            action.action === "bridge" ? "The funds usually arrive within a few minutes." : "",
            link,
          ]
            .filter(Boolean)
            .join(" ")
        : sendStateCode(data)
          ? data.error
          : `**${FAILED_TITLES[action.action] ?? "That did not go through."}** ${plainError(data.error, "Try again in a moment.")}`;

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: resultMsg },
      ]);
      setProposedActions((prev) => prev.filter((_, i) => i !== idx));
      dropReview(action.id);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to execute action. Please try again." },
      ]);
    } finally {
      setExecutingIndex(null);
    }
  };

  if (!authenticated) {
    return (
      <div className="page">
        <Empty icon="wallet" title="Sign in first" text="Connect your wallet to talk to the assistant." />
      </div>
    );
  }

  const hasContent = messages.length > 0 || proposedActions.length > 0;

  const composer = (
    <form onSubmit={handleSubmit} className={cn("ai-composer", hasContent && "is-docked")}>
      <div className="bezel">
        <div className="core">
          <label htmlFor="ai-chat-input" className="sr-only">
            Message to the assistant
          </label>
          <textarea
            id="ai-chat-input"
            ref={inputRef}
            rows={1}
            maxLength={MAX_QUESTION_CHARS}
            aria-describedby="ai-allowance"
            placeholder={exhausted ? `New questions in ${countdown.label}` : hasContent ? "Reply…" : "Ask about your wallet or crypto…"}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            disabled={loading || exhausted}
          />
          <button type="submit" className="send" aria-label="Send message" disabled={loading || exhausted || !input.trim()}>
            <LineIcon name="arrow-up" size={18} strokeWidth={2.2} />
          </button>
        </div>
      </div>
      <div className="ai-foot">
        <Allowance quota={quota} countdown={countdown.label} />
        {input.length > MAX_QUESTION_CHARS * 0.8 ? (
          <span className={cn("num", input.length >= MAX_QUESTION_CHARS && "text-warn-ink")}>
            {input.length}/{MAX_QUESTION_CHARS}
          </span>
        ) : (
          <span className="ai-hint">Enter to send. Nothing moves until you confirm.</span>
        )}
      </div>
    </form>
  );

  const about = (
    <Sheet open={aboutOpen} onClose={() => setAboutOpen(false)} title="What the assistant does">
      <div className="sheet-body">
        <Capabilities />
        <p className="hint">
          Runs on {quota?.model ?? "OpenAI"}. {AI_LIMIT_TEXT} Questions that are not about your wallet or crypto get a short no and still count, so the
          assistant stays fast and affordable for&nbsp;everyone.
        </p>
      </div>
    </Sheet>
  );

  if (!hasContent) {
    return (
      <div className="ai">
        <div className="ai-start">
          <header className="ai-hero in">
            <AssistantMark size={52} />
            <h1 className="page-title">How can I&nbsp;help?</h1>
            <p className="page-lede">
              Ask about your portfolio and yields, or describe a transaction. I prepare it, you confirm&nbsp;it.
            </p>
          </header>
          <div className="in" style={{ "--i": 1 } as React.CSSProperties}>
            {composer}
          </div>
          <ul className="ai-suggest in" style={{ "--i": 2 } as React.CSSProperties} aria-label="Suggestions">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button type="button" onClick={() => sendMessage(s)}>
                  {s}
                  <LineIcon name="arrow-up-right" size={16} />
                </button>
              </li>
            ))}
          </ul>
          <div className="in" style={{ "--i": 3 } as React.CSSProperties}>
            <Capabilities />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ai">
      <div className="ai-bar in">
        <div className="ai-id">
          <AssistantMark size={36} />
          <div>
            <h1>Assistant</h1>
            <p>{quota?.model ? `${quota.model}, ` : ""}sends nothing without your&nbsp;OK</p>
          </div>
        </div>
        <div className="ai-bar-acts">
        <button type="button" className="btn btn--sm btn--icon" aria-label="What the assistant can do" onClick={() => setAboutOpen(true)}>
          <LineIcon name="sparkle" size={15} />
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => {
            setMessages([]);
            setProposedActions([]);
            localStorage.removeItem(CHAT_STORAGE_KEY);
          }}
        >
          <LineIcon name="plus" size={15} />
          New chat
        </button>
        </div>
      </div>

      <ol className="ai-thread" aria-label="Conversation">
        {messages.map((msg, i) => (
          <motion.li
            key={i}
            className={cn("msg", msg.role, msg.kind && `is-${msg.kind}`)}
            initial={i < restored.length ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={ENTER}
          >
            {msg.role === "assistant" ? (
              <>
                <AssistantMark />
                {msg.kind ? (
                  <p className="app-note">
                    <LineIcon name={msg.kind === "refusal" ? "lock" : "alert"} size={15} />
                    <span>{msg.content}</span>
                  </p>
                ) : (
                  <div className="md">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )}
              </>
            ) : (
              <p>{msg.content}</p>
            )}
          </motion.li>
        ))}

        {proposedActions.map((action, i) => (
          <motion.li
            key={action.id}
            className="msg assistant"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={ENTER}
          >
            <AssistantMark />
            <ActionCard
              action={action}
              review={reviews[action.id] ?? null}
              reviewing={reviewingId === action.id}
              onReview={() => void reviewQuote(action)}
              onConfirm={() => executeAction(action, i)}
              onReject={() => {
                setProposedActions((prev) => prev.filter((_, idx) => idx !== i));
                dropReview(action.id);
              }}
              executing={executingIndex === i}
            />
          </motion.li>
        ))}

        {loading && (
          <motion.li className="msg assistant" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={ENTER}>
            <AssistantMark />
            <span className="typing" role="status" aria-label="The assistant is writing">
              <span />
              <span />
              <span />
            </span>
          </motion.li>
        )}
      </ol>

      {composer}
      {about}
    </div>
  );
}
