"use client";

/**
 * GasStationModal — stablecoin gas-payment picker.
 *
 * Shown when an execute endpoint (swap / bridge / send) responds with
 * `requiresGasStation: true`: the wallet lacks native gas on the chain and
 * the backend offers to pay gas with a stablecoin (USDT/USDC/USDG) via the
 * OKX Gas Station relayer.
 *
 * Flow (see src/lib/okx/gas-station.ts for the server contract):
 *   pick token → POST /api/wallet/gas-station (setup or
 *   update-default-token, depending on the backend status) → onResolved()
 *   re-runs the original transaction, which now hits the automatic path.
 *
 * INSUFFICIENT_ALL / HAS_PENDING_TX are terminal — message only, no retry.
 *
 * UX constraints from the OKX skill reference (gas-station.md): never
 * present Gas Station as free (a service fee in the chosen stablecoin
 * applies), require explicit consent for first-time activation, and keep
 * internal mechanism terms (7702 / delegation / relayer) out of the copy.
 */

import { useState } from "react";
import { Modal } from "@/components/motion/modal";
import type { GasStationConfirming, GasStationToken } from "@/lib/okx/types";

// Backend states that require the one-time on-chain activation (handled by
// the "setup" action) rather than a default-token switch.
const ACTIVATION_STATES = new Set([
  "FIRST_TIME_PROMPT",
  "PENDING_UPGRADE",
  "REENABLE_ONLY",
]);

const TERMINAL_STATES = new Set(["INSUFFICIENT_ALL", "HAS_PENDING_TX"]);

function tokenLabel(t: GasStationToken): string {
  return (
    t.symbol ??
    t.feeTokenSymbol ??
    `${t.feeTokenAddress.slice(0, 6)}…${t.feeTokenAddress.slice(-4)}`
  );
}

interface GasStationModalProps {
  open: boolean;
  /** Chain index (e.g. "42161") of the transaction that triggered the prompt. */
  chain: string;
  payload: GasStationConfirming | null;
  onClose: () => void;
  /** Called after the gas token is set up — re-run the original transaction. */
  onResolved: () => void;
}

export function GasStationModal({
  open,
  chain,
  payload,
  onClose,
  onResolved,
}: GasStationModalProps) {
  const [selected, setSelected] = useState<GasStationToken | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!payload) return null;

  const status = payload.status ?? "";
  const isTerminal = TERMINAL_STATES.has(status);
  const needsActivation = ACTIVATION_STATES.has(status);
  const pickable = payload.tokenList.filter((t) => t.sufficient !== false);

  const confirm = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = needsActivation
        ? {
            action: "setup",
            chain,
            gasTokenAddress: selected.feeTokenAddress,
            relayerId: selected.relayerId ?? "",
          }
        : {
            action: "update-default-token",
            chain,
            gasTokenAddress: selected.feeTokenAddress,
          };
      const res = await fetch("/api/wallet/gas-station", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? "Gas Station setup failed. Please try again.");
        return;
      }
      onResolved();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Gas Station setup failed. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={submitting ? undefined : onClose}>
      <div className="rounded-2xl border border-border/60 bg-secondary p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {isTerminal ? "Gas Station unavailable" : "Pay gas with a stablecoin?"}
          </h2>
          {!isTerminal && (
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Your native token balance isn&apos;t enough to pay gas on this
              chain. Gas Station can pay it for you and charge the fee in a
              stablecoin instead. A service fee in the selected token applies —
              it is not free.{" "}
              <a
                href="https://web3.okx.com/learn/wallet-gas-station"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Learn more
              </a>
            </p>
          )}
        </div>

        {/* Backend message is authoritative — token balances and fees live here */}
        {payload.message && (
          <div className="rounded-xl bg-secondary/80 border border-border/40 p-3 text-[12px] text-muted-foreground whitespace-pre-wrap max-h-40 overflow-auto">
            {payload.message}
          </div>
        )}

        {isTerminal ? (
          <button
            onClick={onClose}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Close
          </button>
        ) : (
          <>
            {pickable.length > 0 ? (
              <div className="space-y-2">
                {pickable.map((t) => (
                  <button
                    key={t.feeTokenAddress}
                    onClick={() => setSelected(t)}
                    disabled={submitting}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                      selected?.feeTokenAddress === t.feeTokenAddress
                        ? "border-primary bg-primary/12 text-foreground"
                        : "border-border/60 bg-secondary/80 text-foreground hover:bg-primary/8"
                    }`}
                  >
                    <span>{tokenLabel(t)}</span>
                    {typeof t.balance === "string" && (
                      <span className="ml-2 text-[12px] text-muted-foreground tabular-nums">
                        balance {t.balance}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                No stablecoin on this chain has enough balance to cover the
                fee. Top up your wallet and try again.
              </p>
            )}

            {needsActivation && (
              <p className="text-[12px] text-muted-foreground">
                Enabling runs a one-time setup on this chain (its cost is
                bundled into this transaction). Afterwards, when your native
                balance is low, gas is paid with the chosen stablecoin
                automatically — no further prompts.
              </p>
            )}

            {error && (
              <p className="text-[13px] text-red-400" role="alert">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={submitting}
                className="flex-1 h-11 rounded-xl border border-border/60 bg-secondary/80 text-sm font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                disabled={!selected || submitting || pickable.length === 0}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {submitting
                  ? "Setting up…"
                  : needsActivation
                    ? "Enable & retry"
                    : "Use token & retry"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
