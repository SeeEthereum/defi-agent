"use client";

/**
 * Access gate.
 *
 * Shown by proxy.ts to anyone without a valid gate cookie. This is the
 * deployment lock, not the wallet login — unlocking here only earns the
 * right to use the app; the OKX wallet session is still handled at /auth.
 */

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function GateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Incorrect password.");
        setPassword("");
        return;
      }
      const next = params.get("next");
      // Only follow same-site paths — never an absolute URL from the query
      // string, which would make this an open redirect.
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="gate-password" className="text-eyebrow mb-2 block">
          Access password
        </label>
        <input
          id="gate-password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="focus-ring-voxr w-full h-11 rounded-xl border border-border bg-secondary px-4 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5">
          <p className="text-[12px] text-destructive">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || password.length === 0}
        className="btn-pill-primary disabled-ramp w-full"
      >
        {loading ? (
          <>
            <svg className="animate-spin-breathe h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Unlocking…
          </>
        ) : "Unlock"}
      </button>
    </form>
  );
}

export default function GatePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        className="pointer-events-none absolute -top-20 -right-20 h-[520px] w-[520px] rounded-full opacity-40 blur-[120px]"
        style={{ background: "radial-gradient(closest-side, oklch(0.55 0.3 295 / 0.45), transparent)" }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
        <p className="text-eyebrow mb-4">DEFI · ON-CHAIN AGENT</p>
        <h1 className="text-display-lg text-foreground">This deployment is private</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-foreground/70">
          It controls a live wallet, so access is password-protected. Enter the
          password to continue.
        </p>

        <div className="voxr-card mt-8 p-6">
          <Suspense fallback={<div className="h-11" />}>
            <GateForm />
          </Suspense>
        </div>

        <p className="mt-4 text-[11px] text-muted-foreground/70">
          Signing in to your OKX wallet happens after this, on the next screen.
        </p>
      </div>
    </div>
  );
}
