"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { AppMasthead } from "@/components/shell/app-masthead";
import { AppDock } from "@/components/shell/app-dock";
import { AuthContext, useAuthState } from "@/hooks/use-auth";
import { DISCLAIMER_KEY } from "@/components/risk-disclaimer";
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
 * (missing/expired session cookie) as a hard redirect to /auth.
 */
function useSessionGuard() {
  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await nativeFetch(...args);
      redirectIfNoSession(res);
      return res;
    };

    nativeFetch("/api/auth/status").then(redirectIfNoSession).catch(() => {});

    return () => {
      window.fetch = nativeFetch;
    };
  }, []);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const authState = useAuthState();
  const router = useRouter();
  const pathname = usePathname();
  const accepted = useSyncExternalStore(subscribeToStorage, getAcceptedClient, getAcceptedServer);

  useSessionGuard();

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
            </div>
          </main>
          <AppDock />
        </div>
      </MotionConfig>
    </AuthContext>
  );
}
