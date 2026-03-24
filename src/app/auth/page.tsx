"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

// Fixed particle positions — avoids hydration mismatch
const PARTICLES = [
  { left: "8%",  size: 5, delay: 0,   dur: 12 },
  { left: "18%", size: 3, delay: 2.5, dur: 15 },
  { left: "28%", size: 6, delay: 5,   dur: 10 },
  { left: "38%", size: 4, delay: 1,   dur: 18 },
  { left: "50%", size: 3, delay: 7,   dur: 13 },
  { left: "62%", size: 5, delay: 3.5, dur: 11 },
  { left: "72%", size: 4, delay: 6,   dur: 16 },
  { left: "82%", size: 3, delay: 1.5, dur: 14 },
  { left: "90%", size: 6, delay: 4,   dur: 9  },
  { left: "96%", size: 4, delay: 8,   dur: 17 },
];

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
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[oklch(0.975_0.008_270)]">

      {/* ── Aurora blobs ──────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-[8%]  h-[600px] w-[600px] rounded-full bg-violet-500/10 blur-3xl animate-ai-aurora-1" />
        <div className="absolute bottom-[-8%] right-[4%]  h-[500px] w-[500px] rounded-full bg-indigo-500/9  blur-3xl animate-ai-aurora-2" />
        <div className="absolute top-[35%] right-[15%] h-[400px] w-[400px] rounded-full bg-cyan-400/7   blur-3xl animate-ai-aurora-1 [animation-delay:5s]" />
        <div className="absolute bottom-[20%] left-[30%] h-[300px] w-[300px] rounded-full bg-violet-300/6  blur-3xl animate-ai-aurora-2 [animation-delay:2s]" />
      </div>

      {/* ── Floating particles ────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="absolute bottom-0 rounded-full"
            style={{
              left: p.left,
              width: p.size,
              height: p.size,
              background: i % 3 === 0
                ? "oklch(0.55 0.28 290 / 0.5)"
                : i % 3 === 1
                ? "oklch(0.65 0.22 200 / 0.5)"
                : "oklch(0.5 0.24 260 / 0.5)",
              boxShadow: `0 0 ${p.size * 2}px ${p.size}px ${
                i % 3 === 0
                  ? "oklch(0.55 0.28 290 / 0.3)"
                  : i % 3 === 1
                  ? "oklch(0.65 0.22 200 / 0.3)"
                  : "oklch(0.5 0.24 260 / 0.3)"
              }`,
              animation: `auth-particle ${p.dur}s ease-in infinite ${p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div
        className="relative z-10 w-full max-w-sm px-4"
        style={{ animation: "auth-card-in 0.7s cubic-bezier(0.22,1,0.36,1) both" }}
      >

        {/* ── Logo ──────────────────────────────────────────────────── */}
        <div className="text-center mb-8">
          <div className="relative inline-flex items-center justify-center mb-5">
            {/* Expanding rings */}
            <span className="absolute h-24 w-24 rounded-3xl border border-violet-400/25 animate-ai-ring" />
            <span className="absolute h-24 w-24 rounded-3xl border border-cyan-400/20  animate-ai-ring-delay" />

            {/* Orbit dots */}
            <span className="pointer-events-none absolute top-1/2 left-1/2 h-2.5 w-2.5 rounded-full bg-violet-500 shadow-[0_0_8px_3px_oklch(0.55_0.28_290/0.7)]"
              style={{ animation: "ai-orbit-lg-1 4.5s linear infinite" }} />
            <span className="pointer-events-none absolute top-1/2 left-1/2 h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_7px_3px_oklch(0.65_0.22_200/0.6)]"
              style={{ animation: "ai-orbit-lg-2 4.5s linear infinite" }} />
            <span className="pointer-events-none absolute top-1/2 left-1/2 h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_6px_2px_oklch(0.5_0.24_260/0.6)]"
              style={{ animation: "ai-orbit-lg-3 4.5s linear infinite" }} />

            {/* Icon */}
            <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-violet-500 via-indigo-500 to-cyan-500 flex items-center justify-center shadow-[0_8px_32px_oklch(0.55_0.28_290/0.45)] animate-ai-glow">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="animate-ai-spin-slow">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
              </svg>
            </div>
          </div>

          <h1 className="text-[22px] font-bold tracking-tight ai-gradient-text">
            {step === "email" ? "Sign in to DeFi Agent" : "Verify your email"}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1.5">
            {step === "email"
              ? "Enter your email to access your wallet"
              : `We sent a 6-digit code to ${email}`}
          </p>
        </div>

        {/* ── Card ──────────────────────────────────────────────────── */}
        <div className="relative rounded-2xl border border-violet-200/50 bg-white/75 backdrop-blur-xl shadow-[0_8px_40px_oklch(0.55_0.28_290/0.14)] overflow-hidden">
          {/* Scan line */}
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px animate-ai-scan bg-gradient-to-r from-transparent via-violet-400/70 to-transparent" />
          {/* Subtle top gradient */}
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-violet-50/60 to-transparent pointer-events-none" />

          <div className="relative p-6">
            {step === "email" ? (
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full h-11 rounded-xl border border-violet-200/60 bg-white/80 px-4 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400/50 transition-all animate-ai-input"
                  />
                </div>
                {error && (
                  <div className="rounded-xl bg-red-50 border border-red-200/60 px-3 py-2.5">
                    <p className="text-[12px] text-red-600">{error}</p>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-violet-600 to-indigo-600 shadow-[0_4px_14px_oklch(0.55_0.28_290/0.4)] hover:shadow-[0_6px_20px_oklch(0.55_0.28_290/0.5)] hover:from-violet-500 hover:to-indigo-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Sending code…
                    </span>
                  ) : "Continue →"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleOtpSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    Verification Code
                  </label>
                  {/* 6-box OTP */}
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
                        className="w-full h-12 rounded-xl border border-violet-200/60 bg-white/80 text-center text-lg font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400/60 transition-all"
                      />
                    ))}
                  </div>
                </div>
                {error && (
                  <div className="rounded-xl bg-red-50 border border-red-200/60 px-3 py-2.5">
                    <p className="text-[12px] text-red-600">{error}</p>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading || otpValue.length < 6}
                  className="w-full h-11 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-violet-600 to-indigo-600 shadow-[0_4px_14px_oklch(0.55_0.28_290/0.4)] hover:shadow-[0_6px_20px_oklch(0.55_0.28_290/0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Verifying…
                    </span>
                  ) : "Verify & Sign in"}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep("email"); setOtpDigits(["","","","","",""]); setError(""); }}
                  className="w-full text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors text-center"
                >
                  ← Use a different email
                </button>
              </form>
            )}
          </div>
        </div>

        {/* ── by 0xSalvo ────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-center gap-2 mt-5"
          style={{ animation: "ai-fade-up 0.6s ease both 0.35s", opacity: 0 }}
        >
          <Image
            src="/avatar.png"
            alt="0xSalvo"
            width={24}
            height={24}
            className="rounded-full object-cover ring-2 ring-violet-200/60"
          />
          <span className="text-[11px] text-muted-foreground/70">
            by <span className="font-semibold text-foreground/60">0xSalvo</span>
          </span>
        </div>

        {/* ── Footer ────────────────────────────────────────────────── */}
        <p
          className="text-[10px] text-center text-muted-foreground/40 mt-3 leading-relaxed"
          style={{ animation: "ai-fade-up 0.6s ease both 0.45s", opacity: 0 }}
        >
          A secure wallet is automatically created for your account.
          <br />Protected by OKX TEE technology.
        </p>
      </div>
    </div>
  );
}
