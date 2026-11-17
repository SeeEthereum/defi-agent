"use client";

/**
 * Asks for the 6-digit code OKX emails when approval verification is on.
 *
 * The user turns that protection on in OKX's own policy settings; then OKX
 * holds every token approval until the code is typed. The app layout's
 * fetch wrapper (lib/api/approval-code-retry) calls `askApprovalCode`; the
 * code goes back with the same request, which sends the held approval.
 * Cancel, Escape or a click outside drops it.
 */

import { useState, useSyncExternalStore } from "react";
import { Modal } from "@/components/motion/modal";
import { useT } from "@/i18n/client";

interface Prompt {
  id: number;
  message: string;
  error?: string;
  resolve: (code: string | null) => void;
}

let current: Prompt | null = null;
let seq = 0;
let queue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Ask for the code of one held approval. Prompts are shown one at a time. */
export function askApprovalCode(prompt: { message: string; error?: string }): Promise<string | null> {
  const next = queue.then(
    () =>
      new Promise<string | null>((resolve) => {
        seq += 1;
        current = { ...prompt, id: seq, resolve };
        emit();
      })
  );
  queue = next.catch(() => undefined);
  return next;
}

function answer(code: string | null): void {
  const prompt = current;
  current = null;
  emit();
  prompt?.resolve(code);
}

function CodeForm({ prompt }: { prompt: Prompt }) {
  const t = useT("approvalCode");
  const tc = useT("common");
  const [code, setCode] = useState("");
  const [resend, setResend] = useState<{ busy: boolean; note: string | null }>({ busy: false, note: null });
  const ready = /^\d{6}$/.test(code);

  async function sendNewCode() {
    setResend({ busy: true, note: null });
    try {
      const res = await fetch("/api/wallet/approval-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend" }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setResend({ busy: false, note: res.ok ? t("newCodeSent") : (data?.error ?? t("sendFailed")) });
    } catch {
      setResend({ busy: false, note: t("sendFailed") });
    }
  }

  return (
    <form
      className="rounded-2xl border border-border/60 bg-card p-5 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) answer(code);
      }}
    >
      <div>
        <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {prompt.message || t("defaultMessage")} {t("note")}
        </p>
      </div>

      <label className="block">
        <span className="sr-only">{t("codeLabel")}</span>
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="w-full h-12 rounded-xl border border-border/60 bg-secondary/60 px-4 text-center text-lg tracking-[0.4em] font-mono text-foreground"
          aria-invalid={prompt.error ? true : undefined}
          aria-describedby={prompt.error ? "approval-code-error" : undefined}
        />
      </label>

      {prompt.error && (
        <p id="approval-code-error" role="alert" className="text-[13px] text-loss">
          {prompt.error}
        </p>
      )}

      <button
        type="button"
        onClick={sendNewCode}
        disabled={resend.busy}
        className="text-[13px] text-muted-foreground underline underline-offset-2 disabled:opacity-60"
      >
        {resend.busy ? t("sending") : t("sendNew")}
      </button>
      {resend.note && <p className="text-[13px] text-muted-foreground">{resend.note}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => answer(null)}
          className="flex-1 h-11 rounded-xl border border-border/60 bg-secondary/80 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
        >
          {tc("cancel")}
        </button>
        <button
          type="submit"
          disabled={!ready}
          className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {tc("confirm")}
        </button>
      </div>
    </form>
  );
}

export function ApprovalCodeHost() {
  const prompt = useSyncExternalStore(
    subscribe,
    () => current,
    () => null
  );

  return (
    <Modal open={prompt !== null} onClose={() => answer(null)}>
      {/* A new key per prompt: an error re-asks with an empty field. */}
      {prompt && <CodeForm key={prompt.id} prompt={prompt} />}
    </Modal>
  );
}
