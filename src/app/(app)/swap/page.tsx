"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CHAINS } from "@/lib/chains";
import { toast } from "sonner";
import { TokenIcon } from "@/components/token-icon";
import { Fade, NumberDisplay } from "@/components/motion";
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

function toWei(amount: string, decimals: number): string {
  // String-based conversion to avoid floating point precision loss
  // for tokens with 18 decimals and large amounts (e.g. PEPE)
  const [intPart, fracPart = ""] = amount.split(".");
  const padded = fracPart.padEnd(decimals, "0").slice(0, decimals);
  const raw = intPart + padded;
  // Remove leading zeros but keep at least "0"
  return raw.replace(/^0+/, "") || "0";
}

function fromWei(amount: string, decimals: number): string {
  // String-based conversion to preserve precision for large token amounts
  const s = amount.padStart(decimals + 1, "0");
  const intPart = s.slice(0, s.length - decimals) || "0";
  const fracPart = s.slice(s.length - decimals);
  // Trim trailing zeros, keep up to 6 significant decimals
  const trimmed = fracPart.slice(0, 6).replace(/0+$/, "");
  return trimmed ? `${intPart}.${trimmed}` : intPart;
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin-breathe ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      width="16"
      height="16"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function TokenSelector({
  label,
  token,
  onSelect,
  chain,
  walletTokens,
}: {
  label: string;
  token: TokenInfo | null;
  onSelect: (t: TokenInfo) => void;
  chain: string;
  walletTokens?: WalletToken[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TokenSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Find balance of currently selected token — match by address only (unique)
  const selectedBalance = token && walletTokens
    ? walletTokens.find(
        (w) => w.address.toLowerCase() === token.address.toLowerCase()
      )
    : null;

  return (
    <div ref={containerRef}>
      <p className="text-[13px] font-medium text-muted-foreground mb-2">
        {label}
      </p>
      {token ? (
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-white px-4 h-11">
          <TokenIcon symbol={token.symbol} size={24} />
          <span className="font-semibold text-sm tracking-tight">
            {token.symbol}
          </span>
          {selectedBalance && (
            <span className="text-xs text-muted-foreground">
              {parseFloat(selectedBalance.balance).toLocaleString(undefined, { maximumFractionDigits: 6 })}
            </span>
          )}
          <button
            type="button"
            className="ml-auto text-[13px] font-medium text-indigo-500 hover:text-indigo-700 transition-colors"
            onClick={() => {
              onSelect(null as unknown as TokenInfo);
              setQuery("");
            }}
          >
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <Input
            placeholder="Search token or select from balance..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            className="h-11 rounded-xl border-border/60 bg-white px-4 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-400"
          />
          <AnimatePresence>
            {showDropdown && (
            <motion.div
              className="absolute z-50 top-full left-0 right-0 mt-1.5 max-h-64 overflow-auto rounded-xl border border-border/60 bg-white shadow-lg shadow-black/5 origin-top"
              initial={{ opacity: 0, scaleY: 0.9, y: -4 }}
              animate={{ opacity: 1, scaleY: 1, y: 0 }}
              exit={{ opacity: 0, scaleY: 0.95, y: -2 }}
              transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
            >
              {/* Show wallet tokens first when no search query */}
              {query.length === 0 && walletTokens && walletTokens.length > 0 && (
                <>
                  <div className="px-4 py-2 text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider bg-secondary/80">
                    Your Tokens
                  </div>
                  {walletTokens.map((wt, i) => (
                    <button
                      key={`wallet-${wt.address}-${i}`}
                      type="button"
                      className="w-full text-left px-4 py-2.5 hover:bg-indigo-50/50 active:bg-indigo-50 flex items-center gap-3 text-sm transition-colors"
                      onClick={() => {
                        onSelect({ symbol: wt.symbol, address: wt.address, decimals: wt.decimals });
                        setQuery("");
                        setShowDropdown(false);
                      }}
                    >
                      <TokenIcon symbol={wt.symbol} size={28} />
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold tracking-tight">{wt.symbol}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-[13px] font-medium tabular-nums">
                          {parseFloat(wt.balance).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                        </div>
                        {parseFloat(wt.balanceUsd) > 0 && (
                          <div className="text-[11px] text-muted-foreground">
                            ${parseFloat(wt.balanceUsd).toFixed(2)}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                  <div className="px-4 py-2 text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider bg-secondary/80 border-t border-border/40">
                    Search Other Tokens
                  </div>
                  <div className="px-4 py-2 text-[12px] text-muted-foreground">
                    Type to search any token...
                  </div>
                </>
              )}
              {/* Search results */}
              {query.length > 0 && searching && (
                <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-muted-foreground">
                  <Spinner className="text-indigo-500" />
                  Searching...
                </div>
              )}
              {query.length > 0 && !searching && results.length === 0 && (
                <div className="px-4 py-3 text-[13px] text-muted-foreground">
                  No tokens found
                </div>
              )}
              {query.length > 0 && results.map((t, i) => {
                const parsed = parseTokenResult(t);
                const bal = walletTokens?.find(
                  (w) => w.address.toLowerCase() === parsed.address.toLowerCase()
                );
                return (
                  <button
                    key={`${parsed.address}-${i}`}
                    type="button"
                    className="w-full text-left px-4 py-2.5 hover:bg-indigo-50/50 active:bg-indigo-50 flex items-center gap-3 text-sm transition-colors first:rounded-t-xl last:rounded-b-xl"
                    onClick={() => {
                      onSelect(parsed);
                      setQuery("");
                      setShowDropdown(false);
                    }}
                  >
                    <TokenIcon symbol={parsed.symbol} size={28} />
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold tracking-tight">
                        {parsed.symbol}
                      </span>
                      <span className="text-muted-foreground text-xs truncate ml-2">
                        {getTokenName(t)}
                      </span>
                    </div>
                    {bal ? (
                      <span className="text-[12px] font-medium tabular-nums">
                        {parseFloat(bal.balance).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-[11px] font-mono">
                        {abbreviateAddress(parsed.address)}
                      </span>
                    )}
                  </button>
                );
              })}
            </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

export default function SwapPage() {
  const { authenticated, walletAddress } = useAuth();
  const [chain, setChain] = useState("ethereum");
  const [fromToken, setFromToken] = useState<TokenInfo | null>(
    getNativeToken("ethereum")
  );
  const [toToken, setToToken] = useState<TokenInfo | null>(null);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Record<string, unknown> | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapStep, setSwapStep] = useState<"idle" | "approving" | "waiting_approve" | "swapping">("idle");
  const [error, setError] = useState<{ type: "quote" | "swap"; title: string; message: string } | null>(null);
  const [swapResult, setSwapResult] = useState<{ status: string; message: string; txHash?: string; mevProtected?: boolean; securityWarning?: string | null } | null>(null);
  const [slippage, setSlippage] = useState("0.5");
  const [autoSlippage, setAutoSlippage] = useState(false);
  const [showSlippage, setShowSlippage] = useState(false);
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
    setQuote(null);
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
      await new Promise((r) => setTimeout(r, 2000));
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
    return true; // timeout — proceed anyway
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

  const amountWei =
    amount && fromToken
      ? (() => {
          try {
            return toWei(amount, fromToken.decimals);
          } catch {
            return "";
          }
        })()
      : "";

  const friendlyError = (raw: string): { title: string; message: string } => {
    const lower = raw.toLowerCase();

    // Insufficient balance / funds
    if (lower.includes("insufficient") || lower.includes("not enough") || lower.includes("balance"))
      return { title: "Insufficient Balance", message: "You don't have enough funds to complete this swap. Try reducing the amount or adding funds to your wallet." };

    // Slippage / price movement
    if (lower.includes("slippage") || lower.includes("price movement") || lower.includes("price change"))
      return { title: "Price Changed", message: "The price moved too much while getting your quote. Try again or use a smaller amount." };

    // Liquidity / no route
    if (lower.includes("liquidity") || lower.includes("no route") || lower.includes("no path"))
      return { title: "No Liquidity", message: "There isn't enough liquidity for this trading pair. Try a smaller amount or a different token." };

    // Token approval
    if (lower.includes("allowance") || lower.includes("approve") || lower.includes("approval"))
      return { title: "Approval Required", message: "You need to approve this token before swapping. This is a one-time action per token." };

    // Timeout
    if (lower.includes("timeout") || lower.includes("timed out"))
      return { title: "Request Timeout", message: "The request took too long. Please check your connection and try again." };

    // Rate limit
    if (lower.includes("rate limit") || lower.includes("too many"))
      return { title: "Too Many Requests", message: "Please wait a few seconds and try again." };

    // High price impact / value difference > 90%
    if (lower.includes("82112") || lower.includes("value difference") || lower.includes("risk of loss"))
      return { title: "Extreme Price Impact", message: "This swap would lose more than 90% of your value due to insufficient market liquidity. Try a much smaller amount." };

    // Transaction simulation failed / execution reverted
    if (lower.includes("simulation failed") || lower.includes("execution reverted") || lower.includes("contract call fail"))
      return { title: "Transaction Failed", message: "The transaction was simulated and would fail on-chain. This usually means you don't have enough tokens to complete the swap. Check your wallet balance and try again." };

    // Region restriction
    if (lower.includes("region") || lower.includes("50125") || lower.includes("80001"))
      return { title: "Region Restricted", message: "This service is not available in your region. Try using a VPN or switching to a supported region." };

    // Network error (from fetch itself)
    if (lower.includes("network") || lower.includes("fetch failed"))
      return { title: "Network Error", message: "Could not connect to the server. Please check your internet connection." };

    // Generic CLI failure — be honest, show the real error
    if (lower.includes("command execution failed"))
      return { title: "Service Error", message: "The swap service returned an unexpected error. This may be caused by an unsupported amount, token pair, or a temporary issue. Please try again with different parameters." };

    // Fallback — show the raw error as-is
    return { title: "Error", message: raw };
  };

  const handleQuote = async () => {
    if (!fromToken || !toToken || !amountWei) return;
    setQuoteLoading(true);
    setQuote(null);
    setError(null);
    try {
      const res = await fetch("/api/swap/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromToken: fromToken.address,
          toToken: toToken.address,
          amount: amountWei,
          chain,
          autoSlippage,
          slippage,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const q = Array.isArray(data.data) ? data.data[0] : data.data;
        setQuote(q ?? null);
      } else {
        const err = friendlyError(data.error || "Failed to get quote. Please try again.");
        setError({ type: "quote", ...err });
      }
    } catch {
      setError({ type: "quote", title: "Network Error", message: "Could not connect to the server. Please check your internet connection." });
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleSwap = async () => {
    if (!fromToken || !toToken || !amountWei) return;
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
          await pollSwapTxReceipt(approveTxHash);
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
          wallet: walletAddress ?? "",
          slippage,
          autoSlippage,
          gasLevel,
          mevProtection: mevAvailable && mevProtection,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const result = data.data;
        const txHash = result?.txHash ?? null;
        const status = result?.status ?? "unknown";

        setSwapResult({
          status,
          message: txHash
            ? (status === "confirming"
              ? "Transaction signed and broadcast. Waiting for confirmation..."
              : "Transaction broadcast successfully!")
            : "Transaction submitted. It may take a moment to appear on-chain.",
          txHash: txHash ?? undefined,
          mevProtected: result?.mevProtected ?? false,
          securityWarning: result?.securityWarning ?? null,
        });
        setQuote(null);
        setAmount("");
        setError(null);
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
    quote &&
    toToken &&
    (quote.toTokenAmount || quote.receiveAmount || quote.toAmount);
  const quoteReceiveAmount = quoteReceiveRaw
    ? fromWei(String(quoteReceiveRaw), toToken!.decimals)
    : null;
  const quoteDisplay = quoteReceiveAmount
    ? `${quoteReceiveAmount} ${toToken!.symbol}`
    : null;

  // Parse quote details for user-friendly display
  const quoteDetails = quote
    ? (() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q = quote as Record<string, any>;
        const estimatedGas = q.estimateGasFee ?? q.estimatedGas ?? q.gas;
        const priceImpact = q.priceImpactPercent ?? q.priceImpactPercentage ?? q.priceImpact;
        const tradeFee = q.tradeFee ?? q.fee;
        // From/to token unit prices
        const fromUnitPrice = q.fromToken?.tokenUnitPrice;
        const toUnitPrice = q.toToken?.tokenUnitPrice;
        // Calculate exchange rate
        const rate =
          quoteReceiveAmount && amount && parseFloat(amount) > 0
            ? (parseFloat(quoteReceiveAmount) / parseFloat(amount)).toFixed(6)
            : null;
        // DEX router info
        const dexProtocol = q.dexRouterList?.[0]?.dexProtocol;
        const dexName = dexProtocol?.dexName ?? q.dexName ?? null;
        return { estimatedGas, priceImpact, tradeFee, rate, dexName, fromUnitPrice, toUnitPrice };
      })()
    : null;

  return (
    <div className="max-w-md mx-auto space-y-5 py-2">
      {/* Page header */}
      <div>
        <p className="text-eyebrow">DEX AGGREGATOR</p>
        <h1 className="mt-1.5 text-display-lg text-foreground">
          Swap
        </h1>
        <p className="text-[13px] text-muted-foreground mt-2">
          Trade tokens across 500+ DEX sources
        </p>
      </div>

      {/* Main card */}
      <div className="voxr-card">
        <div className="p-5 space-y-5">
          {/* Chain selector */}
          <div>
            <p className="text-[13px] font-medium text-muted-foreground mb-2">
              Network
            </p>
            <select
              className="flex h-11 w-full rounded-xl border border-border/60 bg-white px-4 text-sm font-medium text-foreground transition-colors outline-none focus:border-indigo-400 focus:ring-3 focus:ring-indigo-500/20 appearance-none cursor-pointer"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' viewBox='0 0 24 24' stroke='%239ca3af' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 14px center",
              }}
              value={chain}
              onChange={(e) => handleChainChange(e.target.value)}
            >
              {Object.values(CHAINS).map((c) => (
                <option key={c.swapName} value={c.swapName}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Slippage settings */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[13px] font-medium text-muted-foreground">Slippage Tolerance</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setAutoSlippage(!autoSlippage); if (!autoSlippage) setShowSlippage(false); }}
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors ${autoSlippage ? "bg-emerald-900/40 text-emerald-300" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                >
                  Auto
                </button>
                {!autoSlippage && (
                  <button
                    type="button"
                    onClick={() => setShowSlippage(!showSlippage)}
                    className="text-[12px] font-medium text-indigo-500 hover:text-indigo-700 transition-colors flex items-center gap-1"
                  >
                    {slippage}%
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={showSlippage ? "rotate-180 transition-transform" : "transition-transform"}>
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
            {showSlippage && !autoSlippage && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary/80 border border-border/40">
                {["0.1", "0.5", "1.0", "2.0"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setSlippage(s); setShowSlippage(false); }}
                    className={`flex-1 h-8 rounded-lg text-[12px] font-semibold transition-colors ${slippage === s ? "bg-indigo-600 text-white" : "bg-white border border-border/60 text-muted-foreground hover:border-indigo-300 hover:text-indigo-600"}`}
                  >
                    {s}%
                  </button>
                ))}
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Custom"
                    className="w-full h-8 rounded-lg border border-border/60 bg-white px-2 text-[12px] font-semibold text-center outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0 && v <= 50) { setSlippage(v.toString()); setShowSlippage(false); }
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Advanced settings (gas level + MEV) */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Advanced Settings</span>
              <span className="flex items-center gap-2">
                {gasLevel !== "average" && (
                  <span className="text-[11px] font-semibold text-indigo-500 capitalize">{gasLevel}</span>
                )}
                {mevProtection && mevAvailable && (
                  <span className="text-[11px] font-semibold text-emerald-500">MEV Protected</span>
                )}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={showAdvanced ? "rotate-180 transition-transform" : "transition-transform"}>
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </button>
            {showAdvanced && (
              <div className="mt-2 p-3 rounded-xl bg-secondary/80 border border-border/40 space-y-3">
                {/* Gas Level */}
                <div>
                  <p className="text-[12px] font-medium text-muted-foreground mb-1.5">Gas Priority</p>
                  <div className="flex gap-2">
                    {(["slow", "average", "fast"] as const).map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setGasLevel(level)}
                        className={`flex-1 h-8 rounded-lg text-[12px] font-semibold capitalize transition-colors ${gasLevel === level ? "bg-indigo-600 text-white" : "bg-white border border-border/60 text-muted-foreground hover:border-indigo-300 hover:text-indigo-600"}`}
                      >
                        {level === "slow" ? "🐢 Slow" : level === "average" ? "⚡ Average" : "🚀 Fast"}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">
                    {gasLevel === "slow" ? "Lower fee, slower confirmation (~5 min)" : gasLevel === "fast" ? "Higher fee, faster confirmation (~15 sec)" : "Balanced fee and speed (~1 min)"}
                  </p>
                </div>
                {/* MEV Protection */}
                <div className="flex items-center justify-between pt-1 border-t border-border/30">
                  <div>
                    <p className="text-[12px] font-medium text-foreground">MEV Protection</p>
                    <p className="text-[11px] text-muted-foreground/70">
                      {mevAvailable
                        ? "Prevents front-running and sandwich attacks on high-value swaps"
                        : `Not available on ${chain.charAt(0).toUpperCase() + chain.slice(1)} (supported: Ethereum, BSC, Base)`}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!mevAvailable}
                    onClick={() => setMevProtection(!mevProtection)}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed ${mevProtection && mevAvailable ? "bg-emerald-500/30" : "bg-gray-200"}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${mevProtection && mevAvailable ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* From token section */}
          <div className="rounded-xl bg-secondary/80 border border-border/40 p-4 space-y-3">
            <TokenSelector
              label="From"
              token={fromToken}
              onSelect={setFromToken}
              chain={chain}
              walletTokens={walletTokens}
            />

            {/* Amount input */}
            <div>
              <p className="text-[13px] font-medium text-muted-foreground mb-2">
                Amount
              </p>
              <Input
                placeholder="0.00"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setQuote(null);
                  setError(null);
                }}
                className="h-11 rounded-xl border-border/60 bg-white px-4 text-base font-medium tabular-nums placeholder:text-muted-foreground/40 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-400"
              />
              {fromToken && (() => {
                const bal = walletTokens.find(
                  (w) => w.address.toLowerCase() === fromToken.address.toLowerCase()
                );
                return (
                  <div className="flex items-center justify-between mt-1.5 px-1">
                    <p className="text-[11px] text-muted-foreground/70">
                      Balance: {bal ? parseFloat(bal.balance).toLocaleString(undefined, { maximumFractionDigits: 6 }) : balanceLoading ? "..." : "--"} {fromToken.symbol}
                    </p>
                    {bal && parseFloat(bal.balance) > 0 && (
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-700 transition-colors"
                        onClick={() => setAmount(bal.balance)}
                      >
                        MAX
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Swap direction arrow */}
          <div className="flex justify-center -my-2 relative z-10">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-secondary text-muted-foreground">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14" />
                <path d="m19 12-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* To token section */}
          <div className="rounded-xl bg-secondary/80 border border-border/40 p-4">
            <TokenSelector
              label="To"
              token={toToken}
              onSelect={setToToken}
              chain={chain}
              walletTokens={walletTokens}
            />
          </div>

          {/* Quote result card */}
          {quoteDisplay && quoteDetails && (
            <div className="rounded-xl bg-gradient-to-br from-indigo-50 via-violet-50 to-purple-50 border border-indigo-100/60 overflow-hidden">
              {/* Main receive amount — digits morph on quote refresh */}
              <div className="p-4 pb-3">
                <p className="text-[11px] font-medium text-indigo-500/80 uppercase tracking-wide mb-1">
                  You will receive
                </p>
                <p className="text-2xl font-bold tracking-tight text-indigo-900 tabular-nums">
                  <NumberDisplay value={quoteReceiveAmount} decimals={6} minDecimals={0} />{" "}
                  <span className="text-base font-semibold text-indigo-600">
                    {toToken?.symbol}
                  </span>
                </p>
                {quoteDetails.toUnitPrice && quoteReceiveAmount && (
                  <p className="text-[12px] text-indigo-400 mt-0.5 tabular-nums">
                    ≈ <NumberDisplay
                        value={parseFloat(quoteReceiveAmount) * parseFloat(quoteDetails.toUnitPrice)}
                        decimals={2}
                        prefix="$"
                        suffix=" USD"
                      />
                  </p>
                )}
              </div>

              {/* Details grid */}
              <div className="border-t border-indigo-100/60 bg-white/60 px-4 py-3 space-y-2.5">
                {/* Slippage */}
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-muted-foreground">Slippage</span>
                  <span className="text-[12px] font-medium text-foreground">{slippage}%</span>
                </div>
                {/* Exchange rate */}
                {quoteDetails.rate && fromToken && toToken && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">Rate</span>
                    <span className="text-[12px] font-medium text-foreground">
                      1 {fromToken.symbol} = {quoteDetails.rate} {toToken.symbol}
                    </span>
                  </div>
                )}

                {/* Price impact */}
                {quoteDetails.priceImpact != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">Price Impact</span>
                    <span
                      className={`text-[12px] font-medium ${
                        Number(quoteDetails.priceImpact) > 3
                          ? "text-red-400"
                          : Number(quoteDetails.priceImpact) > 1
                            ? "text-amber-400"
                            : "text-emerald-400"
                      }`}
                    >
                      {Number(quoteDetails.priceImpact).toFixed(2)}%
                    </span>
                  </div>
                )}

                {/* Estimated gas */}
                {quoteDetails.estimatedGas && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">Estimated Gas</span>
                    <span className="text-[12px] font-medium text-foreground">
                      {Number(quoteDetails.estimatedGas).toLocaleString()} units
                    </span>
                  </div>
                )}

                {/* Trade fee */}
                {quoteDetails.tradeFee != null && Number(quoteDetails.tradeFee) > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">Fee</span>
                    <span className="text-[12px] font-medium text-foreground">
                      ${Number(quoteDetails.tradeFee).toFixed(2)}
                    </span>
                  </div>
                )}

                {/* DEX router */}
                {quoteDetails.dexName && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">Route</span>
                    <span className="text-[12px] font-medium text-indigo-600">
                      {String(quoteDetails.dexName)}
                    </span>
                  </div>
                )}
              {/* Zero commission notice */}
                <div className="flex items-center gap-2 pt-1 mt-0.5 border-t border-emerald-100/60">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-emerald-500 shrink-0">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-[11px] font-medium text-emerald-400">
                    Zero commission — DeFi Agent does not charge any fees on swaps
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Error display */}
          <Fade in={!!error}>
            {error && (
            <div className="rounded-xl bg-red-950/30 border border-red-800/40 p-4 flex gap-3 items-start">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-900/40">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-red-500">
                  <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-red-800 mb-0.5">
                  {error.title}
                </p>
                <p className="text-[12px] text-red-400 leading-relaxed">
                  {error.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="shrink-0 text-red-400 hover:text-red-400 transition-colors p-0.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            )}
          </Fade>

          {/* Swap result display */}
          <Fade in={!!swapResult}>
            {swapResult && (
            <div className="rounded-xl bg-emerald-950/30 border border-emerald-800/40 p-4 flex gap-3 items-start">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-900/40">
                {swapResult.status === "confirming" ? (
                  <Spinner className="text-emerald-400" />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-emerald-400">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-emerald-800 mb-0.5">
                  {swapResult.status === "confirming" ? "Transaction Pending" : "Transaction Sent"}
                </p>
                <p className="text-[12px] text-emerald-400 leading-relaxed">
                  {swapResult.message}
                </p>
                {swapResult.mevProtected && (
                  <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-emerald-400">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    MEV Protected
                  </span>
                )}
                {swapResult.securityWarning && (
                  <p className="mt-1 text-[11px] text-amber-400 leading-snug">
                    ⚠️ {swapResult.securityWarning}
                  </p>
                )}
                {swapResult.txHash && (
                  <a
                    href={`${Object.values(CHAINS).find(c => c.swapName === chain)?.explorer ?? "https://etherscan.io"}/tx/${swapResult.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1.5 text-[12px] font-medium text-emerald-300 hover:text-emerald-900 underline underline-offset-2 transition-colors"
                  >
                    View on Explorer
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                    </svg>
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSwapResult(null)}
                className="shrink-0 text-emerald-400 hover:text-emerald-400 transition-colors p-0.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            )}
          </Fade>

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <Button
              onClick={handleQuote}
              disabled={
                quoteLoading || !toToken || !amount || !fromToken || !amountWei
              }
              variant="outline"
              className="flex-1 h-11 rounded-xl shadow-sm border-border/60 text-[13px] font-semibold hover:bg-secondary active:bg-secondary transition-all"
            >
              {quoteLoading ? (
                <span className="flex items-center gap-2">
                  <Spinner />
                  Getting quote...
                </span>
              ) : (
                "Get Quote"
              )}
            </Button>
            <Button
              onClick={handleSwap}
              disabled={swapLoading || !quote}
              className="flex-1 h-11 rounded-xl shadow-sm bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-[13px] font-semibold transition-all"
            >
              {swapLoading ? (
                <span className="flex items-center gap-2">
                  <Spinner />
                  {swapStep === "approving"
                    ? "Approving..."
                    : swapStep === "waiting_approve"
                    ? "Confirming approval..."
                    : "Swapping..."}
                </span>
              ) : (
                fromToken?.address.toLowerCase() === NATIVE_TOKEN.toLowerCase()
                  ? "Swap"
                  : "Approve & Swap"
              )}
            </Button>
          </div>

        </div>
      </div>

      {/* ── Trending Tokens ───────────────────────────────────────── */}
      {trendingTokens.length > 0 && (
        <div className="mt-6 rounded-2xl border border-border/50 bg-white/80 backdrop-blur-sm shadow-sm shadow-black/[0.03] overflow-hidden">
          <div className="px-5 py-3 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">🔥</span>
              <h3 className="text-[13px] font-semibold">Trending Tokens</h3>
            </div>
            <span className="text-[11px] text-muted-foreground/60">24h · {Object.values(CHAINS).find(c => c.swapName === chain)?.name ?? chain}</span>
          </div>
          {trendingLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="text-muted-foreground" />
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {trendingTokens.slice(0, 10).map((t, i) => {
                const price = parseFloat(t.price);
                const change = parseFloat(t.change24h);
                const mcap = parseFloat(t.marketCap);
                const isUp = change >= 0;
                return (
                  <button
                    key={`${t.address}-${i}`}
                    type="button"
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-indigo-50/40 active:bg-indigo-50/60 transition-colors text-left"
                    onClick={() => {
                      const chainConfig = Object.values(CHAINS).find(c => c.swapName === chain);
                      setToToken({
                        symbol: t.symbol,
                        address: t.address,
                        decimals: 18,
                      });
                      // If no fromToken selected, set native
                      if (!fromToken) setFromToken(getNativeToken(chain));
                      // Scroll to top of form
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      void chainConfig; // suppress unused
                    }}
                  >
                    <span className="text-[11px] font-medium text-muted-foreground/50 w-5 text-right tabular-nums">{i + 1}</span>
                    {t.logo ? (
                      <img
                        src={t.logo}
                        alt={t.symbol}
                        width={28}
                        height={28}
                        className="rounded-full shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <TokenIcon symbol={t.symbol} size={28} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold tracking-tight">{t.symbol}</span>
                        {t.name && <span className="text-[11px] text-muted-foreground/60 truncate">{t.name.length > 16 ? t.name.slice(0, 14) + "..." : t.name}</span>}
                      </div>
                      {mcap > 0 && (
                        <span className="text-[10px] text-muted-foreground/50">
                          MCap: ${mcap >= 1e9 ? (mcap / 1e9).toFixed(1) + "B" : mcap >= 1e6 ? (mcap / 1e6).toFixed(1) + "M" : mcap >= 1e3 ? (mcap / 1e3).toFixed(0) + "K" : mcap.toFixed(0)}
                        </span>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[12px] font-medium tabular-nums">
                        ${price >= 1 ? price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : price >= 0.0001 ? price.toFixed(6) : price.toExponential(2)}
                      </div>
                      <div className={`text-[11px] font-semibold tabular-nums ${isUp ? "text-emerald-400" : "text-red-500"}`}>
                        {isUp ? "+" : ""}{change.toFixed(2)}%
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
