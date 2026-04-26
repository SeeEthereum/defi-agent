"use client";

/**
 * Voxr-inspired auth hero.
 *
 * Layout intent (mirrors the reel):
 *   ┌────────────────────────────────────────────────────────────┐
 *   │  HEADLINE (massive, kinetic-in)        [iridescent prop]   │
 *   │  sub-copy                                                  │
 *   │  ── form card ───────────                                  │
 *   ├──────────────  light feature grid  ────────────────────────┤
 *   │  three pastel cards explaining what you get                │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Form logic (email → OTP → /ai) is unchanged from the previous version;
 * only the visual envelope flipped from light/violet-aurora to dark/
 * iridescent-purple Voxr style.
 */

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

// Three.js prop is heavy — dynamic + ssr:false keeps it off the critical
// path. The hero reflows briefly while it mounts (tens of ms); a stable
// container keeps CLS at zero.
const IridescentProp = dynamic(
  () => import("@/components/voxr/iridescent-prop").then((m) => m.IridescentProp),
  { ssr: false, loading: () => null }
);

export default function AuthPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const otpValue = otpDigits.join("");

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email || undefined }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || "Login failed"); return; }
      if (data.requiresOtp) { setStep("otp"); } else { router.push("/ai"); }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: otpValue }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || "Verification failed"); return; }
      router.push("/ai");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpInput = (i: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[i] = digit;
    setOtpDigits(next);
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (otpDigits[i]) {
        const next = [...otpDigits]; next[i] = ""; setOtpDigits(next);
      } else if (i > 0) {
        otpRefs.current[i - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      otpRefs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < 5) {
      otpRefs.current[i + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length) {
      const next = text.split("").concat(Array(6).fill("")).slice(0, 6);
      setOtpDigits(next);
      otpRefs.current[Math.min(text.length, 5)]?.focus();
    }
    e.preventDefault();
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="voxr-halo relative">
        {/* faint corner halo on the right, mirrors the Voxr "Stop Chasing
            Leads" frame where a soft purple cloud follows the prop. */}
        <div
          className="pointer-events-none absolute -top-20 -right-20 h-[640px] w-[640px] rounded-full opacity-50 blur-[120px]"
          style={{ background: "radial-gradient(closest-side, oklch(0.55 0.3 295 / 0.45), transparent)" }}
        />

        <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 pt-16 pb-20 md:grid-cols-12 md:gap-6 md:pt-28">
          {/* ── Copy + form ── */}
          <div className="md:col-span-7 lg:col-span-7">
            <p className="text-eyebrow mb-5 animate-kinetic-in">DEFI · ON-CHAIN AGENT</p>

            <h1 className="text-display-2xl text-foreground animate-kinetic-in stagger-1">
              Stop chasing yields.
              <br />
              <span className="text-iridescent">Start commanding them.</span>
            </h1>

            <p className="mt-7 max-w-md text-[15px] leading-relaxed text-foreground/70 animate-kinetic-in stagger-2">
              One assistant. Every chain. Every protocol. Trade, swap, bridge and
              earn from a single pane — your keys never leave OKX TEE.
            </p>

            {/* ── Form card ── */}
            <div className="mt-10 max-w-md animate-kinetic-in stagger-3">
              <div className="voxr-card relative p-6">
                {step === "email" ? (
                  <form onSubmit={handleEmailSubmit} className="space-y-4">
                    <label className="text-eyebrow block">Email</label>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="focus-ring-voxr w-full h-11 rounded-xl border border-border bg-secondary px-4 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors"
                    />
                    {error && (
                      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5">
                        <p className="text-[12px] text-destructive">{error}</p>
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="btn-pill-primary disabled-ramp w-full"
                    >
                      {loading ? (
                        <>
                          <svg className="animate-spin-breathe h-4 w-4" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Sending code…
                        </>
                      ) : "Continue →"}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleOtpSubmit} className="space-y-5">
                    <div>
                      <label className="text-eyebrow mb-2.5 block">
                        Code sent to {email}
                      </label>
                      <div className="flex gap-2 justify-between" onPaste={handleOtpPaste}>
                        {otpDigits.map((d, i) => (
                          <input
                            key={i}
                            ref={(el) => { otpRefs.current[i] = el; }}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={d}
                            onChange={(e) => handleOtpInput(i, e.target.value)}
                            onKeyDown={(e) => handleOtpKey(i, e)}
                            autoFocus={i === 0}
                            className="focus-ring-voxr w-full h-12 rounded-xl border border-border bg-secondary text-center text-lg font-bold tracking-widest text-foreground transition-colors"
                          />
                        ))}
                      </div>
                    </div>
                    {error && (
                      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5">
                        <p className="text-[12px] text-destructive">{error}</p>
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={loading || otpValue.length < 6}
                      className="btn-pill-primary disabled-ramp w-full"
                    >
                      {loading ? (
                        <>
                          <svg className="animate-spin-breathe h-4 w-4" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Verifying…
                        </>
                      ) : "Verify & Sign in"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setStep("email"); setOtpDigits(["","","","","",""]); setError(""); }}
                      className="block w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ← Use a different email
                    </button>
                  </form>
                )}
              </div>

              <p className="mt-4 text-[11px] text-muted-foreground/70">
                A wallet is created automatically and protected by{" "}
                <span className="text-foreground/80">OKX TEE</span>.
              </p>
            </div>
          </div>

          {/* ── 3D prop + stat line ── */}
          <div className="md:col-span-5 lg:col-span-5 relative min-h-[300px] md:min-h-[520px]">
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <IridescentProp className="h-[460px] w-[460px] max-w-full" />
              {/* Anchor stat — fills the right-column air the prop alone
                  doesn't, in eyebrow + tabular-nums tone. */}
              <p className="mt-2 text-[11px] tracking-[0.18em] uppercase text-foreground/55 tabular-nums">
                <span className="text-foreground/80 font-semibold">1</span> sign-in
                <span className="mx-2 opacity-40">·</span>
                <span className="text-foreground/80 font-semibold">6</span> chains
                <span className="mx-2 opacity-40">·</span>
                zero seed phrases
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bleed — soft fade from dark hero into the light island so the
          dark→light hand-off feels intentional, not a guillotine cut. */}
      <div
        aria-hidden="true"
        className="h-32 -mb-px"
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, oklch(0.965 0.005 85 / 0.35) 60%, oklch(0.965 0.005 85) 100%)",
        }}
      />

      {/* ── LIGHT FEATURE GRID ─────────────────────────────────────────
          Mirrors Voxr's "Power Up Your Pipeline" panel — a light island
          that breaks the dark hero with three pastel-tinted cards. */}
      <section className="voxr-light-section">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <p className="text-eyebrow mb-4">WHAT YOU GET</p>
          <h2 className="text-display-lg max-w-2xl text-foreground">
            A trader&apos;s desk. <span className="opacity-60">Without the desk.</span>
          </h2>

          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
            <FeatureCard
              tint="purple"
              title="One pane"
              body="Spot, perps, bridges and lending on Ethereum, Arbitrum, Base, BNB and Hyperliquid — same UI."
            />
            <FeatureCard
              tint="peach"
              title="AI co-pilot"
              body="Claude proposes routes, leverage, exits. You always confirm before anything signs."
            />
            <FeatureCard
              tint="mint"
              title="Keys you keep"
              body="Private keys live in OKX TEE. No extensions. No seed phrase. Just your email."
            />
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────
          Tiny bar back on dark. Closes the Voxr "dark→light→dark" rhythm. */}
      <section className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-[11px] text-muted-foreground">
          <span>
            by{" "}
            <a
              href="https://x.com/salvodisobey"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-foreground/80 hover:text-foreground transition-colors"
            >
              0xSalvo
            </a>
          </span>
          <span className="opacity-50">DeFi Agent · {new Date().getFullYear()}</span>
        </div>
      </section>
    </div>
  );
}

/* ── Feature card ──
   Voxr's light-island cards have a soft pastel wash (purple, peach, mint)
   plus a single accent shape. We reuse the same recipe with three subtle
   tints; the shape is a CSS gradient blob rather than asset to keep zero
   binary weight. */
function FeatureCard({
  tint,
  title,
  body,
}: {
  tint: "purple" | "peach" | "mint";
  title: string;
  body: string;
}) {
  const tints: Record<typeof tint, { bg: string; blob: string }> = {
    purple: {
      bg: "linear-gradient(180deg, oklch(0.97 0.04 295) 0%, oklch(0.99 0.005 75) 70%)",
      blob: "radial-gradient(closest-side, oklch(0.6 0.22 295 / 0.55), transparent)",
    },
    peach: {
      bg: "linear-gradient(180deg, oklch(0.96 0.05 50) 0%, oklch(0.99 0.005 75) 70%)",
      blob: "radial-gradient(closest-side, oklch(0.78 0.18 50 / 0.55), transparent)",
    },
    mint: {
      bg: "linear-gradient(180deg, oklch(0.96 0.05 165) 0%, oklch(0.99 0.005 75) 70%)",
      blob: "radial-gradient(closest-side, oklch(0.78 0.16 165 / 0.5), transparent)",
    },
  };

  return (
    <div
      className="hover-lift relative overflow-hidden rounded-2xl border border-border p-6"
      style={{ background: tints[tint].bg }}
    >
      <div
        className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full blur-2xl"
        style={{ background: tints[tint].blob }}
      />
      <h3 className="text-foreground text-[19px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
