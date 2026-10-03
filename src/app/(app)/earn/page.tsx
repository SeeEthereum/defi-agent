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

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL_AMOUNT_RE = /^\d+(\.\d+)?$/;

function normalizeAmount(raw: string): string {
  return raw.trim().replace(",", ".");
}

function isValidAmount(raw: string): boolean {
  const normalized = normalizeAmount(raw);
  return DECIMAL_AMOUNT_RE.test(normalized) && Number(normalized) > 0;
}

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

const CHAIN_TABS = [
  { id: "all", label: "All" },
  { id: "1", label: "Ethereum" },
  { id: "42161", label: "Arbitrum" },
  { id: "8453", label: "Base" },
  { id: "137", label: "Polygon" },
] as const;

const CHAIN_NAMES: Record<number, string> = { 1: "Ethereum", 42161: "Arbitrum", 8453: "Base", 137: "Polygon" };

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
        toast.success("Already approved. Now press Supply.");
        return;
      }
      const txHash = data.data?.txHash ?? "";
      setApproveTxHash(txHash);
      setStep("waiting_approve");
      toast.info("Waiting for the approval to confirm on-chain…");
      // Wait for the approve tx to be mined before enabling Supply
      const confirmed = await waitForReceipt(txHash, market.chainIndex);
      if (!confirmed) {
        setApproveFailed(true);
        return;
      }
      setStep("approved");
      toast.success("Approval confirmed. Now press Supply.");
    } catch (e) {
      console.error(e);
      toast.error(userFacingError(e, "Supply failed"));
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
      toast.success("Supplied to Fluid");
    } catch (e) {
      console.error(e);
      toast.error(userFacingError(e, "Supply failed"));
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
        Supply
      </button>
      <Sheet open={open} onClose={close} title={`Supply ${market.underlyingSymbol} on ${market.chainName}`}>
        <div className="sheet-body">
          <div className="yield-hero">
            <TokenIcon symbol={market.underlyingSymbol} size={40} />
            <div>
              <span className="muted">Estimated yield</span>
              <span className="num text-gain-ink">{market.totalAprPercent.toFixed(2)}%</span>
            </div>
          </div>

          <div className="field">
            <label htmlFor={supplyAmountId}>Amount in {market.underlyingSymbol}</label>
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
            {amount.length > 0 && !amountValid && <p className="err">Enter a valid amount</p>}
          </div>

          <ol className="two-steps" aria-label="Progress">
            <li data-state={approveComplete ? "done" : isWaiting && !approveFailed ? "busy" : step === "approving" ? "busy" : "todo"}>
              <span className="dot" aria-hidden="true">
                {approveComplete ? <LineIcon name="check" size={13} strokeWidth={2.6} /> : isWaiting && !approveFailed ? <span className="spin" /> : "1"}
              </span>
              Approve
            </li>
            <li className="line" aria-hidden="true" />
            <li data-state={step === "done" ? "done" : step === "supplying" ? "busy" : "todo"}>
              <span className="dot" aria-hidden="true">
                {step === "done" ? <LineIcon name="check" size={13} strokeWidth={2.6} /> : step === "supplying" ? <span className="spin" /> : "2"}
              </span>
              Supply
            </li>
          </ol>

          {isWaiting && !approveFailed && (
            <p className="note warn">
              <span className="spin" aria-hidden="true" />
              <span>
                Waiting for the approval to confirm on-chain
                {approveTxHash && <span className="num"> ({approveTxHash.slice(0, 8)}…)</span>}
              </span>
            </p>
          )}
          {isWaiting && approveFailed && (
            <p className="note loss">
              <LineIcon name="alert" size={16} />
              <span>The approval was not confirmed. Try again.</span>
            </p>
          )}

          {step === "done" ? (
            <div className="note gain msg-note">
              <LineIcon name="check" size={16} />
              <div>
                <strong>Supplied</strong>
                {depositTxHash && (
                  <p className="num">
                    {depositTxHash.slice(0, 10)}…{depositTxHash.slice(-8)}
                  </p>
                )}
              </div>
              <button type="button" className="btn btn--sm" onClick={close}>
                Close
              </button>
            </div>
          ) : step === "idle" || step === "approving" ? (
            <button type="button" className="btn btn--primary sheet-cta" disabled={step === "approving" || !amountValid || !walletReady} onClick={handleApprove}>
              {step === "approving" ? (
                <>
                  <span className="spin" aria-hidden="true" /> Approving…
                </>
              ) : (
                `Approve ${amount || "0"} ${market.underlyingSymbol}`
              )}
            </button>
          ) : step === "waiting_approve" ? (
            approveFailed ? (
              <button type="button" className="btn btn--primary sheet-cta" disabled={!amountValid || !walletReady} onClick={handleApprove}>
                Try the approval again
              </button>
            ) : (
              <button type="button" className="btn btn--primary sheet-cta" disabled>
                <span className="spin" aria-hidden="true" /> Waiting for confirmation…
              </button>
            )
          ) : (
            <>
              {approveTxHash && (
                <p className="note gain">
                  <LineIcon name="check" size={16} />
                  <span>
                    Approved in <span className="num">{approveTxHash.slice(0, 8)}…{approveTxHash.slice(-6)}</span>
                  </span>
                </p>
              )}
              <button type="button" className="btn btn--primary sheet-cta" disabled={step === "supplying" || !amountValid || !walletReady} onClick={handleSupply}>
                {step === "supplying" ? (
                  <>
                    <span className="spin" aria-hidden="true" /> Supplying…
                  </>
                ) : (
                  `Supply ${amount} ${market.underlyingSymbol}`
                )}
              </button>
            </>
          )}

          <p className="hint">
            The approval lets Fluid use your {market.underlyingSymbol}. The supply starts only after the approval is confirmed&nbsp;on-chain.
          </p>
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
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);
  const withdrawRef = useRef(false);
  const amountValid = isValidAmount(amount);
  const walletReady = EVM_ADDRESS_RE.test(walletAddress);
  const withdrawAmountId = `withdraw-amount-${position.chainIndex}-${position.fTokenAddress}`;

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
      toast.success("Withdrawal sent");
      onSuccess();
    } catch (e) {
      console.error(e);
      toast.error(userFacingError(e, "Withdrawal failed"));
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
        Withdraw
      </button>
      <Sheet open={open} onClose={close} title={`Withdraw ${position.underlyingSymbol} on ${CHAIN_NAMES[position.chainIndex] ?? `chain ${position.chainIndex}`}`}>
        <div className="sheet-body">
          <dl className="sum">
            <div>
              <dt>Available</dt>
              <dd className="num">
                {parseFloat(maxAmount).toFixed(6)} {position.underlyingSymbol}
              </dd>
            </div>
            <div>
              <dt>Shares ({position.symbol})</dt>
              <dd className="num">{(parseFloat(position.shares) / 10 ** position.underlyingDecimals).toFixed(6)}</dd>
            </div>
            {apy !== undefined && (
              <div>
                <dt>Current yield</dt>
                <dd className="num text-gain-ink">{apy.toFixed(2)}%</dd>
              </div>
            )}
          </dl>

          {done ? (
            <div className="note gain msg-note">
              <LineIcon name="check" size={16} />
              <div>
                <strong>Withdrawal sent</strong>
                {txHash && (
                  <p className="num">
                    {txHash.slice(0, 10)}…{txHash.slice(-8)}
                  </p>
                )}
              </div>
              <button type="button" className="btn btn--sm" onClick={close}>
                Close
              </button>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor={withdrawAmountId}>Amount in {position.underlyingSymbol}</label>
                <div className="input-wrap">
                  <input
                    id={withdrawAmountId}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    className="input num-in"
                    value={amount}
                    aria-invalid={amount.length > 0 && !amountValid}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={loading}
                  />
                  <button type="button" className="max" aria-label="Use maximum balance" onClick={() => setAmount(maxAmount)}>
                    Max
                  </button>
                </div>
                {amount.length > 0 && !amountValid && <p className="err">Enter a valid amount</p>}
              </div>

              <div className="sheet-actions">
                <button type="button" className="btn" disabled={loading || !walletReady} onClick={() => handleWithdraw(true)}>
                  {loading ? <span className="spin" aria-hidden="true" /> : "Withdraw all"}
                </button>
                <button type="button" className="btn btn--primary" disabled={loading || !amountValid || !walletReady} onClick={() => handleWithdraw(false)}>
                  {loading ? <span className="spin" aria-hidden="true" /> : `Withdraw ${amount || ""}`.trim()}
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
  const { authenticated, walletAddress } = useAuth();
  const { markets, isLoading } = useFluidMarkets();
  const { positions, isLoading: positionsLoading, mutate: mutatePositions } = useFluidPositions(walletAddress);
  const [activeChain, setActiveChain] = useState<string>("all");

  if (!authenticated) {
    return (
      <div className="page">
        <Empty icon="trending-up" title="Sign in first" text="Connect your wallet to lend on Fluid." />
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

  return (
    <div className="page">
      <PageHead title="Earn" lede="Lend your tokens on Fluid and earn a variable yield, paid by the people who&nbsp;borrow." />

      <div className="metrics in" style={{ "--i": 1 } as React.CSSProperties}>
        <Metric
          label="Best yield now"
          value={isLoading ? "…" : best ? <span className="text-gain-ink">{best.totalAprPercent.toFixed(2)}%</span> : "n/a"}
          sub={best ? `${best.underlyingSymbol} on ${best.chainName}` : undefined}
        />
        <Metric label="Markets" value={isLoading ? "…" : markets.length} sub={`on ${CHAIN_TABS.length - 1} chains`} />
        <Metric label="Your positions" value={positionsLoading ? "…" : positions.length} sub={positionsLoading ? undefined : positions.length ? "earning now" : "nothing supplied yet"} />
      </div>

      {(positionsLoading || positions.length > 0) && (
        <Panel flush index={2} title="Your positions" sub="Supplied to Fluid, earning yield">
          {positionsLoading ? (
            <div className="wal-pad" style={{ display: "grid", gap: 12 }}>
              <Skeleton height={56} />
            </div>
          ) : (
            <ul className="rows wal-pad">
              {positions.map((pos) => {
                const apy = getPositionApy(pos);
                return (
                  <li key={`${pos.chainIndex}-${pos.fTokenAddress}`}>
                    <div className="row mkt-row">
                      <TokenIcon symbol={pos.underlyingSymbol} size={36} />
                      <div style={{ minWidth: 0 }}>
                        <div className="t">{pos.underlyingSymbol}</div>
                        <div className="sub">{CHAIN_NAMES[pos.chainIndex] ?? `Chain ${pos.chainIndex}`}</div>
                      </div>
                      <div className="end">
                        <div className="num">
                          {parseFloat(pos.underlyingAssetsUi).toFixed(4)} {pos.underlyingSymbol}
                        </div>
                        {apy !== undefined && <div className="sub num text-gain-ink">{apy.toFixed(2)}% a year</div>}
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
        title="Fluid markets"
        sub="Live rates from on-chain data, best first"
        action={
          <PillTabs
            id="earn-chain"
            label="Filter by chain"
            value={activeChain}
            onChange={setActiveChain}
            options={CHAIN_TABS.map((t) => ({ value: t.id as string, label: t.label }))}
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
          <Empty icon="trending-up" title="No markets here" text="Fluid has no market on this chain right now." />
        ) : (
          <>
            <div className="mkt-head" aria-hidden="true">
              <span>Asset</span>
              <span>Supply</span>
              <span>Rewards</span>
              <span>Yield</span>
              <span />
            </div>
            <ul className="rows wal-pad">
              {visibleMarkets.map((market) => (
                <li key={`${market.chainIndex}-${market.fTokenAddress}`}>
                  <div className="row mkt-row mkt-row--full">
                    <TokenIcon symbol={market.underlyingSymbol} size={36} />
                    <div style={{ minWidth: 0 }}>
                      <div className="t">{market.underlyingSymbol}</div>
                      <div className="sub">{market.chainName}</div>
                    </div>
                    <span className="num col-x">{market.supplyRatePercent.toFixed(2)}%</span>
                    <span className="num col-x">{market.rewardsRatePercent.toFixed(2)}%</span>
                    <span className="glp pos">{market.totalAprPercent.toFixed(2)}%</span>
                    <SupplyDialog market={market} walletAddress={walletAddress ?? ""} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}
