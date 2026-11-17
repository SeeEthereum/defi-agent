"use client";

/**
 * Earn: your Fluid positions first, then every market in one table.
 * Supply and withdraw open as sheets in the app's own language.
 */

import { useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useFluidMarkets, useFluidPositions } from "@/hooks/use-fluid-markets";
import { toast } from "sonner";
import { TokenIcon } from "@/components/token-icon";
import { LineIcon } from "@/components/line-icon";
import { Empty, Metric, PageHead, Panel, PillTabs, Sheet, Skeleton } from "@/components/premium";
import type { FluidMarket, FluidUserPosition } from "@/lib/fluid/resolver";
import { isNativeUnderlying } from "@/lib/fluid/constants";
import { userFacingError } from "@/lib/api/send-state";
import { getChainByIndex } from "@/lib/chains";
import { chainName, displayToken } from "@/lib/tokens/display";
import { useFormat, useT } from "@/i18n/client";

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL_AMOUNT_RE = /^\d+(\.\d+)?$/;

function normalizeAmount(raw: string): string {
  return raw.trim().replace(",", ".");
}

function isValidAmount(raw: string): boolean {
  const normalized = normalizeAmount(raw);
  return DECIMAL_AMOUNT_RE.test(normalized) && Number(normalized) > 0;
}

const CHAIN_TABS = [
  { id: "all", label: "All" },
  { id: "1", label: "Ethereum" },
  { id: "42161", label: "Arbitrum" },
  { id: "8453", label: "Base" },
  { id: "137", label: "Polygon" },
] as const;

/** "Arbitrum", or `unknown` ("Unknown network", translated) for a chain we do not list. */
function networkName(chainIndex: number, unknown: string): string {
  return chainName(chainIndex) ?? unknown;
}

/**
 * The asset as people know it. Fluid lends WETH / WPOL, but deposits and
 * withdrawals here use the chain's own coin (depositNative), so it reads
 * ETH / POL. Display only: requests still carry the fToken symbol.
 */
function assetOf(m: { chainIndex: number; symbol: string; underlyingSymbol: string }) {
  return displayToken({ symbol: m.underlyingSymbol, chainIndex: m.chainIndex, isNative: isNativeUnderlying(m.chainIndex, m.symbol) });
}

/** The explorer page of a transaction, or null without a valid hash or a known explorer. */
function txUrl(chainIndex: number, hash: string): string | null {
  const explorer = getChainByIndex(chainIndex)?.explorer;
  return explorer && /^0x[0-9a-fA-F]{64}$/.test(hash) ? `${explorer}/tx/${hash}` : null;
}

/** "View transaction ↗" on the chain's explorer, in place of the hash. */
function TxLink({ chainIndex, hash }: { chainIndex: number; hash: string }) {
  const t = useT("earn");
  const href = txUrl(chainIndex, hash);
  if (!href) return null;
  return (
    <a className="tx-link" href={href} target="_blank" rel="noopener noreferrer">
      {t("viewTransaction")} <LineIcon name="arrow-up-right" size={13} />
    </a>
  );
}

const RPC_URLS: Record<number, string> = {
  1: "https://ethereum-rpc.publicnode.com",
  42161: "https://arb1.arbitrum.io/rpc",
  8453: "https://mainnet.base.org",
  137: "https://polygon-bor-rpc.publicnode.com",
};

/** Poll eth_getTransactionReceipt until confirmed or timeout (60s) */
async function waitForReceipt(txHash: string, chainIndex: number): Promise<boolean> {
  const rpcUrl = RPC_URLS[chainIndex];
  if (!rpcUrl || !txHash) return false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getTransactionReceipt",
          params: [txHash],
          id: 1,
        }),
      });
      const json = await res.json();
      if (json.result?.status === "0x1") return true;
      if (json.result?.status === "0x0") return false; // reverted
    } catch {}
  }
  return false;
}

// ─── Supply Dialog ──────────────────────────────────────────────────────────

type SupplyStep = "idle" | "approving" | "waiting_approve" | "approved" | "supplying" | "done";

interface SupplyDialogProps {
  market: FluidMarket;
  walletAddress: string;
}

function SupplyDialog({ market, walletAddress }: SupplyDialogProps) {
  const t = useT("earn");
  const tc = useT("common");
  const f = useFormat();
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<SupplyStep>("idle");
  const [approveTxHash, setApproveTxHash] = useState("");
  const [depositTxHash, setDepositTxHash] = useState("");
  const [open, setOpen] = useState(false);
  const [approveFailed, setApproveFailed] = useState(false);
  const approveRef = useRef(false);
  const supplyRef = useRef(false);
  const amountValid = isValidAmount(amount);
  const walletReady = EVM_ADDRESS_RE.test(walletAddress);
  const supplyAmountId = `supply-amount-${market.chainIndex}-${market.fTokenAddress}`;
  const asset = assetOf(market);

  const handleApprove = async () => {
    if (approveRef.current) return;
    if (!amountValid || !walletReady) return;
    approveRef.current = true;
    setApproveFailed(false);
    setStep("approving");
    try {
      const res = await fetch("/api/earn/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fTokenSymbol: market.symbol,
          amount: normalizeAmount(amount),
          chainIndex: market.chainIndex,
          walletAddress,
          // Pass live addresses from the resolver to override stale constants
          fTokenAddress: market.fTokenAddress,
          underlyingAddress: market.underlyingAddress || undefined,
          decimals: market.underlyingDecimals,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Approve failed");
      // The route answers `alreadyApproved` (with no hash) when the existing
      // allowance already covers this amount — nothing to wait for.
      if (data.data?.alreadyApproved) {
        setStep("approved");
        toast.success(t("toastAlreadyApproved"));
        return;
      }
      const txHash = data.data?.txHash ?? "";
      setApproveTxHash(txHash);
      setStep("waiting_approve");
      toast.info(t("toastWaitingApproval"));
      // Wait for the approve tx to be mined before enabling Supply
      const confirmed = await waitForReceipt(txHash, market.chainIndex);
      if (!confirmed) {
        setApproveFailed(true);
        return;
      }
      setStep("approved");
      toast.success(t("toastApprovalConfirmed"));
    } catch (e) {
      console.error(e);
      toast.error(userFacingError(e, t("supplyFailed")));
      setStep("idle");
    } finally {
      approveRef.current = false;
    }
  };

  const handleSupply = async () => {
    if (supplyRef.current) return;
    if (!amountValid || !walletReady) return;
    supplyRef.current = true;
    setStep("supplying");
    try {
      const res = await fetch("/api/earn/supply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fTokenSymbol: market.symbol,
          amount: normalizeAmount(amount),
          chainIndex: market.chainIndex,
          walletAddress,
          // Pass live addresses from the resolver to override stale constants
          fTokenAddress: market.fTokenAddress,
          underlyingAddress: market.underlyingAddress || undefined,
          decimals: market.underlyingDecimals,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Supply failed");
      setDepositTxHash(data.data?.depositTxHash ?? "");
      setStep("done");
      toast.success(t("toastSupplied"));
    } catch (e) {
      console.error(e);
      toast.error(userFacingError(e, t("supplyFailed")));
      setStep("approved"); // allow retry
    } finally {
      supplyRef.current = false;
    }
  };

  const reset = () => {
    setAmount("");
    setStep("idle");
    setApproveTxHash("");
    setDepositTxHash("");
    setApproveFailed(false);
  };

  const isWaiting = step === "waiting_approve";
  const approveComplete = step === "approved" || step === "supplying" || step === "done";


  const close = () => {
    setOpen(false);
    reset();
  };

  return (
    <>
      <button type="button" className="btn btn--sm btn--primary" onClick={() => setOpen(true)}>
        {t("supply")}
      </button>
      <Sheet open={open} onClose={close} title={t("supplyTitle", { symbol: asset.symbol, network: networkName(market.chainIndex, t("unknownNetwork")) })}>
        <div className="sheet-body">
          <div className="yield-hero">
            <TokenIcon symbol={asset.symbol} size={40} chainIndex={market.chainIndex} />
            <div>
              <span className="muted">{t("estimatedYield")}</span>
              <span className="num">{f.percent(market.totalAprPercent)}</span>
            </div>
          </div>

          <div className="field">
            <label htmlFor={supplyAmountId}>{t("amountIn", { symbol: asset.symbol })}</label>
            <input
              id={supplyAmountId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="100"
              className="input num-in"
              value={amount}
              aria-invalid={amount.length > 0 && !amountValid}
              onChange={(e) => setAmount(e.target.value)}
              disabled={step !== "idle"}
            />
            {amount.length > 0 && !amountValid && <p className="err">{t("invalidAmount")}</p>}
          </div>

          <ol className="two-steps" aria-label={t("progress")}>
            <li data-state={approveComplete ? "done" : isWaiting && !approveFailed ? "busy" : step === "approving" ? "busy" : "todo"}>
              <span className="dot" aria-hidden="true">
                {approveComplete ? <LineIcon name="check" size={13} strokeWidth={2.6} /> : isWaiting && !approveFailed ? <span className="spin" /> : "1"}
              </span>
              {t("approve")}
            </li>
            <li className="line" aria-hidden="true" />
            <li data-state={step === "done" ? "done" : step === "supplying" ? "busy" : "todo"}>
              <span className="dot" aria-hidden="true">
                {step === "done" ? <LineIcon name="check" size={13} strokeWidth={2.6} /> : step === "supplying" ? <span className="spin" /> : "2"}
              </span>
              {t("supply")}
            </li>
          </ol>

          {isWaiting && !approveFailed && (
            <p className="note warn">
              <span className="spin" aria-hidden="true" />
              <span>
                {t("waitingApproval")}{" "}
                <TxLink chainIndex={market.chainIndex} hash={approveTxHash} />
              </span>
            </p>
          )}
          {isWaiting && approveFailed && (
            <p className="note loss">
              <LineIcon name="alert" size={16} />
              <span>{t("approvalNotConfirmed")}</span>
            </p>
          )}

          {step === "done" ? (
            <div className="note gain msg-note">
              <LineIcon name="check" size={16} />
              <div>
                <strong>{t("supplied")}</strong>
                {txUrl(market.chainIndex, depositTxHash) && (
                  <p>
                    <TxLink chainIndex={market.chainIndex} hash={depositTxHash} />
                  </p>
                )}
              </div>
              <button type="button" className="btn btn--sm" onClick={close}>
                {tc("close")}
              </button>
            </div>
          ) : step === "idle" || step === "approving" ? (
            <button type="button" className="btn btn--primary sheet-cta" disabled={step === "approving" || !amountValid || !walletReady} onClick={handleApprove}>
              {step === "approving" ? (
                <>
                  <span className="spin" aria-hidden="true" /> {t("approving")}
                </>
              ) : (
                t("approveAmount", { amount: amount || "0", symbol: asset.symbol })
              )}
            </button>
          ) : step === "waiting_approve" ? (
            approveFailed ? (
              <button type="button" className="btn btn--primary sheet-cta" disabled={!amountValid || !walletReady} onClick={handleApprove}>
                {t("retryApproval")}
              </button>
            ) : (
              <button type="button" className="btn btn--primary sheet-cta" disabled>
                <span className="spin" aria-hidden="true" /> {t("waitingConfirmation")}
              </button>
            )
          ) : (
            <>
              {approveTxHash && (
                <p className="note gain">
                  <LineIcon name="check" size={16} />
                  <span>
                    {t("approvalConfirmed")} <TxLink chainIndex={market.chainIndex} hash={approveTxHash} />
                  </span>
                </p>
              )}
              <button type="button" className="btn btn--primary sheet-cta" disabled={step === "supplying" || !amountValid || !walletReady} onClick={handleSupply}>
                {step === "supplying" ? (
                  <>
                    <span className="spin" aria-hidden="true" /> {t("supplying")}
                  </>
                ) : (
                  t("supplyAmount", { amount, symbol: asset.symbol })
                )}
              </button>
            </>
          )}

          <p className="hint">{t("approvalHint", { symbol: asset.symbol })}</p>
        </div>
      </Sheet>
    </>
  );
}

// ─── Withdraw Dialog ─────────────────────────────────────────────────────────

interface WithdrawDialogProps {
  position: FluidUserPosition;
  walletAddress: string;
  apy?: number;
  onSuccess: () => void;
}

function WithdrawDialog({ position, walletAddress, apy, onSuccess }: WithdrawDialogProps) {
  const t = useT("earn");
  const tc = useT("common");
  const f = useFormat();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);
  const withdrawRef = useRef(false);
  const amountValid = isValidAmount(amount);
  const walletReady = EVM_ADDRESS_RE.test(walletAddress);
  const withdrawAmountId = `withdraw-amount-${position.chainIndex}-${position.fTokenAddress}`;
  const asset = assetOf(position);

  const handleWithdraw = async (isAll = false) => {
    if (withdrawRef.current) return;
    const withdrawAmount = isAll ? position.underlyingAssetsUi : normalizeAmount(amount);
    if (!walletReady) return;
    if (!isAll && !amountValid) return;
    if (!withdrawAmount) return;
    withdrawRef.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/earn/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fTokenSymbol: position.symbol,
          amount: withdrawAmount,
          chainIndex: position.chainIndex,
          walletAddress,
          fTokenAddress: position.fTokenAddress,
          decimals: position.underlyingDecimals,
          isAll,
          shares: isAll ? position.shares : undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Withdraw failed");
      setTxHash(data.data?.txHash ?? "");
      setDone(true);
      toast.success(t("withdrawalSent"));
      onSuccess();
    } catch (e) {
      console.error(e);
      toast.error(userFacingError(e, t("withdrawalFailed")));
    } finally {
      withdrawRef.current = false;
      setLoading(false);
    }
  };

  const reset = () => {
    setAmount("");
    setTxHash("");
    setDone(false);
  };

  const maxAmount = position.underlyingAssetsUi;


  const close = () => {
    setOpen(false);
    reset();
  };

  return (
    <>
      <button type="button" className="btn btn--sm" onClick={() => setOpen(true)}>
        {t("withdraw")}
      </button>
      <Sheet open={open} onClose={close} title={t("withdrawTitle", { symbol: asset.symbol, network: networkName(position.chainIndex, t("unknownNetwork")) })}>
        <div className="sheet-body">
          <dl className="sum">
            <div>
              <dt>{t("available")}</dt>
              <dd className="num">
                {f.amount(maxAmount)} {asset.symbol}
              </dd>
            </div>
            {apy !== undefined && (
              <div>
                <dt>{t("currentYield")}</dt>
                <dd className="num">{f.percent(apy)}</dd>
              </div>
            )}
          </dl>

          {done ? (
            <div className="note gain msg-note">
              <LineIcon name="check" size={16} />
              <div>
                <strong>{t("withdrawalSent")}</strong>
                {txUrl(position.chainIndex, txHash) && (
                  <p>
                    <TxLink chainIndex={position.chainIndex} hash={txHash} />
                  </p>
                )}
              </div>
              <button type="button" className="btn btn--sm" onClick={close}>
                {tc("close")}
              </button>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor={withdrawAmountId}>{t("amountIn", { symbol: asset.symbol })}</label>
                <div className="input-wrap">
                  <input
                    id={withdrawAmountId}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={t("amountPlaceholder")}
                    className="input num-in"
                    value={amount}
                    aria-invalid={amount.length > 0 && !amountValid}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={loading}
                  />
                  <button type="button" className="max" aria-label={t("useMax")} onClick={() => setAmount(maxAmount)}>
                    {t("max")}
                  </button>
                </div>
                {amount.length > 0 && !amountValid && <p className="err">{t("invalidAmount")}</p>}
              </div>

              <div className="sheet-actions">
                <button type="button" className="btn" disabled={loading || !walletReady} onClick={() => handleWithdraw(true)}>
                  {loading ? <span className="spin" aria-hidden="true" /> : t("withdrawAll")}
                </button>
                <button type="button" className="btn btn--primary" disabled={loading || !amountValid || !walletReady} onClick={() => handleWithdraw(false)}>
                  {loading ? <span className="spin" aria-hidden="true" /> : t("withdrawAmount", { amount: amount || "" }).trim()}
                </button>
              </div>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EarnPage() {
  const t = useT("earn");
  const f = useFormat();
  const { authenticated, walletAddress } = useAuth();
  const { markets, isLoading } = useFluidMarkets();
  const { positions, isLoading: positionsLoading, mutate: mutatePositions } = useFluidPositions(walletAddress);
  const [activeChain, setActiveChain] = useState<string>("all");

  if (!authenticated) {
    return (
      <div className="page">
        <Empty icon="trending-up" title={t("signInTitle")} text={t("signInText")} />
      </div>
    );
  }

  // Cross-reference positions with markets to get current APY
  const getPositionApy = (pos: FluidUserPosition): number | undefined => {
    const market = markets.find(
      (m) =>
        m.chainIndex === pos.chainIndex &&
        m.fTokenAddress.toLowerCase() === pos.fTokenAddress.toLowerCase()
    );
    return market?.totalAprPercent;
  };

  const visibleMarkets = markets
    .filter((m) => activeChain === "all" || String(m.chainIndex) === activeChain)
    .sort((a, b) => b.totalAprPercent - a.totalAprPercent);
  const best = [...markets].sort((a, b) => b.totalAprPercent - a.totalAprPercent)[0];
  // Fluid's rewards are 0% on most markets: the column shows only when one pays.
  const showRewards = visibleMarkets.some((m) => m.rewardsRatePercent > 0);
  const rewardsCls = showRewards ? "" : " no-rewards";
  const bestAsset = best ? assetOf(best) : null;

  return (
    <div className="page">
      <PageHead title={t("title")} lede={t("lede")} />

      <div className="metrics in" style={{ "--i": 1 } as React.CSSProperties}>
        <Metric
          label={t("bestYield")}
          value={isLoading ? "…" : best ? f.percent(best.totalAprPercent) : t("notAvailable")}
          sub={best && bestAsset ? t("assetOn", { symbol: bestAsset.symbol, network: networkName(best.chainIndex, t("unknownNetwork")) }) : undefined}
        />
        <Metric label={t("markets")} value={isLoading ? "…" : markets.length} sub={t("onChains", { count: CHAIN_TABS.length - 1 })} />
        <Metric label={t("yourPositions")} value={positionsLoading ? "…" : positions.length} sub={positionsLoading ? undefined : positions.length ? t("earningNow", { count: positions.length }) : t("nothingSupplied")} />
      </div>

      {/* Only when there is something to show: a panel that appears and vanishes would shift the page. */}
      {!positionsLoading && positions.length > 0 && (
        <Panel flush index={2} title={t("yourPositions")} sub={t("positionsSub")}>
          {positionsLoading ? (
            <div className="wal-pad" style={{ display: "grid", gap: 12 }}>
              <Skeleton height={56} />
            </div>
          ) : (
            <ul className="rows wal-pad">
              {positions.map((pos) => {
                const apy = getPositionApy(pos);
                const asset = assetOf(pos);
                return (
                  <li key={`${pos.chainIndex}-${pos.fTokenAddress}`}>
                    <div className="row mkt-row">
                      <TokenIcon symbol={asset.symbol} size={36} chainIndex={pos.chainIndex} />
                      <div style={{ minWidth: 0 }}>
                        <div className="t">{asset.symbol}</div>
                        <div className="sub">{networkName(pos.chainIndex, t("unknownNetwork"))}</div>
                      </div>
                      <div className="end">
                        <div className="num">
                          {f.amount(pos.underlyingAssetsUi)} {asset.symbol}
                        </div>
                        {apy !== undefined && <div className="sub num">{t("perYear", { percent: f.percent(apy) })}</div>}
                      </div>
                      <WithdrawDialog
                        position={pos}
                        walletAddress={walletAddress ?? ""}
                        apy={apy}
                        onSuccess={() => setTimeout(() => mutatePositions(), 5000)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      <Panel
        flush
        index={3}
        title={t("marketsTitle")}
        sub={t("marketsSub")}
        action={
          <PillTabs
            id="earn-chain"
            label={t("filterByChain")}
            value={activeChain}
            onChange={setActiveChain}
            options={CHAIN_TABS.map((tab) => ({ value: tab.id as string, label: tab.id === "all" ? t("allChains") : tab.label }))}
          />
        }
      >
        {isLoading ? (
          <div className="wal-pad" style={{ display: "grid", gap: 12 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={56} />
            ))}
          </div>
        ) : visibleMarkets.length === 0 ? (
          <Empty icon="trending-up" title={t("noMarketsTitle")} text={t("noMarketsText")} />
        ) : (
          <>
            <div className={`mkt-head${rewardsCls}`} aria-hidden="true">
              <span>{t("colAsset")}</span>
              {/* Without rewards, supply and yield are the same number: show it once. */}
              {showRewards && <span>{t("colSupply")}</span>}
              {showRewards && <span>{t("colRewards")}</span>}
              <span>{t("colYield")}</span>
              <span />
            </div>
            <ul className="rows wal-pad">
              {visibleMarkets.map((market) => {
                const asset = assetOf(market);
                return (
                  <li key={`${market.chainIndex}-${market.fTokenAddress}`}>
                    <div className={`row mkt-row mkt-row--full${rewardsCls}`}>
                      <TokenIcon symbol={asset.symbol} size={36} chainIndex={market.chainIndex} />
                      <div style={{ minWidth: 0 }}>
                        <div className="t">{asset.symbol}</div>
                        <div className="sub">{networkName(market.chainIndex, t("unknownNetwork"))}</div>
                      </div>
                      {showRewards && <span className="num col-x">{f.percent(market.supplyRatePercent)}</span>}
                      {showRewards && <span className="num col-x">{f.percent(market.rewardsRatePercent)}</span>}
                      <span className="glp apr">{f.percent(market.totalAprPercent)}</span>
                      <SupplyDialog market={market} walletAddress={walletAddress ?? ""} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}
