"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHAINS } from "@/lib/chains";

// ── Types ────────────────────────────────────────────────────────────────────

interface TokenScanResult {
  tokenContractAddress?: string;
  tokenAddress?: string;
  address?: string;
  tokenSymbol?: string;
  symbol?: string;
  chainIndex?: string | number;
  chainId?: string | number;
  riskLevel?: string;
  risk_level?: string;
  isHoneypot?: boolean;
  is_honeypot?: boolean;
  honeypot?: boolean;
  buyTax?: string | number;
  buy_tax?: string | number;
  sellTax?: string | number;
  sell_tax?: string | number;
  isOpenSource?: boolean;
  is_open_source?: boolean;
  isMintable?: boolean;
  is_mintable?: boolean;
  canPause?: boolean;
  can_pause?: boolean;
  holderCount?: string | number;
  holder_count?: string | number;
  riskItems?: string[];
  risks?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface ApprovalItem {
  tokenContractAddress?: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  symbol?: string;
  approvalAddress?: string;
  spenderAddress?: string;
  spender?: string;
  protocolName?: string;
  protocolIcon?: string | null;
  spenderName?: string;
  spender_name?: string;
  remainAmount?: string;
  remainAmtPrecise?: string;
  allowance?: string;
  approvedAmount?: string;
  approved_amount?: string;
  chainIndex?: string | number;
  chainId?: string | number;
  network?: string;
  tags?: string | null;
  vulnerabilityFlag?: boolean;
  isAtRisk?: boolean;
  is_at_risk?: boolean;
  riskLevel?: string;
  risk_level?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function abbreviate(addr: string): string {
  if (!addr || addr.length <= 14) return addr || "—";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function getChainName(idx: string | number | undefined): string {
  if (!idx) return "—";
  const chain = Object.values(CHAINS).find(
    (c) => String(c.chainIndex) === String(idx)
  );
  return chain?.name ?? String(idx);
}

function getRiskColor(level: string | undefined): string {
  if (!level) return "text-muted-foreground";
  const l = level.toLowerCase();
  if (l === "high" || l === "3" || l === "danger") return "text-red-600";
  if (l === "medium" || l === "2" || l === "warning") return "text-amber-600";
  if (l === "low" || l === "1" || l === "safe" || l === "0") return "text-emerald-600";
  return "text-muted-foreground";
}

function getRiskBadge(level: string | undefined): { label: string; bg: string; text: string } {
  if (!level) return { label: "Unknown", bg: "bg-slate-100", text: "text-slate-600" };
  const l = level.toLowerCase();
  if (l === "high" || l === "3" || l === "danger")
    return { label: "High Risk", bg: "bg-red-100", text: "text-red-700" };
  if (l === "medium" || l === "2" || l === "warning")
    return { label: "Medium Risk", bg: "bg-amber-100", text: "text-amber-700" };
  if (l === "low" || l === "1" || l === "safe" || l === "0")
    return { label: "Safe", bg: "bg-emerald-100", text: "text-emerald-700" };
  return { label: level, bg: "bg-slate-100", text: "text-slate-600" };
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      width="16"
      height="16"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Token Scanner Tab ────────────────────────────────────────────────────────

function TokenScannerTab({ walletAddress }: { walletAddress: string | null }) {
  const [mode, setMode] = useState<"wallet" | "manual">("wallet");
  const [chain, setChain] = useState("arbitrum");
  const [manualTokens, setManualTokens] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TokenScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);

  const handleScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResults([]);
    setScanned(false);
    try {
      const params = new URLSearchParams();
      if (mode === "wallet" && walletAddress) {
        params.set("address", walletAddress);
        if (chain) params.set("chain", chain);
      } else if (mode === "manual" && manualTokens.trim()) {
        params.set("tokens", manualTokens.trim());
      } else {
        // Scan logged-in wallet
        if (chain) params.set("chain", chain);
      }

      const res = await fetch(`/api/security/token-scan?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        const raw = data.data;
        // Results can be an array or nested under a key
        const list: TokenScanResult[] = Array.isArray(raw)
          ? raw
          : raw?.tokens ?? raw?.results ?? raw?.data ?? (raw ? [raw] : []);
        setResults(list);
        setScanned(true);
      } else {
        setError(data.error || "Scan failed");
      }
    } catch {
      setError("Failed to connect to the server");
    } finally {
      setLoading(false);
    }
  }, [mode, walletAddress, chain, manualTokens]);

  return (
    <div className="space-y-5">
      {/* Mode selector */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("wallet")}
          className={`flex-1 h-9 rounded-lg text-[12px] font-semibold transition-colors ${
            mode === "wallet"
              ? "bg-indigo-600 text-white"
              : "bg-white border border-border/60 text-muted-foreground hover:border-indigo-300 hover:text-indigo-600"
          }`}
        >
          Scan My Wallet
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`flex-1 h-9 rounded-lg text-[12px] font-semibold transition-colors ${
            mode === "manual"
              ? "bg-indigo-600 text-white"
              : "bg-white border border-border/60 text-muted-foreground hover:border-indigo-300 hover:text-indigo-600"
          }`}
        >
          Scan Specific Tokens
        </button>
      </div>

      {/* Chain selector (wallet mode — required) */}
      {mode === "wallet" && (
        <div>
          <p className="text-[13px] font-medium text-muted-foreground mb-2">
            Select chain
          </p>
          <select
            className="flex h-10 w-full rounded-xl border border-border/60 bg-white px-4 text-sm font-medium text-foreground outline-none focus:border-indigo-400 focus:ring-3 focus:ring-indigo-500/20 appearance-none cursor-pointer"
            value={chain}
            onChange={(e) => setChain(e.target.value)}
          >
            {Object.values(CHAINS).map((c) => (
              <option key={c.swapName} value={c.swapName}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Manual token input */}
      {mode === "manual" && (
        <div>
          <p className="text-[13px] font-medium text-muted-foreground mb-2">
            Token list (chainId:address, comma-separated)
          </p>
          <Input
            placeholder="e.g. 1:0xdac17f958d2ee523a2206206994597c13d831ec7"
            value={manualTokens}
            onChange={(e) => setManualTokens(e.target.value)}
            className="h-10 rounded-xl border-border/60 bg-white text-sm"
          />
          <p className="text-[11px] text-muted-foreground/60 mt-1 px-1">
            Chain IDs: 1=Ethereum, 42161=Arbitrum, 8453=Base, 56=BNB, 137=Polygon
          </p>
        </div>
      )}

      <Button
        onClick={handleScan}
        disabled={loading || (mode === "manual" && !manualTokens.trim()) || (mode === "wallet" && !chain)}
        className="w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <Spinner /> Scanning...
          </span>
        ) : (
          "Scan Tokens"
        )}
      </Button>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200/60 p-4 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      {scanned && results.length === 0 && !error && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200/60 p-4 text-center">
          <p className="text-[13px] font-medium text-emerald-700">
            No risky tokens found in your wallet
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-[13px] font-medium text-muted-foreground">
            {results.length} token{results.length !== 1 ? "s" : ""} scanned
          </p>
          {results.map((token, i) => {
            const addr =
              token.tokenAddress ?? token.tokenContractAddress ?? token.address ?? "";
            const symbol = token.tokenSymbol ?? token.symbol ?? abbreviate(addr);
            const risk = token.riskLevel ?? token.risk_level;
            const badge = getRiskBadge(risk);
            const isHoneypot =
              token.isHoneypot ?? token.is_honeypot ?? token.honeypot ?? false;
            const buyTax = token.buyTaxes ?? token.buyTax ?? token.buy_tax;
            const sellTax = token.sellTaxes ?? token.sellTax ?? token.sell_tax;
            const isMintable = token.isMintable ?? token.is_mintable;
            const canPause = token.canPause ?? token.can_pause ?? token.isHasFrozenAuth;
            const holders = token.holderCount ?? token.holder_count ?? token.holders;
            const chainIdx = token.chainId ?? token.chainIndex;

            // Build risk items from boolean flags
            const risks: string[] = token.riskItems ?? token.risks ?? [];
            if (risks.length === 0) {
              if (token.isNotOpenSource) risks.push("Contract is not open source");
              if (token.isNotRenounced) risks.push("Ownership not renounced");
              if (token.isLowLiquidity) risks.push("Low liquidity");
              if (token.isLiquidityRemoval) risks.push("Liquidity removal risk");
              if (token.isDumping) risks.push("Dumping detected");
              if (token.isFakeLiquidity) risks.push("Fake liquidity");
              if (token.isAirdropScam) risks.push("Airdrop scam");
              if (token.isCounterfeit) risks.push("Counterfeit token");
              if (token.isOverIssued) risks.push("Over-issued");
              if (token.isVeryHighLpHolderProp) risks.push("Very high LP holder proportion");
              if (token.isVeryLowLpBurn) risks.push("Very low LP burn");
              if (token.isHasBlockingHis) risks.push("Has blocking history");
              if (token.isHasAssetEditAuth) risks.push("Has asset edit authority");
              if (token.isFundLinkage) risks.push("Fund linkage detected");
            }

            return (
              <div
                key={`${addr}-${i}`}
                className="rounded-xl border border-border/60 bg-white overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold">{symbol}</span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                      {isHoneypot && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                          Honeypot
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground/60 font-mono mt-0.5">
                      {abbreviate(addr)} · {getChainName(chainIdx)}
                    </p>
                  </div>
                </div>

                {/* Details */}
                <div className="px-4 py-3 space-y-2 text-[12px]">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {buyTax != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Buy Tax</span>
                        <span className={Number(buyTax) > 5 ? "text-red-600 font-medium" : ""}>{Number(buyTax).toFixed(1)}%</span>
                      </div>
                    )}
                    {sellTax != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sell Tax</span>
                        <span className={Number(sellTax) > 5 ? "text-red-600 font-medium" : ""}>{Number(sellTax).toFixed(1)}%</span>
                      </div>
                    )}
                    {isMintable != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Mintable</span>
                        <span className={isMintable ? "text-amber-600" : "text-emerald-600"}>{isMintable ? "Yes" : "No"}</span>
                      </div>
                    )}
                    {canPause != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Pausable</span>
                        <span className={canPause ? "text-amber-600" : "text-emerald-600"}>{canPause ? "Yes" : "No"}</span>
                      </div>
                    )}
                    {holders != null && Number(holders) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Holders</span>
                        <span>{Number(holders).toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  {/* Risk items */}
                  {risks.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/30">
                      <p className="text-[11px] font-medium text-red-600 mb-1">Risk Factors:</p>
                      <ul className="space-y-0.5">
                        {risks.map((r, j) => (
                          <li key={j} className="text-[11px] text-red-500 flex items-start gap-1.5">
                            <span className="mt-0.5 shrink-0">•</span>
                            <span>{typeof r === "string" ? r : JSON.stringify(r)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Approvals Tab ────────────────────────────────────────────────────────────

function ApprovalsTab({ walletAddress }: { walletAddress: string | null }) {
  const [chain, setChain] = useState("");
  const [loading, setLoading] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const handleFetch = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);
    setApprovals([]);
    setFetched(false);
    try {
      const params = new URLSearchParams({ address: walletAddress });
      if (chain) params.set("chain", chain);
      params.set("limit", "50");

      const res = await fetch(`/api/security/approvals?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        const raw = data.data;
        // The API returns: [{ cursor, dataList: [...], total }]
        let list: ApprovalItem[] = [];
        if (Array.isArray(raw) && raw.length > 0 && raw[0]?.dataList) {
          list = raw[0].dataList;
        } else if (Array.isArray(raw)) {
          list = raw;
        } else if (raw?.dataList) {
          list = raw.dataList;
        } else if (raw?.approvals ?? raw?.results ?? raw?.data) {
          list = raw.approvals ?? raw.results ?? raw.data;
        }
        setApprovals(list);
        setFetched(true);
      } else {
        setError(data.error || "Failed to fetch approvals");
      }
    } catch {
      setError("Failed to connect to the server");
    } finally {
      setLoading(false);
    }
  }, [walletAddress, chain]);

  if (!walletAddress) {
    return (
      <div className="text-center py-8 text-muted-foreground text-[13px]">
        Please connect your wallet first.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Chain filter */}
      <div>
        <p className="text-[13px] font-medium text-muted-foreground mb-2">
          Filter by chain (optional)
        </p>
        <select
          className="flex h-10 w-full rounded-xl border border-border/60 bg-white px-4 text-sm font-medium text-foreground outline-none focus:border-indigo-400 focus:ring-3 focus:ring-indigo-500/20 appearance-none cursor-pointer"
          value={chain}
          onChange={(e) => setChain(e.target.value)}
        >
          <option value="">All chains</option>
          {Object.values(CHAINS).map((c) => (
            <option key={c.swapName} value={c.swapName}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <Button
        onClick={handleFetch}
        disabled={loading}
        className="w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <Spinner /> Loading...
          </span>
        ) : (
          "Check Approvals"
        )}
      </Button>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200/60 p-4 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {/* Empty state */}
      {fetched && approvals.length === 0 && !error && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200/60 p-4 text-center">
          <p className="text-[13px] font-medium text-emerald-700">
            No active token approvals found
          </p>
          <p className="text-[11px] text-emerald-600 mt-1">
            Your wallet has no outstanding ERC-20 or Permit2 approvals.
          </p>
        </div>
      )}

      {/* Approvals list */}
      {approvals.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-muted-foreground">
              {approvals.length} active approval{approvals.length !== 1 ? "s" : ""}
            </p>
            <p className="text-[11px] text-amber-600 font-medium">
              Revoke unused approvals to stay safe
            </p>
          </div>
          {approvals.map((item, i) => {
            const tokenAddr =
              item.tokenAddress ?? item.tokenContractAddress ?? "";
            const symbol = item.symbol ?? item.tokenSymbol ?? abbreviate(tokenAddr);
            const spender = item.approvalAddress ?? item.spenderAddress ?? item.spender ?? "";
            const spenderName = item.protocolName ?? item.spenderName ?? item.spender_name ?? "";
            const allowance =
              item.remainAmount ?? item.allowance ?? item.approvedAmount ?? item.approved_amount ?? "";
            const chainIdx = item.chainIndex ?? item.chainId;
            const networkName = item.network;
            const risk = item.riskLevel ?? item.risk_level;
            const isRisky = item.vulnerabilityFlag ?? item.isAtRisk ?? item.is_at_risk ?? false;
            const riskColor = getRiskColor(risk);
            const isUnlimited =
              String(allowance).includes("unlimited") ||
              String(allowance).includes("MAX") ||
              (String(allowance).length > 30 && /^[0-9]+$/.test(String(allowance)));

            return (
              <div
                key={`${tokenAddr}-${spender}-${i}`}
                className={`rounded-xl border bg-white overflow-hidden ${
                  isRisky ? "border-red-200" : "border-border/60"
                }`}
              >
                <div className="px-4 py-3 space-y-2">
                  {/* Token + chain */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold">{symbol}</span>
                      <span className="text-[11px] text-muted-foreground/60">
                        {networkName ?? getChainName(chainIdx)}
                      </span>
                    </div>
                    {isRisky && (
                      <span className="text-[11px] font-semibold text-red-600">At Risk</span>
                    )}
                    {risk && !isRisky && (
                      <span className={`text-[11px] font-semibold ${riskColor}`}>
                        {risk}
                      </span>
                    )}
                  </div>

                  {/* Spender */}
                  <div className="text-[12px]">
                    <span className="text-muted-foreground">Approved to: </span>
                    <span className="font-medium">
                      {spenderName || abbreviate(spender)}
                    </span>
                    {spenderName && (
                      <span className="text-muted-foreground/60 ml-1 font-mono text-[10px]">
                        ({abbreviate(spender)})
                      </span>
                    )}
                  </div>

                  {/* Allowance */}
                  <div className="text-[12px]">
                    <span className="text-muted-foreground">Amount: </span>
                    <span className={`font-medium ${isUnlimited ? "text-amber-600" : ""}`}>
                      {isUnlimited
                        ? "Unlimited"
                        : item.remainAmtPrecise
                          ? `${parseFloat(item.remainAmtPrecise).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${symbol}`
                          : allowance || "—"}
                    </span>
                    {isUnlimited && (
                      <span className="text-[10px] text-amber-500 ml-1">(consider revoking)</span>
                    )}
                  </div>
                  {/* Tags */}
                  {item.tags && (
                    <div className="text-[11px]">
                      <span className={`px-1.5 py-0.5 rounded-full ${item.tags === "isEoa" ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-muted-foreground"}`}>
                        {item.tags === "isEoa" ? "EOA (not a contract)" : item.tags}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Security Page ───────────────────────────────────────────────────────

export default function SecurityPage() {
  const { authenticated, walletAddress } = useAuth();
  const [tab, setTab] = useState<"scanner" | "approvals">("scanner");

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-[15px]">
          Please connect your wallet first.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-5 py-2">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          Security
        </h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Scan tokens for risks and manage your approvals
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100">
        <button
          type="button"
          onClick={() => setTab("scanner")}
          className={`flex-1 h-9 rounded-lg text-[13px] font-semibold transition-all ${
            tab === "scanner"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Token Scanner
        </button>
        <button
          type="button"
          onClick={() => setTab("approvals")}
          className={`flex-1 h-9 rounded-lg text-[13px] font-semibold transition-all ${
            tab === "approvals"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Approvals
        </button>
      </div>

      {/* Content */}
      <div className="rounded-2xl border border-border/60 bg-white shadow-sm shadow-black/[0.03] p-5">
        {tab === "scanner" ? (
          <TokenScannerTab walletAddress={walletAddress} />
        ) : (
          <ApprovalsTab walletAddress={walletAddress} />
        )}
      </div>
    </div>
  );
}
