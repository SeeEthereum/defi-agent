"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { motion, useReducedMotion } from "motion/react";
import useSWR from "swr";
import { LineIcon, type LineIconName } from "@/components/line-icon";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatUnits } from "viem";
import { getChainByIndex, getChainBySwapName, CHAINS } from "@/lib/chains";
import { cn } from "@/lib/utils";
import { Empty, Sheet } from "@/components/premium";

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

function readQuoteId(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload == null) return undefined;
  const source = Array.isArray(payload) ? payload[0] : payload;
  if (typeof source !== "object" || source == null) return undefined;
  const id = (source as Record<string, unknown>).quoteId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
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
      return hasParam(p.coin) && hasParam(p.side) && hasParam(p.size);
    case "hl_close":
      return hasParam(p.coin);
    default:
      return false;
  }
}

// ── Token symbol lookup ──────────────────────────────────────────────────────
const TOKEN_MAP: Record<string, string> = {
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee": "ETH",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": "USDC",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": "USDT",
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH",
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": "WETH",
  "0x4200000000000000000000000000000000000006": "WETH",
};

function tokenSymbol(addr?: string): string {
  if (!addr) return "token";
  return TOKEN_MAP[addr.toLowerCase()] ?? addr.slice(0, 6) + "…" + addr.slice(-4);
}

// Decimals of the tokens in TOKEN_MAP, so swap and bridge amounts (sent in
// minimal units) can be shown as people read them. Unknown tokens keep the raw value.
const TOKEN_DECIMALS: Record<string, number> = {
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee": 18,
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 6,
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": 6,
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 6,
  "0xdac17f958d2ee523a2206206994597c13d831ec7": 6,
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": 6,
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": 18,
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": 18,
  "0x4200000000000000000000000000000000000006": 18,
};

function minimalToDisplay(raw: unknown, addr: unknown, symbol: string): string {
  const value = String(raw);
  const decimals = typeof addr === "string" ? TOKEN_DECIMALS[addr.toLowerCase()] : undefined;
  if (decimals == null || !/^\d+$/.test(value)) return `${value} ${symbol}`;
  return `${formatUnits(BigInt(value), decimals)} ${symbol}`;
}

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
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
  action: string;
  params: Record<string, unknown>;
}

// ── Action Card ──────────────────────────────────────────────────────────────
/** Shown in place of a value the assistant has not filled in yet. */
const MISSING = "Not set";

function ActionCard({
  action,
  onConfirm,
  onReject,
  executing,
}: {
  action: ProposedAction;
  onConfirm: () => void;
  onReject: () => void;
  executing: boolean;
}) {
  const rows: { label: string; value: string }[] = [];
  let title = "";
  let icon: LineIconName = "swap";

  if (action.action === "swap") {
    const p = action.params;
    const chain = getChainBySwapName(p.chain as string);
    const fromSymbol = tokenSymbol(p.fromToken as string | undefined);
    const toSymbol = tokenSymbol(p.toToken as string | undefined);
    title = "Token swap";
    icon = "swap";
    rows.push({
      label: "Amount",
      value: hasParam(p.amount) ? minimalToDisplay(p.amount, p.fromToken, fromSymbol) : MISSING,
    });
    rows.push({ label: "From", value: fromSymbol });
    rows.push({ label: "To", value: toSymbol });
    rows.push({ label: "Chain", value: chain?.name ?? (hasParam(p.chain) ? String(p.chain) : MISSING) });
    if (p.slippage) rows.push({ label: "Slippage", value: `${p.slippage}%` });
    if (p.gasLevel) rows.push({ label: "Gas", value: String(p.gasLevel) });
    if (p.mevProtection) rows.push({ label: "MEV protection", value: "On" });
  } else if (action.action === "supply") {
    const p = action.params;
    const chain = getChainByIndex(p.chainIndex as number);
    title = "Supply on Fluid";
    icon = "trending-up";
    rows.push({ label: "Asset", value: p.fTokenSymbol as string });
    rows.push({ label: "Amount", value: `${p.amount}` });
    rows.push({ label: "Chain", value: chain?.name ?? String(p.chainIndex) });
  } else if (action.action === "send") {
    const p = action.params;
    const chain = getChainByIndex(p.chainIndex as number);
    const token = p.contractToken
      ? tokenSymbol(p.contractToken as string)
      : chain?.nativeSymbol ?? "ETH";
    title = "Transfer";
    icon = "send";
    rows.push({ label: "Token", value: token });
    rows.push({ label: "Amount", value: hasParam(p.amount) ? `${p.amount} ${token}` : MISSING });
    rows.push({
      label: "To",
      value: hasParam(p.recipient) ? shortAddr(String(p.recipient)) : MISSING,
    });
    rows.push({ label: "Chain", value: chain?.name ?? (hasParam(p.chainIndex) ? String(p.chainIndex) : MISSING) });
  } else if (action.action === "bridge") {
    const p = action.params;
    const fromChain = getChainByIndex(Number(p.fromChain));
    const toChain = getChainByIndex(Number(p.toChain));
    const fromSymbol = (p.fromTokenSymbol as string) || tokenSymbol(p.fromToken as string | undefined);
    const toSymbol = (p.toTokenSymbol as string) || tokenSymbol(p.toToken as string | undefined);
    title = "Bridge";
    icon = "bridge";
    rows.push({ label: "From chain", value: fromChain?.name ?? (hasParam(p.fromChain) ? String(p.fromChain) : MISSING) });
    rows.push({ label: "To chain", value: toChain?.name ?? (hasParam(p.toChain) ? String(p.toChain) : MISSING) });
    rows.push({
      label: "Amount",
      value: hasParam(p.fromAmount) ? minimalToDisplay(p.fromAmount, p.fromToken, fromSymbol) : MISSING,
    });
    rows.push({ label: "From token", value: fromSymbol });
    rows.push({ label: "To token", value: toSymbol });
    if (p.estimatedOutput) rows.push({ label: "Estimated output", value: String(p.estimatedOutput) });
    if (p.bridge) rows.push({ label: "Provider", value: String(p.bridge) });
  } else if (action.action === "withdraw") {
    const p = action.params;
    const chain = getChainByIndex(p.chainIndex as number);
    title = "Withdraw from Fluid";
    icon = "trending-down";
    rows.push({ label: "Asset", value: p.fTokenSymbol as string });
    rows.push({ label: "Amount", value: p.amount === "all" ? "Everything" : String(p.amount) });
    rows.push({ label: "Chain", value: chain?.name ?? String(p.chainIndex) });
  } else if (action.action === "hl_order") {
    const p = action.params;
    const side = p.side === "buy" ? "Long" : p.side === "sell" ? "Short" : null;
    title = side ? `Hyperliquid ${side.toLowerCase()}` : "Hyperliquid order";
    icon = p.side === "buy" ? "long" : "short";
    rows.push({ label: "Market", value: hasParam(p.coin) ? `${p.coin}-PERP` : MISSING });
    rows.push({ label: "Side", value: side ?? MISSING });
    rows.push({ label: "Size", value: hasParam(p.size) ? `${p.size} ${hasParam(p.coin) ? p.coin : ""}`.trim() : MISSING });
    if (p.type) rows.push({ label: "Type", value: String(p.type).toUpperCase() });
    rows.push({ label: "Leverage", value: hasParam(p.leverage) ? `${p.leverage}×` : MISSING });
    if (p.currentPrice) rows.push({ label: "Mark price", value: `$${parseFloat(String(p.currentPrice)).toLocaleString("en-US")}` });
    if (p.slPx) rows.push({ label: "Stop loss", value: `$${p.slPx}` });
    if (p.tpPx) rows.push({ label: "Take profit", value: `$${p.tpPx}` });
    rows.push({ label: "Settlement", value: "USDC on Hyperliquid L1" });
  } else if (action.action === "hl_close") {
    const p = action.params;
    title = "Close Hyperliquid position";
    icon = "close";
    rows.push({ label: "Market", value: `${p.coin}-PERP` });
    if (p.size) rows.push({ label: "Size", value: `${p.size} ${p.coin}` });
    else rows.push({ label: "Size", value: "Full position" });
    if (p.unrealizedPnl) rows.push({ label: "Unrealized PnL", value: `${parseFloat(String(p.unrealizedPnl)) >= 0 ? "+" : ""}${p.unrealizedPnl} USDC` });
  }

  const ready = actionParamsReady(action);

  return (
    <div className="bezel act">
      <div className="core">
        <div className="act-head">
          <span className="act-ico" aria-hidden="true">
            <LineIcon name={icon} size={18} />
          </span>
          <div>
            <div className="t">{title}</div>
            <div className="sub">{ready ? "Waiting for your confirmation" : "Some details are missing"}</div>
          </div>
        </div>

        <dl className="act-rows">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd className={row.value === MISSING ? "missing" : undefined}>{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="act-btns">
          <button type="button" className="btn btn--sm" onClick={onReject} disabled={executing}>
            Reject
          </button>
          <button type="button" className="btn btn--sm btn--primary" onClick={onConfirm} disabled={executing || !ready}>
            {executing ? (
              <>
                <span className="spin" aria-hidden="true" />
                Executing…
              </>
            ) : (
              "Confirm"
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
              ...data.data.proposedActions,
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

  const executeAction = async (action: ProposedAction, idx: number) => {
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
          setMessages((prev) => [...prev, { role: "assistant", content: `**Approval failed:** ${approveEarnData.error}` }]);
          setExecutingIndex(null);
          return;
        }
        const earnApproveTxHash = approveEarnData.data?.txHash as string | undefined;
        // `alreadyApproved` means the allowance already covers this amount:
        // there is no transaction to wait for.
        if (!approveEarnData.data?.alreadyApproved) {
          if (earnApproveTxHash) {
            setMessages((prev) => [...prev, { role: "assistant", content: `Approval sent (\`${earnApproveTxHash.slice(0, 10)}…\`). Waiting for confirmation…` }]);
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
            setMessages((prev) => [...prev, { role: "assistant", content: `**Approval failed:** ${approveData.error}` }]);
            setExecutingIndex(null);
            return;
          }
          const approveTxHash = approveData.data?.txHash as string | undefined;
          const alreadyApproved = Boolean(approveData.data?.alreadyApproved);
          if (!alreadyApproved) {
            if (approveTxHash) {
              setMessages((prev) => [...prev, { role: "assistant", content: `Approval sent (\`${approveTxHash.slice(0, 10)}…\`). Waiting for confirmation…` }]);
            }
            const confirmed = await waitForReceipt(approveTxHash ?? "", action.params.chain as string);
            if (!confirmed) {
              setMessages((prev) => [...prev, { role: "assistant", content: "Approval not confirmed, try again" }]);
              setExecutingIndex(null);
              return;
            }
          }
        }
        // Step 2: Quote, then execute with the issued quote id
        const swapQuoteBody: Record<string, unknown> = {
          fromToken: action.params.fromToken,
          toToken: action.params.toToken,
          amount: action.params.amount,
          chain: action.params.chain,
        };
        if (hasParam(action.params.slippage)) {
          swapQuoteBody.slippage = action.params.slippage;
        }
        let swapQuoteId: string | undefined;
        try {
          const quoteRes = await fetch("/api/swap/quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(swapQuoteBody),
          });
          const quoteData = await quoteRes.json();
          if (quoteData.success) {
            swapQuoteId = readQuoteId(quoteData.data);
          }
        } catch {
          swapQuoteId = undefined;
        }
        if (!swapQuoteId) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "Could not get a quote, try again" },
          ]);
          setExecutingIndex(null);
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
          quoteId: swapQuoteId,
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
      case "bridge": {
        const qs = new URLSearchParams({
          fromChain: String(action.params.fromChain),
          toChain: String(action.params.toChain),
          fromToken: String(action.params.fromToken),
          toToken: String(action.params.toToken),
          fromAmount: String(action.params.fromAmount),
        });
        let bridgeQuoteId: string | undefined;
        try {
          const quoteRes = await fetch(`/api/bridge/quote?${qs.toString()}`);
          const quoteData = await quoteRes.json();
          if (quoteData.success) {
            bridgeQuoteId = readQuoteId(quoteData.data);
          }
        } catch {
          bridgeQuoteId = undefined;
        }
        if (!bridgeQuoteId) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "Could not get a quote, try again" },
          ]);
          setExecutingIndex(null);
          return;
        }
        endpoint = "/api/bridge/execute";
        body = {
          fromChain: action.params.fromChain,
          toChain: action.params.toChain,
          fromToken: action.params.fromToken,
          toToken: action.params.toToken,
          fromAmount: action.params.fromAmount,
          quoteId: bridgeQuoteId,
        };
        break;
      }
      case "hl_order":
        endpoint = "/api/perp/order";
        body = {
          coin: action.params.coin,
          side: action.params.side,
          size: action.params.size,
          type: action.params.type ?? "market",
          price: action.params.price,
          leverage: action.params.leverage ?? 10,
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

      if (res.status === 409 && (action.action === "swap" || action.action === "bridge")) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Price moved, ask me again for a fresh quote" },
        ]);
        setProposedActions((prev) => prev.filter((_, i) => i !== idx));
        return;
      }

      const resultMsg = data.success
        ? `**${action.action.charAt(0).toUpperCase() + action.action.slice(1)} completed!**\n${
            data.data?.txHash
              ? `Transaction hash: \`${data.data.txHash}\``
              : "Transaction submitted successfully."
          }`
        : `**${action.action} failed:** ${data.error}`;

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: resultMsg },
      ]);
      setProposedActions((prev) => prev.filter((_, i) => i !== idx));
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
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
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
            key={`act-${i}`}
            className="msg assistant"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={ENTER}
          >
            <AssistantMark />
            <ActionCard
              action={action}
              onConfirm={() => executeAction(action, i)}
              onReject={() => setProposedActions((prev) => prev.filter((_, idx) => idx !== i))}
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
