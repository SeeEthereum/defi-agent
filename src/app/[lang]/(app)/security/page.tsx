"use client";

/**
 * Security: who may spend your tokens (approvals, revocable), and how risky
 * the tokens you hold are. Filters sit in one bar; results are rows.
 */

import { useState, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CHAINS } from "@/lib/chains";
import { LineIcon } from "@/components/line-icon";
import { TokenIcon } from "@/components/token-icon";
import { Empty, Metric, PageHead, Panel, PillTabs, Segmented, Sheet, Skeleton } from "@/components/premium";
import { userFacingError } from "@/lib/api/send-state";
import { MISSING } from "@/lib/format";
import { useFormat, useT } from "@/i18n/client";
import {
  EVM_ADDRESS,
  allowanceLabel,
  approvalRisk,
  isUnlimitedAllowance,
  networkName,
  parseAddresses,
  riskLabels,
  taxIsHigh,
  taxLabel,
  tokenRisk,
  tokenTitle,
  tokensParam,
} from "./display";

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
  if (!addr || addr.length <= 14) return addr;
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

/** Most tokens one scan takes (the API's limit). */
const MAX_SCAN_TOKENS = 10;

function ChainSelect({ id, value, onChange, allLabel }: { id: string; value: string; onChange: (v: string) => void; allLabel?: string }) {
  const t = useT("security");
  return (
    <div className="select select--chip">
      <label htmlFor={id} className="sr-only">
        {t("chain")}
      </label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {allLabel && <option value="">{allLabel}</option>}
        {/* The API takes the chain id: a name such as "arbitrum" was refused. */}
        {Object.values(CHAINS).map((c) => (
          <option key={c.chainIndex} value={String(c.chainIndex)}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Chain picker whose values are chain ids, as the scan API's tokens take them. */
function ChainIndexSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const t = useT("security");
  return (
    <div className="select select--chip">
      <label htmlFor={id} className="sr-only">
        {t("network")}
      </label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.values(CHAINS).map((c) => (
          <option key={c.chainIndex} value={String(c.chainIndex)}>
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
  const t = useT("security");
  const f = useFormat();
  const [mode, setMode] = useState<"wallet" | "manual">("wallet");
  const [chain, setChain] = useState(String(CHAINS.arbitrum.chainIndex));
  const [manualChain, setManualChain] = useState("1");
  const [manualTokens, setManualTokens] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TokenScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);

  // Addresses typed for the manual scan; the API takes them as "chain:address".
  const manualAddresses = parseAddresses(manualTokens);
  const badAddress = manualAddresses.find((a) => !EVM_ADDRESS.test(a));
  const tooMany = manualAddresses.length > MAX_SCAN_TOKENS;
  const manualOk = manualAddresses.length > 0 && !badAddress && !tooMany;

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
        params.set("tokens", tokensParam(manualChain, parseAddresses(manualTokens)));
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
        setError(data.error || t("scanFailed"));
      }
    } catch {
      setError(t("unreachable"));
    } finally {
      setLoading(false);
    }
  }, [mode, walletAddress, chain, manualChain, manualTokens, t]);

  return (
    <Panel
      flush
      index={2}
      title={t("scanTitle")}
      sub={t("scanSub")}
      action={
        <div className="filter-bar">
          <Segmented
            id="scan-mode"
            label={t("scanWhat")}
            value={mode}
            onChange={setMode}
            options={[
              { value: "wallet", label: t("scanMyWallet") },
              { value: "manual", label: t("scanSpecific") },
            ]}
          />
          {mode === "wallet" && <ChainSelect id="scan-chain" value={chain} onChange={setChain} />}
          {mode === "manual" && <ChainIndexSelect id="scan-network" value={manualChain} onChange={setManualChain} />}
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={handleScan}
            disabled={loading || (mode === "manual" && !manualOk) || (mode === "wallet" && !chain)}
          >
            {loading ? <span className="spin" aria-hidden="true" /> : <LineIcon name="shield-check" size={15} />}
            {loading ? t("scanning") : t("scan")}
          </button>
        </div>
      }
    >
      {mode === "manual" && (
        <div className="field scan-input">
          <label htmlFor="scan-tokens">{t("tokenAddress")}</label>
          <input
            id="scan-tokens"
            className="input mono"
            spellCheck={false}
            autoComplete="off"
            placeholder="0x…"
            value={manualTokens}
            aria-invalid={manualTokens.trim() !== "" && !manualOk}
            onChange={(e) => setManualTokens(e.target.value)}
          />
          {badAddress ? (
            <p className="err">{t("badAddress", { address: abbreviate(badAddress) })}</p>
          ) : tooMany ? (
            <p className="err">{t("tooMany", { max: MAX_SCAN_TOKENS })}</p>
          ) : (
            <p className="hint">{t("addressHint")}</p>
          )}
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
        <Empty icon="shield-check" title={t("scanIdleTitle")} text={mode === "wallet" ? t("scanIdleWallet") : t("scanIdleManual")} />
      ) : results.length === 0 ? (
        <Empty icon="shield-check" title={t("scanCleanTitle")} text={t("scanCleanText")} />
      ) : (
        <ul className="rows wal-pad">
          {results.map((token, i) => {
            const addr: string = token.tokenAddress ?? token.tokenContractAddress ?? token.address ?? "";
            const chainIdx = token.chainId ?? token.chainIndex;
            const { title, iconSymbol, named } = tokenTitle({ symbol: token.tokenSymbol ?? token.symbol, chainIndex: chainIdx, address: addr }, t);
            const risk = token.riskLevel ?? token.risk_level;
            const isHoneypot = (token.isHoneypot ?? token.is_honeypot ?? token.honeypot) === true;
            const buyTax = token.buyTaxes ?? token.buyTax ?? token.buy_tax;
            const sellTax = token.sellTaxes ?? token.sellTax ?? token.sell_tax;
            const isMintable = token.isMintable ?? token.is_mintable;
            const canPause = token.canPause ?? token.can_pause ?? token.isHasFrozenAuth;
            const holders = Number(token.holderCount ?? token.holder_count ?? token.holders);
            const risks = riskLabels(token, t);
            const tone = tokenRisk(risk, t);

            return (
              <li key={`${addr}-${i}`}>
                <div className="scan-item">
                  <div className="row scan-row">
                    <span className={`risk-dot ${tone.tone}`} aria-hidden="true">
                      <LineIcon name={tone.tone === "ok" ? "shield-check" : "alert"} size={16} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="t scan-t">
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "center" }}>
                          <TokenIcon symbol={iconSymbol} size={20} chainIndex={chainIdx} />
                          {title}
                        </span>
                        <span className={`st ${tone.tone === "bad" ? "bad" : tone.tone === "warn" ? "wait" : tone.tone === "ok" ? "ok" : ""}`}>{tone.label}</span>
                        {isHoneypot && <span className="st bad">{t("honeypot")}</span>}
                      </div>
                      <div className="sub">
                        {addr && named && (
                          <>
                            <span className="num">{abbreviate(addr)}</span> ·{" "}
                          </>
                        )}
                        {networkName(chainIdx, t)}
                      </div>
                    </div>
                    <dl className="facts scan-facts">
                      <div>
                        <dt>{t("buyTax")}</dt>
                        <dd className={`num${taxIsHigh(buyTax) ? " text-loss-ink" : ""}`}>{taxLabel(buyTax, f)}</dd>
                      </div>
                      <div>
                        <dt>{t("sellTax")}</dt>
                        <dd className={`num${taxIsHigh(sellTax) ? " text-loss-ink" : ""}`}>{taxLabel(sellTax, f)}</dd>
                      </div>
                      <div>
                        <dt>{t("mintable")}</dt>
                        <dd className={isMintable === true ? "text-warn-ink" : ""}>{typeof isMintable !== "boolean" ? MISSING : isMintable ? t("yes") : t("no")}</dd>
                      </div>
                      <div>
                        <dt>{t("pausable")}</dt>
                        <dd className={canPause === true ? "text-warn-ink" : ""}>{typeof canPause !== "boolean" ? MISSING : canPause ? t("yes") : t("no")}</dd>
                      </div>
                    </dl>
                  </div>
                  {(risks.length > 0 || holders > 0) && (
                    <div className="scan-extra">
                      {risks.map((r) => (
                        <span key={r} className="tag tag--bad">
                          {r}
                        </span>
                      ))}
                      {holders > 0 && <span className="muted">{t("holders", { count: Math.round(holders), n: f.number(Math.round(holders)) })}</span>}
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

function ApprovalsTab({ walletAddress }: { walletAddress: string | null }) {
  const t = useT("security");
  const tc = useT("common");
  const f = useFormat();
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
          setRevokeError(userFacingError(data.error, t("revokeFailed")));
        }
      } catch (e) {
        console.error(e);
        setRevokeError(userFacingError(e, t("revokeFailed")));
      } finally {
        revokingRef.current = false;
        setRevokingKey(null);
      }
    },
    [t]
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
        setError(data.error || t("loadApprovalsFailed"));
      }
    } catch {
      setError(t("unreachable"));
    } finally {
      setLoading(false);
    }
  }, [walletAddress, chain, t]);

  if (!walletAddress) {
    return <Empty icon="wallet" title={t("walletLoadingTitle")} text={t("walletLoadingText")} />;
  }

  const unlimitedCount = approvals.filter((a) => isUnlimitedAllowance(a.remainAmount ?? a.allowance ?? a.approvedAmount ?? a.approved_amount ?? "")).length;
  const riskyCount = approvals.filter((a) => a.vulnerabilityFlag ?? a.isAtRisk ?? a.is_at_risk).length;

  return (
    <>
      {fetched && approvals.length > 0 && (
        <div className="metrics in">
          <Metric label={t("activeApprovals")} value={approvals.length} sub={t("revokedThisVisit", { count: revokedKeys.size })} />
          <Metric label={t("unlimitedCount")} value={<span className={unlimitedCount ? "text-warn-ink" : ""}>{unlimitedCount}</span>} sub={t("unlimitedSub")} />
          <Metric label={t("flagged")} value={<span className={riskyCount ? "text-loss-ink" : ""}>{riskyCount}</span>} sub={t("flaggedSub")} />
        </div>
      )}

      <Panel
        flush
        index={2}
        title={t("approvalsTitle")}
        sub={t("approvalsSub")}
        action={
          <div className="filter-bar">
            <ChainSelect id="approvals-chain" value={chain} onChange={setChain} allLabel={t("allChains")} />
            <button type="button" className="btn btn--sm btn--primary" onClick={handleFetch} disabled={loading}>
              {loading ? <span className="spin" aria-hidden="true" /> : <LineIcon name="refresh" size={15} />}
              {fetched ? t("checkAgain") : t("checkApprovals")}
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
          <Empty icon="lock" title={t("approvalsIdleTitle")} text={t("approvalsIdleText")} />
        ) : approvals.length === 0 ? (
          <Empty icon="shield-check" title={t("allClearTitle")} text={t("allClearText")} />
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
            const chainIdx = item.chainIndex ?? item.chainId;
            const { title: symbol, iconSymbol } = tokenTitle({ symbol: item.symbol ?? item.tokenSymbol, chainIndex: chainIdx, address: tokenAddr }, t);
            const spender = item.approvalAddress ?? item.spenderAddress ?? item.spender ?? "";
            const spenderName = item.protocolName ?? item.spenderName ?? item.spender_name ?? "";
            const allowance =
              item.remainAmount ?? item.allowance ?? item.approvedAmount ?? item.approved_amount ?? "";
            const network = networkName(chainIdx, t);
            const risk = approvalRisk(item.riskLevel ?? item.risk_level, t);
            const isRisky = item.vulnerabilityFlag ?? item.isAtRisk ?? item.is_at_risk ?? false;
            const isUnlimited = isUnlimitedAllowance(allowance);

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
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "center" }}>
                            <TokenIcon symbol={iconSymbol} size={20} chainIndex={chainIdx} />
                            {symbol}
                          </span>
                          <span className="muted appr-chain">{network}</span>
                          {isRisky && !isRevoked && <span className="st bad">{t("atRisk")}</span>}
                          {!isRisky && risk && !isRevoked && (
                            <span className={`st ${risk.tone === "bad" ? "bad" : risk.tone === "warn" ? "wait" : "ok"}`}>{risk.label}</span>
                          )}
                          {item.tags === "isEoa" && <span className="st wait">{t("risks.spenderIsWallet")}</span>}
                        </div>
                        <div className="sub trunc">
                          {t("to")}{" "}
                          {spenderName && (
                            <TokenIcon symbol={spenderName} logoUrl={item.protocolIcon} size={14} className="align-middle" />
                          )}{" "}
                          {spenderName || <span className="num">{spender ? abbreviate(spender) : t("unknownAddress")}</span>}
                          {spenderName && spender && <span className="num"> · {abbreviate(spender)}</span>}
                        </div>
                      </div>
                      <div className="end">
                        <div className={`num${isUnlimited ? " text-warn-ink" : ""}`}>
                          {allowanceLabel(item, isUnlimited, t, f)}
                        </div>
                        <div className="sub">{t("allowance")}</div>
                      </div>
                      {isRevoked ? (
                        <span className="st ok appr-act">{t("revoked")}</span>
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
                              chainName: network,
                            })
                          }
                          disabled={isRevoking || !!revokingKey}
                        >
                          {isRevoking ? <span className="spin" aria-hidden="true" /> : t("revoke")}
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

      <Sheet open={confirmRevoke !== null} onClose={() => setConfirmRevoke(null)} title={t("confirmTitle")}>
        {confirmRevoke && (
          <div className="sheet-body">
            <dl className="sum">
              <div>
                <dt>{t("token")}</dt>
                <dd>{confirmRevoke.symbol}</dd>
              </div>
              <div>
                <dt>{t("chain")}</dt>
                <dd>{confirmRevoke.chainName}</dd>
              </div>
              <div>
                <dt>{t("spender")}</dt>
                <dd className="num conf-recipient">{confirmRevoke.spender}</dd>
              </div>
            </dl>
            <p className="hint">{t("confirmHint", { chain: confirmRevoke.chainName })}</p>
            <div className="sheet-actions">
              <button type="button" className="btn" onClick={() => setConfirmRevoke(null)} disabled={!!revokingKey}>
                {tc("cancel")}
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
                {t("revoke")}
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
  const t = useT("security");
  const { authenticated, walletAddress } = useAuth();
  const [tab, setTab] = useState<"approvals" | "scanner">("approvals");

  if (!authenticated) {
    return (
      <div className="page">
        <Empty icon="shield-check" title={t("signInTitle")} text={t("signInText")} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHead title={t("title")} lede={t("lede")} />
      <PillTabs
        id="sec-tabs"
        label={t("views")}
        value={tab}
        onChange={setTab}
        options={[
          { value: "approvals", label: t("tabApprovals") },
          { value: "scanner", label: t("tabScanner") },
        ]}
      />
      {tab === "scanner" ? <TokenScannerTab walletAddress={walletAddress} /> : <ApprovalsTab walletAddress={walletAddress} />}
    </div>
  );
}
