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
 * Styles come from the landing's scoped stylesheet (everything under .lp),
 * so type, buttons and cards match it exactly.
 */

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import "../welcome/landing.css";
import { BrandMark } from "@/components/brand-mark";
import { LineIcon } from "@/components/line-icon";
import { ThemeSwitch } from "@/components/theme-switch";
import { typeset as t } from "@/lib/typeset";
import { DISCLAIMER_KEY, RiskCards } from "@/components/risk-disclaimer";

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

export default function AuthPage() {
  const router = useRouter();
  const storedAccepted = useSyncExternalStore(subscribeToStorage, readAccepted, readAcceptedServer);
  // Set from the click handler: localStorage writes don't fire `storage` in
  // the same tab, so the store alone wouldn't notice the acceptance.
  const [justAccepted, setJustAccepted] = useState(false);
  const [ticked, setTicked] = useState(false);
  // Consent opens once every card has been on screen.
  const [allSeen, setAllSeen] = useState(false);
  const markAllSeen = useCallback(() => setAllSeen(true), []);

  const [step, setStep] = useState<"idle" | "awaiting">("idle");
  const [loginUrl, setLoginUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      // The QR library loads only when a code is needed.
      import("qrcode")
        .then(({ default: QRCode }) => QRCode.toDataURL(url, { width: 320, margin: 1 }))
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

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(loginUrl);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        copyTimerRef.current = null;
        setCopied(false);
      }, 2000);
    } catch {
      setError("Could not copy. Select the link and copy it manually.");
    }
  };

  return (
    <div className="lp auth">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="lp-ambient" aria-hidden="true" />
      <div className="lp-grain" aria-hidden="true" />

      <header className="mast">
        <div className="wrap mast-row auth-mast">
          <a className="wordmark" href="/welcome" aria-label="albicocca, home">
            <BrandMark size={22} />
          </a>
          <div className="mast-side">
            <ThemeSwitch />
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="wrap auth-main">
        {!accepted ? (
          <section className="auth-col" aria-labelledby="auth-title">
            <span className="label">Before you start</span>
            <h1 id="auth-title" className="h2">Read this first.</h1>
            <p className="sec-lead">
              {t("albicocca moves real money on public chains. Take a minute with the risks before you get a wallet.")}
            </p>

            <div className="bezel auth-card">
              <div className="core">
                <RiskCards onAllSeen={markAllSeen} />

                <label htmlFor="auth-disclaimer-accept" className="consent" data-disabled={!allSeen}>
                  <input
                    id="auth-disclaimer-accept"
                    type="checkbox"
                    checked={ticked}
                    disabled={!allSeen}
                    aria-describedby="consent-hint"
                    onChange={(e) => setTicked(e.target.checked)}
                  />
                  <span>
                    I have read the disclaimer above and understand the risks of swapping, bridging, lending, using AI-assisted actions, and managing a non-custodial wallet whose keys cannot be&nbsp;exported.
                  </span>
                </label>

                <p id="consent-hint" className="auth-note" aria-live="polite">
                  {allSeen ? "You have seen every card." : "Swipe through every card to continue."}
                </p>

                <button type="button" className="btn btn--primary btn--lg auth-cta" onClick={acceptDisclaimer} disabled={!ticked || !allSeen}>
                  Accept &amp; continue
                  <span className="well" aria-hidden="true">
                    <LineIcon name="arrow-right" size={18} />
                  </span>
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="auth-col" aria-labelledby="auth-title">
            <span className="label">Sign in</span>
            <h1 id="auth-title" className="h2">
              Ask your wallet. <span className="soft">Start&nbsp;here.</span>
            </h1>
            <p className="sec-lead">
              {t("Sign in with Google, Apple or email on OKX's page. A wallet is created for you on the spot: no seed phrase.")}
            </p>

            <div className="bezel auth-card">
              <div className="core">
                {step === "idle" ? (
                  <>
                    {error && (
                      <p role="alert" className="auth-error">
                        {error}
                      </p>
                    )}
                    <button type="button" className="btn btn--primary btn--lg auth-cta" onClick={startLogin} disabled={loading}>
                      {loading ? (
                        <>
                          <Spinner /> Preparing sign-in…
                        </>
                      ) : (
                        <>
                          Sign in with OKX
                          <span className="well" aria-hidden="true">
                            <LineIcon name="arrow-up-right" size={18} />
                          </span>
                        </>
                      )}
                    </button>
                    <p className="auth-note">{t("We open OKX in a new tab and finish here automatically once you're done.")}</p>
                  </>
                ) : (
                  <>
                    <p className="auth-wait" aria-live="polite">
                      <Spinner />
                      Waiting for you to finish signing in…
                    </p>
                    <p className="auth-note" style={{ textAlign: "left" }}>
                      {t("A new tab should have opened. If it didn't, use the link below, or scan the code to sign in on your phone.")}
                    </p>
                    {qrDataUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img className="auth-qr" src={qrDataUrl} width={168} height={168} alt="QR code to open the sign-in link on another device" />
                    )}
                    <div className="auth-row">
                      <a className="btn btn--primary" href={loginUrl} target="_blank" rel="noopener noreferrer">
                        Open sign-in page
                        <span className="well" aria-hidden="true">
                          <LineIcon name="arrow-up-right" size={16} />
                        </span>
                      </a>
                      <button type="button" className="btn" onClick={copyLink}>
                        {copied ? "Copied" : "Copy link"}
                      </button>
                    </div>
                    {error && (
                      <p role="alert" className="auth-error">
                        {error}
                      </p>
                    )}
                    <button type="button" className="auth-cancel" onClick={cancelLogin}>
                      Cancel and start over
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
