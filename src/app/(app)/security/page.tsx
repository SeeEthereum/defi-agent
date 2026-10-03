"use client";

/**
 * Security: who may spend your tokens (approvals, revocable), and how risky
 * the tokens you hold are. Filters sit in one bar; results are rows.
 */

import { useState, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CHAINS } from "@/lib/chains";
import { LineIcon } from "@/components/line-icon";
import { Empty, Metric, PageHead, Panel, PillTabs, Segmented, Sheet, Skeleton } from "@/components/premium";

function userFacingError(detail: unknown, fallback: string): string {
  const message =
    typeof detail === "string"
      ? detail
      : detail instanceof Error
        ? detail.message
        : "";
  if (/logged out/i.test(message) || /insufficient funds/i.test(message)) {
    return message;
  }
  return fallback;
}

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
  if (!addr || addr.length <= 14) return addr || "unknown";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function getChainName(idx: string | number | undefined): string {
  if (!idx) return "unknown chain";
  const chain = Object.values(CHAINS).find((c) => String(c.chainIndex) === String(idx));
  return chain?.name ?? String(idx);
}

/** Risk level as a calm label and a tone used for its colour. */
function riskTone(level: string | undefined): { label: string; tone: "bad" | "warn" | "ok" | "flat" } {
  if (!level) return { label: "Unknown", tone: "flat" };
  const l = level.toLowerCase();
  if (l === "high" || l === "3" || l === "danger") return { label: "High risk", tone: "bad" };
  if (l === "medium" || l === "2" || l === "warning") return { label: "Medium risk", tone: "warn" };
  if (l === "low" || l === "1" || l === "safe" || l === "0") return { label: "Looks safe", tone: "ok" };
  return { label: level, tone: "flat" };
}

function ChainSelect({ id, value, onChange, allLabel }: { id: string; value: string; onChange: (v: string) => void; allLabel?: string }) {
  return (
    <div className="select select--chip">
      <label htmlFor={id} className="sr-only">
        Chain
      </label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {allLabel && <option value="">{allLabel}</option>}
        {Object.values(CHAINS).map((c) => (
          <option key={c.swapName} value={c.swapName}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function Loading() {
  return (
    <div className="wal-pad" style={{ display: "grid", gap: 12 }}>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} height={60} />
      ))}
    </div>
  );
}

// ── Token Scanner ────────────────────────────────────────────────────────────

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
        setError(data.error || "The scan failed");
      }
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }, [mode, walletAddress, chain, manualTokens]);

  return (
    <Panel
      flush
      index={2}
      title="Token risk scan"
      sub="Honeypots, hidden taxes, owners who can mint or freeze"
      action={
        <div className="filter-bar">
          <Segmented
            id="scan-mode"
            label="What to scan"
            value={mode}
            onChange={setMode}
            options={[
              { value: "wallet", label: "My wallet" },
              { value: "manual", label: "Specific tokens" },
            ]}
          />
          {mode === "wallet" && <ChainSelect id="scan-chain" value={chain} onChange={setChain} />}
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={handleScan}
            disabled={loading || (mode === "manual" && !manualTokens.trim()) || (mode === "wallet" && !chain)}
          >
            {loading ? <span className="spin" aria-hidden="true" /> : <LineIcon name="shield-check" size={15} />}
            {loading ? "Scanning…" : "Scan"}
          </button>
        </div>
      }
    >
      {mode === "manual" && (
        <div className="field scan-input">
          <label htmlFor="scan-tokens">Tokens to scan, as chainId:address, separated by commas</label>
          <input
            id="scan-tokens"
            className="input mono"
            spellCheck={false}
            autoComplete="off"
            placeholder="1:0xdac17f958d2ee523a2206206994597c13d831ec7"
            value={manualTokens}
            onChange={(e) => setManualTokens(e.target.value)}
          />
          <p className="hint">Chain IDs: 1 Ethereum, 42161 Arbitrum, 8453 Base, 56 BNB Chain, 137 Polygon, 10 Optimism.</p>
        </div>
      )}

      {loading ? (
        <Loading />
      ) : error ? (
        <div className="wal-pad">
          <p className="note loss" role="alert">
            <LineIcon name="alert" size={16} />
            <span>{error}</span>
          </p>
        </div>
      ) : !scanned ? (
        <Empty icon="shield-check" title="Nothing scanned yet" text={mode === "wallet" ? "Pick a chain and press Scan to check the tokens you hold there." : "Paste one or more tokens above, then press Scan."} />
      ) : results.length === 0 ? (
        <Empty icon="shield-check" title="No risky tokens found" text="The scan found nothing to worry about." />
      ) : (
        <ul className="rows wal-pad">
          {results.map((token, i) => {
            const addr =
              token.tokenAddress ?? token.tokenContractAddress ?? token.address ?? "";
            const symbol = token.tokenSymbol ?? token.symbol ?? abbreviate(addr);
            const risk = token.riskLevel ?? token.risk_level;
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

            const tone = riskTone(risk);
            const taxBad = (v: unknown) => v != null && Number(v) > 5;

            return (
              <li key={`${addr}-${i}`}>
                <div className="scan-item">
                  <div className="row scan-row">
                    <span className={`risk-dot ${tone.tone}`} aria-hidden="true">
                      <LineIcon name={tone.tone === "ok" ? "shield-check" : "alert"} size={16} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="t scan-t">
                        <span>{symbol}</span>
                        <span className={`st ${tone.tone === "bad" ? "bad" : tone.tone === "warn" ? "wait" : tone.tone === "ok" ? "ok" : ""}`}>{tone.label}</span>
                        {isHoneypot && <span className="st bad">Honeypot</span>}
                      </div>
                      <div className="sub">
                        <span className="num">{abbreviate(addr)}</span> · {getChainName(chainIdx)}
                      </div>
                    </div>
                    <dl className="facts scan-facts">
                      <div>
                        <dt>Buy tax</dt>
                        <dd className={`num${taxBad(buyTax) ? " text-loss-ink" : ""}`}>{buyTax != null ? `${Number(buyTax).toFixed(1)}%` : "n/a"}</dd>
                      </div>
                      <div>
                        <dt>Sell tax</dt>
                        <dd className={`num${taxBad(sellTax) ? " text-loss-ink" : ""}`}>{sellTax != null ? `${Number(sellTax).toFixed(1)}%` : "n/a"}</dd>
                      </div>
                      <div>
                        <dt>Mintable</dt>
                        <dd className={isMintable ? "text-warn-ink" : ""}>{isMintable == null ? "n/a" : isMintable ? "Yes" : "No"}</dd>
                      </div>
                      <div>
                        <dt>Pausable</dt>
                        <dd className={canPause ? "text-warn-ink" : ""}>{canPause == null ? "n/a" : canPause ? "Yes" : "No"}</dd>
                      </div>
                    </dl>
                  </div>
                  {(risks.length > 0 || (holders != null && Number(holders) > 0)) && (
                    <div className="scan-extra">
                      {risks.map((r, j) => (
                        <span key={j} className="tag tag--bad">
                          {typeof r === "string" ? r : JSON.stringify(r)}
                        </span>
                      ))}
                      {holders != null && Number(holders) > 0 && <span className="muted">{Number(holders).toLocaleString("en-US")} holders</span>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ── Approvals ────────────────────────────────────────────────────────────────

interface RevokePending {
  tokenAddr: string;
  spender: string;
  chainIdx: number;
  symbol: string;
  chainName: string;
}

function isUnlimitedAllowance(allowance: unknown): boolean {
  const a = String(allowance);
  return a.includes("unlimited") || a.includes("MAX") || (a.length > 30 && /^[0-9]+$/.test(a));
}

function ApprovalsTab({ walletAddress }: { walletAddress: string | null }) {
  const [chain, setChain] = useState("");
  const [loading, setLoading] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [revokingKey, setRevokingKey] = useState<string | null>(null);
  const [revokedKeys, setRevokedKeys] = useState<Set<string>>(new Set());
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<RevokePending | null>(null);
  const revokingRef = useRef(false);

  const handleRevoke = useCallback(
    async (tokenAddr: string, spenderAddr: string, chainIdx: number) => {
      if (revokingRef.current) return;
      revokingRef.current = true;
      const key = `${tokenAddr}-${spenderAddr}-${chainIdx}`;
      setRevokingKey(key);
      setRevokeError(null);
      try {
        const res = await fetch("/api/security/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tokenAddress: tokenAddr,
            spenderAddress: spenderAddr,
            chainIndex: chainIdx,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setRevokedKeys((prev) => new Set(prev).add(key));
        } else {
          console.error(data.error);
          setRevokeError(userFacingError(data.error, "Revoke failed"));
        }
      } catch (e) {
        console.error(e);
        setRevokeError(userFacingError(e, "Revoke failed"));
      } finally {
        revokingRef.current = false;
        setRevokingKey(null);
      }
    },
    []
  );

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
        setError(data.error || "Could not load approvals");
      }
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }, [walletAddress, chain]);

  if (!walletAddress) {
    return <Empty icon="wallet" title="Loading your wallet" text="One moment." />;
  }

  const unlimitedCount = approvals.filter((a) => isUnlimitedAllowance(a.remainAmount ?? a.allowance ?? a.approvedAmount ?? a.approved_amount ?? "")).length;
  const riskyCount = approvals.filter((a) => a.vulnerabilityFlag ?? a.isAtRisk ?? a.is_at_risk).length;

  return (
    <>
      {fetched && approvals.length > 0 && (
        <div className="metrics in">
          <Metric label="Active approvals" value={approvals.length} sub={`${revokedKeys.size} revoked this visit`} />
          <Metric label="Unlimited" value={<span className={unlimitedCount ? "text-warn-ink" : ""}>{unlimitedCount}</span>} sub="can spend everything" />
          <Metric label="Flagged" value={<span className={riskyCount ? "text-loss-ink" : ""}>{riskyCount}</span>} sub="spender at risk" />
        </div>
      )}

      <Panel
        flush
        index={2}
        title="Who can spend your tokens"
        sub="Every app you approved keeps that right until you revoke it"
        action={
          <div className="filter-bar">
            <ChainSelect id="approvals-chain" value={chain} onChange={setChain} allLabel="All chains" />
            <button type="button" className="btn btn--sm btn--primary" onClick={handleFetch} disabled={loading}>
              {loading ? <span className="spin" aria-hidden="true" /> : <LineIcon name="refresh" size={15} />}
              {fetched ? "Check again" : "Check approvals"}
            </button>
          </div>
        }
      >
        {loading ? (
          <Loading />
        ) : error ? (
          <div className="wal-pad">
            <p className="note loss" role="alert">
              <LineIcon name="alert" size={16} />
              <span>{error}</span>
            </p>
          </div>
        ) : !fetched ? (
          <Empty icon="lock" title="Check your approvals" text="See which apps can still move your tokens, and revoke the ones you no longer use." />
        ) : approvals.length === 0 ? (
          <Empty icon="shield-check" title="All clear" text="Your wallet has no open ERC-20 or Permit2 approvals." />
        ) : (
          <>
            {revokeError && (
              <div className="wal-pad">
                <p className="note loss" role="alert">
                  <LineIcon name="alert" size={16} />
                  <span>{revokeError}</span>
                </p>
              </div>
            )}
            <ul className="rows wal-pad">
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
            const isUnlimited =
              String(allowance).includes("unlimited") ||
              String(allowance).includes("MAX") ||
              (String(allowance).length > 30 && /^[0-9]+$/.test(String(allowance)));

            const revokeKey = `${tokenAddr}-${spender}-${Number(chainIdx)}`;
            const isRevoking = revokingKey === revokeKey;
            const isRevoked = revokedKeys.has(revokeKey);

                return (
                  <li key={`${tokenAddr}-${spender}-${i}`} className={isRevoked ? "is-done" : undefined}>
                    <div className="row appr-row">
                      <span className={`risk-dot ${isRevoked ? "ok" : isRisky ? "bad" : isUnlimited ? "warn" : "flat"}`} aria-hidden="true">
                        <LineIcon name={isRevoked ? "check" : isRisky ? "alert" : "lock"} size={16} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="t scan-t">
                          <span>{symbol}</span>
                          <span className="muted appr-chain">{networkName ?? getChainName(chainIdx)}</span>
                          {isRisky && !isRevoked && <span className="st bad">At risk</span>}
                          {!isRisky && risk && !isRevoked && <span className={`st ${riskTone(risk).tone === "bad" ? "bad" : "wait"}`}>{risk}</span>}
                          {item.tags === "isEoa" && <span className="st wait">Spender is a wallet, not an app</span>}
                        </div>
                        <div className="sub trunc">
                          to {spenderName || <span className="num">{abbreviate(spender)}</span>}
                          {spenderName && <span className="num"> · {abbreviate(spender)}</span>}
                        </div>
                      </div>
                      <div className="end">
                        <div className={`num${isUnlimited ? " text-warn-ink" : ""}`}>
                          {isUnlimited
                            ? "Unlimited"
                            : item.remainAmtPrecise
                              ? `${parseFloat(item.remainAmtPrecise).toLocaleString("en-US", { maximumFractionDigits: 6 })}`
                              : allowance || "n/a"}
                        </div>
                        <div className="sub">allowance</div>
                      </div>
                      {isRevoked ? (
                        <span className="st ok appr-act">Revoked</span>
                      ) : tokenAddr && spender && chainIdx != null ? (
                        <button
                          type="button"
                          className="btn btn--sm appr-act revoke"
                          onClick={() =>
                            setConfirmRevoke({
                              tokenAddr,
                              spender,
                              chainIdx: Number(chainIdx),
                              symbol,
                              chainName: networkName ?? getChainName(chainIdx),
                            })
                          }
                          disabled={isRevoking || !!revokingKey}
                        >
                          {isRevoking ? <span className="spin" aria-hidden="true" /> : "Revoke"}
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Panel>

      <Sheet open={confirmRevoke !== null} onClose={() => setConfirmRevoke(null)} title="Revoke this approval?">
        {confirmRevoke && (
          <div className="sheet-body">
            <dl className="sum">
              <div>
                <dt>Token</dt>
                <dd>{confirmRevoke.symbol}</dd>
              </div>
              <div>
                <dt>Chain</dt>
                <dd>{confirmRevoke.chainName}</dd>
              </div>
              <div>
                <dt>Spender</dt>
                <dd className="num conf-recipient">{confirmRevoke.spender}</dd>
              </div>
            </dl>
            <p className="hint">Revoking sends a small transaction and costs gas on {confirmRevoke.chainName}. The app will need a new approval to use this token&nbsp;again.</p>
            <div className="sheet-actions">
              <button type="button" className="btn" onClick={() => setConfirmRevoke(null)} disabled={!!revokingKey}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!!revokingKey || !confirmRevoke}
                onClick={() => {
                  const item = confirmRevoke;
                  setConfirmRevoke(null);
                  if (item) void handleRevoke(item.tokenAddr, item.spender, item.chainIdx);
                }}
              >
                Revoke
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const { authenticated, walletAddress } = useAuth();
  const [tab, setTab] = useState<"approvals" | "scanner">("approvals");

  if (!authenticated) {
    return (
      <div className="page">
        <Empty icon="shield-check" title="Sign in first" text="Connect your wallet to check approvals and token risks." />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHead title="Security" lede="See which apps can spend your tokens, revoke what you no longer use, and check tokens before you&nbsp;trust&nbsp;them." />
      <PillTabs
        id="sec-tabs"
        label="Security views"
        value={tab}
        onChange={setTab}
        options={[
          { value: "approvals", label: "Approvals" },
          { value: "scanner", label: "Token scan" },
        ]}
      />
      {tab === "scanner" ? <TokenScannerTab walletAddress={walletAddress} /> : <ApprovalsTab walletAddress={walletAddress} />}
    </div>
  );
}
