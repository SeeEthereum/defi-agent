"use client";

/**
 * Bridge: a ticket (from, to, quote) beside the assets on the source chain.
 * The Confidential tab hands over to the NEAR Intents panel.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CHAINS } from "@/lib/chains";
import { Fade, NumberDisplay } from "@/components/motion";
import { GasStationModal } from "@/components/gas-station-modal";
import { LineIcon } from "@/components/line-icon";
import { Empty, PageHead, Panel, PillTabs, Picker, PickRow, Skeleton } from "@/components/premium";
import type { GasStationConfirming } from "@/lib/okx/types";
import { AnimatePresence, motion } from "motion/react";
import { ConfidentialPanel } from "./confidential-panel";

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
  quoteId: string;
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

function toWei(amount: string, decimals: number): string | null {
  const normalized = amount.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const [intPart, fracPart = ""] = normalized.split(".");
  const truncatedFrac = fracPart.slice(0, decimals);
  const padded = truncatedFrac.padEnd(decimals, "0");
  try {
    return BigInt(intPart + padded).toString();
  } catch {
    return null;
  }
}

function weiToAmount(wei: string, decimals: number): string {
  const s = wei.padStart(decimals + 1, "0");
  const intPart = s.slice(0, s.length - decimals) || "0";
  const fracPart = s.slice(s.length - decimals).replace(/0+$/, "");
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

function makeQuoteKey(
  fromChain: number,
  toChain: number,
  fromToken: BridgeTokenInfo,
  toToken: BridgeTokenInfo,
  amount: string
): string {
  return `${fromChain}|${toChain}|${fromToken.address}|${toToken.address}|${amount}`;
}

function readQuoteId(payload: unknown): string {
  if (typeof payload !== "object" || payload == null) return "";
  const source = Array.isArray(payload) ? payload[0] : payload;
  if (typeof source !== "object" || source == null) return "";
  const id = (source as Record<string, unknown>).quoteId;
  return typeof id === "string" ? id : "";
}

function abbreviateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function mapBackendError(detail: unknown): string {
  console.error(detail);
  return "Bridge failed, please try again";
}

function fromWei(amount: string, decimals: number): string {
  const s = amount.padStart(decimals + 1, "0");
  const intPart = s.slice(0, s.length - decimals) || "0";
  const fracPart = s.slice(s.length - decimals);
  const trimmed = fracPart.slice(0, 6).replace(/0+$/, "");
  return trimmed ? `${intPart}.${trimmed}` : intPart;
}

function TokenLogo({
  logoURI,
  symbol,
  size,
}: {
  logoURI?: string;
  symbol: string;
  size: number;
}) {
  if (logoURI?.startsWith("https://")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- LI.FI logos come from many hosts
      <img
        src={logoURI}
        alt=""
        width={size}
        height={size}
        className="tok-logo"
        onError={(e) => {
          (e.target as HTMLImageElement).style.visibility = "hidden";
        }}
      />
    );
  }
  return (
    <span className="tok-fallback" style={{ width: size, height: size }} aria-hidden="true">
      {symbol.slice(0, 2)}
    </span>
  );
}

/** Network as a compact select; `label` is read by screen readers. */
function ChainSelect({
  id,
  label,
  value,
  onChange,
  excludeChainIndex,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (chainIndex: number) => void;
  excludeChainIndex?: number;
}) {
  return (
    <div className="select select--chip">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {CHAIN_LIST.filter((c) => c.chainIndex !== excludeChainIndex).map((c) => (
          <option key={c.chainIndex} value={c.chainIndex}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Token button plus a searchable picker over the LI.FI list for one chain. */
function TokenChoice({
  tokens,
  selected,
  onSelect,
  loading,
  title,
}: {
  tokens: BridgeTokenInfo[];
  selected: BridgeTokenInfo | null;
  onSelect: (t: BridgeTokenInfo) => void;
  loading: boolean;
  title: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const filtered = query
    ? tokens.filter(
        (t) =>
          t.symbol.toLowerCase().includes(query.toLowerCase()) ||
          t.name.toLowerCase().includes(query.toLowerCase())
      )
    : tokens.slice(0, 50);

  return (
    <>
      <button
        type="button"
        className={`tok-btn${selected ? "" : " empty"}`}
        onClick={() => setOpen(true)}
        disabled={loading}
        aria-haspopup="dialog"
        aria-label={selected ? `${title}: ${selected.symbol}. Change token` : title}
      >
        {loading ? (
          <span>Loading…</span>
        ) : selected ? (
          <>
            <TokenLogo logoURI={selected.logoURI} symbol={selected.symbol} size={26} />
            <span>{selected.symbol}</span>
          </>
        ) : (
          <span>Select token</span>
        )}
        <LineIcon name="chevron-down" size={15} />
      </button>
      <Picker open={open} onClose={close} title={title} query={query} onQuery={setQuery} placeholder="Search a name or symbol">
        {filtered.length === 0 && <p className="picker-hint">No tokens found.</p>}
        {filtered.map((t, i) => (
          <PickRow
            key={`${t.address}-${i}`}
            icon={<TokenLogo logoURI={t.logoURI} symbol={t.symbol} size={34} />}
            title={t.symbol}
            sub={t.name}
            end={t.priceUSD && parseFloat(t.priceUSD) > 0 ? <span className="num">${parseFloat(t.priceUSD).toFixed(2)}</span> : undefined}
            selected={selected?.address.toLowerCase() === t.address.toLowerCase()}
            onPick={() => {
              onSelect(t);
              close();
            }}
          />
        ))}
      </Picker>
    </>
  );
}

export default function BridgePage() {
  const { authenticated, walletAddress } = useAuth();
  const [mode, setMode] = useState<"standard" | "confidential">("standard");
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
  const [quoteKey, setQuoteKey] = useState<string | null>(null);
  const [quoteReceivedAt, setQuoteReceivedAt] = useState<number | null>(null);
  const [quoteExpired, setQuoteExpired] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [bridgeResult, setBridgeResult] = useState<BridgeResult | null>(null);
  const [gasStation, setGasStation] = useState<GasStationConfirming | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<StatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCancelledRef = useRef(false);
  const quoteAbortRef = useRef<AbortController | null>(null);
  const skipClearQuoteErrorRef = useRef(false);
  const currentKeyRef = useRef<string | null>(null);

  const liveQuoteKey =
    fromToken && toToken
      ? makeQuoteKey(fromChainIndex, toChainIndex, fromToken, toToken, amount)
      : null;
  currentKeyRef.current = liveQuoteKey;

  const parsedAmountWei = fromToken ? toWei(amount, fromToken.decimals) : null;
  const invalidAmount = amount.trim() !== "" && parsedAmountWei === null;

  const clearQuote = useCallback(() => {
    setQuote(null);
    setQuoteKey(null);
    setQuoteReceivedAt(null);
    setQuoteExpired(false);
  }, []);

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
    clearQuote();
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
  }, [fromChainIndex, toChainIndex, clearQuote]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  // Cleanup poll and in-flight quote on unmount
  useEffect(() => {
    return () => {
      pollCancelledRef.current = true;
      if (pollRef.current) clearInterval(pollRef.current);
      quoteAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!quote || quoteReceivedAt == null) {
      setQuoteExpired(false);
      return;
    }
    const remaining = 60_000 - (Date.now() - quoteReceivedAt);
    if (remaining <= 0) {
      setQuoteExpired(true);
      return;
    }
    setQuoteExpired(false);
    const id = window.setTimeout(() => setQuoteExpired(true), remaining);
    return () => window.clearTimeout(id);
  }, [quote, quoteReceivedAt]);

  // When source chain changes and equals dest chain, swap dest
  const handleFromChainChange = (chainIndex: number) => {
    if (chainIndex === toChainIndex) {
      setToChainIndex(fromChainIndex);
    }
    setFromChainIndex(chainIndex);
    clearQuote();
    setError(null);
    setBridgeResult(null);
    setBridgeStatus(null);
  };

  const handleToChainChange = (chainIndex: number) => {
    if (chainIndex === fromChainIndex) {
      setFromChainIndex(toChainIndex);
    }
    setToChainIndex(chainIndex);
    clearQuote();
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
    clearQuote();
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

    clearQuote();
    setError(null);
  };

  const handleMaxBalance = () => {
    if (!fromToken) return;
    const asset = walletAssets.find(
      (a) =>
        a.address.toLowerCase() === fromToken.address.toLowerCase() ||
        a.symbol.toLowerCase() === fromToken.symbol.toLowerCase()
    );
    if (!asset) return;

    let nextAmount = asset.balance;
    const isNative =
      fromToken.address.toLowerCase() === NATIVE_TOKEN_LIFI;
    if (isNative) {
      const reserveHuman = fromChainIndex === 1 ? "0.002" : "0.0005";
      const balWei = toWei(asset.balance, fromToken.decimals);
      const reserveWei = toWei(reserveHuman, fromToken.decimals);
      if (balWei !== null && reserveWei !== null) {
        const remaining = BigInt(balWei) - BigInt(reserveWei);
        nextAmount =
          remaining > 0n
            ? weiToAmount(remaining.toString(), fromToken.decimals)
            : "0";
      } else {
        const bal = Number(asset.balance);
        const reserve = fromChainIndex === 1 ? 0.002 : 0.0005;
        nextAmount = Number.isFinite(bal) ? String(Math.max(0, bal - reserve)) : "0";
      }
    }

    setAmount(nextAmount);
    clearQuote();
    setError(null);
  };

  const handleGetQuote = async () => {
    const preserveError = skipClearQuoteErrorRef.current;
    skipClearQuoteErrorRef.current = false;
    if (!fromToken || !toToken || !amount || !walletAddress) return;
    const amountWei = toWei(amount, fromToken.decimals);
    if (amountWei === null) {
      setError("Enter a valid amount");
      return;
    }
    const requestKey = makeQuoteKey(
      fromChainIndex,
      toChainIndex,
      fromToken,
      toToken,
      amount
    );

    quoteAbortRef.current?.abort();
    const controller = new AbortController();
    quoteAbortRef.current = controller;

    setQuoteLoading(true);
    clearQuote();
    if (!preserveError) {
      setError(null);
    }

    try {
      const qs = new URLSearchParams({
        fromChain: String(fromChainIndex),
        toChain: String(toChainIndex),
        fromToken: fromToken.address,
        toToken: toToken.address,
        fromAmount: amountWei,
        fromAddress: walletAddress,
      });

      const res = await fetch(`/api/bridge/quote?${qs.toString()}`, {
        signal: controller.signal,
      });
      const data = await res.json();

      if (currentKeyRef.current !== requestKey) return;

      if (data.success && data.data) {
        const q = data.data;
        setQuote({
          tool: q.tool ?? q.toolDetails?.name ?? "Unknown",
          toAmount: q.estimate?.toAmount ?? "0",
          toAmountMin: q.estimate?.toAmountMin ?? "0",
          toToken: q.action?.toToken ?? toToken,
          fromToken: q.action?.fromToken ?? fromToken,
          executionDuration: q.estimate?.executionDuration ?? 0,
          quoteId: readQuoteId(q),
          approvalAddress: q.estimate?.approvalAddress,
          feeCosts: q.estimate?.feeCosts ?? [],
          gasCosts: q.estimate?.gasCosts ?? [],
        });
        setQuoteKey(requestKey);
        setQuoteReceivedAt(Date.now());
        setQuoteExpired(false);
      } else {
        setError(mapBackendError(data.error || "Failed to get bridge quote"));
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      if (currentKeyRef.current !== requestKey) return;
      setError(mapBackendError(e));
    } finally {
      if (quoteAbortRef.current === controller) {
        setQuoteLoading(false);
      }
    }
  };

  const handleBridge = async () => {
    if (!fromToken || !toToken || !amount || !walletAddress || !quote) return;
    const requestKey = makeQuoteKey(
      fromChainIndex,
      toChainIndex,
      fromToken,
      toToken,
      amount
    );
    if (quoteKey !== requestKey) return;
    if (quoteExpired || (quoteReceivedAt != null && Date.now() - quoteReceivedAt >= 60_000)) {
      return;
    }
    const amountWei = toWei(amount, fromToken.decimals);
    if (amountWei === null) {
      setError("Enter a valid amount");
      return;
    }
    setBridgeLoading(true);
    setError(null);
    setBridgeResult(null);
    setBridgeStatus(null);
    pollCancelledRef.current = true;
    if (pollRef.current) clearInterval(pollRef.current);

    try {
      const res = await fetch("/api/bridge/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromChain: String(fromChainIndex),
          toChain: String(toChainIndex),
          fromToken: fromToken.address,
          toToken: toToken.address,
          fromAmount: amountWei,
          quoteId: quote.quoteId,
        }),
      });

      const data = await res.json();
      if (res.status === 409) {
        skipClearQuoteErrorRef.current = true;
        clearQuote();
        setError("The quote expired or the price moved. Getting a fresh one…");
        void handleGetQuote();
        return;
      }
      if (data.success && data.data) {
        const result = data.data as BridgeResult;
        setBridgeResult(result);
        clearQuote();
        setAmount("");

        if (result.txHash) {
          pollCancelledRef.current = false;
          const startedAt = Date.now();
          const pollMaxMs = 10 * 60 * 1000;
          pollRef.current = setInterval(async () => {
            if (pollCancelledRef.current) {
              if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
              return;
            }
            if (Date.now() - startedAt >= pollMaxMs) {
              if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
              return;
            }
            try {
              const statusRes = await fetch(
                `/api/bridge/status?txHash=${result.txHash}&fromChain=${result.fromChain}&toChain=${result.toChain}&bridge=${encodeURIComponent(result.bridge)}`
              );
              const statusData = await statusRes.json();
              if (pollCancelledRef.current) return;
              if (statusData.success && statusData.data) {
                setBridgeStatus(statusData.data);
                if (
                  statusData.data.status === "DONE" ||
                  statusData.data.status === "FAILED" ||
                  statusData.data.status === "INVALID"
                ) {
                  if (pollRef.current) {
                    clearInterval(pollRef.current);
                    pollRef.current = null;
                  }
                }
              }
            } catch {
              // continue polling
            }
          }, 10_000);
        }
      } else if (data.requiresGasStation) {
        // Insufficient native gas on the source chain — backend offers
        // stablecoin gas payment. Modal handles pick + setup, then re-runs.
        setGasStation(data.gasStation);
      } else {
        setError(mapBackendError(data.error || "Bridge execution failed"));
      }
    } catch (e) {
      setError(mapBackendError(e));
    } finally {
      setBridgeLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="page">
        <Empty icon="bridge" title="Sign in first" text="Connect your wallet to move tokens between chains." />
      </div>
    );
  }

  const fromChainConfig = CHAIN_LIST.find((c) => c.chainIndex === fromChainIndex);
  const toChainConfig = CHAIN_LIST.find((c) => c.chainIndex === toChainIndex);

  const quoteIsCurrent = quote !== null && quoteKey === liveQuoteKey;
  const activeQuote = quoteIsCurrent ? quote : null;

  const quoteReceiveAmount =
    activeQuote && activeQuote.toToken
      ? fromWei(activeQuote.toAmount, activeQuote.toToken.decimals)
      : null;

  const quoteMinAmount =
    activeQuote && activeQuote.toToken
      ? fromWei(activeQuote.toAmountMin, activeQuote.toToken.decimals)
      : null;

  const totalFeeUsd = activeQuote
    ? [
        ...(activeQuote.feeCosts ?? []),
        ...(activeQuote.gasCosts ?? []),
      ]
        .reduce((sum, c) => sum + parseFloat(c.amountUSD ?? "0"), 0)
        .toFixed(2)
    : null;

  const estimatedMinutes = activeQuote
    ? Math.ceil(activeQuote.executionDuration / 60)
    : null;

  // Find the selected fromToken's wallet balance
  const selectedAssetBalance = fromToken
    ? walletAssets.find(
        (a) =>
          a.address.toLowerCase() === fromToken.address.toLowerCase() ||
          a.symbol.toLowerCase() === fromToken.symbol.toLowerCase()
      )
    : null;

  const usdFmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const payUsd =
    fromToken?.priceUSD && parsedAmountWei !== null && amount ? parseFloat(amount.replace(",", ".")) * parseFloat(fromToken.priceUSD) : null;
  const receiveUsd =
    activeQuote?.toToken?.priceUSD && quoteReceiveAmount ? parseFloat(quoteReceiveAmount) * parseFloat(activeQuote.toToken.priceUSD) : null;
  const bridgeDone = bridgeStatus?.status === "DONE";
  const bridgeFailed = bridgeStatus?.status === "FAILED" || bridgeStatus?.status === "INVALID";

  return (
    <div className="page">
      <GasStationModal
        open={gasStation !== null}
        chain={String(fromChainIndex)}
        payload={gasStation}
        onClose={() => setGasStation(null)}
        onResolved={() => {
          setGasStation(null);
          void handleBridge();
        }}
      />

      <PageHead
        title="Bridge"
        lede={
          mode === "confidential"
            ? "Swap to another address without linking it to this wallet, through NEAR Intents."
            : "Move tokens between chains through LI.FI. albicocca adds no commission."
        }
      />

      <PillTabs
        id="bridge-mode"
        label="Bridge mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: "standard", label: "Standard" },
          {
            value: "confidential",
            label: (
              <>
                <LineIcon name="lock" size={14} />
                Confidential
              </>
            ),
          },
        ]}
      />

      {mode === "confidential" ? (
        walletAddress ? (
          <ConfidentialPanel walletAddress={walletAddress} />
        ) : (
          <Skeleton height={320} />
        )
      ) : (
        <div className="bento">
          <Panel className="span-7 ticket" index={1}>
            {/* from */}
            <div className="leg">
              <div className="leg-top">
                <ChainSelect
                  id="bridge-from"
                  label="From network"
                  value={fromChainIndex}
                  onChange={handleFromChainChange}
                  excludeChainIndex={toChainIndex}
                />
                {selectedAssetBalance && (
                  <span className="leg-bal">
                    <span className="num">{parseFloat(selectedAssetBalance.balance).toLocaleString("en-US", { maximumFractionDigits: 6 })}</span> available
                    <button type="button" className="max" onClick={handleMaxBalance}>
                      Max
                    </button>
                  </span>
                )}
              </div>
              <div className="leg-main">
                <label htmlFor="bridge-amount" className="sr-only">
                  Amount to send
                </label>
                <input
                  id="bridge-amount"
                  className="amount-in"
                  placeholder="0"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  aria-invalid={invalidAmount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setError(null);
                  }}
                />
                <TokenChoice
                  tokens={fromTokens}
                  selected={fromToken}
                  onSelect={(t) => {
                    setFromToken(t);
                    clearQuote();
                    setError(null);
                    // Auto-match destination token by symbol
                    if (t && toTokens.length > 0) {
                      const destMatch = toTokens.find((dt) => dt.symbol.toLowerCase() === t.symbol.toLowerCase());
                      if (destMatch) setToToken(destMatch);
                    }
                  }}
                  loading={tokensLoading}
                  title={`Send from ${fromChainConfig?.name ?? "source chain"}`}
                />
              </div>
              <div className="leg-foot">
                {invalidAmount ? (
                  <span className="err" role="alert">
                    Enter a valid amount
                  </span>
                ) : (
                  <span className="num">{payUsd != null ? usdFmt(payUsd) : " "}</span>
                )}
              </div>
            </div>

            <div className="flip-wrap">
              <button type="button" className="flip" onClick={handleSwapChains} aria-label="Swap source and destination chains">
                <LineIcon name="swap" size={18} />
              </button>
            </div>

            {/* to */}
            <div className="leg">
              <div className="leg-top">
                <ChainSelect
                  id="bridge-to"
                  label="To network"
                  value={toChainIndex}
                  onChange={handleToChainChange}
                  excludeChainIndex={fromChainIndex}
                />
                {walletAddress && (
                  <span className="leg-bal">
                    to <span className="num">{abbreviateAddress(walletAddress).replace("...", "…")}</span>
                  </span>
                )}
              </div>
              <div className="leg-main">
                <output className={`amount-out${quoteReceiveAmount ? "" : " muted"}`} aria-live="polite">
                  {activeQuote && quoteReceiveAmount ? <NumberDisplay value={quoteReceiveAmount} decimals={6} minDecimals={0} /> : "0"}
                  {quoteLoading && <span className="spin" aria-label="Getting a quote" />}
                </output>
                <TokenChoice
                  tokens={toTokens}
                  selected={toToken}
                  onSelect={(t) => {
                    setToToken(t);
                    clearQuote();
                    setError(null);
                  }}
                  loading={tokensLoading}
                  title={`Receive on ${toChainConfig?.name ?? "destination chain"}`}
                />
              </div>
              <div className="leg-foot">
                <span className="num">{receiveUsd != null ? usdFmt(receiveUsd) : " "}</span>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {activeQuote && quoteReceiveAmount && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  style={{ display: "grid", gap: 12 }}
                >
                  <dl className="sum quote-sum">
                    {quoteMinAmount != null && (
                      <div>
                        <dt>Minimum received</dt>
                        <dd className="num">
                          {quoteMinAmount} {activeQuote.toToken.symbol}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Bridge</dt>
                      <dd style={{ textTransform: "capitalize" }}>{activeQuote.tool}</dd>
                    </div>
                    {fromToken && toToken && fromToken.symbol !== toToken.symbol && (
                      <div>
                        <dt>Route</dt>
                        <dd>
                          {fromToken.symbol} to {toToken.symbol}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Estimated time</dt>
                      <dd>{estimatedMinutes != null ? `About ${estimatedMinutes} min` : "Unknown"}</dd>
                    </div>
                    <div>
                      <dt>Fees and gas</dt>
                      <dd className="num">{totalFeeUsd != null ? `$${totalFeeUsd}` : "Unknown"}</dd>
                    </div>
                    <div>
                      <dt>Arrives at</dt>
                      <dd className="num" title={walletAddress ?? undefined}>
                        {walletAddress ? abbreviateAddress(walletAddress).replace("...", "…") : "Unknown"} on {toChainConfig?.name ?? "destination"}
                      </dd>
                    </div>
                  </dl>
                  {activeQuote.approvalAddress && fromToken && fromToken.address.toLowerCase() !== NATIVE_TOKEN_LIFI && (
                    <p className="note warn">
                      <LineIcon name="alert" size={16} />
                      <span>Two transactions: first an approval for the bridge contract, then the bridge itself. Both run one after the other when you press&nbsp;Bridge.</span>
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <Fade in={!!error}>
              {error && (
                <div className="note loss msg-note" role="alert">
                  <LineIcon name="alert" size={16} />
                  <div>
                    <strong>Bridge error</strong>
                    <p>{error}</p>
                  </div>
                  <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setError(null)}>
                    <LineIcon name="x" size={15} />
                  </button>
                </div>
              )}
            </Fade>

            <Fade in={!!bridgeResult}>
              {bridgeResult && (
                <div className={`note msg-note ${bridgeFailed ? "loss" : "gain"}`} role="status">
                  {bridgeDone ? <LineIcon name="check" size={16} /> : bridgeFailed ? <LineIcon name="alert" size={16} /> : <span className="spin" aria-hidden="true" />}
                  <div>
                    <strong>{bridgeDone ? "Bridge complete" : bridgeFailed ? "Bridge failed" : "Bridge in progress"}</strong>
                    <p>
                      {bridgeStatus?.substatusMessage ??
                        (bridgeDone
                          ? "The tokens have arrived on the destination chain."
                          : bridgeFailed
                            ? "The bridge transaction failed. Your funds may be returned."
                            : `Bridging via ${bridgeResult.bridge}. About ${Math.ceil(bridgeResult.estimatedTime / 60)} min.`)}
                    </p>
                    {bridgeResult.txHash && (
                      <a className="tx-link" href={`${fromChainConfig?.explorer ?? "https://etherscan.io"}/tx/${bridgeResult.txHash}`} target="_blank" rel="noopener noreferrer">
                        Sent on {fromChainConfig?.name} <LineIcon name="arrow-up-right" size={13} />
                      </a>
                    )}
                    {bridgeStatus?.receiving?.txHash && (
                      <a className="tx-link" href={`${toChainConfig?.explorer ?? "https://etherscan.io"}/tx/${bridgeStatus.receiving.txHash}`} target="_blank" rel="noopener noreferrer">
                        Received on {toChainConfig?.name} <LineIcon name="arrow-up-right" size={13} />
                      </a>
                    )}
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Dismiss"
                    onClick={() => {
                      setBridgeResult(null);
                      setBridgeStatus(null);
                      pollCancelledRef.current = true;
                      if (pollRef.current) clearInterval(pollRef.current);
                    }}
                  >
                    <LineIcon name="x" size={15} />
                  </button>
                </div>
              )}
            </Fade>

            <div className="ticket-actions">
              <button type="button" className="btn" onClick={handleGetQuote} disabled={quoteLoading || !fromToken || !toToken || parsedAmountWei === null}>
                {quoteLoading ? (
                  <>
                    <span className="spin" aria-hidden="true" />
                    Getting quote…
                  </>
                ) : activeQuote ? (
                  "Refresh quote"
                ) : (
                  "Get quote"
                )}
              </button>
              {quoteIsCurrent && quoteExpired ? (
                <button type="button" className="btn btn--primary" onClick={handleGetQuote} disabled={quoteLoading || parsedAmountWei === null}>
                  Quote expired, refresh
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleBridge}
                  disabled={bridgeLoading || !activeQuote || quoteExpired || parsedAmountWei === null}
                >
                  {bridgeLoading ? (
                    <>
                      <span className="spin" aria-hidden="true" />
                      Bridging…
                    </>
                  ) : (
                    "Bridge"
                  )}
                </button>
              )}
            </div>
          </Panel>

          <Panel className="span-5" flush index={2} title={`On ${fromChainConfig?.name ?? "this chain"}`} sub="Tap a token to send it">
            {walletAssetsLoading ? (
              <div className="wal-pad" style={{ display: "grid", gap: 12 }}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} height={48} />
                ))}
              </div>
            ) : walletAssets.length === 0 ? (
              <Empty icon="wallet" title="Nothing here" text={`You hold no tokens on ${fromChainConfig?.name ?? "this chain"}. Pick another source network.`} />
            ) : (
              <ul className="rows wal-pad">
                {walletAssets.map((asset, i) => {
                  const on =
                    fromToken != null &&
                    (fromToken.address.toLowerCase() === asset.address.toLowerCase() ||
                      fromToken.symbol.toLowerCase() === asset.symbol.toLowerCase());
                  return (
                    <li key={`${asset.address}-${i}`}>
                      <button type="button" className={`row${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => handleSelectWalletAsset(asset)}>
                        <TokenLogo symbol={asset.symbol} size={34} logoURI={fromTokens.find((t) => t.address.toLowerCase() === asset.address.toLowerCase())?.logoURI} />
                        <div style={{ minWidth: 0 }}>
                          <div className="t">{asset.symbol}</div>
                          <div className="sub num">{parseFloat(asset.balance).toLocaleString("en-US", { maximumFractionDigits: 6 })}</div>
                        </div>
                        <div className="end num">{parseFloat(asset.balanceUsd) > 0 ? `$${parseFloat(asset.balanceUsd).toFixed(2)}` : ""}</div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
