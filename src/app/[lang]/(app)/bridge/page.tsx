"use client";

/**
 * Bridge: a ticket (from, to, quote) beside the assets on the source chain.
 * The Confidential tab hands over to the NEAR Intents panel.
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CHAINS } from "@/lib/chains";
import { bridgeCost, formatCostShare, type BridgeCost } from "@/lib/bridge/cost";
import { BRIDGE_REFUSED_CODE } from "@/lib/bridge/safety";
import { knownDecimals } from "@/lib/wallet/amount-guards";
import { searchTokens } from "@/lib/token-search";
import { Fade } from "@/components/motion";
import { TokenIcon } from "@/components/token-icon";
import { useFormat, useT } from "@/i18n/client";
import { displayToken } from "@/lib/tokens/display";
import { formatUnits } from "viem";
import { GasStationModal } from "@/components/gas-station-modal";
import { LineIcon } from "@/components/line-icon";
import { Empty, PageHead, Panel, PillTabs, Picker, PickRow, Skeleton } from "@/components/premium";
import type { GasStationConfirming } from "@/lib/okx/types";
import { AnimatePresence, motion } from "motion/react";
import { ConfidentialPanel } from "./confidential-panel";
import { isStaleQuote, sendStateCode } from "@/lib/api/send-state";

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

const NO_BRIDGE_TOKENS: BridgeTokenInfo[] = [];
const NO_WALLET_ASSETS: WalletToken[] = [];

interface QuoteData {
  tool: string;
  /** LI.FI's name for the bridge ("Stargate"), for display. */
  toolName?: string;
  toAmount: string;
  toAmountMin: string;
  toToken: BridgeTokenInfo;
  fromToken: BridgeTokenInfo;
  executionDuration: number;
  quoteId: string;
  /** USD value of the amount sent, when LI.FI prices it. */
  fromAmountUSD?: string;
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

/** Logs the backend detail; the user gets `message` (the page's generic error). */
function mapBackendError(detail: unknown, message: string): string {
  console.error(detail);
  return message;
}

/** A base-unit amount as a full-precision decimal string, for display only. */
function unitsToDecimal(raw: string | null | undefined, decimals: number): string | null {
  const d = Number(decimals);
  if (typeof raw !== "string" || !/^\d+$/.test(raw) || !Number.isInteger(d) || d < 0) return null;
  return formatUnits(BigInt(raw), d);
}

/** Names people know for LI.FI's bridge keys, when the quote has no name. */
const TOOL_NAMES: Record<string, string> = {
  stargatev2: "Stargate",
  stargatev2bus: "Stargate",
  cbridge: "cBridge",
};

/** "stargateV2" → "Stargate", "across" → "Across", "someTool" → "Some Tool". */
function toolLabel(key: string): string {
  const known = TOOL_NAMES[key.toLowerCase()];
  if (known) return known;
  const words = key.replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "LI.FI";
}

/** "About 40 s", "About 3 min", "About 2 h" as a dictionary key and count; null when not given. */
function duration(seconds: number | null | undefined): { key: "aboutSeconds" | "aboutMinutes" | "aboutHours"; count: number } | null {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return null;
  if (s < 60) return { key: "aboutSeconds", count: Math.max(1, Math.round(s)) };
  const min = Math.ceil(s / 60);
  if (min < 90) return { key: "aboutMinutes", count: min };
  return { key: "aboutHours", count: Math.round(min / 60) };
}

const LIFI_NATIVE = new Set([NATIVE_TOKEN_LIFI, "0x0000000000000000000000000000000000000000"]);

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
  chainIndex,
}: {
  tokens: BridgeTokenInfo[];
  selected: BridgeTokenInfo | null;
  onSelect: (t: BridgeTokenInfo) => void;
  loading: boolean;
  title: string;
  chainIndex: number;
}) {
  const t = useT("bridge");
  const f = useFormat();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  // Exact symbol first, then symbols that start with the query, then the rest
  // (see lib/token-search). A pasted contract address matches too.
  const filtered = query ? searchTokens(tokens, query) : tokens.slice(0, 50);
  const show = (tok: BridgeTokenInfo) => displayToken({ symbol: tok.symbol, name: tok.name, address: tok.address, chainIndex });
  const selectedDisplay = selected ? show(selected) : null;

  return (
    <>
      <button
        type="button"
        className={`tok-btn${selected ? "" : " empty"}`}
        onClick={() => setOpen(true)}
        disabled={loading}
        aria-haspopup="dialog"
        aria-label={selectedDisplay ? t("changeToken", { title, symbol: selectedDisplay.symbol }) : title}
      >
        {loading ? (
          <span>{t("loading")}</span>
        ) : selected && selectedDisplay ? (
          <>
            <TokenIcon symbol={selectedDisplay.symbol} size={26} chainIndex={chainIndex} logoUrl={selected.logoURI} />
            <span>{selectedDisplay.symbol}</span>
          </>
        ) : (
          <span>{t("selectToken")}</span>
        )}
        <LineIcon name="chevron-down" size={15} />
      </button>
      <Picker open={open} onClose={close} title={title} query={query} onQuery={setQuery} placeholder={t("searchToken")}>
        {filtered.length === 0 && <p className="picker-hint">{t("noTokens")}</p>}
        {filtered.map((tok, i) => {
          const d = show(tok);
          return (
            <PickRow
              key={`${tok.address}-${i}`}
              icon={<TokenIcon symbol={d.symbol} size={34} chainIndex={chainIndex} logoUrl={tok.logoURI} />}
              title={d.symbol}
              sub={d.name !== d.symbol ? d.name : undefined}
              end={tok.priceUSD && parseFloat(tok.priceUSD) > 0 ? <span className="num">{f.price(tok.priceUSD)}</span> : undefined}
              selected={selected?.address.toLowerCase() === tok.address.toLowerCase()}
              onPick={() => {
                onSelect(tok);
                close();
              }}
            />
          );
        })}
      </Picker>
    </>
  );
}

export default function BridgePage() {
  const t = useT("bridge");
  const f = useFormat();
  const { authenticated, walletAddress } = useAuth();
  const [mode, setMode] = useState<"standard" | "confidential">("standard");
  const [fromChainIndex, setFromChainIndex] = useState(1);
  const [toChainIndex, setToChainIndex] = useState(42161);
  const [fromToken, setFromToken] = useState<BridgeTokenInfo | null>(null);
  const [toToken, setToToken] = useState<BridgeTokenInfo | null>(null);
  const [amount, setAmount] = useState("");
  // Token lists and wallet assets are stored with the chains they were fetched
  // for, so a chain switch never shows the old chain's tokens or balances and
  // a late answer for an old pair cannot overwrite the current one.
  const tokensKey = `${fromChainIndex}:${toChainIndex}`;
  const [tokenLists, setTokenLists] = useState<{ key: string; from: BridgeTokenInfo[]; to: BridgeTokenInfo[] } | null>(null);
  const fromTokens = tokenLists?.key === tokensKey ? tokenLists.from : NO_BRIDGE_TOKENS;
  const toTokens = tokenLists?.key === tokensKey ? tokenLists.to : NO_BRIDGE_TOKENS;
  const tokensLoading = tokenLists?.key !== tokensKey;
  const assetsChain = walletAddress ? CHAIN_LIST.find((c) => c.chainIndex === fromChainIndex)?.chainIndex ?? null : null;
  const assetsKey = assetsChain != null ? `${walletAddress}:${assetsChain}` : null;
  const [assetsFetch, setAssetsFetch] = useState<{ key: string; assets: WalletToken[] } | null>(null);
  const walletAssets = assetsKey != null && assetsFetch?.key === assetsKey ? assetsFetch.assets : NO_WALLET_ASSETS;
  const walletAssetsLoading = assetsKey != null && assetsFetch?.key !== assetsKey;
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [quoteKey, setQuoteKey] = useState<string | null>(null);
  const [quoteReceivedAt, setQuoteReceivedAt] = useState<number | null>(null);
  // Holds the quoteReceivedAt whose 60 s ran out; a newer quote has a newer
  // timestamp, so it starts fresh without any reset.
  const [expiredQuoteAt, setExpiredQuoteAt] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [bridgeResult, setBridgeResult] = useState<BridgeResult | null>(null);
  // LI.FI's name for the bridge of the last sent quote, for the progress note.
  const [bridgeToolName, setBridgeToolName] = useState<string | null>(null);
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
  // Async quote handlers compare against this to drop answers for old inputs.
  // Written in a layout effect: refs must not change during render, and the
  // layout effect runs in the same commit, before any later answer arrives.
  useLayoutEffect(() => {
    currentKeyRef.current = liveQuoteKey;
  }, [liveQuoteKey]);

  const parsedAmountWei = fromToken ? toWei(amount, fromToken.decimals) : null;
  const invalidAmount = amount.trim() !== "" && parsedAmountWei === null;

  const quoteExpired = quote != null && quoteReceivedAt != null && expiredQuoteAt === quoteReceivedAt;

  const clearQuote = useCallback(() => {
    setQuote(null);
    setQuoteKey(null);
    setQuoteReceivedAt(null);
  }, []);

  // Fetch wallet balances for the source chain
  useEffect(() => {
    if (assetsKey == null || assetsChain == null) return;
    (async () => {
      try {
        const res = await fetch(`/api/wallet/balances?chain=${assetsChain}`);
        const data = await res.json();
        const raw = data.data;
        const tokenList = raw?.details?.[0]?.tokenAssets ?? raw?.tokenAssets ?? (Array.isArray(raw) ? raw : []);
        const nativeDecimals = CHAIN_LIST.find((c) => c.chainIndex === assetsChain)?.nativeDecimals;
        const assets: WalletToken[] = [];
        for (const t of tokenList) {
          const bal = parseFloat(t.balance ?? t.holdingAmount ?? "0");
          if (bal <= 0) continue;
          const contract = t.tokenAddress || t.tokenContractAddress;
          // Never guess decimals (a wrong value scales the amount and the
          // approval): a token without them is left out of the list. The
          // native coin may use the chain's own.
          const isNative = !contract || String(contract).toLowerCase() === NATIVE_TOKEN_LIFI;
          const decimals = knownDecimals(t.decimal ?? t.decimals, isNative ? nativeDecimals : null);
          if (decimals == null) {
            console.warn("[bridge] skipped a wallet token without known decimals", contract);
            continue;
          }
          assets.push({
            symbol: t.symbol ?? t.tokenSymbol ?? "?",
            address: contract || "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            decimals,
            balance: t.balance ?? t.holdingAmount ?? "0",
            balanceUsd: t.usdValue ? String(t.usdValue) : t.tokenPrice ? String(bal * parseFloat(t.tokenPrice)) : "0",
          });
        }
        assets.sort((a, b) => parseFloat(b.balanceUsd) - parseFloat(a.balanceUsd));
        setAssetsFetch({ key: assetsKey, assets });
      } catch {
        setAssetsFetch({ key: assetsKey, assets: [] });
      }
    })();
  }, [assetsKey, assetsChain]);

  // Fetch LI.FI tokens for both chains. Clearing the picked tokens and the
  // quote happens in the chain handlers below, where the change is made.
  useEffect(() => {
    const key = `${fromChainIndex}:${toChainIndex}`;
    (async () => {
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
          setTokenLists({ key, from: srcTokens, to: dstTokens });
        } else {
          setTokenLists({ key, from: [], to: [] });
        }
      } catch {
        setTokenLists({ key, from: [], to: [] });
      }
    })();
  }, [fromChainIndex, toChainIndex]);

  // Cleanup poll and in-flight quote on unmount
  useEffect(() => {
    return () => {
      pollCancelledRef.current = true;
      if (pollRef.current) clearInterval(pollRef.current);
      quoteAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!quote || quoteReceivedAt == null) return;
    const remaining = 60_000 - (Date.now() - quoteReceivedAt);
    const id = window.setTimeout(() => setExpiredQuoteAt(quoteReceivedAt), Math.max(0, remaining));
    return () => window.clearTimeout(id);
  }, [quote, quoteReceivedAt]);

  // When the source chain changes and equals the destination, swap them.
  // A real chain change means new token lists, so the picked tokens no longer
  // apply. (Flipping keeps them, swapped, since each still belongs to its chain.)
  const handleFromChainChange = (chainIndex: number) => {
    if (chainIndex === toChainIndex) {
      setToChainIndex(fromChainIndex);
    }
    setFromChainIndex(chainIndex);
    if (chainIndex !== fromChainIndex) {
      setFromToken(null);
      setToToken(null);
    }
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
    if (chainIndex !== toChainIndex) {
      setFromToken(null);
      setToToken(null);
    }
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
      setError(t("invalidAmount"));
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
          tool: q.tool ?? q.toolDetails?.name ?? t("unknown"),
          toolName: typeof q.toolDetails?.name === "string" && q.toolDetails.name ? q.toolDetails.name : undefined,
          toAmount: q.estimate?.toAmount ?? "0",
          toAmountMin: q.estimate?.toAmountMin ?? "0",
          toToken: q.action?.toToken ?? toToken,
          fromToken: q.action?.fromToken ?? fromToken,
          executionDuration: q.estimate?.executionDuration ?? 0,
          quoteId: readQuoteId(q),
          approvalAddress: q.estimate?.approvalAddress,
          feeCosts: q.estimate?.feeCosts ?? [],
          gasCosts: q.estimate?.gasCosts ?? [],
          fromAmountUSD: q.estimate?.fromAmountUSD,
        });
        setQuoteKey(requestKey);
        setQuoteReceivedAt(Date.now());
      } else {
        setError(mapBackendError(data.error || "Failed to get bridge quote", t("genericError")));
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      if (currentKeyRef.current !== requestKey) return;
      setError(mapBackendError(e, t("genericError")));
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
      setError(t("invalidAmount"));
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
      // Refused before signing (unknown contract, loose minimum, security
      // scan): the server's reason is written for the user, show it as is.
      if (sendStateCode(data) || (data.code === BRIDGE_REFUSED_CODE && typeof data.error === "string")) {
        setError(data.error);
        return;
      }
      if (isStaleQuote(data)) {
        skipClearQuoteErrorRef.current = true;
        clearQuote();
        setError(t("staleQuote"));
        void handleGetQuote();
        return;
      }
      if (data.success && data.data) {
        const result = data.data as BridgeResult;
        setBridgeResult(result);
        setBridgeToolName(quote.toolName ?? null);
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
        setError(mapBackendError(data.error || "Bridge execution failed", t("genericError")));
      }
    } catch (e) {
      setError(mapBackendError(e, t("genericError")));
    } finally {
      setBridgeLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="page">
        <Empty icon="bridge" title={t("signInTitle")} text={t("signInText")} />
      </div>
    );
  }

  const fromChainConfig = CHAIN_LIST.find((c) => c.chainIndex === fromChainIndex);
  const toChainConfig = CHAIN_LIST.find((c) => c.chainIndex === toChainIndex);

  const quoteIsCurrent = quote !== null && quoteKey === liveQuoteKey;
  const activeQuote = quoteIsCurrent ? quote : null;

  // Display only, at full precision (nothing here is sent with the bridge).
  const quoteReceiveAmount =
    activeQuote && activeQuote.toToken
      ? unitsToDecimal(activeQuote.toAmount, activeQuote.toToken.decimals)
      : null;

  const quoteMinAmount =
    activeQuote && activeQuote.toToken
      ? unitsToDecimal(activeQuote.toAmountMin, activeQuote.toToken.decimals)
      : null;

  const quoteCost = activeQuote
    ? bridgeCost(activeQuote.feeCosts, activeQuote.gasCosts, activeQuote.fromAmountUSD)
    : null;
  // formatCostShare decides whether the share is shown (1% or more); the figure is in the page's language.
  const costPct = quoteCost?.shareOfAmount != null ? quoteCost.shareOfAmount * 100 : null;
  const quoteCostShare =
    quoteCost && costPct != null && formatCostShare(quoteCost) ? f.percent(costPct, { decimals: costPct < 10 ? 1 : 0 }) : null;

  // The "Fees and gas" figure, as formatBridgeCost (lib/bridge/cost) words it, in the page's language.
  const costText = (cost: BridgeCost): string => {
    if (cost.usd == null) return t("costNotGiven");
    if (cost.usd >= 0.01) {
      const dollars = f.usd(cost.usd);
      return cost.partial ? t("costAtLeast", { amount: dollars }) : dollars;
    }
    if (cost.partial) return t("costNotFullyPriced");
    return cost.usd > 0 ? t("costLessThan", { amount: f.usd(0.01) }) : f.usd(0);
  };

  const durationText = (seconds: number | null | undefined): string | null => {
    const d = duration(seconds);
    return d ? t(d.key, { count: d.count }) : null;
  };

  const estimatedTime = activeQuote ? durationText(activeQuote.executionDuration) : null;

  // Find the selected fromToken's wallet balance
  const selectedAssetBalance = fromToken
    ? walletAssets.find(
        (a) =>
          a.address.toLowerCase() === fromToken.address.toLowerCase() ||
          a.symbol.toLowerCase() === fromToken.symbol.toLowerCase()
      )
    : null;

  const fromSymbol = fromToken
    ? displayToken({ symbol: fromToken.symbol, address: fromToken.address, chainIndex: fromChainIndex }).symbol
    : "";
  const toSymbol = toToken
    ? displayToken({ symbol: toToken.symbol, address: toToken.address, chainIndex: toChainIndex }).symbol
    : "";
  const quoteToSymbol = activeQuote?.toToken
    ? displayToken({ symbol: activeQuote.toToken.symbol, address: activeQuote.toToken.address, chainIndex: toChainIndex }).symbol
    : toSymbol;
  const resultTime = bridgeResult ? durationText(bridgeResult.estimatedTime) : null;
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
        title={t("title")}
        lede={mode === "confidential" ? t("ledeConfidential") : t("ledeStandard")}
      />

      <PillTabs
        id="bridge-mode"
        label={t("modeLabel")}
        value={mode}
        onChange={setMode}
        options={[
          { value: "standard", label: t("modeStandard") },
          {
            value: "confidential",
            label: (
              <>
                <LineIcon name="lock" size={14} />
                {t("modeConfidential")}
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
                  label={t("fromNetwork")}
                  value={fromChainIndex}
                  onChange={handleFromChainChange}
                  excludeChainIndex={toChainIndex}
                />
                {selectedAssetBalance && (
                  <span className="leg-bal">
                    <span className="num">{f.amount(selectedAssetBalance.balance)}</span> {t("available")}
                    <button type="button" className="max" onClick={handleMaxBalance}>
                      {t("max")}
                    </button>
                  </span>
                )}
              </div>
              <div className="leg-main">
                <label htmlFor="bridge-amount" className="sr-only">
                  {t("amountToSend")}
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
                  title={t("sendFrom", { chain: fromChainConfig?.name ?? t("sourceChain") })}
                  chainIndex={fromChainIndex}
                />
              </div>
              <div className="leg-foot">
                {invalidAmount ? (
                  <span className="err" role="alert">
                    {t("invalidAmount")}
                  </span>
                ) : (
                  <span className="num">{payUsd != null ? f.usd(payUsd) : " "}</span>
                )}
              </div>
            </div>

            <div className="flip-wrap">
              <button type="button" className="flip" onClick={handleSwapChains} aria-label={t("flipChains")}>
                <LineIcon name="swap" size={18} />
              </button>
            </div>

            {/* to */}
            <div className="leg">
              <div className="leg-top">
                <ChainSelect
                  id="bridge-to"
                  label={t("toNetwork")}
                  value={toChainIndex}
                  onChange={handleToChainChange}
                  excludeChainIndex={fromChainIndex}
                />
                {walletAddress && (
                  <span className="leg-bal">
                    {t("to")} <span className="num">{abbreviateAddress(walletAddress).replace("...", "…")}</span>
                  </span>
                )}
              </div>
              <div className="leg-main">
                <output className={`amount-out${quoteReceiveAmount ? "" : " muted"}`} aria-live="polite">
                  {activeQuote && quoteReceiveAmount ? f.amount(quoteReceiveAmount) : "0"}
                  {quoteLoading && <span className="spin" aria-label={t("gettingQuoteAria")} />}
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
                  title={t("receiveOn", { chain: toChainConfig?.name ?? t("destinationChain") })}
                  chainIndex={toChainIndex}
                />
              </div>
              <div className="leg-foot">
                <span className="num">{receiveUsd != null ? f.usd(receiveUsd) : " "}</span>
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
                        <dt>{t("minimumReceived")}</dt>
                        <dd className="num">
                          {f.amount(quoteMinAmount)} {quoteToSymbol}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>{t("bridgeLabel")}</dt>
                      <dd>{activeQuote.toolName ?? toolLabel(activeQuote.tool)}</dd>
                    </div>
                    {fromToken && toToken && fromSymbol !== toSymbol && (
                      <div>
                        <dt>{t("route")}</dt>
                        <dd>{t("routeValue", { from: fromSymbol, to: toSymbol })}</dd>
                      </div>
                    )}
                    <div>
                      <dt>{t("estimatedTime")}</dt>
                      <dd>{estimatedTime ?? t("unknown")}</dd>
                    </div>
                    <div>
                      <dt>{t("feesAndGas")}</dt>
                      <dd className="num">
                        {quoteCost ? costText(quoteCost) : t("costNotGiven")}
                        {quoteCostShare && <span className="text-warn-ink">{t("costShare", { share: quoteCostShare })}</span>}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("arrivesAt")}</dt>
                      <dd className="num" title={walletAddress ?? undefined}>
                        {t("arrivesAtValue", {
                          address: walletAddress ? abbreviateAddress(walletAddress).replace("...", "…") : t("unknown"),
                          chain: toChainConfig?.name ?? t("destination"),
                        })}
                      </dd>
                    </div>
                  </dl>
                  {activeQuote.approvalAddress && fromToken && fromToken.address.toLowerCase() !== NATIVE_TOKEN_LIFI && (
                    <p className="note warn">
                      <LineIcon name="alert" size={16} />
                      <span>{t("approvalNote")}</span>
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
                    <strong>{t("errorTitle")}</strong>
                    <p>{error}</p>
                  </div>
                  <button type="button" className="icon-btn" aria-label={t("dismiss")} onClick={() => setError(null)}>
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
                    <strong>{bridgeDone ? t("doneTitle") : bridgeFailed ? t("failedTitle") : t("progressTitle")}</strong>
                    <p>
                      {bridgeDone
                        ? t("doneText")
                        : bridgeFailed
                          ? t("failedText")
                          : `${t("progressText", { tool: bridgeToolName ?? toolLabel(bridgeResult.bridge) })}${resultTime ? ` ${resultTime}.` : ""}`}
                    </p>
                    {bridgeStatus?.substatusMessage && <p className="muted">{bridgeStatus.substatusMessage}</p>}
                    {bridgeResult.txHash && (
                      <a className="tx-link" href={`${fromChainConfig?.explorer ?? "https://etherscan.io"}/tx/${bridgeResult.txHash}`} target="_blank" rel="noopener noreferrer">
                        {t("sentOn", { chain: fromChainConfig?.name ?? "" })} <LineIcon name="arrow-up-right" size={13} />
                      </a>
                    )}
                    {bridgeStatus?.receiving?.txHash && (
                      <a className="tx-link" href={`${toChainConfig?.explorer ?? "https://etherscan.io"}/tx/${bridgeStatus.receiving.txHash}`} target="_blank" rel="noopener noreferrer">
                        {t("receivedOn", { chain: toChainConfig?.name ?? "" })} <LineIcon name="arrow-up-right" size={13} />
                      </a>
                    )}
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t("dismiss")}
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
                    {t("gettingQuote")}
                  </>
                ) : activeQuote ? (
                  t("refreshQuote")
                ) : (
                  t("getQuote")
                )}
              </button>
              {quoteIsCurrent && quoteExpired ? (
                <button type="button" className="btn btn--primary" onClick={handleGetQuote} disabled={quoteLoading || parsedAmountWei === null}>
                  {t("quoteExpired")}
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
                      {t("bridging")}
                    </>
                  ) : (
                    t("bridgeAction")
                  )}
                </button>
              )}
            </div>
          </Panel>

          <Panel className="span-5" flush index={2} title={t("onChain", { chain: fromChainConfig?.name ?? t("thisChain") })} sub={t("assetsSub")}>
            {walletAssetsLoading ? (
              <div className="wal-pad" style={{ display: "grid", gap: 12 }}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} height={48} />
                ))}
              </div>
            ) : walletAssets.length === 0 ? (
              <Empty icon="wallet" title={t("nothingTitle")} text={t("nothingText", { chain: fromChainConfig?.name ?? t("thisChain") })} />
            ) : (
              <ul className="rows wal-pad">
                {walletAssets.map((asset, i) => {
                  const on =
                    fromToken != null &&
                    (fromToken.address.toLowerCase() === asset.address.toLowerCase() ||
                      fromToken.symbol.toLowerCase() === asset.symbol.toLowerCase());
                  // OKX's own symbols ("ARB_ETH") shown as people know them; natives
                  // find LI.FI's logo under its native address.
                  const d = displayToken({ symbol: asset.symbol, address: asset.address, chainIndex: fromChainIndex });
                  const assetAddr = asset.address.toLowerCase();
                  const lifiLogo = fromTokens.find((t) =>
                    d.isNative ? LIFI_NATIVE.has(t.address.toLowerCase()) : t.address.toLowerCase() === assetAddr
                  )?.logoURI;
                  return (
                    <li key={`${asset.address}-${i}`}>
                      <button type="button" className={`row${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => handleSelectWalletAsset(asset)}>
                        <TokenIcon symbol={d.symbol} size={34} chainIndex={fromChainIndex} logoUrl={lifiLogo} />
                        <div style={{ minWidth: 0 }}>
                          <div className="t">{d.symbol}</div>
                          <div className="sub num">{f.amount(asset.balance)}</div>
                        </div>
                        <div className="end num">{parseFloat(asset.balanceUsd) > 0 ? f.usd(asset.balanceUsd) : ""}</div>
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
