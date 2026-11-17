"use client";

/**
 * Swap: one ticket (pay, receive, quote) beside what is trending on the
 * chain. Settings fold away behind the slippage chip; tokens are chosen in a
 * searchable picker instead of an inline dropdown.
 */

import { toEnglishApiMessage } from "@/i18n/api-messages";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { CHAINS } from "@/lib/chains";
import { TokenIcon } from "@/components/token-icon";
import { Fade } from "@/components/motion";
import { MISSING } from "@/lib/format";
import { displayToken } from "@/lib/tokens/display";
import { GasStationModal } from "@/components/gas-station-modal";
import { LineIcon } from "@/components/line-icon";
import { Change, Empty, PageHead, Panel, Picker, PickRow, Segmented, Skeleton } from "@/components/premium";
import type { GasStationConfirming } from "@/lib/okx/types";
import { motion, AnimatePresence } from "motion/react";
import { isStaleQuote, sendStateCode } from "@/lib/api/send-state";
import { exceedsSpendable, gasReserve, knownDecimals } from "@/lib/wallet/amount-guards";
import { useFormat, useT } from "@/i18n/client";

type SwapT = ReturnType<typeof useT<"swap">>;


const NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

interface TokenInfo {
  symbol: string;
  address: string;
  decimals: number;
  /** Logo URL from OKX, for display only. */
  logo?: string;
}

interface TokenSearchResult {
  tokenSymbol?: string;
  tokenContractAddress?: string;
  decimal?: string | number;
  tokenName?: string;
  tokenFullName?: string;
  tokenLogoUrl?: string;
  chainIndex?: string | number;
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

const NO_WALLET_TOKENS: WalletToken[] = [];
const NO_SEARCH_RESULTS: TokenSearchResult[] = [];

/** The chain's own coin, with the chain's nativeDecimals; null for a chain we do not list. */
function getNativeToken(chain: string): TokenInfo | null {
  const chainConfig = Object.values(CHAINS).find((c) => c.swapName === chain);
  if (!chainConfig) return null;
  return {
    symbol: chainConfig.nativeSymbol,
    address: NATIVE_TOKEN,
    decimals: chainConfig.nativeDecimals,
  };
}

/**
 * A search result as a pickable token, or null when its decimals are not
 * given: a guessed 18 would scale the amount and the approval by a wrong
 * power of ten. The native coin may use the chain's nativeDecimals.
 */
function parseTokenResult(t: TokenSearchResult, chain: string): TokenInfo | null {
  const address = t.tokenContractAddress || t.address || "";
  const native = address.toLowerCase() === NATIVE_TOKEN;
  const decimals = knownDecimals(t.decimal ?? t.decimals, native ? getNativeToken(chain)?.decimals : null);
  if (decimals == null) return null;
  return {
    symbol: t.tokenSymbol ?? t.symbol ?? "",
    address,
    decimals,
    logo: t.tokenLogoUrl || undefined,
  };
}

/** Symbol and plain name of a search result, as people know them. */
function searchResultDisplay(t: TokenSearchResult, chainIndex: number | null) {
  return displayToken({
    symbol: t.tokenSymbol ?? t.symbol,
    name: t.tokenName ?? t.tokenFullName ?? t.name,
    address: t.tokenContractAddress || t.address,
    chainIndex: t.chainIndex || chainIndex,
  });
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

/**
 * The share of value a quote loses to price impact, in percent. OKX signs
 * it: a loss is negative ("-28.26" for a huge trade, checked 2026-11-17), a
 * slightly better than market fill is a small positive number. Checking the
 * signed value let a 28% loss through with no warning.
 */
function impactLoss(impact: number | null): number | null {
  return impact == null ? null : Math.max(0, -impact);
}

function clampSlippage(raw: string): string {
  // "0,3" is how an Italian keyboard writes 0.3: read it as that, not as
  // "not a number" (which used to fall back to 0.5 without a word).
  const n = Number(raw.trim().replace(",", "."));
  if (!Number.isFinite(n)) return "0.5";
  if (n < 0.1) return "0.1";
  if (n > 5) return "5";
  return String(n);
}

const QUOTE_TTL_MS = 30_000;

/** True once a quote is older than its TTL. Called from handlers, never during render. */
function quoteHasExpired(arrivedAt: number): boolean {
  return Date.now() - arrivedAt >= QUOTE_TTL_MS;
}

/**
 * A raw error (server text, or an English fallback the page passes in) as a
 * title and an explanation in the page's language. The matching runs on the
 * raw English text, so the fallbacks handed to it stay in English.
 */
function friendlyError(raw: string, t: SwapT): { title: string; message: string } {
  // The server may have answered in Italian (i18n/api-messages): match on its English.
  const lower = toEnglishApiMessage(raw).toLowerCase();

  if (lower.includes("insufficient") || lower.includes("not enough") || lower.includes("balance"))
    return { title: t("errors.insufficient.title"), message: t("errors.insufficient.message") };

  if (lower.includes("slippage") || lower.includes("price movement") || lower.includes("price change"))
    return { title: t("errors.priceChanged.title"), message: t("errors.priceChanged.message") };

  if (lower.includes("liquidity") || lower.includes("no route") || lower.includes("no path"))
    return { title: t("errors.noLiquidity.title"), message: t("errors.noLiquidity.message") };

  if (lower.includes("allowance") || lower.includes("approve") || lower.includes("approval"))
    return { title: t("errors.approval.title"), message: t("errors.approval.message") };

  if (lower.includes("timeout") || lower.includes("timed out"))
    return { title: t("errors.timeout.title"), message: t("errors.timeout.message") };

  if (lower.includes("rate limit") || lower.includes("too many"))
    return { title: t("errors.rateLimit.title"), message: t("errors.rateLimit.message") };

  if (lower.includes("82112") || lower.includes("value difference") || lower.includes("risk of loss"))
    return { title: t("errors.extremeImpact.title"), message: t("errors.extremeImpact.message") };

  if (lower.includes("simulation failed") || lower.includes("execution reverted") || lower.includes("contract call fail"))
    return { title: t("errors.simulation.title"), message: t("errors.simulation.message") };

  if (lower.includes("region") || lower.includes("50125") || lower.includes("80001"))
    return { title: t("errors.region.title"), message: t("errors.region.message") };

  if (lower.includes("network") || lower.includes("fetch failed"))
    return { title: t("errors.network.title"), message: t("errors.network.message") };

  if (lower.includes("command execution failed"))
    return { title: t("errors.service.title"), message: t("errors.service.message") };

  console.error(raw);
  return { title: t("errors.generic.title"), message: t("errors.generic.message") };
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



function TokenSelector({
  side,
  token,
  onSelect,
  chain,
  walletTokens,
}: {
  /** Which side of the swap this picker is for (not shown: the labels are translated). */
  side: "From" | "To";
  token: TokenInfo | null;
  onSelect: (t: TokenInfo) => void;
  chain: string;
  walletTokens?: WalletToken[];
}) {
  const t = useT("swap");
  const f = useFormat();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // Results are stored with the query and chain they answer; until the answer
  // for what is typed now arrives, the picker reads "Searching…" (that covers
  // the 500 ms wait before the request too). Only the latest request may
  // store its answer, so a slow reply for an older query cannot replace it.
  const [found, setFound] = useState<{ q: string; chain: string; results: TokenSearchResult[] } | null>(null);
  const latestRequestRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answered = found != null && found.q === query && found.chain === chain;
  const results = answered ? found.results : NO_SEARCH_RESULTS;
  const searching = query.length > 0 && !answered;

  const search = useCallback(
    async (q: string) => {
      const request = `${chain}|${q}`;
      latestRequestRef.current = request;
      let list: TokenSearchResult[] = [];
      try {
        const res = await fetch(
          `/api/tokens/search?q=${encodeURIComponent(q)}&chain=${encodeURIComponent(chain)}`
        );
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) list = data.data;
        else if (data.success && data.data?.tokens) list = data.data.tokens;
      } catch {
        // A failed search shows "No tokens found" for this query.
      }
      // Tokens without known decimals are not offered (see parseTokenResult).
      list = list.filter((t) => {
        if (parseTokenResult(t, chain)) return true;
        console.warn("[swap] skipped a token without known decimals", t.tokenContractAddress || t.address);
        return false;
      });
      if (latestRequestRef.current === request) setFound({ q, chain, results: list });
    },
    [chain]
  );

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.length < 1) {
      latestRequestRef.current = "";
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

  // OKX's own symbols ("ARB_ETH", "USD₮0") are shown as people know them.
  const chainIndex = Object.values(CHAINS).find((c) => c.swapName === chain)?.chainIndex ?? null;
  const show = (t: { symbol: string; address: string }) => displayToken({ symbol: t.symbol, address: t.address, chainIndex });
  const tokenDisplay = token ? show(token) : null;

  return (
    <>
      <button
        type="button"
        className={`tok-btn${token ? "" : " empty"}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={
          tokenDisplay
            ? t(side === "From" ? "picker.payingWith" : "picker.receiving", { symbol: tokenDisplay.symbol })
            : side === "From"
              ? t("picker.choosePay")
              : t("picker.chooseReceive")
        }
      >
        {token && tokenDisplay ? (
          <>
            <TokenIcon symbol={tokenDisplay.symbol} size={26} chainIndex={chainIndex} logoUrl={token.logo} />
            <span>{tokenDisplay.symbol}</span>
          </>
        ) : (
          <span>{t("picker.selectToken")}</span>
        )}
        <LineIcon name="chevron-down" size={15} />
      </button>

      <Picker
        open={open}
        onClose={close}
        title={side === "From" ? t("picker.payWith") : t("picker.receive")}
        query={query}
        onQuery={setQuery}
        placeholder={t("picker.search")}
      >
        {query.length === 0 && (
          <>
            {walletTokens && walletTokens.length > 0 ? (
              <>
                <p className="picker-group">{t("picker.inWallet")}</p>
                {walletTokens.map((wt, i) => {
                  const d = show(wt);
                  return (
                    <PickRow
                      key={`wallet-${wt.address}-${i}`}
                      icon={<TokenIcon symbol={d.symbol} size={34} chainIndex={chainIndex} />}
                      title={d.symbol}
                      sub={<span className="num">{f.amount(wt.balance)}</span>}
                      end={parseFloat(wt.balanceUsd) > 0 ? <span className="num">{f.usd(wt.balanceUsd)}</span> : undefined}
                      selected={isSelected(wt.address)}
                      onPick={() => pick({ symbol: wt.symbol, address: wt.address, decimals: wt.decimals })}
                    />
                  );
                })}
              </>
            ) : (
              <p className="picker-hint">{t("picker.hint")}</p>
            )}
          </>
        )}
        {query.length > 0 && searching && (
          <p className="picker-hint">
            <span className="spin" aria-hidden="true" /> {t("picker.searching")}
          </p>
        )}
        {query.length > 0 && !searching && results.length === 0 && <p className="picker-hint">{t("picker.noResults")}</p>}
        {query.length > 0 &&
          !searching &&
          results.map((t, i) => {
            const parsed = parseTokenResult(t, chain);
            if (!parsed) return null;
            const d = searchResultDisplay(t, chainIndex);
            const bal = walletTokens?.find((w) => w.address.toLowerCase() === parsed.address.toLowerCase());
            return (
              <PickRow
                key={`${parsed.address}-${i}`}
                icon={<TokenIcon symbol={d.symbol} size={34} chainIndex={chainIndex} logoUrl={parsed.logo} />}
                title={d.symbol}
                sub={d.name !== d.symbol ? d.name : undefined}
                end={bal ? <span className="num">{f.amount(bal.balance)}</span> : undefined}
                selected={isSelected(parsed.address)}
                onPick={() => pick(parsed)}
              />
            );
          })}
      </Picker>
    </>
  );
}


export default function SwapPage() {
  const t = useT("swap");
  const f = useFormat();
  const { authenticated } = useAuth();
  const [chain, setChain] = useState("ethereum");
  const [fromToken, setFromToken] = useState<TokenInfo | null>(
    getNativeToken("ethereum")
  );
  const [toToken, setToToken] = useState<TokenInfo | null>(null);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<StoredQuote | null>(null);
  const [quoteStale, setQuoteStale] = useState(false);
  // The price-impact acceptance belongs to one quote: it is stored with that
  // quote's identity, so a fresh quote is never covered by an older OK.
  const [priceImpactAckFor, setPriceImpactAckFor] = useState<string | null>(null);
  const quoteIdentity = quote ? `${quote.key}@${quote.arrivedAt}` : null;
  const priceImpactAck = quoteIdentity != null && priceImpactAckFor === quoteIdentity;
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
  // Balances and trending tokens are stored with the chain they were fetched
  // for. While a new chain loads, nothing from the previous chain is shown
  // (a native-token balance from Arbitrum must never read as "available" on
  // Base), and a late answer for an old chain cannot overwrite the new one.
  // `failed`: the balances could not be read, so nothing is judged from them.
  const [walletFetch, setWalletFetch] = useState<{ chain: string; tokens: WalletToken[]; failed?: boolean } | null>(null);
  const balanceChainIndex = authenticated
    ? Object.values(CHAINS).find((c) => c.swapName === chain)?.chainIndex ?? null
    : null;
  const walletTokens = walletFetch && walletFetch.chain === chain ? walletFetch.tokens : NO_WALLET_TOKENS;
  const balanceLoading = balanceChainIndex != null && walletFetch?.chain !== chain;

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
  const [trendingFetch, setTrendingFetch] = useState<{ chain: string; tokens: TrendingToken[] } | null>(null);
  // Trending needs a session too: signed out, the page shows "Sign in first".
  const trendingChain = authenticated
    ? Object.values(CHAINS).find((c) => c.swapName === chain)?.swapName ?? null
    : null;
  const trendingTokens: TrendingToken[] = trendingFetch && trendingFetch.chain === chain ? trendingFetch.tokens : [];
  const trendingLoading = trendingChain != null && trendingFetch?.chain !== chain;

  // Fetch wallet balances when chain changes
  useEffect(() => {
    if (balanceChainIndex == null) return;
    fetch(`/api/wallet/balances?chain=${balanceChainIndex}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) {
          setWalletFetch({ chain, tokens: [], failed: true });
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = data.data as any;
        const assets: WalletToken[] = [];
        // Parse balance response — may be nested under details[].tokenAssets or flat array
        const tokenList =
          raw?.details?.[0]?.tokenAssets ??
          raw?.tokenAssets ??
          (Array.isArray(raw) ? raw : []);
        const nativeDecimals = getNativeToken(chain)?.decimals;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const t of tokenList as any[]) {
          const bal = parseFloat(t.balance ?? t.holdingAmount ?? "0");
          if (bal <= 0) continue;
          const contract = t.tokenAddress || t.tokenContractAddress;
          // Never guess decimals: a token without them is not offered.
          const isNative = !contract || String(contract).toLowerCase() === NATIVE_TOKEN;
          const decimals = knownDecimals(t.decimal ?? t.decimals, isNative ? nativeDecimals : null);
          if (decimals == null) {
            console.warn("[swap] skipped a wallet token without known decimals", contract);
            continue;
          }
          assets.push({
            symbol: t.symbol ?? t.tokenSymbol ?? "?",
            address: contract || NATIVE_TOKEN,
            decimals,
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
        setWalletFetch({ chain, tokens: assets });
      })
      .catch(() => setWalletFetch({ chain, tokens: [], failed: true }));
  }, [chain, balanceChainIndex]);

  // Fetch trending tokens on chain change
  useEffect(() => {
    if (trendingChain == null) return;
    fetch(`/api/tokens/trending?chain=${trendingChain}&timeFrame=4`)
      .then((r) => r.json())
      .then((data) => {
        // A failed answer shows nothing rather than another chain's tokens.
        setTrendingFetch({ chain, tokens: data.success && Array.isArray(data.data) ? data.data : [] });
      })
      .catch(() => setTrendingFetch({ chain, tokens: [] }));
  }, [chain, trendingChain]);

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
        const err = friendlyError(data.error || "Failed to get quote. Please try again.", t);
        setError({ type: "quote", ...err });
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError({ type: "quote", title: t("errors.network.title"), message: t("errors.network.message") });
    } finally {
      if (quoteAbortRef.current === ac) setQuoteLoading(false);
    }
  }, [fromToken, toToken, amount, chain, autoSlippage, slippage, t]);

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
        <Empty icon="swap" title={t("signInTitle")} text={t("signInText")} />
      </div>
    );
  }

  const amountWei =
    amount && fromToken ? (toWei(amount, fromToken.decimals) ?? "") : "";
  const amountInvalid = amount.trim() !== "" && !amountWei;
  const currentQuoteKey = quoteInputKey(fromToken, toToken, chain, amount);
  const liveQuote = quote && quote.key === currentQuoteKey ? quote : null;
  // The expiry timer above flips quoteStale when the TTL runs out; render only
  // reads that flag. handleSwap re-checks the clock itself, so a throttled
  // background tab whose timer fires late still cannot swap on a stale quote.
  const quoteExpired = liveQuote != null && quoteStale;
  const liveSlippage = clampSlippage(slippage);

  const handleSwap = async () => {
    if (!fromToken || !toToken) return;
    if (!amountWei) return;
    if (!liveQuote || liveQuote.key !== currentQuoteKey) return;
    if (quoteExpired) return;
    if (quoteHasExpired(liveQuote.arrivedAt)) {
      // Same as the expiry timer: mark it stale and fetch a fresh quote.
      setQuoteStale(true);
      void handleQuote();
      return;
    }
    const loss = impactLoss(parsePriceImpact(liveQuote.data));
    if (loss != null && loss > 10) return;
    if (loss != null && loss >= 3 && loss <= 10 && !priceImpactAck) return;
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
              title: t("approvalNotConfirmed.title"),
              message: t("approvalNotConfirmed.message"),
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
      const sendState = sendStateCode(data);
      if (sendState) {
        setError({ type: "swap", title: t(`sendState.${sendState}`), message: data.error });
        return;
      }
      if (isStaleQuote(data)) {
        skipClearQuoteErrorRef.current = true;
        setQuote(null);
        setError({
          type: "swap",
          title: t("priceMoved.title"),
          message: t("priceMoved.message"),
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
              ? t("result.confirming")
              : t("result.broadcast"))
            : t("result.submitted"),
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
        const err = friendlyError(data.error || "Swap failed. Please try again.", t);
        setError({ type: "swap", ...err });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Swap failed. Please try again.";
      const err = friendlyError(msg, t);
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
  // Display only, at full precision: cutting to 6 decimals turned small
  // amounts into "0". Nothing below is sent with the swap.
  const quoteReceiveAmount = quoteReceiveRaw
    ? fromWei(String(quoteReceiveRaw), toToken!.decimals)
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
      ? fromWei(minReceivedWei, toToken.decimals)
      : null;
  const livePriceImpact = liveQuote ? parsePriceImpact(liveQuote.data) : null;
  const liveImpactLoss = impactLoss(livePriceImpact);
  const priceImpactTooHigh = liveImpactLoss != null && liveImpactLoss > 10;
  const priceImpactNeedsAck = liveImpactLoss != null && liveImpactLoss >= 3 && liveImpactLoss <= 10;

  // Parse quote details for user-friendly display
  const quoteDetails = liveQuote
    ? (() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q = liveQuote.data as Record<string, any>;
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
                // 18 decimals so low-priced pairs do not read "= 0".
                const scale = 10n ** 18n;
                const fromDec = BigInt(fromToken.decimals);
                const toDec = BigInt(toToken.decimals);
                const adj = toWeiAmt * (10n ** fromDec) * scale / (fromWeiAmt * (10n ** toDec));
                return fromWei(adj.toString(), 18);
              })()
            : null;
        // DEX router info
        const dexProtocol = q.dexRouterList?.[0]?.dexProtocol;
        const dexName = dexProtocol?.dexName ?? q.dexName ?? null;
        return { priceImpact, tradeFee, rate, dexName, fromUnitPrice, toUnitPrice };
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
  const symbolOf = (t: TokenInfo | null) =>
    t ? displayToken({ symbol: t.symbol, address: t.address, chainIndex: chainConfig?.chainIndex }).symbol : "";
  const fromSymbol = symbolOf(fromToken);
  const toSymbol = symbolOf(toToken);
  // What the trade loses to price impact (0 when the fill beats the market).
  const impactSize = liveImpactLoss;
  // Above the balance (for the native coin, the balance less the gas
  // reserve), the swap can only fail, after the approval may already be
  // signed. Judged only from balances read for this chain; while they load,
  // or if they could not be read, nothing is blocked.
  const balancesKnown = walletFetch != null && walletFetch.chain === chain && !walletFetch.failed;
  const notEnough =
    balancesKnown &&
    fromToken != null &&
    !!amountWei &&
    exceedsSpendable(amount, fromBal?.balance ?? "0", {
      native: isNativeFrom,
      chainIndex: chainConfig?.chainIndex,
      decimals: fromToken.decimals,
    }) === true;
  const notEnoughLabel = fromSymbol && fromSymbol !== "?" ? t("notEnough", { symbol: fromSymbol }) : t("notEnoughBalance");

  const setMax = () => {
    if (!fromToken || !fromBal) return;
    if (!isNativeFrom) {
      setAmount(fromBal.balance);
      return;
    }
    // Keep a little of the native coin for gas (lib/wallet/amount-guards).
    const reserve = gasReserve(chainConfig?.chainIndex);
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
  // Slippage is shown as it is stored ("0.5", "1.0"), only with the language's decimal mark.
  const showSlippage = (value: string) => (f.locale === "it" ? value.replace(".", ",") : value);
  // Read here: the trending rows below call each token `t`.
  const tokenUnusable = t("tokenUnusable");
  const marketCapLabel = (value: string) => t("marketCap", { value });

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

      <PageHead title={t("title")} lede={t("lede")} />

      <div className={trendingVisible ? "bento" : "solo"}>
        <Panel className={trendingVisible ? "span-7 ticket" : "ticket"} index={1}>
          {/* network + settings */}
          <div className="ticket-head">
            <div className="select select--chip">
              <label htmlFor="swap-chain" className="sr-only">
                {t("network")}
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
              {autoSlippage ? t("slippageAutoChip") : t("slippageChip", { value: showSlippage(slippage) })}
              {mevProtection && mevAvailable && <span className="dot-on" aria-label={t("mevOn")} />}
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
                    <span>{t("slippage")}</span>
                    <span className="muted">{t("slippageHelp")}</span>
                  </div>
                  <div className="set-line">
                    <Segmented
                      id="slip"
                      label={t("slippage")}
                      value={autoSlippage ? "auto" : ["0.1", "0.5", "1.0", "2.0"].includes(slippage) ? slippage : null}
                      options={[
                        { value: "auto", label: t("auto") },
                        { value: "0.1", label: f.percent(0.1) },
                        { value: "0.5", label: f.percent(0.5) },
                        { value: "1.0", label: f.percent(1) },
                        { value: "2.0", label: f.percent(2) },
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
                      placeholder={t("customPlaceholder")}
                      aria-label={t("customLabel")}
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
                    <span>{t("gasPriority")}</span>
                    <span className="muted">
                      {gasLevel === "slow"
                        ? t("gasSlowHelp")
                        : gasLevel === "fast"
                          ? t("gasFastHelp")
                          : t("gasAverageHelp")}
                    </span>
                  </div>
                  <Segmented
                    id="gas"
                    label={t("gasPriority")}
                    value={gasLevel}
                    options={[
                      { value: "slow", label: t("gasSlow") },
                      { value: "average", label: t("gasAverage") },
                      { value: "fast", label: t("gasFast") },
                    ]}
                    onChange={setGasLevel}
                  />
                </div>

                <div className="set-block set-row">
                  <div className="set-label">
                    <span>{t("mev")}</span>
                    <span className="muted">
                      {mevAvailable
                        ? t("mevHelp")
                        : t("mevUnavailable", { chain: chainConfig?.name ?? chain })}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={mevProtection && mevAvailable}
                    aria-label={t("mev")}
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
              <label htmlFor="swap-amount">{t("youPay")}</label>
              {fromToken && (
                <span className="leg-bal">
                  {fromBal ? (
                    <>
                      {t.node("available", { num: (s) => <span className="num">{s}</span> }, { amount: f.amount(fromBal.balance) })}
                      {parseFloat(fromBal.balance) > 0 && (
                        <button type="button" className="max" onClick={setMax}>
                          {t("max")}
                        </button>
                      )}
                    </>
                  ) : balanceLoading ? (
                    t("checkingBalance")
                  ) : (
                    t("noneInWallet")
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
              <TokenSelector side="From" token={fromToken} onSelect={setFromToken} chain={chain} walletTokens={walletTokens} />
            </div>
            <div className="leg-foot">
              {amountInvalid ? (
                <span className="err" role="alert">
                  {t("invalidAmount")}
                </span>
              ) : (
                <span className="num">{payUsd != null ? f.usd(payUsd) : " "}</span>
              )}
            </div>
          </div>

          <div className="flip-wrap">
            <button type="button" className="flip" onClick={flip} disabled={!toToken} aria-label={t("flip")}>
              <LineIcon name="arrow-down" size={18} />
            </button>
          </div>

          {/* receive */}
          <div className="leg">
            <div className="leg-top">
              <span>{t("youReceive")}</span>
              {toBal && (
                <span className="leg-bal">
                  {t.node("held", { num: (s) => <span className="num">{s}</span> }, { amount: f.amount(toBal.balance) })}
                </span>
              )}
            </div>
            <div className="leg-main">
              <output className={`amount-out${quoteReceiveAmount ? "" : " muted"}`} aria-live="polite">
                {quoteReceiveAmount ? f.amount(quoteReceiveAmount) : "0"}
                {quoteLoading && <span className="spin" aria-label={t("quoteLoading")} />}
              </output>
              <TokenSelector side="To" token={toToken} onSelect={setToToken} chain={chain} walletTokens={walletTokens} />
            </div>
            <div className="leg-foot">
              <span className="num">{receiveUsd != null ? f.usd(receiveUsd) : " "}</span>
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
                    <dt>{t("rate")}</dt>
                    <dd className="num">
                      1 {fromSymbol} = {f.amount(quoteDetails.rate)} {toSymbol}
                    </dd>
                  </div>
                )}
                {minReceivedAmount && toToken && (
                  <div>
                    <dt>{t("minReceived")}</dt>
                    <dd className="num">
                      {f.amount(minReceivedAmount)} {toSymbol}
                    </dd>
                  </div>
                )}
                {impactSize != null && (
                  <div>
                    <dt>{t("priceImpact")}</dt>
                    <dd className={`num${impactSize > 3 ? " text-loss-ink" : impactSize > 1 ? " text-warn-ink" : ""}`}>
                      {f.percent(impactSize)}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>{t("slippage")}</dt>
                  <dd>{autoSlippage ? t("auto") : `${showSlippage(liveSlippage)}%`}</dd>
                </div>
                {quoteDetails.tradeFee != null && Number(quoteDetails.tradeFee) > 0 && (
                  <div>
                    <dt>{t("networkFee")}</dt>
                    <dd className="num">{f.usd(quoteDetails.tradeFee)}</dd>
                  </div>
                )}
                {quoteDetails.dexName && (
                  <div>
                    <dt>{t("route")}</dt>
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
                <button type="button" className="icon-btn" aria-label={t("dismiss")} onClick={() => setError(null)}>
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
                  <strong>{swapResult.status === "confirming" ? t("txPending") : t("txSent")}</strong>
                  <p>{swapResult.message}</p>
                  {swapResult.mevProtected && <p>{t("mevWasOn")}</p>}
                  {swapResult.securityWarning && <p className="text-warn-ink">{swapResult.securityWarning}</p>}
                  {swapResult.txHash && (
                    <a
                      className="tx-link"
                      href={`${chainConfig?.explorer ?? "https://etherscan.io"}/tx/${swapResult.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("viewExplorer")} <LineIcon name="arrow-up-right" size={13} />
                    </a>
                  )}
                </div>
                <button type="button" className="icon-btn" aria-label={t("dismiss")} onClick={() => setSwapResult(null)}>
                  <LineIcon name="x" size={15} />
                </button>
              </div>
            )}
          </Fade>

          {priceImpactTooHigh && (
            <div className="note loss" role="alert">
              <LineIcon name="alert" size={16} />
              <span>{t("impactTooHigh")}</span>
            </div>
          )}
          {priceImpactNeedsAck && !priceImpactAck && !priceImpactTooHigh && (
            <button type="button" onClick={() => setPriceImpactAckFor(quoteIdentity)} className="note warn ack">
              <LineIcon name="alert" size={16} />
              <span>{t("impactAck", { impact: f.percent(impactSize) })}</span>
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
                  {t("gettingQuote")}
                </>
              ) : liveQuote ? (
                t("refreshQuote")
              ) : (
                t("getQuote")
              )}
            </button>
            {quoteExpired && liveQuote ? (
              <button type="button" className="btn btn--primary" onClick={handleQuote} disabled={quoteLoading}>
                {quoteLoading ? (
                  <>
                    <span className="spin" aria-hidden="true" />
                    {t("gettingQuote")}
                  </>
                ) : (
                  t("quoteExpired")
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
                  (priceImpactNeedsAck && !priceImpactAck) ||
                  notEnough
                }
              >
                {swapLoading ? (
                  <>
                    <span className="spin" aria-hidden="true" />
                    {swapStep === "approving"
                      ? t("approving")
                      : swapStep === "waiting_approve"
                        ? t("confirmingApproval")
                        : t("swapping")}
                  </>
                ) : notEnough ? (
                  notEnoughLabel
                ) : isNativeFrom ? (
                  t("swap")
                ) : (
                  t("approveAndSwap")
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
            title={t("trendingTitle", { chain: chainConfig?.name ?? chain })}
            sub={t("trendingSub")}
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
                  const d = displayToken({ symbol: t.symbol, name: t.name, address: t.address, chainIndex: t.chainIndex || chainConfig?.chainIndex });
                  return (
                    <li key={`${t.address}-${i}`}>
                      <button
                        type="button"
                        className="row"
                        onClick={() => {
                          const raw = t.decimals ?? t.decimal;
                          const decimals = raw !== undefined && raw !== null && raw !== "" ? Number(raw) : NaN;
                          if (!Number.isFinite(decimals) || decimals < 0) {
                            toast.error(tokenUnusable);
                            return;
                          }
                          setToToken({
                            symbol: t.symbol,
                            address: t.address,
                            decimals,
                            logo: t.logo || undefined,
                          });
                          if (!fromToken) setFromToken(getNativeToken(chain));
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        <TokenIcon symbol={d.symbol} size={34} logoUrl={t.logo} chainIndex={d.chainIndex} />
                        <div style={{ minWidth: 0 }}>
                          <div className="t">{d.symbol}</div>
                          <div className="sub trunc">{mcap > 0 ? marketCapLabel(f.compactUsd(mcap)) : d.name}</div>
                        </div>
                        <div className="end">
                          <div className="num">{price > 0 ? f.price(price) : MISSING}</div>
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
