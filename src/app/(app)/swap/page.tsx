"use client";

/**
 * Swap: one ticket (pay, receive, quote) beside what is trending on the
 * chain. Settings fold away behind the slippage chip; tokens are chosen in a
 * searchable picker instead of an inline dropdown.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { CHAINS } from "@/lib/chains";
import { TokenIcon } from "@/components/token-icon";
import { Fade, NumberDisplay } from "@/components/motion";
import { GasStationModal } from "@/components/gas-station-modal";
import { LineIcon } from "@/components/line-icon";
import { Change, Empty, PageHead, Panel, Picker, PickRow, Skeleton } from "@/components/premium";
import type { GasStationConfirming } from "@/lib/okx/types";
import { motion, AnimatePresence } from "motion/react";


const NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

interface TokenInfo {
  symbol: string;
  address: string;
  decimals: number;
}

interface TokenSearchResult {
  tokenSymbol?: string;
  tokenContractAddress?: string;
  decimal?: string | number;
  tokenFullName?: string;
  symbol?: string;
  address?: string;
  decimals?: string | number;
  name?: string;
}

interface WalletToken {
  symbol: string;
  address: string;
  decimals: number;
  balance: string; // human-readable
  balanceUsd: string;
}

function getNativeToken(chain: string): TokenInfo {
  const chainConfig = Object.values(CHAINS).find((c) => c.swapName === chain);
  return {
    symbol: chainConfig?.nativeSymbol ?? "ETH",
    address: NATIVE_TOKEN,
    decimals: chainConfig?.nativeDecimals ?? 18,
  };
}

function parseTokenResult(t: TokenSearchResult): TokenInfo {
  return {
    symbol: t.tokenSymbol ?? t.symbol ?? "???",
    address: t.tokenContractAddress || t.address || "",
    decimals: Number(t.decimal ?? t.decimals ?? 18),
  };
}

function getTokenName(t: TokenSearchResult): string {
  const name = t.tokenFullName ?? t.name ?? "";
  return name.length > 24 ? name.slice(0, 22) + "..." : name;
}

function abbreviateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function toWei(amount: string, decimals: number): string | null {
  const normalized = amount.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const dec = Math.max(0, Math.floor(decimals));
  const [intPart, fracPartRaw = ""] = normalized.split(".");
  const fracPart = fracPartRaw.slice(0, dec).padEnd(dec, "0");
  return BigInt(intPart + fracPart).toString();
}

function fromWei(amount: string, decimals: number, maxFracDigits?: number): string {
  if (!/^\d+$/.test(amount)) return "0";
  const dec = Math.max(0, Math.floor(decimals));
  const padded = amount.padStart(dec + 1, "0");
  const intPart = padded.slice(0, padded.length - dec).replace(/^0+/, "") || "0";
  let fracPart = padded.slice(padded.length - dec);
  if (maxFracDigits != null) fracPart = fracPart.slice(0, maxFracDigits);
  fracPart = fracPart.replace(/0+$/, "");
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

function quoteInputKey(
  from: TokenInfo | null,
  to: TokenInfo | null,
  chainName: string,
  amt: string
): string {
  if (!from || !to) return "";
  return `${from.address}|${to.address}|${chainName}|${amt}`;
}

function applySlippage(amountWei: string, slippagePercent: string): string {
  if (!/^\d+$/.test(amountWei)) return "0";
  const normalized = slippagePercent.trim().replace(",", ".");
  const slipStr = /^\d+(\.\d+)?$/.test(normalized) ? normalized : "0.5";
  const [i, f = ""] = slipStr.split(".");
  const scale = 10n ** BigInt(f.length);
  const slip = BigInt(i) * scale + BigInt(f || "0");
  const hundred = 100n * scale;
  const amount = BigInt(amountWei);
  if (slip >= hundred) return "0";
  return ((amount * (hundred - slip)) / hundred).toString();
}

function minToAmountWei(
  q: Record<string, unknown>,
  toAmountWei: string,
  slippagePercent: string
): string {
  const candidates = [
    q.toAmountMin,
    q.minReceiveAmount,
    q.minimum,
    q.toTokenMinAmount,
    q.minAmountOut,
    q.minReturnAmount,
    q.receiveAmountMin,
    q.toAmountMinimum,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && /^\d+$/.test(c)) return c;
  }
  return applySlippage(toAmountWei, slippagePercent);
}

function parsePriceImpact(q: Record<string, unknown>): number | null {
  const raw = q.priceImpactPercent ?? q.priceImpactPercentage ?? q.priceImpact;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function clampSlippage(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return "0.5";
  if (n < 0.1) return "0.1";
  if (n > 5) return "5";
  return String(n);
}

const QUOTE_TTL_MS = 30_000;

function friendlyError(raw: string): { title: string; message: string } {
  const lower = raw.toLowerCase();

  if (lower.includes("insufficient") || lower.includes("not enough") || lower.includes("balance"))
    return { title: "Insufficient balance", message: "You don't have enough funds to complete this swap. Try reducing the amount or adding funds to your wallet." };

  if (lower.includes("slippage") || lower.includes("price movement") || lower.includes("price change"))
    return { title: "Price changed", message: "The price moved too much while getting your quote. Try again or use a smaller amount." };

  if (lower.includes("liquidity") || lower.includes("no route") || lower.includes("no path"))
    return { title: "No liquidity", message: "There isn't enough liquidity for this trading pair. Try a smaller amount or a different token." };

  if (lower.includes("allowance") || lower.includes("approve") || lower.includes("approval"))
    return { title: "Approval required", message: "You need to approve this token before swapping. This is a one-time action per token." };

  if (lower.includes("timeout") || lower.includes("timed out"))
    return { title: "Request timeout", message: "The request took too long. Please check your connection and try again." };

  if (lower.includes("rate limit") || lower.includes("too many"))
    return { title: "Too many requests", message: "Please wait a few seconds and try again." };

  if (lower.includes("82112") || lower.includes("value difference") || lower.includes("risk of loss"))
    return { title: "Extreme price impact", message: "This swap would lose more than 90% of your value due to insufficient market liquidity. Try a much smaller amount." };

  if (lower.includes("simulation failed") || lower.includes("execution reverted") || lower.includes("contract call fail"))
    return { title: "Transaction failed", message: "The transaction was simulated and would fail on-chain. This usually means you don't have enough tokens to complete the swap. Check your wallet balance and try again." };

  if (lower.includes("region") || lower.includes("50125") || lower.includes("80001"))
    return { title: "Region restricted", message: "This service is not available in your region. Try using a VPN or switching to a supported region." };

  if (lower.includes("network") || lower.includes("fetch failed"))
    return { title: "Network error", message: "Could not connect to the server. Please check your internet connection." };

  if (lower.includes("command execution failed"))
    return { title: "Service error", message: "The swap service returned an unexpected error. This may be caused by an unsupported amount, token pair, or a temporary issue. Please try again with different parameters." };

  console.error(raw);
  return { title: "Swap failed", message: "Swap failed, please try again" };
}

type Quote = Record<string, unknown>;
type StoredQuote = { data: Quote; key: string; arrivedAt: number; quoteId: string };

function readQuoteId(payload: unknown): string {
  if (typeof payload !== "object" || payload == null) return "";
  const source = Array.isArray(payload) ? payload[0] : payload;
  if (typeof source !== "object" || source == null) return "";
  const id = (source as Record<string, unknown>).quoteId;
  return typeof id === "string" ? id : "";
}


const SEG_SPRING = { type: "spring" as const, stiffness: 420, damping: 36, mass: 0.8 };

function TokenSelector({
  label,
  token,
  onSelect,
  chain,
  walletTokens,
}: {
  label: "From" | "To";
  token: TokenInfo | null;
  onSelect: (t: TokenInfo) => void;
  chain: string;
  walletTokens?: WalletToken[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TokenSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (q: string) => {
      if (q.length < 1) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch(
          `/api/tokens/search?q=${encodeURIComponent(q)}&chain=${encodeURIComponent(chain)}`
        );
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setResults(data.data);
        } else if (data.success && data.data?.tokens) {
          setResults(data.data.tokens);
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [chain]
  );

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.length < 1) {
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(() => {
      search(query);
    }, 500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, search]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const pick = (t: TokenInfo) => {
    onSelect(t);
    close();
  };

  const isSelected = (address: string) => token != null && token.address.toLowerCase() === address.toLowerCase();

  return (
    <>
      <button
        type="button"
        className={`tok-btn${token ? "" : " empty"}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={token ? `${label === "From" ? "Paying with" : "Receiving"} ${token.symbol}. Change token` : label === "From" ? "Choose the token to pay with" : "Choose the token to receive"}
      >
        {token ? (
          <>
            <TokenIcon symbol={token.symbol} size={26} />
            <span>{token.symbol}</span>
          </>
        ) : (
          <span>Select token</span>
        )}
        <LineIcon name="chevron-down" size={15} />
      </button>

      <Picker
        open={open}
        onClose={close}
        title={label === "From" ? "Pay with" : "Receive"}
        query={query}
        onQuery={setQuery}
        placeholder="Search a name or paste an address"
      >
        {query.length === 0 && (
          <>
            {walletTokens && walletTokens.length > 0 ? (
              <>
                <p className="picker-group">In your wallet</p>
                {walletTokens.map((wt, i) => (
                  <PickRow
                    key={`wallet-${wt.address}-${i}`}
                    icon={<TokenIcon symbol={wt.symbol} size={34} />}
                    title={wt.symbol}
                    sub={<span className="num">{parseFloat(wt.balance).toLocaleString("en-US", { maximumFractionDigits: 6 })}</span>}
                    end={parseFloat(wt.balanceUsd) > 0 ? <span className="num">${parseFloat(wt.balanceUsd).toFixed(2)}</span> : undefined}
                    selected={isSelected(wt.address)}
                    onPick={() => pick({ symbol: wt.symbol, address: wt.address, decimals: wt.decimals })}
                  />
                ))}
              </>
            ) : (
              <p className="picker-hint">Type a token name, a symbol or a contract address.</p>
            )}
          </>
        )}
        {query.length > 0 && searching && (
          <p className="picker-hint">
            <span className="spin" aria-hidden="true" /> Searching…
          </p>
        )}
        {query.length > 0 && !searching && results.length === 0 && <p className="picker-hint">No tokens found on this network.</p>}
        {query.length > 0 &&
          !searching &&
          results.map((t, i) => {
            const parsed = parseTokenResult(t);
            const bal = walletTokens?.find((w) => w.address.toLowerCase() === parsed.address.toLowerCase());
            return (
              <PickRow
                key={`${parsed.address}-${i}`}
                icon={<TokenIcon symbol={parsed.symbol} size={34} />}
                title={parsed.symbol}
                sub={getTokenName(t)}
                end={
                  bal ? (
                    <span className="num">{parseFloat(bal.balance).toLocaleString("en-US", { maximumFractionDigits: 4 })}</span>
                  ) : (
                    <span className="num muted">{abbreviateAddress(parsed.address)}</span>
                  )
                }
                selected={isSelected(parsed.address)}
                onPick={() => pick(parsed)}
              />
            );
          })}
      </Picker>
    </>
  );
}

/** Segmented choice with a sliding light pill. */
function Segmented<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T | null;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}>
            {on && <motion.span layoutId={`${id}-seg`} className="seg-bg" transition={SEG_SPRING} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function SwapPage() {
  const { authenticated } = useAuth();
  const [chain, setChain] = useState("ethereum");
  const [fromToken, setFromToken] = useState<TokenInfo | null>(
    getNativeToken("ethereum")
  );
  const [toToken, setToToken] = useState<TokenInfo | null>(null);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<StoredQuote | null>(null);
  const [quoteStale, setQuoteStale] = useState(false);
  const [priceImpactAck, setPriceImpactAck] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const quoteAbortRef = useRef<AbortController | null>(null);
  const skipClearQuoteErrorRef = useRef(false);
  const mountedRef = useRef(true);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapStep, setSwapStep] = useState<"idle" | "approving" | "waiting_approve" | "swapping">("idle");
  const [error, setError] = useState<{ type: "quote" | "swap"; title: string; message: string } | null>(null);
  const [swapResult, setSwapResult] = useState<{ status: string; message: string; txHash?: string; mevProtected?: boolean; securityWarning?: string | null } | null>(null);
  const [gasStation, setGasStation] = useState<GasStationConfirming | null>(null);
  const [slippage, setSlippage] = useState("0.5");
  const [autoSlippage, setAutoSlippage] = useState(false);
  const [gasLevel, setGasLevel] = useState<"slow" | "average" | "fast">("average");
  const [mevProtection, setMevProtection] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [walletTokens, setWalletTokens] = useState<WalletToken[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Trending tokens
  interface TrendingToken {
    symbol: string;
    name: string;
    address: string;
    chainIndex: string;
    decimals?: string | number;
    decimal?: string | number;
    price: string;
    change24h: string;
    marketCap: string;
    logo: string;
  }
  const [trendingTokens, setTrendingTokens] = useState<TrendingToken[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);

  // Fetch wallet balances when chain changes
  useEffect(() => {
    if (!authenticated) return;
    const chainConfig = Object.values(CHAINS).find((c) => c.swapName === chain);
    if (!chainConfig) return;
    setBalanceLoading(true);
    fetch(`/api/wallet/balances?chain=${chainConfig.chainIndex}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = data.data as any;
        const assets: WalletToken[] = [];
        // Parse balance response — may be nested under details[].tokenAssets or flat array
        const tokenList =
          raw?.details?.[0]?.tokenAssets ??
          raw?.tokenAssets ??
          (Array.isArray(raw) ? raw : []);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const t of tokenList as any[]) {
          const bal = parseFloat(t.balance ?? t.holdingAmount ?? "0");
          if (bal <= 0) continue;
          assets.push({
            symbol: t.symbol ?? t.tokenSymbol ?? "?",
            address: t.tokenAddress || t.tokenContractAddress || NATIVE_TOKEN,
            decimals: Number(t.decimal ?? t.decimals ?? 18),
            balance: t.balance ?? t.holdingAmount ?? "0",
            balanceUsd: t.usdValue
              ? String(t.usdValue)
              : t.tokenPrice
                ? String(bal * parseFloat(t.tokenPrice))
                : "0",
          });
        }
        // Sort by USD value descending
        assets.sort((a, b) => parseFloat(b.balanceUsd) - parseFloat(a.balanceUsd));
        setWalletTokens(assets);
      })
      .catch(() => setWalletTokens([]))
      .finally(() => setBalanceLoading(false));
  }, [chain, authenticated]);

  // Fetch trending tokens on chain change
  useEffect(() => {
    const chainConfig = Object.values(CHAINS).find((c) => c.swapName === chain);
    if (!chainConfig) return;
    setTrendingLoading(true);
    fetch(`/api/tokens/trending?chain=${chainConfig.swapName}&timeFrame=4`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setTrendingTokens(data.data);
        }
      })
      .catch(() => setTrendingTokens([]))
      .finally(() => setTrendingLoading(false));
  }, [chain]);

  // MEV protection is only available on Ethereum, BSC, Base
  const mevSupportedChains = ["ethereum", "bsc", "base"];
  const mevAvailable = mevSupportedChains.includes(chain);

  const handleChainChange = (newChain: string) => {
    setChain(newChain);
    setFromToken(getNativeToken(newChain));
    setToToken(null);
    setError(null);
    setSwapResult(null);
    setSwapStep("idle");
  };

  const RPC_URLS: Record<string, string> = {
    ethereum: "https://ethereum-rpc.publicnode.com",
    arbitrum: "https://arb1.arbitrum.io/rpc",
    base: "https://mainnet.base.org",
    bsc: "https://bsc-dataseed.binance.org",
    polygon: "https://polygon-bor-rpc.publicnode.com",
    optimism: "https://mainnet.optimism.io",
  };

  const pollSwapTxReceipt = async (txHash: string): Promise<boolean> => {
    const rpcUrl = RPC_URLS[chain];
    if (!rpcUrl || !txHash) return true;
    for (let i = 0; i < 30; i++) {
      if (!mountedRef.current) return false;
      await new Promise((r) => setTimeout(r, 2000));
      if (!mountedRef.current) return false;
      try {
        const res = await fetch(rpcUrl, {
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
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      quoteAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setPriceImpactAck(false);
  }, [quote?.key, quote?.arrivedAt]);

  const handleQuote = useCallback(async () => {
    const preserveError = skipClearQuoteErrorRef.current;
    skipClearQuoteErrorRef.current = false;
    if (!fromToken || !toToken) return;
    const amountWei = toWei(amount, fromToken.decimals);
    if (!amountWei) return;
    const key = quoteInputKey(fromToken, toToken, chain, amount);
    quoteAbortRef.current?.abort();
    const ac = new AbortController();
    quoteAbortRef.current = ac;
    setQuoteLoading(true);
    if (!preserveError) {
      setError(null);
    }
    try {
      const res = await fetch("/api/swap/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          fromToken: fromToken.address,
          toToken: toToken.address,
          amount: amountWei,
          chain,
          autoSlippage,
          slippage: clampSlippage(slippage),
        }),
      });
      const data = await res.json();
      if (ac.signal.aborted) return;
      const currentKey = quoteInputKey(fromToken, toToken, chain, amount);
      if (key !== currentKey) return;
      if (data.success) {
        const q = Array.isArray(data.data) ? data.data[0] : data.data;
        if (q) {
          setQuote({
            data: q as Quote,
            key,
            arrivedAt: Date.now(),
            quoteId: readQuoteId(data.data) || readQuoteId(q),
          });
          setQuoteStale(false);
        } else {
          setQuote(null);
        }
      } else {
        const err = friendlyError(data.error || "Failed to get quote. Please try again.");
        setError({ type: "quote", ...err });
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError({ type: "quote", title: "Network error", message: "Could not connect to the server. Please check your internet connection." });
    } finally {
      if (quoteAbortRef.current === ac) setQuoteLoading(false);
    }
  }, [fromToken, toToken, amount, chain, autoSlippage, slippage]);

  useEffect(() => {
    if (!quote) return;
    const currentKey = quoteInputKey(fromToken, toToken, chain, amount);
    if (quote.key !== currentKey) return;
    const remaining = quote.arrivedAt + QUOTE_TTL_MS - Date.now();
    const t = setTimeout(() => {
      setQuoteStale(true);
      void handleQuote();
    }, Math.max(0, remaining));
    return () => clearTimeout(t);
  }, [quote, fromToken, toToken, chain, amount, handleQuote]);

  if (!authenticated) {
    return (
      <div className="page">
        <Empty icon="swap" title="Sign in first" text="Connect your wallet to swap tokens." />
      </div>
    );
  }

  const amountWei =
    amount && fromToken ? (toWei(amount, fromToken.decimals) ?? "") : "";
  const amountInvalid = amount.trim() !== "" && !amountWei;
  const currentQuoteKey = quoteInputKey(fromToken, toToken, chain, amount);
  const liveQuote = quote && quote.key === currentQuoteKey ? quote : null;
  const quoteExpired =
    liveQuote != null &&
    (quoteStale || Date.now() - liveQuote.arrivedAt >= QUOTE_TTL_MS);
  const liveSlippage = clampSlippage(slippage);

  const handleSwap = async () => {
    if (!fromToken || !toToken) return;
    if (!amountWei) return;
    if (!liveQuote || liveQuote.key !== currentQuoteKey) return;
    if (quoteExpired) return;
    const impact = parsePriceImpact(liveQuote.data);
    if (impact != null && impact > 10) return;
    if (impact != null && impact >= 3 && impact <= 10 && !priceImpactAck) return;
    setSwapLoading(true);
    setSwapStep("idle");
    setError(null);
    setSwapResult(null);
    try {
      // Step 1: Approve DEX router for ERC-20 tokens (skip for native ETH/BNB)
      const isNative = fromToken.address.toLowerCase() === NATIVE_TOKEN.toLowerCase();
      if (!isNative) {
        setSwapStep("approving");
        const approveRes = await fetch("/api/swap/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: fromToken.address, amount: amountWei, chain }),
        });
        const approveData = await approveRes.json();
        if (!approveData.success) {
          throw new Error(approveData.error || "Approval failed");
        }
        // Poll for approval tx confirmation
        const approveTxHash =
          (approveData.data as Record<string, unknown>)?.txHash as string | undefined ??
          (typeof approveData.data === "string" ? approveData.data : undefined);
        if (approveTxHash) {
          setSwapStep("waiting_approve");
          const confirmed = await pollSwapTxReceipt(approveTxHash);
          if (!confirmed) {
            setError({
              type: "swap",
              title: "Approval not confirmed",
              message: "Approval not confirmed, try again",
            });
            return;
          }
        }
      }

      setSwapStep("swapping");
      const res = await fetch("/api/swap/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromToken: fromToken.address,
          toToken: toToken.address,
          amount: amountWei,
          chain,
          slippage: liveSlippage,
          autoSlippage,
          gasLevel,
          mevProtection: mevAvailable && mevProtection,
          quoteId: liveQuote.quoteId,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        skipClearQuoteErrorRef.current = true;
        setQuote(null);
        setError({
          type: "swap",
          title: "The price moved",
          message: "The quote expired or the price changed. Getting a fresh one…",
        });
        void handleQuote();
        return;
      }
      if (data.success) {
        const result = data.data;
        const txHash = result?.txHash ?? null;
        const status = result?.status ?? "unknown";

        setSwapResult({
          status,
          message: txHash
            ? (status === "confirming"
              ? "Signed and sent. Waiting for the network to confirm…"
              : "Transaction broadcast successfully!")
            : "Transaction submitted. It may take a moment to appear on-chain.",
          txHash: txHash ?? undefined,
          mevProtected: result?.mevProtected ?? false,
          securityWarning: result?.securityWarning ?? null,
        });
        setQuote(null);
        setAmount("");
        setError(null);
      } else if (data.requiresGasStation) {
        // Insufficient native gas — backend offers stablecoin gas payment.
        // The modal handles token pick + setup, then re-runs handleSwap.
        setGasStation(data.gasStation);
      } else {
        const err = friendlyError(data.error || "Swap failed. Please try again.");
        setError({ type: "swap", ...err });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Swap failed. Please try again.";
      const err = friendlyError(msg);
      setError({ type: "swap", ...err });
    } finally {
      setSwapLoading(false);
      setSwapStep("idle");
    }
  };

  const quoteReceiveRaw =
    liveQuote &&
    toToken &&
    (liveQuote.data.toTokenAmount || liveQuote.data.receiveAmount || liveQuote.data.toAmount);
  const quoteReceiveAmount = quoteReceiveRaw
    ? fromWei(String(quoteReceiveRaw), toToken!.decimals, 6)
    : null;
  const quoteDisplay = quoteReceiveAmount
    ? `${quoteReceiveAmount} ${toToken!.symbol}`
    : null;
  const minReceivedWei =
    liveQuote && quoteReceiveRaw
      ? minToAmountWei(liveQuote.data, String(quoteReceiveRaw), liveSlippage)
      : null;
  const minReceivedAmount =
    minReceivedWei && toToken
      ? fromWei(minReceivedWei, toToken.decimals, 6)
      : null;
  const livePriceImpact = liveQuote ? parsePriceImpact(liveQuote.data) : null;
  const priceImpactTooHigh = livePriceImpact != null && livePriceImpact > 10;
  const priceImpactNeedsAck =
    livePriceImpact != null && livePriceImpact >= 3 && livePriceImpact <= 10;

  // Parse quote details for user-friendly display
  const quoteDetails = liveQuote
    ? (() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q = liveQuote.data as Record<string, any>;
        const estimatedGas = q.estimateGasFee ?? q.estimatedGas ?? q.gas;
        const priceImpact = livePriceImpact;
        const tradeFee = q.tradeFee ?? q.fee;
        // From/to token unit prices
        const fromUnitPrice = q.fromToken?.tokenUnitPrice;
        const toUnitPrice = q.toToken?.tokenUnitPrice;
        const fromWeiAmt = fromToken && amountWei ? BigInt(amountWei) : null;
        const toWeiAmt = quoteReceiveRaw && /^\d+$/.test(String(quoteReceiveRaw)) ? BigInt(String(quoteReceiveRaw)) : null;
        const rate =
          fromWeiAmt && toWeiAmt && fromWeiAmt > 0n && fromToken && toToken
            ? (() => {
                const scale = 10n ** 6n;
                const fromDec = BigInt(fromToken.decimals);
                const toDec = BigInt(toToken.decimals);
                const adj = toWeiAmt * (10n ** fromDec) * scale / (fromWeiAmt * (10n ** toDec));
                return fromWei(adj.toString(), 6, 6);
              })()
            : null;
        // DEX router info
        const dexProtocol = q.dexRouterList?.[0]?.dexProtocol;
        const dexName = dexProtocol?.dexName ?? q.dexName ?? null;
        return { estimatedGas, priceImpact, tradeFee, rate, dexName, fromUnitPrice, toUnitPrice };
      })()
    : null;


  const chainConfig = Object.values(CHAINS).find((c) => c.swapName === chain);
  const fromBal = fromToken
    ? walletTokens.find((w) => w.address.toLowerCase() === fromToken.address.toLowerCase())
    : undefined;
  const toBal = toToken
    ? walletTokens.find((w) => w.address.toLowerCase() === toToken.address.toLowerCase())
    : undefined;
  const fromUnitUsd =
    fromBal && parseFloat(fromBal.balance) > 0 ? parseFloat(fromBal.balanceUsd) / parseFloat(fromBal.balance) : null;
  const payUsd = fromUnitUsd && amountWei ? parseFloat(amount) * fromUnitUsd : null;
  const receiveUsd =
    quoteDetails?.toUnitPrice && quoteReceiveAmount
      ? parseFloat(quoteReceiveAmount) * parseFloat(quoteDetails.toUnitPrice)
      : null;
  const isNativeFrom = fromToken?.address.toLowerCase() === NATIVE_TOKEN.toLowerCase();
  const usdFmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const setMax = () => {
    if (!fromToken || !fromBal) return;
    if (!isNativeFrom) {
      setAmount(fromBal.balance);
      return;
    }
    // Keep a little of the native coin for gas.
    const reserve = chain === "ethereum" ? "0.002" : "0.0005";
    const balWei = toWei(fromBal.balance, fromToken.decimals);
    const resWei = toWei(reserve, fromToken.decimals);
    if (!balWei || !resWei) {
      setAmount("0");
      return;
    }
    const remaining = BigInt(balWei) - BigInt(resWei);
    setAmount(remaining > 0n ? fromWei(remaining.toString(), fromToken.decimals) : "0");
  };

  const flip = () => {
    if (!toToken) return;
    setFromToken(toToken);
    setToToken(fromToken);
    setAmount("");
    setError(null);
  };

  const trendingVisible = trendingLoading || trendingTokens.length > 0;

  return (
    <div className="page">
      <GasStationModal
        open={gasStation !== null}
        chain={String(chainConfig?.chainIndex ?? "")}
        payload={gasStation}
        onClose={() => setGasStation(null)}
        onResolved={() => {
          setGasStation(null);
          void handleSwap();
        }}
      />

      <PageHead title="Swap" lede="The best route across 500+ exchanges. albicocca adds no&nbsp;commission." />

      <div className={trendingVisible ? "bento" : "solo"}>
        <Panel className={trendingVisible ? "span-7 ticket" : "ticket"} index={1}>
          {/* network + settings */}
          <div className="ticket-head">
            <div className="select select--chip">
              <label htmlFor="swap-chain" className="sr-only">
                Network
              </label>
              <select id="swap-chain" className="input" value={chain} onChange={(e) => handleChainChange(e.target.value)}>
                {Object.values(CHAINS).map((c) => (
                  <option key={c.swapName} value={c.swapName}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="chip"
              aria-expanded={showAdvanced}
              aria-controls="swap-settings"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <LineIcon name="sliders" size={14} />
              {autoSlippage ? "Auto slippage" : `${slippage}% slippage`}
              {mevProtection && mevAvailable && <span className="dot-on" aria-label="MEV protection on" />}
            </button>
          </div>

          <AnimatePresence initial={false}>
            {showAdvanced && (
              <motion.div
                id="swap-settings"
                className="swap-settings"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="set-block">
                  <div className="set-label">
                    <span>Slippage</span>
                    <span className="muted">How far the price may move before the swap is cancelled</span>
                  </div>
                  <div className="set-line">
                    <Segmented
                      id="slip"
                      label="Slippage"
                      value={autoSlippage ? "auto" : ["0.1", "0.5", "1.0", "2.0"].includes(slippage) ? slippage : null}
                      options={[
                        { value: "auto", label: "Auto" },
                        { value: "0.1", label: "0.1%" },
                        { value: "0.5", label: "0.5%" },
                        { value: "1.0", label: "1%" },
                        { value: "2.0", label: "2%" },
                      ]}
                      onChange={(v) => {
                        if (v === "auto") {
                          setAutoSlippage(true);
                          return;
                        }
                        setAutoSlippage(false);
                        setSlippage(v);
                      }}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Custom %"
                      aria-label="Custom slippage in percent"
                      className={`input seg-input${!autoSlippage && !["0.1", "0.5", "1.0", "2.0"].includes(slippage) ? " on" : ""}`}
                      defaultValue={!["0.1", "0.5", "1.0", "2.0"].includes(slippage) ? slippage : ""}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        if (!raw) return;
                        setAutoSlippage(false);
                        setSlippage(clampSlippage(raw));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </div>
                </div>

                <div className="set-block">
                  <div className="set-label">
                    <span>Gas priority</span>
                    <span className="muted">
                      {gasLevel === "slow"
                        ? "Lower fee, slower (about 5 minutes)"
                        : gasLevel === "fast"
                          ? "Higher fee, faster (about 15 seconds)"
                          : "Balanced fee and speed (about 1 minute)"}
                    </span>
                  </div>
                  <Segmented
                    id="gas"
                    label="Gas priority"
                    value={gasLevel}
                    options={[
                      { value: "slow", label: "Slow" },
                      { value: "average", label: "Average" },
                      { value: "fast", label: "Fast" },
                    ]}
                    onChange={setGasLevel}
                  />
                </div>

                <div className="set-block set-row">
                  <div className="set-label">
                    <span>MEV protection</span>
                    <span className="muted">
                      {mevAvailable
                        ? "Shields large swaps from front-running bots"
                        : `Not available on ${chainConfig?.name ?? chain}. Works on Ethereum, BNB Chain and Base.`}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={mevProtection && mevAvailable}
                    aria-label="MEV protection"
                    className="switch"
                    disabled={!mevAvailable}
                    onClick={() => setMevProtection(!mevProtection)}
                  >
                    <span />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* pay */}
          <div className="leg">
            <div className="leg-top">
              <label htmlFor="swap-amount">You pay</label>
              {fromToken && (
                <span className="leg-bal">
                  {fromBal ? (
                    <>
                      <span className="num">{parseFloat(fromBal.balance).toLocaleString("en-US", { maximumFractionDigits: 6 })}</span> available
                      {parseFloat(fromBal.balance) > 0 && (
                        <button type="button" className="max" onClick={setMax}>
                          Max
                        </button>
                      )}
                    </>
                  ) : balanceLoading ? (
                    "Checking balance…"
                  ) : (
                    "None in wallet"
                  )}
                </span>
              )}
            </div>
            <div className="leg-main">
              <input
                id="swap-amount"
                className="amount-in"
                placeholder="0"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                aria-invalid={amountInvalid}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError(null);
                }}
              />
              <TokenSelector label="From" token={fromToken} onSelect={setFromToken} chain={chain} walletTokens={walletTokens} />
            </div>
            <div className="leg-foot">
              {amountInvalid ? (
                <span className="err" role="alert">
                  Enter a valid amount
                </span>
              ) : (
                <span className="num">{payUsd != null ? usdFmt(payUsd) : " "}</span>
              )}
            </div>
          </div>

          <div className="flip-wrap">
            <button type="button" className="flip" onClick={flip} disabled={!toToken} aria-label="Swap pay and receive tokens">
              <LineIcon name="arrow-down" size={18} />
            </button>
          </div>

          {/* receive */}
          <div className="leg">
            <div className="leg-top">
              <span>You receive</span>
              {toBal && (
                <span className="leg-bal">
                  <span className="num">{parseFloat(toBal.balance).toLocaleString("en-US", { maximumFractionDigits: 6 })}</span> held
                </span>
              )}
            </div>
            <div className="leg-main">
              <output className={`amount-out${quoteReceiveAmount ? "" : " muted"}`} aria-live="polite">
                {quoteReceiveAmount ? <NumberDisplay value={quoteReceiveAmount} decimals={6} minDecimals={0} /> : "0"}
                {quoteLoading && <span className="spin" aria-label="Getting a quote" />}
              </output>
              <TokenSelector label="To" token={toToken} onSelect={setToToken} chain={chain} walletTokens={walletTokens} />
            </div>
            <div className="leg-foot">
              <span className="num">{receiveUsd != null ? usdFmt(receiveUsd) : " "}</span>
            </div>
          </div>

          {/* quote */}
          <AnimatePresence initial={false}>
            {quoteDisplay && quoteDetails && (
              <motion.dl
                className="sum quote-sum"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                {quoteDetails.rate && fromToken && toToken && (
                  <div>
                    <dt>Rate</dt>
                    <dd className="num">
                      1 {fromToken.symbol} = {quoteDetails.rate} {toToken.symbol}
                    </dd>
                  </div>
                )}
                {minReceivedAmount && toToken && (
                  <div>
                    <dt>Minimum received</dt>
                    <dd className="num">
                      {minReceivedAmount} {toToken.symbol}
                    </dd>
                  </div>
                )}
                {quoteDetails.priceImpact != null && (
                  <div>
                    <dt>Price impact</dt>
                    <dd
                      className={`num ${
                        Number(quoteDetails.priceImpact) > 3
                          ? "text-loss-ink"
                          : Number(quoteDetails.priceImpact) > 1
                            ? "text-warn-ink"
                            : "text-gain-ink"
                      }`}
                    >
                      {Number(quoteDetails.priceImpact).toFixed(2)}%
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Slippage</dt>
                  <dd>{autoSlippage ? "Auto" : `${liveSlippage}%`}</dd>
                </div>
                {quoteDetails.estimatedGas && (
                  <div>
                    <dt>Gas limit</dt>
                    <dd className="num">{Number(quoteDetails.estimatedGas).toLocaleString("en-US")} units</dd>
                  </div>
                )}
                {quoteDetails.tradeFee != null && Number(quoteDetails.tradeFee) > 0 && (
                  <div>
                    <dt>Network fee</dt>
                    <dd className="num">${Number(quoteDetails.tradeFee).toFixed(2)}</dd>
                  </div>
                )}
                {quoteDetails.dexName && (
                  <div>
                    <dt>Route</dt>
                    <dd>{String(quoteDetails.dexName)}</dd>
                  </div>
                )}
              </motion.dl>
            )}
          </AnimatePresence>

          {/* messages */}
          <Fade in={!!error}>
            {error && (
              <div className="note loss msg-note" role="alert">
                <LineIcon name="alert" size={16} />
                <div>
                  <strong>{error.title}</strong>
                  <p>{error.message}</p>
                </div>
                <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setError(null)}>
                  <LineIcon name="x" size={15} />
                </button>
              </div>
            )}
          </Fade>

          <Fade in={!!swapResult}>
            {swapResult && (
              <div className="note gain msg-note" role="status">
                {swapResult.status === "confirming" ? <span className="spin" aria-hidden="true" /> : <LineIcon name="check" size={16} />}
                <div>
                  <strong>{swapResult.status === "confirming" ? "Transaction pending" : "Transaction sent"}</strong>
                  <p>{swapResult.message}</p>
                  {swapResult.mevProtected && <p>MEV protection was on.</p>}
                  {swapResult.securityWarning && <p className="text-warn-ink">{swapResult.securityWarning}</p>}
                  {swapResult.txHash && (
                    <a
                      className="tx-link"
                      href={`${chainConfig?.explorer ?? "https://etherscan.io"}/tx/${swapResult.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View on the explorer <LineIcon name="arrow-up-right" size={13} />
                    </a>
                  )}
                </div>
                <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setSwapResult(null)}>
                  <LineIcon name="x" size={15} />
                </button>
              </div>
            )}
          </Fade>

          {priceImpactTooHigh && (
            <div className="note loss" role="alert">
              <LineIcon name="alert" size={16} />
              <span>The price impact is above 10%. Try a smaller amount.</span>
            </div>
          )}
          {priceImpactNeedsAck && !priceImpactAck && !priceImpactTooHigh && (
            <button type="button" onClick={() => setPriceImpactAck(true)} className="note warn ack">
              <LineIcon name="alert" size={16} />
              <span>
                This swap moves the price by {livePriceImpact!.toFixed(2)}%. You get noticeably less than the market rate. Tap to accept and&nbsp;continue.
              </span>
            </button>
          )}

          <div className="ticket-actions">
            <button
              type="button"
              className="btn"
              onClick={handleQuote}
              disabled={quoteLoading || !toToken || !amount || !fromToken || !amountWei || amountInvalid}
            >
              {quoteLoading ? (
                <>
                  <span className="spin" aria-hidden="true" />
                  Getting quote…
                </>
              ) : liveQuote ? (
                "Refresh quote"
              ) : (
                "Get quote"
              )}
            </button>
            {quoteExpired && liveQuote ? (
              <button type="button" className="btn btn--primary" onClick={handleQuote} disabled={quoteLoading}>
                {quoteLoading ? (
                  <>
                    <span className="spin" aria-hidden="true" />
                    Getting quote…
                  </>
                ) : (
                  "Quote expired, refresh"
                )}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleSwap}
                disabled={
                  swapLoading ||
                  !liveQuote ||
                  amountInvalid ||
                  !amountWei ||
                  priceImpactTooHigh ||
                  (priceImpactNeedsAck && !priceImpactAck)
                }
              >
                {swapLoading ? (
                  <>
                    <span className="spin" aria-hidden="true" />
                    {swapStep === "approving"
                      ? "Approving…"
                      : swapStep === "waiting_approve"
                        ? "Confirming approval…"
                        : "Swapping…"}
                  </>
                ) : isNativeFrom ? (
                  "Swap"
                ) : (
                  "Approve and swap"
                )}
              </button>
            )}
          </div>
        </Panel>

        {trendingVisible && (
          <Panel
            className="span-5"
            flush
            index={2}
            title={`Trending on ${chainConfig?.name ?? chain}`}
            sub="Tap one to receive it"
          >
            {trendingLoading ? (
              <div className="wal-pad" style={{ display: "grid", gap: 12 }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} height={48} />
                ))}
              </div>
            ) : (
              <ul className="rows wal-pad">
                {trendingTokens.slice(0, 10).map((t, i) => {
                  const price = parseFloat(t.price);
                  const change = parseFloat(t.change24h);
                  const mcap = parseFloat(t.marketCap);
                  return (
                    <li key={`${t.address}-${i}`}>
                      <button
                        type="button"
                        className="row"
                        onClick={() => {
                          const raw = t.decimals ?? t.decimal;
                          const decimals = raw !== undefined && raw !== null && raw !== "" ? Number(raw) : NaN;
                          if (!Number.isFinite(decimals) || decimals < 0) {
                            toast.error("Token decimals unavailable");
                            return;
                          }
                          setToToken({
                            symbol: t.symbol,
                            address: t.address,
                            decimals,
                          });
                          if (!fromToken) setFromToken(getNativeToken(chain));
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        {t.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element -- remote logos from many hosts
                          <img
                            src={t.logo}
                            alt=""
                            width={34}
                            height={34}
                            className="tok-logo"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.visibility = "hidden";
                            }}
                          />
                        ) : (
                          <TokenIcon symbol={t.symbol} size={34} />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div className="t">{t.symbol}</div>
                          <div className="sub trunc">
                            {mcap > 0
                              ? `${mcap >= 1e9 ? (mcap / 1e9).toFixed(1) + "B" : mcap >= 1e6 ? (mcap / 1e6).toFixed(1) + "M" : mcap >= 1e3 ? (mcap / 1e3).toFixed(0) + "K" : mcap.toFixed(0)} market cap`
                              : t.name}
                          </div>
                        </div>
                        <div className="end">
                          <div className="num">
                            ${price >= 1 ? price.toLocaleString("en-US", { maximumFractionDigits: 2 }) : price >= 0.0001 ? price.toFixed(6) : price.toExponential(2)}
                          </div>
                          <Change value={change} />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}
