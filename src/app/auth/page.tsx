"use client";

/**
 * Sign in to albicocca — two steps, in the landing's visual language.
 *
 *   1. Risk disclaimer. Accepting writes the flag the (app) layout checks,
 *      so nobody reaches the app without it — and they accept at the moment
 *      they are about to get a wallet, not on a marketing page.
 *   2. OKX sign-in (CLI v4). The server mints a one-time sign-in link; you
 *      open it here or on your phone via the QR, and we watch /api/auth/poll
 *      until the session lands, then route to /ai. There is no headless
 *      email + OTP login any more: `wallet verify` was removed upstream.
 *
 * Styles come from the landing's scoped stylesheet (everything under .albi),
 * so type, buttons and cards match it exactly.
 */

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import QRCode from "qrcode";
import "../welcome/albicocca.css";
import { DISCLAIMER_KEY, RiskDisclaimerText } from "@/components/risk-disclaimer";

// How often to ask the server whether the browser login landed. The route
// reads in-memory state (no CLI spawn), so this stays cheap.
const POLL_INTERVAL_MS = 2000;

// Disclaimer flag from localStorage. The server can't read it and React
// renders the server snapshot during hydration, so "not known yet" is null
// rather than false — same approach as the (app) layout, which otherwise
// bounced every hard load (see 92bc9be).
function subscribeToStorage(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}
const readAccepted = (): boolean | null => localStorage.getItem(DISCLAIMER_KEY) != null;
const readAcceptedServer = (): boolean | null => null;

const Spinner = ({ size = 16 }: { size?: number }) => (
  <svg className="animate-spin-breathe" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const Mark = ({ id }: { id: string }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, margin: "2px 1px 0" }} aria-hidden="true">
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ff7a1a" />
        <stop offset="1" stopColor="#ff2d75" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="10" fill={`url(#${id})`} />
  </svg>
);

export default function AuthPage() {
  const router = useRouter();
  const storedAccepted = useSyncExternalStore(subscribeToStorage, readAccepted, readAcceptedServer);
  // Set from the click handler: localStorage writes don't fire `storage` in
  // the same tab, so the store alone wouldn't notice the acceptance.
  const [justAccepted, setJustAccepted] = useState(false);
  const [ticked, setTicked] = useState(false);

  const [step, setStep] = useState<"idle" | "awaiting">("idle");
  const [loginUrl, setLoginUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const accepted = justAccepted || storedAccepted === true;

  const acceptDisclaimer = () => {
    localStorage.setItem(DISCLAIMER_KEY, "true");
    setJustAccepted(true);
  };

  const startLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST" });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Could not start sign-in. Please try again.");
        return;
      }
      const url: string = data.data.loginUrl;
      setLoginUrl(url);
      setStep("awaiting");
      // Best-effort: popup blockers may swallow this, which is why the link
      // and QR stay on screen regardless.
      window.open(url, "_blank", "noopener,noreferrer");
      QRCode.toDataURL(url, { width: 320, margin: 1 })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(""));
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const cancelLogin = useCallback(() => {
    void fetch("/api/auth/poll", { method: "DELETE" });
    setStep("idle");
    setLoginUrl("");
    setQrDataUrl("");
    setError("");
  }, []);

  // Watch the background poll until the session is persisted server-side.
  useEffect(() => {
    if (step !== "awaiting") return;
    let cancelled = false;

    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/auth/poll");
        const data = await res.json();
        if (cancelled || !data.success) return;

        if (data.data.phase === "done") {
          clearInterval(id);
          // useAuthState caches /api/auth/status on a 30s interval and still
          // holds the logged-out result. Revalidate before routing so the app
          // shell doesn't render its "Connect Wallet" state first.
          await mutate("/api/auth/status");
          router.push("/ai");
        } else if (data.data.phase === "error") {
          clearInterval(id);
          setError(data.data.error || "Sign-in failed. Please try again.");
          setStep("idle");
        }
      } catch {
        // Transient network blip — keep polling.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [step, router]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(loginUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy. Select the link and copy it manually.");
    }
  };

  return (
    <div className="albi" style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      {/* Hero wash — the landing's blobs, apricot and pink only */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div className="blob" style={{ position: "absolute", top: -160, left: "6%", width: 520, height: 520, borderRadius: "50%", background: "radial-gradient(circle at 30% 30%, rgba(255,122,26,0.40), rgba(255,122,26,0) 70%)", filter: "blur(40px)", animation: "albi-blob 14s ease-in-out infinite" }} />
        <div className="blob" style={{ position: "absolute", top: 60, right: "4%", width: 520, height: 520, borderRadius: "50%", background: "radial-gradient(circle at 60% 40%, rgba(255,45,117,0.32), rgba(255,45,117,0) 70%)", filter: "blur(46px)", animation: "albi-blob 18s ease-in-out infinite reverse" }} />
      </div>

      {/* Bar */}
      <div className="nav" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "rgba(251,251,253,0.72)", backdropFilter: "saturate(180%) blur(20px)", WebkitBackdropFilter: "saturate(180%) blur(20px)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div className="wrap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <a href="/welcome" aria-label="albicocca home" style={{ display: "flex", alignItems: "center", gap: 1, color: "#1d1d1f", fontWeight: 700, fontSize: 24, letterSpacing: "-0.045em", lineHeight: 1 }}>
            <span>albic</span>
            <Mark id="markAuth" />
            <span>cca</span>
          </a>
        </div>
      </div>

      <main className="wrap" style={{ position: "relative", zIndex: 1, paddingTop: 120, paddingBottom: 80 }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          {!accepted ? (
            <section className="rise" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 600, color: "#b8500a", letterSpacing: "0.02em", textTransform: "uppercase" }}>Before you start</p>
                <h1 className="h-section" style={{ marginTop: 14 }}>Read this first.</h1>
                <p className="lead" style={{ marginTop: 16 }}>
                  albicocca moves real money on public chains. Take a minute with the risks before you get a wallet.
                </p>
              </div>

              <div className="card" style={{ borderRadius: 28, background: "#ffffff", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 30px 70px rgba(0,0,0,0.08)", padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ maxHeight: 320, overflowY: "auto", fontSize: 14, lineHeight: 1.55, color: "#424245", display: "flex", flexDirection: "column", gap: 12, paddingRight: 6 }} className="risk-body">
                  <RiskDisclaimerText />
                </div>

                <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", paddingTop: 14, borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                  <input
                    type="checkbox"
                    checked={ticked}
                    onChange={(e) => setTicked(e.target.checked)}
                    style={{ width: 20, height: 20, marginTop: 1, accentColor: "#ff7a1a", flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 14, lineHeight: 1.45, color: "#1d1d1f" }}>
                    I have read the disclaimer above and understand the risks of swapping, bridging, lending, using AI-assisted actions, and managing a non-custodial wallet whose keys cannot be exported.
                  </span>
                </label>

                <button
                  type="button"
                  className="btn"
                  onClick={acceptDisclaimer}
                  disabled={!ticked}
                  style={{ height: 52, borderRadius: 999, border: "none", background: "#ff7a1a", color: "#ffffff", fontSize: 17, fontWeight: 600, fontFamily: "inherit", cursor: ticked ? "pointer" : "not-allowed", opacity: ticked ? 1 : 0.45 }}
                >
                  Accept &amp; continue
                </button>
              </div>
            </section>
          ) : (
            <section className="rise" style={{ display: "flex", flexDirection: "column", gap: 20, textAlign: "center" }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 600, color: "#b8500a", letterSpacing: "0.02em", textTransform: "uppercase" }}>Sign in</p>
                <h1 className="h-section" style={{ marginTop: 14 }}>
                  <span style={{ display: "block" }}>Ask your wallet.</span>
                  <span className="gradient-text" style={{ display: "block" }}>Start here.</span>
                </h1>
                <p className="lead" style={{ marginTop: 16, marginLeft: "auto", marginRight: "auto", maxWidth: 460 }}>
                  Sign in with Google, Apple or email on OKX&apos;s page. A wallet is created for you on the spot — no seed phrase.
                </p>
              </div>

              <div className="card" style={{ borderRadius: 28, background: "#ffffff", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 30px 70px rgba(0,0,0,0.08)", padding: 28, display: "flex", flexDirection: "column", gap: 16, textAlign: "left" }}>
                {step === "idle" ? (
                  <>
                    {error && (
                      <p role="alert" style={{ fontSize: 14, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "10px 14px" }}>{error}</p>
                    )}
                    <button
                      type="button"
                      className="btn"
                      onClick={startLogin}
                      disabled={loading}
                      style={{ height: 52, borderRadius: 999, border: "none", background: "#ff7a1a", color: "#ffffff", fontSize: 17, fontWeight: 600, fontFamily: "inherit", cursor: loading ? "wait" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10 }}
                    >
                      {loading ? (<><Spinner /> Preparing sign-in…</>) : "Sign in with OKX"}
                    </button>
                    <p style={{ fontSize: 13, color: "#6e6e73", textAlign: "center" }}>
                      We open OKX in a new tab and finish here automatically once you&apos;re done.
                    </p>
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#b8500a" }}>
                      <Spinner />
                      <span style={{ fontSize: 15, fontWeight: 600, color: "#1d1d1f" }}>Waiting for you to finish signing in…</span>
                    </div>
                    <p style={{ fontSize: 14, lineHeight: 1.5, color: "#6e6e73" }}>
                      A new tab should have opened. If it didn&apos;t, use the link below — or scan the code to sign in on your phone.
                    </p>
                    {qrDataUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={qrDataUrl} alt="QR code to open the sign-in link on another device" style={{ margin: "4px auto", width: 168, height: 168, borderRadius: 16, background: "#ffffff", padding: 8, border: "1px solid rgba(0,0,0,0.08)" }} />
                    )}
                    <div style={{ display: "flex", gap: 10 }}>
                      <a href={loginUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, height: 48, borderRadius: 999, background: "rgba(0,0,0,0.05)", color: "#1d1d1f", fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        Open sign-in page
                      </a>
                      <button type="button" onClick={copyLink} style={{ height: 48, padding: "0 20px", borderRadius: 999, border: "1px solid rgba(0,0,0,0.12)", background: "#ffffff", color: "#1d1d1f", fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
                        {copied ? "Copied" : "Copy link"}
                      </button>
                    </div>
                    {error && (
                      <p role="alert" style={{ fontSize: 14, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "10px 14px" }}>{error}</p>
                    )}
                    <button type="button" onClick={cancelLogin} style={{ alignSelf: "center", minHeight: 44, padding: "0 12px", border: "none", background: "transparent", color: "#6e6e73", fontSize: 14, fontFamily: "inherit", cursor: "pointer" }}>
                      Cancel and start over
                    </button>
                  </>
                )}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
