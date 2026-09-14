"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const authState = useAuthState();
  const router = useRouter();
  const pathname = usePathname();
  const accepted = useSyncExternalStore(subscribeToStorage, getAcceptedClient, getAcceptedServer);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    // Only redirect on a definitive "declined" — `null` means we haven't
    // read localStorage yet, and treating it as declined is what broke
    // deep links and refreshes.
    if (accepted === false) router.replace("/welcome");
  }, [accepted, router]);

  const ready = accepted === true;

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <AuthContext value={authState}>
      <div className="flex h-screen bg-background overflow-hidden">
        {/* Desktop sidebar — always visible on md+ */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* Mobile sidebar overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
        <div
          className={`fixed inset-y-0 left-0 z-50 md:hidden transition-transform duration-300 ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar onClose={() => setMobileMenuOpen(false)} />
        </div>

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <Header onMenuClick={() => setMobileMenuOpen(true)} />
          <main className="flex-1 overflow-y-auto">
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
    </AuthContext>
  );
}
