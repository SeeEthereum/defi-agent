"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import { getChainByIndex, getChainBySwapName, CHAINS } from "@/lib/chains";
import { cn } from "@/lib/utils";

const NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const CHAIN_RPC: Record<string, string> = Object.fromEntries(
  Object.values(CHAINS).map((c) => [c.swapName, c.rpcUrl])
);

/** Poll eth_getTransactionReceipt until confirmed or timeout */
async function waitForReceipt(txHash: string, chain: string): Promise<boolean> {
  const rpc = CHAIN_RPC[chain];
  if (!rpc || !txHash) return true;
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
  return true;
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

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

// ── Types ────────────────────────────────────────────────────────────────────
interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ProposedAction {
  action: string;
  params: Record<string, unknown>;
}

// ── Action Card ──────────────────────────────────────────────────────────────
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
  let emoji = "";

  if (action.action === "swap") {
    const p = action.params;
    const chain = getChainBySwapName(p.chain as string);
    title = "Token Swap";
    emoji = "🔄";
    rows.push({ label: "From", value: tokenSymbol(p.fromToken as string) });
    rows.push({ label: "To", value: tokenSymbol(p.toToken as string) });
    rows.push({ label: "Chain", value: chain?.name ?? (p.chain as string) });
    if (p.slippage) rows.push({ label: "Slippage", value: `${p.slippage}%` });
    if (p.gasLevel) rows.push({ label: "Gas", value: String(p.gasLevel) });
    if (p.mevProtection) rows.push({ label: "MEV Protection", value: "✅ Enabled" });
  } else if (action.action === "supply") {
    const p = action.params;
    const chain = getChainByIndex(p.chainIndex as number);
    title = "Fluid Supply";
    emoji = "📈";
    rows.push({ label: "Asset", value: p.fTokenSymbol as string });
    rows.push({ label: "Amount", value: `${p.amount}` });
    rows.push({ label: "Chain", value: chain?.name ?? String(p.chainIndex) });
  } else if (action.action === "send") {
    const p = action.params;
    const chain = getChainByIndex(p.chainIndex as number);
    title = "Token Transfer";
    emoji = "📤";
    rows.push({
      label: "Token",
      value: p.contractToken
        ? tokenSymbol(p.contractToken as string)
        : chain?.nativeSymbol ?? "ETH",
    });
    rows.push({ label: "Amount", value: String(p.amount) });
    rows.push({ label: "To", value: shortAddr(p.recipient as string) });
    rows.push({ label: "Chain", value: chain?.name ?? String(p.chainIndex) });
  } else if (action.action === "withdraw") {
    const p = action.params;
    const chain = getChainByIndex(p.chainIndex as number);
    title = "Fluid Withdraw";
    emoji = "📉";
    rows.push({ label: "Asset", value: p.fTokenSymbol as string });
    rows.push({ label: "Amount", value: p.amount === "all" ? "Withdraw All" : String(p.amount) });
    rows.push({ label: "Chain", value: chain?.name ?? String(p.chainIndex) });
  } else if (action.action === "hl_order") {
    const p = action.params;
    title = `Hyperliquid ${p.side === "buy" ? "Long" : "Short"}`;
    emoji = p.side === "buy" ? "📗" : "📕";
    rows.push({ label: "Market", value: `${p.coin}-PERP` });
    rows.push({ label: "Side", value: p.side === "buy" ? "LONG" : "SHORT" });
    rows.push({ label: "Size", value: `${p.size} ${p.coin}` });
    if (p.type) rows.push({ label: "Type", value: String(p.type).toUpperCase() });
    if (p.leverage) rows.push({ label: "Leverage", value: `${p.leverage}×` });
    if (p.currentPrice) rows.push({ label: "Mark Price", value: `$${parseFloat(String(p.currentPrice)).toLocaleString()}` });
    if (p.slPx) rows.push({ label: "Stop Loss", value: `$${p.slPx}` });
    if (p.tpPx) rows.push({ label: "Take Profit", value: `$${p.tpPx}` });
    rows.push({ label: "Settlement", value: "USDC on Hyperliquid L1" });
  } else if (action.action === "hl_close") {
    const p = action.params;
    title = "Close Hyperliquid Position";
    emoji = "🔴";
    rows.push({ label: "Market", value: `${p.coin}-PERP` });
    if (p.size) rows.push({ label: "Size", value: `${p.size} ${p.coin}` });
    else rows.push({ label: "Size", value: "Full position" });
    if (p.unrealizedPnl) rows.push({ label: "Unrealized PnL", value: `${parseFloat(String(p.unrealizedPnl)) >= 0 ? "+" : ""}${p.unrealizedPnl} USDC` });
  }

  return (
    <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/5 to-violet-500/5 p-4 space-y-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-lg">{emoji}</span>
        <span className="font-semibold text-sm">{title}</span>
        <Badge variant="outline" className="ml-auto text-[10px] border-primary/30 text-primary">
          Awaiting Confirmation
        </Badge>
      </div>

      <div className="rounded-xl bg-background/60 border border-border/40 divide-y divide-border/40">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-muted-foreground">{row.label}</span>
            <span className="text-xs font-medium">{row.value}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="flex-1 h-9 rounded-xl text-sm font-medium shadow-sm"
          onClick={onConfirm}
          disabled={executing}
        >
          {executing ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Executing…
            </span>
          ) : (
            "Confirm"
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-9 rounded-xl text-sm"
          onClick={onReject}
          disabled={executing}
        >
          Reject
        </Button>
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
  "Show my wallet address",
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

export default function AiPage() {
  const { authenticated, walletAddress } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [proposedActions, setProposedActions] = useState<ProposedAction[]>([]);
  const [executingIndex, setExecutingIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load chat history from localStorage on mount
  useEffect(() => {
    const saved = loadMessages();
    if (saved.length > 0) setMessages(saved);
  }, []);

  // Save chat history whenever messages change
  useEffect(() => {
    if (messages.length > 0) saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, proposedActions]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      const userMessage: Message = { role: "user", content: text.trim() };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: newMessages, walletAddress }),
        });
        const data = await res.json();

        if (data.success) {
          if (data.data.text) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: data.data.text },
            ]);
          }
          if (data.data.proposedActions?.length) {
            setProposedActions((prev) => [
              ...prev,
              ...data.data.proposedActions,
            ]);
          }
        } else {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `⚠️ ${data.error || "Something went wrong"}` },
          ]);
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Network error. Please try again." },
        ]);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [messages, loading, walletAddress]
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
        setMessages((prev) => [...prev, { role: "assistant", content: "⏳ Approvazione token per Fluid..." }]);
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
          setMessages((prev) => [...prev, { role: "assistant", content: `❌ **Approvazione fallita:** ${approveEarnData.error}` }]);
          setExecutingIndex(null);
          return;
        }
        const earnApproveTxHash = approveEarnData.data?.approveTxHash as string | undefined;
        if (earnApproveTxHash) {
          setMessages((prev) => [...prev, { role: "assistant", content: `✅ Approvazione inviata (\`${earnApproveTxHash.slice(0, 10)}…\`). In attesa di conferma on-chain...` }]);
          // Convert chainIndex to swapName for waitForReceipt
          const earnChain = getChainByIndex(action.params.chainIndex as number)?.swapName ?? "arbitrum";
          const confirmed = await waitForReceipt(earnApproveTxHash, earnChain);
          if (!confirmed) {
            setMessages((prev) => [...prev, { role: "assistant", content: "❌ Transazione di approvazione fallita on-chain." }]);
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
          walletAddress: walletAddress ?? "",
        };
        break;
      }
      case "swap": {
        // Step 1: Approve DEX router for ERC-20 tokens (skip for native ETH/BNB)
        const fromAddr = (action.params.fromToken as string ?? "").toLowerCase();
        const isNative = fromAddr === NATIVE_TOKEN;
        if (!isNative && fromAddr) {
          setMessages((prev) => [...prev, { role: "assistant", content: "⏳ Approving token for swap..." }]);
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
            setMessages((prev) => [...prev, { role: "assistant", content: `❌ **Approval failed:** ${approveData.error}` }]);
            setExecutingIndex(null);
            return;
          }
          // Wait for approval tx confirmation
          const approveTxHash = approveData.data?.txHash as string | undefined;
          if (approveTxHash) {
            setMessages((prev) => [...prev, { role: "assistant", content: `✅ Approval sent (\`${approveTxHash.slice(0, 10)}…\`). Waiting for confirmation...` }]);
            const confirmed = await waitForReceipt(approveTxHash, action.params.chain as string);
            if (!confirmed) {
              setMessages((prev) => [...prev, { role: "assistant", content: "❌ Approval transaction reverted on-chain." }]);
              setExecutingIndex(null);
              return;
            }
          }
        }
        // Step 2: Execute swap
        endpoint = "/api/swap/execute";
        body = {
          fromToken: action.params.fromToken,
          toToken: action.params.toToken,
          amount: action.params.amount,
          chain: action.params.chain,
          wallet: walletAddress ?? "",
          slippage: action.params.slippage,
          gasLevel: action.params.gasLevel,
          mevProtection: action.params.mevProtection,
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
        body = {
          fTokenSymbol: action.params.fTokenSymbol,
          amount: action.params.amount,
          chainIndex: action.params.chainIndex,
          walletAddress: walletAddress ?? "",
          withdrawAll: action.params.amount === "all",
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
          fromAddress: walletAddress ?? "",
        };
        break;
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

      const resultMsg = data.success
        ? `✅ **${action.action.charAt(0).toUpperCase() + action.action.slice(1)} completed!**\n${
            data.data?.txHash
              ? `Transaction hash: \`${data.data.txHash}\``
              : "Transaction submitted successfully."
          }`
        : `❌ **${action.action} failed:** ${data.error}`;

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: resultMsg },
      ]);
      setProposedActions((prev) => prev.filter((_, i) => i !== idx));
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "❌ Failed to execute action. Please try again." },
      ]);
    } finally {
      setExecutingIndex(null);
    }
  };

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please connect your wallet first.</p>
      </div>
    );
  }

  const hasContent = messages.length > 0 || proposedActions.length > 0;

  return (
    <div className="relative flex flex-col h-[calc(100vh-4rem-56px)] md:h-[calc(100vh-4rem)] overflow-hidden">

      {/* ── Aurora background blobs ─────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
        <div className="absolute -top-24 left-1/4 h-[480px] w-[480px] rounded-full bg-violet-500/7 blur-3xl animate-ai-aurora-1" />
        <div className="absolute bottom-0 right-0 h-[380px] w-[380px] rounded-full bg-indigo-500/7 blur-3xl animate-ai-aurora-2" />
        <div className="absolute top-1/2 -left-16 h-[300px] w-[300px] rounded-full bg-cyan-400/5 blur-3xl animate-ai-aurora-1 [animation-delay:4.5s]" />
      </div>

      {/* ── Header — only visible when conversation has started ────────── */}
      <div className={cn("relative shrink-0 px-6 pt-6 pb-4 border-b border-border/60 z-10 transition-all duration-300", !hasContent && "hidden")}>
        <div className="relative flex items-center gap-3">
          <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 via-indigo-500 to-cyan-500 flex items-center justify-center shadow-[0_4px_14px_oklch(0.55_0.28_290/0.4)]">
            {/* Glow ring on header icon */}
            <span className="absolute inset-0 rounded-xl animate-ai-ring border border-violet-300/50" />
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-ai-spin-slow relative z-10">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight ai-gradient-text">AI Assistant</h1>
            <p className="text-[11px] text-muted-foreground">Powered by Claude · Zero fees</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setProposedActions([]);
              localStorage.removeItem(CHAT_STORAGE_KEY);
            }}
            className="text-[11px] text-muted-foreground/60 hover:text-destructive transition-colors px-2 py-1 rounded-lg hover:bg-destructive/5"
          >
            Clear chat
          </button>
        )}
      </div>

      {/* ── Messages ───────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-y-auto px-6 py-4 space-y-4 z-10">
        {/* Empty state */}
        {!hasContent && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6 py-12">

            {/* Floating icon with orbit system */}
            <div className="relative flex h-28 w-28 items-center justify-center animate-ai-float">
              {/* Expanding rings */}
              <span className="absolute h-16 w-16 rounded-2xl border border-violet-400/30 animate-ai-ring" />
              <span className="absolute h-16 w-16 rounded-2xl border border-primary/20 animate-ai-ring-delay" />

              {/* Orbit dot 1 — violet */}
              <span className="pointer-events-none absolute top-1/2 left-1/2 h-2.5 w-2.5 rounded-full bg-violet-500 shadow-[0_0_8px_3px_oklch(0.55_0.28_290/0.7)] animate-ai-orbit-lg-1" />
              {/* Orbit dot 2 — cyan */}
              <span className="pointer-events-none absolute top-1/2 left-1/2 h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_7px_3px_oklch(0.65_0.22_200/0.6)] animate-ai-orbit-lg-2" />
              {/* Orbit dot 3 — indigo */}
              <span className="pointer-events-none absolute top-1/2 left-1/2 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_2px_oklch(0.5_0.24_260/0.6)] animate-ai-orbit-lg-3" />

              {/* Main icon */}
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500/20 via-indigo-500/15 to-cyan-500/15 border border-violet-400/25 flex items-center justify-center animate-ai-glow">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-violet-400 animate-ai-spin-slow">
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                </svg>
              </div>
            </div>

            <div style={{ animation: "ai-fade-up 0.5s ease both 0.15s", opacity: 0 }}>
              <p className="font-semibold text-[16px] mb-1.5 ai-gradient-text">How can I help you?</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Ask me about your portfolio, yields, or tell me what transaction to prepare.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={s}
                  style={{ animation: `ai-fade-up 0.45s ease both ${0.25 + i * 0.07}s`, opacity: 0 }}
                  className="rounded-xl border border-primary/25 bg-secondary px-3 py-2 text-[12px] text-foreground/70 hover:bg-primary/15 hover:text-foreground hover:border-primary/40 transition-colors text-left shadow-sm"
                  onClick={() => sendMessage(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
          >
            {msg.role === "assistant" && (
              <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center mr-2 mt-1 shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                </svg>
              </div>
            )}
            <div
              className={cn(
                "max-w-[88%] sm:max-w-[75%] rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-sm",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-muted rounded-bl-sm"
              )}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:mb-2 [&>ul]:pl-4 [&>ul>li]:mb-0.5 [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm [&>code]:text-xs [&>pre]:text-xs">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {/* Proposed action cards */}
        {proposedActions.map((action, i) => (
          <div key={i} className="flex justify-start">
            <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center mr-2 mt-1 shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
              </svg>
            </div>
            <div className="max-w-[85%] w-full sm:w-72">
              <ActionCard
                action={action}
                onConfirm={() => executeAction(action, i)}
                onReject={() => setProposedActions((prev) => prev.filter((_, idx) => idx !== i))}
                executing={executingIndex === i}
              />
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center mr-2 mt-1 shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
              </svg>
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input bar ──────────────────────────────────────────────────── */}
      <div className="relative shrink-0 border-t border-violet-200/40 px-3 py-3 md:px-6 md:py-4 bg-background/80 backdrop-blur z-10">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-500/4 via-transparent to-cyan-500/4 pointer-events-none" />
        <form onSubmit={handleSubmit} className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              rows={1}
              placeholder="Ask anything about your portfolio, yields, or swaps…"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              disabled={loading}
              className="w-full resize-none rounded-2xl border border-primary/20 bg-secondary/60 px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary disabled:opacity-60 overflow-hidden animate-ai-input"
              style={{ minHeight: "44px" }}
            />
          </div>
          <Button
            type="submit"
            size="icon"
            className="h-11 w-11 rounded-2xl shrink-0 shadow-[0_4px_12px_oklch(0.55_0.28_290/0.3)] bg-gradient-to-br from-violet-600 to-indigo-600 border-0 hover:from-violet-500 hover:to-indigo-500"
            disabled={loading || !input.trim()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </Button>
        </form>
        <p className="text-[10px] text-muted-foreground/50 text-center mt-2">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
