"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { AuthContext, useAuthState } from "@/hooks/use-auth";
import { DISCLAIMER_KEY } from "@/components/risk-disclaimer";

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

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useSessionGuard();

  useEffect(() => {
    // Only redirect on a definitive "declined" — `null` means we haven't
    // read localStorage yet, and treating it as declined is what broke
    // deep links and refreshes.
    if (accepted === false) router.replace("/welcome");
  }, [accepted, router]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const panel = drawerRef.current;
    if (!panel) return;
    const previous = document.activeElement as HTMLElement | null;
    const nodes = focusablesIn(panel);
    (nodes[0] ?? panel).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMobileMenuOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const tabbable = focusablesIn(panel);
      if (tabbable.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = tabbable[0];
      const last = tabbable[tabbable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !panel.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last || !panel.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [mobileMenuOpen]);

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
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="flex h-dvh bg-background overflow-hidden">
        {/* Desktop sidebar — always visible on md+ */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* Mobile sidebar overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
        <div
          ref={drawerRef}
          role={mobileMenuOpen ? "dialog" : undefined}
          aria-modal={mobileMenuOpen ? true : undefined}
          aria-label={mobileMenuOpen ? "Menu" : undefined}
          aria-hidden={!mobileMenuOpen}
          inert={!mobileMenuOpen}
          tabIndex={-1}
          className={`fixed inset-y-0 left-0 z-50 md:hidden transition-transform duration-300 ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar onClose={() => setMobileMenuOpen(false)} />
        </div>

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <Header onMenuClick={() => setMobileMenuOpen(true)} />
          <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
            <div className="mx-auto max-w-5xl px-4 py-4 md:px-6 md:py-8 pb-24 md:pb-8">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={pathname}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
          {/* Mobile bottom navigation */}
          <MobileNav />
        </div>
      </div>
      </MotionConfig>
    </AuthContext>
  );
}
