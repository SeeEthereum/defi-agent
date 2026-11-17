"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { AppMasthead } from "@/components/shell/app-masthead";
import { AppDock } from "@/components/shell/app-dock";
import { AuthContext, useAuthState } from "@/hooks/use-auth";
import { DISCLAIMER_KEY } from "@/components/risk-disclaimer";
import { askRiskConfirmation, RiskConfirmHost } from "@/components/risk-confirm";
import { confirmRiskIfAsked } from "@/lib/api/risk-retry";
import { answerWalletPrompts } from "@/lib/api/approval-code-retry";
import { askApprovalCode, ApprovalCodeHost } from "@/components/approval-code-prompt";
import { InstallStepsHost } from "@/components/pwa/install-app";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import "./app.css";

// Derive the disclaimer state from localStorage via useSyncExternalStore so
// React owns the subscription lifecycle. This avoids the set-state-in-effect
// pattern that React 19 rightly flags: we're not "syncing" external state
// into React state, we're *reading* external state every render.
/** `null` = not known yet (server render + hydration pass). */
type DisclaimerState = boolean | null;

function subscribeToStorage(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}
function getAcceptedClient(): DisclaimerState {
  return localStorage.getItem(DISCLAIMER_KEY) != null;
}
function getAcceptedServer(): DisclaimerState {
  // The server can't read localStorage, and React also renders this snapshot
  // during hydration to match the server HTML — so it is "unknown", NOT
  // "declined". Returning `false` here used to conflate the two: the redirect
  // effect below ran against the hydration snapshot and bounced every hard
  // load to /welcome before the real value was ever read. Keeping `null`
  // distinct makes that stale pass harmless by construction, without a
  // mounted flag (which would reintroduce set-state-in-effect).
  return null;
}

/** Send the user to sign-in when a response is a missing/expired session cookie. */
function redirectIfNoSession(res: Response): void {
  if (res.status !== 401) return;
  res
    .clone()
    .json()
    .then((body: { code?: string }) => {
      if (body?.code === "no_session") window.location.replace("/auth");
    })
    .catch(() => {});
}

/**
 * Client session guard. useAuthState already polls /api/auth/status for the
 * OKX login flag; this additionally treats HTTP 401 `{ code: "no_session" }`
 * (missing/expired session cookie) as a hard redirect to /auth, asks the
 * user about transactions the wallet flagged (lib/api/risk-retry), and for
 * OKX's email code when it holds a token approval (lib/api/approval-code-retry).
 */
function useSessionGuard() {
  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await nativeFetch(input, init);
      redirectIfNoSession(res);
      const send = async (retryInput: RequestInfo | URL, retryInit?: RequestInit) => {
        const retry = await nativeFetch(retryInput, retryInit);
        redirectIfNoSession(retry);
        return retry;
      };
      // A flagged transaction asks for consent; a held token approval asks
      // for OKX's email code. One request can run into both, in any order.
      return answerWalletPrompts(
        res,
        input,
        init,
        send,
        (r, i, ri, s) => confirmRiskIfAsked(r, i, ri, s, askRiskConfirmation),
        askApprovalCode
      );
    };

    nativeFetch("/api/auth/status").then(redirectIfNoSession).catch(() => {});

    return () => {
      window.fetch = nativeFetch;
    };
  }, []);
}

/** Send a heartbeat at most this often while the person is using the app. */
const HEARTBEAT_EVERY_MS = 5 * 60_000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
/** Outside the effect, so a re-run (sign-in state, React's dev double run) does not beat again. */
let lastHeartbeatAt = 0;

/**
 * Tell the server the person is here (clicks, keys, scrolling, coming back
 * to the tab), so their session is not signed out for inactivity. Polling
 * in the background never counts: an open, unattended tab does not keep
 * the server's signing credential alive.
 */
function useActivityHeartbeat(authenticated: boolean) {
  useEffect(() => {
    if (!authenticated) return;
    const beat = () => {
      const now = Date.now();
      if (now - lastHeartbeatAt < HEARTBEAT_EVERY_MS) return;
      lastHeartbeatAt = now;
      void fetch("/api/auth/activity", { method: "POST" }).catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    const options = { capture: true, passive: true };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, beat, options);
    document.addEventListener("visibilitychange", onVisible);
    beat();
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, beat, options);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [authenticated]);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const authState = useAuthState();
  const router = useRouter();
  const pathname = usePathname();
  const accepted = useSyncExternalStore(subscribeToStorage, getAcceptedClient, getAcceptedServer);

  useSessionGuard();
  useActivityHeartbeat(authState.authenticated);

  useEffect(() => {
    // Only redirect on a definitive "declined" — `null` means we haven't
    // read localStorage yet, and treating it as declined is what broke
    // deep links and refreshes.
    if (accepted === false) router.replace("/welcome");
  }, [accepted, router]);

  const ready = accepted === true;

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <AuthContext value={authState}>
      <MotionConfig reducedMotion="user">
        <div className="app">
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <div className="app-ambient" aria-hidden="true" />
          <div className="app-grain" aria-hidden="true" />
          <AppMasthead />
          <main id="main" tabIndex={-1}>
            <div className="wrap">
              <OfflineBanner />
              {authState.signedOutReason === "idle" && (
                <p className="note warn idle-note" role="status">
                  <span>
                    You were signed out after 30 minutes without activity, so the server no longer holds
                    your session. <Link href="/auth">Sign in again</Link> to continue.
                  </span>
                </p>
              )}
              {!authState.known ? (
                // Until the server has said whether this browser is signed in,
                // pages would flash "Sign in first" at people who are.
                <div className="flex flex-col items-center justify-center gap-3 py-24" role="status" aria-live="polite">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  {!authState.isLoading && (
                    <p className="text-[13px] text-muted-foreground">Can&apos;t reach the wallet service right now. Trying again…</p>
                  )}
                </div>
              ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={pathname}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
              )}
            </div>
          </main>
          <AppDock />
          <RiskConfirmHost />
          <ApprovalCodeHost />
          <InstallStepsHost />
        </div>
      </MotionConfig>
    </AuthContext>
  );
}
