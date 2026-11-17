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
import { TokenIcon } from "@/components/token-icon";
import { getChainByIndex } from "@/lib/chains";
import { useFormat, useT } from "@/i18n/client";
import { chainName, displayToken } from "@/lib/tokens/display";
import type { GasStationConfirming, GasStationToken } from "@/lib/okx/types";

// Backend states that require the one-time on-chain activation (handled by
// the "setup" action) rather than a default-token switch.
const ACTIVATION_STATES = new Set([
  "FIRST_TIME_PROMPT",
  "PENDING_UPGRADE",
  "REENABLE_ONLY",
]);

// States where no token choice can help: the user must top up, wait for a
// pending transaction, or use native gas. NOT_SUPPORT_INTENTION (added in
// CLI v4) means this particular transaction type can't route through Gas
// Station at all.
const TERMINAL_STATES = new Set([
  "INSUFFICIENT_ALL",
  "HAS_PENDING_TX",
  "NOT_SUPPORT_INTENTION",
]);

/** "USDT" (OKX's "USD₮0" cleaned up), or null when the backend gave no symbol. */
function tokenSymbol(t: GasStationToken, chain: string): string | null {
  const raw = t.symbol ?? t.feeTokenSymbol;
  if (!raw) return null;
  return displayToken({ symbol: raw, chainIndex: chain, tokenAddress: t.feeTokenAddress }).symbol;
}

/** Why Gas Station cannot help, in plain words, for the terminal states (keys of the gasStation messages). */
const TERMINAL_TEXT: Record<string, "insufficientAll" | "hasPendingTx" | "notSupportIntention"> = {
  INSUFFICIENT_ALL: "insufficientAll",
  HAS_PENDING_TX: "hasPendingTx",
  NOT_SUPPORT_INTENTION: "notSupportIntention",
};

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
  const t = useT("gasStation");
  const tc = useT("common");
  const f = useFormat();
  const [selected, setSelected] = useState<GasStationToken | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new prompt starts clean. Reset while rendering (React's "adjust state
  // when a prop changes" pattern) so the old pick never shows for a frame.
  const [shownFor, setShownFor] = useState({ open, chain, payload });
  if (shownFor.open !== open || shownFor.chain !== chain || shownFor.payload !== payload) {
    setShownFor({ open, chain, payload });
    setSelected(null);
    setError(null);
  }

  if (!payload) return null;

  const status = payload.status ?? "";
  const isTerminal = TERMINAL_STATES.has(status);
  const network = chainName(chain) ?? t("thisNetwork");
  const nativeCoin = getChainByIndex(Number(chain))?.nativeSymbol ?? t("nativeCoin");
  const needsActivation = ACTIVATION_STATES.has(status);
  const pickable = payload.tokenList.filter((token) => token.sufficient !== false);

  const selectedIsPickable =
    selected != null &&
    pickable.some((token) => token.feeTokenAddress === selected.feeTokenAddress);

  const confirm = async () => {
    if (!selectedIsPickable || !selected) return;
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
        setError(data.error ?? t("setupFailed"));
        return;
      }
      onResolved();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("setupFailed")
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={submitting ? undefined : onClose}>
      <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {isTerminal ? t("titleUnavailable") : t("titleAsk")}
          </h2>
          {isTerminal && (
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {TERMINAL_TEXT[status] ? t(TERMINAL_TEXT[status]) : t("unavailableDefault")}
            </p>
          )}
          {!isTerminal && (
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {t.node(
                "explain",
                {
                  link: (text) => (
                    <a
                      href="https://web3.okx.com/learn/wallet-gas-station"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {text}
                    </a>
                  ),
                },
                { nativeCoin, network }
              )}
            </p>
          )}
        </div>

        {/* Backend message is authoritative (token balances and fees live
            here), so it stays visible, labelled, under the plain explanation. */}
        {payload.message && (
          <div className="rounded-xl bg-secondary/80 border border-border/40 p-3 text-[12px] text-muted-foreground max-h-40 overflow-auto">
            <p className="mb-1 font-medium text-foreground/80">{t("details")}</p>
            <p className="whitespace-pre-wrap">{payload.message}</p>
          </div>
        )}

        {isTerminal ? (
          <button
            onClick={onClose}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {tc("close")}
          </button>
        ) : (
          <>
            {pickable.length > 0 ? (
              <div className="space-y-2">
                {pickable.map((token) => {
                  const symbol = tokenSymbol(token, chain);
                  return (
                    <button
                      key={token.feeTokenAddress}
                      onClick={() => setSelected(token)}
                      disabled={submitting}
                      title={symbol ? undefined : token.feeTokenAddress}
                      className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                        selected?.feeTokenAddress === token.feeTokenAddress
                          ? "border-primary bg-primary/12 text-foreground"
                          : "border-border/60 bg-secondary/80 text-foreground hover:bg-primary/8"
                      }`}
                    >
                      <TokenIcon symbol={symbol ?? "?"} size={24} chainIndex={chain} />
                      <span>{symbol ?? t("unknownToken")}</span>
                      {typeof token.balance === "string" && token.balance !== "" && (
                        <span className="ml-auto text-[12px] text-muted-foreground tabular-nums">
                          {t("balance", { amount: f.amount(token.balance) })}
                          {symbol ? ` ${symbol}` : ""}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">{t("noneEnough")}</p>
            )}

            {needsActivation && (
              <p className="text-[12px] text-muted-foreground">{t("activationNote")}</p>
            )}

            {error && (
              <p className="text-[13px] text-loss-ink" role="alert">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={submitting}
                className="flex-1 h-11 rounded-xl border border-border/60 bg-secondary/80 text-sm font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={confirm}
                disabled={!selectedIsPickable || submitting}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {submitting
                  ? t("settingUp")
                  : needsActivation
                    ? t("enableRetry")
                    : t("useTokenRetry")}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
