"use client";

/**
 * The wallet's own risk warning, shown before a flagged transaction is signed.
 *
 * When the OKX backend flags a transaction (a possible large loss, a risky
 * address), the route answers 428 `risk_confirmation` with the backend's
 * message and signs nothing. The app layout's fetch wrapper calls
 * `askRiskConfirmation`, this dialog shows the message as it is, and only
 * "Send anyway" re-sends the request with `acknowledgeRisk: true`.
 * Cancel is focused first, and Escape or a click outside also cancels.
 */

import { useSyncExternalStore } from "react";
import { Modal } from "@/components/motion/modal";
import { useT } from "@/i18n/client";

interface Prompt {
  message: string;
  resolve: (accepted: boolean) => void;
}

let current: Prompt | null = null;
let queue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Ask the user about one flagged transaction. Prompts are shown one at a time. */
export function askRiskConfirmation(message: string): Promise<boolean> {
  const next = queue.then(
    () =>
      new Promise<boolean>((resolve) => {
        current = { message, resolve };
        emit();
      })
  );
  queue = next.catch(() => undefined);
  return next;
}

function answer(accepted: boolean): void {
  const prompt = current;
  current = null;
  emit();
  prompt?.resolve(accepted);
}

export function RiskConfirmHost() {
  const t = useT("riskConfirm");
  const tc = useT("common");
  const prompt = useSyncExternalStore(
    subscribe,
    () => current,
    () => null
  );

  return (
    <Modal open={prompt !== null} onClose={() => answer(false)}>
      <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">{t("intro")}</p>
        </div>

        <div
          className="rounded-xl bg-loss-soft border border-loss/30 p-3 text-[13px] text-foreground whitespace-pre-wrap max-h-48 overflow-auto"
          role="alert"
        >
          {prompt?.message || t("noReason")}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => answer(false)}
            className="flex-1 h-11 rounded-xl border border-border/60 bg-secondary/80 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
          >
            {tc("cancel")}
          </button>
          <button
            onClick={() => answer(true)}
            className="flex-1 h-11 rounded-xl bg-loss text-white text-sm font-medium hover:bg-loss/90 transition-colors"
          >
            {t("sendAnyway")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
