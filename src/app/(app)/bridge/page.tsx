"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CHAINS } from "@/lib/chains";
import { Fade, NumberDisplay } from "@/components/motion";
import { motion, AnimatePresence } from "motion/react";

// Lowercase everywhere for consistent comparison. LI.FI accepts both cases.
const NATIVE_TOKEN_LIFI = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const CHAIN_LIST = Object.values(CHAINS);

interface BridgeTokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
  logoURI?: string;
  priceUSD?: string;
}

interface WalletToken {
  symbol: string;
  address: string;
  decimals: number;
  balance: string;
  balanceUsd: string;
}

interface QuoteData {
  tool: string;
  toAmount: string;
  toAmountMin: string;
  toToken: BridgeTokenInfo;
  fromToken: BridgeTokenInfo;
  executionDuration: number;
  /** LI.FI's router/bridge contract that needs ERC-20 allowance. Absent for native tokens. */
  approvalAddress?: string;
  feeCosts: Array<{
    name: string;
    amount: string;
    amountUSD?: string;
    token: BridgeTokenInfo;
  }>;
  gasCosts: Array<{
    amount: string;
    amountUSD?: string;
    token: BridgeTokenInfo;
  }>;
}

interface BridgeResult {
  txHash: string | null;
  bridge: string;
  estimatedTime: number;
  toAmount: string;
  fromChain: string;
  toChain: string;
  status: string;
}

interface StatusData {
  status: "NOT_FOUND" | "INVALID" | "PENDING" | "DONE" | "FAILED";
  substatus?: string;
  substatusMessage?: string;
  receiving?: {
    txHash?: string;
    amount?: string;
  };
}

function toWei(amount: string, decimals: number): string {
  const [intPart, fracPart = ""] = amount.split(".");
  const padded = fracPart.padEnd(decimals, "0").slice(0, decimals);
  const raw = intPart + padded;
  return raw.replace(/^0+/, "") || "0";
}

function fromWei(amount: string, decimals: number): string {
  const s = amount.padStart(decimals + 1, "0");
  const intPart = s.slice(0, s.length - decimals) || "0";
  const fracPart = s.slice(s.length - decimals);
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

function ChainSelector({
  label,
  value,
  onChange,
  excludeChainIndex,
}: {
  label: string;
  value: number;
  onChange: (chainIndex: number) => void;
  excludeChainIndex?: number;
}) {
  return (
    <div>
      <p className="text-[13px] font-medium text-muted-foreground mb-2">
        {label}
      </p>
      <select
        className="flex h-11 w-full rounded-xl border border-border/60 bg-white px-4 text-sm font-medium text-foreground transition-colors outline-none focus:border-indigo-400 focus:ring-3 focus:ring-indigo-500/20 appearance-none cursor-pointer"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' viewBox='0 0 24 24' stroke='%239ca3af' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 14px center",
        }}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {CHAIN_LIST.filter((c) => c.chainIndex !== excludeChainIndex).map((c) => (
          <option key={c.chainIndex} value={c.chainIndex}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function TokenDropdown({
  tokens,
  selected,
  onSelect,
  loading,
  label,
}: {
  tokens: BridgeTokenInfo[];
  selected: BridgeTokenInfo | null;
  onSelect: (t: BridgeTokenInfo) => void;
  loading: boolean;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = query
    ? tokens.filter(
        (t) =>
          t.symbol.toLowerCase().includes(query.toLowerCase()) ||
          t.name.toLowerCase().includes(query.toLowerCase())
      )
    : tokens.slice(0, 50);

  return (
    <div ref={containerRef}>
      <p className="text-[13px] font-medium text-muted-foreground mb-2">
        {label ?? "Token"}
      </p>
      {selected ? (
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-white px-4 h-11">
          {selected.logoURI && (
            <img
              src={selected.logoURI}
              alt={selected.symbol}
              width={24}
              height={24}
              className="rounded-full shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <span className="font-semibold text-sm tracking-tight">
            {selected.symbol}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {selected.name}
          </span>
          <button
            type="button"
            className="ml-auto text-[13px] font-medium text-indigo-500 hover:text-indigo-700 transition-colors"
            onClick={() => onSelect(null as unknown as BridgeTokenInfo)}
          >
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <Input
            placeholder={loading ? "Loading tokens..." : "Search token..."}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            disabled={loading}
            className="h-11 rounded-xl border-border/60 bg-white px-4 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-400"
          />
          <AnimatePresence>
            {showDropdown && !loading && (
              <motion.div
                className="absolute z-50 top-full left-0 right-0 mt-1.5 max-h-64 overflow-auto rounded-xl border border-border/60 bg-white shadow-lg shadow-black/5 origin-top"
                initial={{ opacity: 0, scaleY: 0.9, y: -4 }}
                animate={{ opacity: 1, scaleY: 1, y: 0 }}
                exit={{ opacity: 0, scaleY: 0.95, y: -2 }}
                transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
              >
                {filtered.length === 0 && (
                  <div className="px-4 py-3 text-[13px] text-muted-foreground">
                    No tokens found
                  </div>
                )}
                {filtered.map((t, i) => (
                  <button
                    key={`${t.address}-${i}`}
                    type="button"
                    className="w-full text-left px-4 py-2.5 hover:bg-indigo-50/50 active:bg-indigo-50 flex items-center gap-3 text-sm transition-colors"
                    onClick={() => {
                      onSelect(t);
                      setQuery("");
                      setShowDropdown(false);
                    }}
                  >
                    {t.logoURI && (
                      <img
                        src={t.logoURI}
                        alt={t.symbol}
                        width={28}
                        height={28}
                        className="rounded-full shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold tracking-tight">
                        {t.symbol}
                      </span>
                      <span className="text-muted-foreground text-xs truncate ml-2">
                        {t.name.length > 24 ? t.name.slice(0, 22) + "..." : t.name}
                      </span>
                    </div>
                    {t.priceUSD && parseFloat(t.priceUSD) > 0 && (
                      <span className="text-[11px] text-muted-foreground font-mono">
                        ${parseFloat(t.priceUSD).toFixed(2)}
                      </span>
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

export default function BridgePage() {
  const { authenticated, walletAddress } = useAuth();
  const [fromChainIndex, setFromChainIndex] = useState(1);
  const [toChainIndex, setToChainIndex] = useState(42161);
  const [fromToken, setFromToken] = useState<BridgeTokenInfo | null>(null);
  const [toToken, setToToken] = useState<BridgeTokenInfo | null>(null);
  const [amount, setAmount] = useState("");
  const [fromTokens, setFromTokens] = useState<BridgeTokenInfo[]>([]);
  const [toTokens, setToTokens] = useState<BridgeTokenInfo[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [walletAssets, setWalletAssets] = useState<WalletToken[]>([]);
  const [walletAssetsLoading, setWalletAssetsLoading] = useState(false);
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [bridgeResult, setBridgeResult] = useState<BridgeResult | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<StatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch wallet balances for source chain
  const fetchWalletAssets = useCallback(async () => {
    if (!walletAddress) return;
    setWalletAssetsLoading(true);
    try {
      const chainConfig = CHAIN_LIST.find((c) => c.chainIndex === fromChainIndex);
      if (!chainConfig) return;
      const res = await fetch(`/api/wallet/balances?chain=${chainConfig.chainIndex}`);
      const data = await res.json();
      const raw = data.data;
      const tokenList = raw?.details?.[0]?.tokenAssets ?? raw?.tokenAssets ?? (Array.isArray(raw) ? raw : []);
      const assets: WalletToken[] = [];
      for (const t of tokenList) {
        const bal = parseFloat(t.balance ?? t.holdingAmount ?? "0");
        if (bal <= 0) continue;
        assets.push({
          symbol: t.symbol ?? t.tokenSymbol ?? "?",
          address: t.tokenAddress || t.tokenContractAddress || "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          decimals: Number(t.decimal ?? t.decimals ?? 18),
          balance: t.balance ?? t.holdingAmount ?? "0",
          balanceUsd: t.usdValue ? String(t.usdValue) : t.tokenPrice ? String(bal * parseFloat(t.tokenPrice)) : "0",
        });
      }
      assets.sort((a, b) => parseFloat(b.balanceUsd) - parseFloat(a.balanceUsd));
      setWalletAssets(assets);
    } catch {
      setWalletAssets([]);
    } finally {
      setWalletAssetsLoading(false);
    }
  }, [fromChainIndex, walletAddress]);

  useEffect(() => {
    fetchWalletAssets();
  }, [fetchWalletAssets]);

  // Fetch LI.FI tokens for both chains
  const fetchTokens = useCallback(async () => {
    setTokensLoading(true);
    setFromToken(null);
    setToToken(null);
    setQuote(null);
    try {
      const res = await fetch(
        `/api/bridge/tokens?fromChain=${fromChainIndex}&toChain=${toChainIndex}`
      );
      const data = await res.json();
      if (data.success && data.data) {
        const srcTokens: BridgeTokenInfo[] =
          data.data[String(fromChainIndex)] ?? [];
        const dstTokens: BridgeTokenInfo[] =
          data.data[String(toChainIndex)] ?? [];
        setFromTokens(srcTokens);
        setToTokens(dstTokens);
      } else {
        setFromTokens([]);
        setToTokens([]);
      }
    } catch {
      setFromTokens([]);
      setToTokens([]);
    } finally {
      setTokensLoading(false);
    }
  }, [fromChainIndex, toChainIndex]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // When source chain changes and equals dest chain, swap dest
  const handleFromChainChange = (chainIndex: number) => {
    if (chainIndex === toChainIndex) {
      setToChainIndex(fromChainIndex);
    }
    setFromChainIndex(chainIndex);
    setQuote(null);
    setError(null);
    setBridgeResult(null);
    setBridgeStatus(null);
  };

  const handleToChainChange = (chainIndex: number) => {
    if (chainIndex === fromChainIndex) {
      setFromChainIndex(toChainIndex);
    }
    setToChainIndex(chainIndex);
    setQuote(null);
    setError(null);
    setBridgeResult(null);
    setBridgeStatus(null);
  };

  const handleSwapChains = () => {
    const prevFrom = fromChainIndex;
    const prevTo = toChainIndex;
    const prevFromToken = fromToken;
    const prevToToken = toToken;
    setFromChainIndex(prevTo);
    setToChainIndex(prevFrom);
    setFromToken(prevToToken);
    setToToken(prevFromToken);
    setQuote(null);
    setError(null);
    setBridgeResult(null);
    setBridgeStatus(null);
  };

  // When user clicks a wallet asset, set it as fromToken and auto-match toToken
  const handleSelectWalletAsset = (asset: WalletToken) => {
    // Find matching LI.FI token on source chain
    const lifiMatch = fromTokens.find(
      (t) =>
        t.address.toLowerCase() === asset.address.toLowerCase() ||
        t.symbol.toLowerCase() === asset.symbol.toLowerCase()
    );
    const bridgeToken: BridgeTokenInfo = lifiMatch ?? {
      address: asset.address,
      symbol: asset.symbol,
      decimals: asset.decimals,
      name: asset.symbol,
    };
    setFromToken(bridgeToken);

    // Auto-set destination token to same symbol if available
    const destMatch = toTokens.find(
      (t) => t.symbol.toLowerCase() === asset.symbol.toLowerCase()
    );
    if (destMatch) {
      setToToken(destMatch);
    }

    setQuote(null);
    setError(null);
  };

  const handleMaxBalance = () => {
    if (!fromToken) return;
    const asset = walletAssets.find(
      (a) =>
        a.address.toLowerCase() === fromToken.address.toLowerCase() ||
        a.symbol.toLowerCase() === fromToken.symbol.toLowerCase()
    );
    if (asset) {
      setAmount(asset.balance);
      setQuote(null);
      setError(null);
    }
  };

  const handleGetQuote = async () => {
    if (!fromToken || !toToken || !amount || !walletAddress) return;
    setQuoteLoading(true);
    setQuote(null);
    setError(null);

    try {
      const amountWei = toWei(amount, fromToken.decimals);

      const qs = new URLSearchParams({
        fromChain: String(fromChainIndex),
        toChain: String(toChainIndex),
        fromToken: fromToken.address,
        toToken: toToken.address,
        fromAmount: amountWei,
        fromAddress: walletAddress,
      });

      const res = await fetch(`/api/bridge/quote?${qs.toString()}`);
      const data = await res.json();

      if (data.success && data.data) {
        const q = data.data;
        setQuote({
          tool: q.tool ?? q.toolDetails?.name ?? "Unknown",
          toAmount: q.estimate?.toAmount ?? "0",
          toAmountMin: q.estimate?.toAmountMin ?? "0",
          toToken: q.action?.toToken ?? toToken,
          fromToken: q.action?.fromToken ?? fromToken,
          executionDuration: q.estimate?.executionDuration ?? 0,
          approvalAddress: q.estimate?.approvalAddress,
          feeCosts: q.estimate?.feeCosts ?? [],
          gasCosts: q.estimate?.gasCosts ?? [],
        });
      } else {
        setError(data.error || "Failed to get bridge quote");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get bridge quote");
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleBridge = async () => {
    if (!fromToken || !toToken || !amount || !walletAddress || !quote) return;
    setBridgeLoading(true);
    setError(null);
    setBridgeResult(null);
    setBridgeStatus(null);
    if (pollRef.current) clearInterval(pollRef.current);

    try {
      const amountWei = toWei(amount, fromToken.decimals);
      const res = await fetch("/api/bridge/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromChain: String(fromChainIndex),
          toChain: String(toChainIndex),
          fromToken: fromToken.address,
          toToken: toToken.address,
          fromAmount: amountWei,
          fromAddress: walletAddress,
        }),
      });

      const data = await res.json();
      if (data.success && data.data) {
        const result = data.data as BridgeResult;
        setBridgeResult(result);
        setQuote(null);
        setAmount("");

        // Start polling for status
        if (result.txHash) {
          pollRef.current = setInterval(async () => {
            try {
              const statusRes = await fetch(
                `/api/bridge/status?txHash=${result.txHash}&fromChain=${result.fromChain}&toChain=${result.toChain}&bridge=${encodeURIComponent(result.bridge)}`
              );
              const statusData = await statusRes.json();
              if (statusData.success && statusData.data) {
                setBridgeStatus(statusData.data);
                if (
                  statusData.data.status === "DONE" ||
                  statusData.data.status === "FAILED"
                ) {
                  if (pollRef.current) clearInterval(pollRef.current);
                }
              }
            } catch {
              // continue polling
            }
          }, 10_000);
        }
      } else {
        setError(data.error || "Bridge execution failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bridge execution failed");
    } finally {
      setBridgeLoading(false);
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

  const fromChainConfig = CHAIN_LIST.find((c) => c.chainIndex === fromChainIndex);
  const toChainConfig = CHAIN_LIST.find((c) => c.chainIndex === toChainIndex);

  const quoteReceiveAmount =
    quote && quote.toToken
      ? fromWei(quote.toAmount, quote.toToken.decimals)
      : null;

  const totalFeeUsd = quote
    ? [
        ...(quote.feeCosts ?? []),
        ...(quote.gasCosts ?? []),
      ]
        .reduce((sum, c) => sum + parseFloat(c.amountUSD ?? "0"), 0)
        .toFixed(2)
    : null;

  const estimatedMinutes = quote
    ? Math.ceil(quote.executionDuration / 60)
    : null;

  // Find the selected fromToken's wallet balance
  const selectedAssetBalance = fromToken
    ? walletAssets.find(
        (a) =>
          a.address.toLowerCase() === fromToken.address.toLowerCase() ||
          a.symbol.toLowerCase() === fromToken.symbol.toLowerCase()
      )
    : null;

  return (
    <div className="max-w-md mx-auto space-y-5 py-2">
      {/* Page header */}
      <div>
        <p className="text-eyebrow">CROSS-CHAIN · LI.FI</p>
        <h1 className="mt-1.5 text-display-lg text-foreground">
          Bridge
        </h1>
        <p className="text-[13px] text-muted-foreground mt-2">
          Transfer tokens across chains via LI.FI
        </p>
      </div>

      {/* Main card */}
      <div className="voxr-card">
        <div className="p-5 space-y-5">
          {/* Source chain */}
          <ChainSelector
            label="From Network"
            value={fromChainIndex}
            onChange={handleFromChainChange}
            excludeChainIndex={toChainIndex}
          />

          {/* Your Assets section */}
          <div className="rounded-xl bg-secondary/80 border border-border/40 p-4">
            <p className="text-[13px] font-medium text-muted-foreground mb-2.5">
              Your Assets on {fromChainConfig?.name ?? "source chain"}
            </p>
            {walletAssetsLoading ? (
              <div className="flex items-center gap-2 py-3 justify-center text-muted-foreground">
                <Spinner />
                <span className="text-[13px]">Loading balances...</span>
              </div>
            ) : walletAssets.length === 0 ? (
              <p className="text-[12px] text-muted-foreground py-2 text-center">
                No tokens found on this chain
              </p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-auto">
                {walletAssets.map((asset, i) => (
                  <button
                    key={`${asset.address}-${i}`}
                    type="button"
                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between text-sm transition-colors ${
                      fromToken &&
                      (fromToken.address.toLowerCase() === asset.address.toLowerCase() ||
                        fromToken.symbol.toLowerCase() === asset.symbol.toLowerCase())
                        ? "bg-indigo-50 border border-indigo-200/60"
                        : "hover:bg-white active:bg-indigo-50/50 border border-transparent"
                    }`}
                    onClick={() => handleSelectWalletAsset(asset)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-950/40/60 text-[11px] font-bold text-indigo-600">
                        {asset.symbol.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold tracking-tight text-[13px]">
                          {asset.symbol}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[13px] font-medium tabular-nums">
                        {parseFloat(asset.balance).toFixed(
                          parseFloat(asset.balance) < 0.01 ? 6 : parseFloat(asset.balance) < 1 ? 4 : 2
                        )}
                      </p>
                      {parseFloat(asset.balanceUsd) > 0 && (
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          ${parseFloat(asset.balanceUsd).toFixed(2)}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Source token + amount */}
          <div className="rounded-xl bg-secondary/80 border border-border/40 p-4 space-y-3">
            <TokenDropdown
              tokens={fromTokens}
              selected={fromToken}
              onSelect={(t) => {
                setFromToken(t);
                setQuote(null);
                setError(null);
                // Auto-match destination token by symbol
                if (t && toTokens.length > 0) {
                  const destMatch = toTokens.find(
                    (dt) => dt.symbol.toLowerCase() === t.symbol.toLowerCase()
                  );
                  if (destMatch) setToToken(destMatch);
                }
              }}
              loading={tokensLoading}
              label="Source Token"
            />

            {/* Amount input with MAX */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[13px] font-medium text-muted-foreground">
                  Amount
                </p>
                {selectedAssetBalance && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      Bal: {parseFloat(selectedAssetBalance.balance).toFixed(
                        parseFloat(selectedAssetBalance.balance) < 1 ? 4 : 2
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={handleMaxBalance}
                      className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-700 transition-colors px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-950/40"
                    >
                      MAX
                    </button>
                  </div>
                )}
              </div>
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
            </div>
          </div>

          {/* Swap chains arrow */}
          <div className="flex justify-center -my-2 relative z-10">
            <button
              type="button"
              onClick={handleSwapChains}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-secondary text-muted-foreground hover:text-indigo-600 hover:border-indigo-300 transition-colors"
            >
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
                <path d="M7 16V4m0 0L3 8m4-4l4 4" />
                <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* Destination chain */}
          <ChainSelector
            label="To Network"
            value={toChainIndex}
            onChange={handleToChainChange}
            excludeChainIndex={fromChainIndex}
          />

          {/* Destination token selector */}
          <div className="rounded-xl bg-secondary/80 border border-border/40 p-4">
            <TokenDropdown
              tokens={toTokens}
              selected={toToken}
              onSelect={(t) => {
                setToToken(t);
                setQuote(null);
                setError(null);
              }}
              loading={tokensLoading}
              label="Destination Token"
            />
          </div>

          {/* Quote result */}
          {quote && quoteReceiveAmount && (
            <div className="rounded-xl bg-gradient-to-br from-indigo-50 via-violet-50 to-purple-50 border border-indigo-100/60 overflow-hidden">
              <div className="p-4 pb-3">
                <p className="text-[11px] font-medium text-indigo-500/80 uppercase tracking-wide mb-1">
                  You will receive
                </p>
                <p className="text-2xl font-bold tracking-tight text-indigo-900 tabular-nums">
                  <NumberDisplay value={quoteReceiveAmount} decimals={6} minDecimals={0} />{" "}
                  <span className="text-base font-semibold text-indigo-600">
                    {quote.toToken.symbol}
                  </span>
                </p>
                <p className="text-[12px] text-indigo-400 mt-0.5">
                  on {toChainConfig?.name ?? "destination chain"}
                </p>
              </div>

              <div className="border-t border-indigo-100/60 bg-white/60 px-4 py-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-muted-foreground">Bridge</span>
                  <span className="text-[12px] font-medium text-foreground capitalize">
                    {quote.tool}
                  </span>
                </div>
                {fromToken && toToken && fromToken.symbol !== toToken.symbol && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">Route</span>
                    <span className="text-[12px] font-medium text-foreground">
                      {fromToken.symbol} &rarr; {toToken.symbol}
                    </span>
                  </div>
                )}
                {estimatedMinutes != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">Estimated Time</span>
                    <span className="text-[12px] font-medium text-foreground">
                      ~{estimatedMinutes} min
                    </span>
                  </div>
                )}
                {totalFeeUsd && parseFloat(totalFeeUsd) > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">Total Fees</span>
                    <span className="text-[12px] font-medium text-foreground">
                      ~${totalFeeUsd}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1 mt-0.5 border-t border-emerald-100/60">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-emerald-500 shrink-0">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-[11px] font-medium text-emerald-400">
                    Zero commission — DeFi Agent does not charge any fees on bridges
                  </span>
                </div>
                {/* Approval notice: ERC-20 bridges need an approve tx before the bridge call */}
                {quote.approvalAddress &&
                  fromToken &&
                  fromToken.address.toLowerCase() !== NATIVE_TOKEN_LIFI && (
                    <div className="flex items-start gap-2 pt-2 mt-0.5 border-t border-amber-100/60">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-amber-500 shrink-0 mt-[1px]">
                        <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span className="text-[11px] text-amber-300 leading-relaxed">
                        Two transactions required: first an ERC-20 <strong>approve</strong> for the bridge router, then the <strong>bridge</strong> itself. Both happen in sequence after you click Bridge.
                      </span>
                    </div>
                  )}
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
                  Bridge Error
                </p>
                <p className="text-[12px] text-red-400 leading-relaxed">
                  {error}
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

          {/* Bridge result + status tracking */}
          <Fade in={!!bridgeResult}>
            {bridgeResult && (
            <div className="rounded-xl bg-emerald-950/30 border border-emerald-800/40 p-4 flex gap-3 items-start">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-900/40">
                {(!bridgeStatus || bridgeStatus.status === "PENDING" || bridgeStatus.status === "NOT_FOUND") ? (
                  <Spinner className="text-emerald-400" />
                ) : bridgeStatus.status === "DONE" ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-emerald-400">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-red-500">
                    <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-emerald-800 mb-0.5">
                  {bridgeStatus?.status === "DONE"
                    ? "Bridge Complete"
                    : bridgeStatus?.status === "FAILED"
                    ? "Bridge Failed"
                    : "Bridge In Progress"}
                </p>
                <p className="text-[12px] text-emerald-400 leading-relaxed">
                  {bridgeStatus?.substatusMessage ??
                    (bridgeStatus?.status === "DONE"
                      ? "Tokens have been delivered to the destination chain."
                      : bridgeStatus?.status === "FAILED"
                      ? "The bridge transaction failed. Your funds may be returned."
                      : `Bridging via ${bridgeResult.bridge}. Estimated ~${Math.ceil(bridgeResult.estimatedTime / 60)} min.`)}
                </p>
                {bridgeResult.txHash && (
                  <a
                    href={`${fromChainConfig?.explorer ?? "https://etherscan.io"}/tx/${bridgeResult.txHash}`}
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
                {bridgeStatus?.receiving?.txHash && (
                  <a
                    href={`${toChainConfig?.explorer ?? "https://etherscan.io"}/tx/${bridgeStatus.receiving.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1 text-[12px] font-medium text-emerald-300 hover:text-emerald-900 underline underline-offset-2 transition-colors"
                  >
                    Receiving tx on {toChainConfig?.name}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                    </svg>
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setBridgeResult(null);
                  setBridgeStatus(null);
                  if (pollRef.current) clearInterval(pollRef.current);
                }}
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
              onClick={handleGetQuote}
              disabled={quoteLoading || !fromToken || !toToken || !amount}
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
              onClick={handleBridge}
              disabled={bridgeLoading || !quote}
              className="flex-1 h-11 rounded-xl shadow-sm bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-[13px] font-semibold transition-all"
            >
              {bridgeLoading ? (
                <span className="flex items-center gap-2">
                  <Spinner />
                  Bridging...
                </span>
              ) : (
                "Bridge"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
