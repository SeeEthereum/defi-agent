"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js (the offline page) in production builds.
 *
 * In development it removes any worker left by a local production run
 * (`next start` on the same port), so `next dev` pages never go through it.
 * Registration waits for the load event: the worker should not compete with
 * the page's own requests on a slow phone.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
        .catch(() => {});
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((error: unknown) => {
        // Not fatal: the app works the same without it, minus the offline page.
        console.warn("Service worker registration failed", error);
      });
    };
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
