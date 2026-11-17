"use client";

/**
 * Last-resort error page: the root layout itself failed. It replaces the
 * whole document, so global styles and fonts are not loaded here; a few
 * inline styles keep it in albicocca's palette (warm near-black, ivory ink,
 * one apricot accent). The error goes to Sentry when it is on.
 */

import { useEffect, useSyncExternalStore } from "react";

/**
 * The root layout failed, so there is no dictionary: the page's language
 * comes from its path (/it/… is Italian), and the few words are here.
 */
const TEXT = {
  en: {
    title: "albicocca: something went wrong",
    heading: "Something went wrong.",
    body: "If you had just confirmed a transaction, check your wallet activity before trying again. If this keeps happening, come back in a few minutes.",
    retry: "Try again",
    home: "Home",
  },
  it: {
    title: "albicocca: qualcosa non ha funzionato",
    heading: "Qualcosa non ha funzionato.",
    body: "Se avevi appena confermato una transazione, controlla l'attività del wallet prima di riprovare. Se succede ancora, torna tra qualche minuto.",
    retry: "Riprova",
    home: "Home",
  },
} as const;

function subscribe(): () => void {
  return () => {};
}

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const lang = useSyncExternalStore(
    subscribe,
    () => (window.location.pathname.startsWith("/it") ? "it" : "en"),
    () => "en" as const
  );
  const text = TEXT[lang];
  useEffect(() => {
    void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <html lang={lang}>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#0e0e0d",
          color: "#f2f1ec",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <title>{text.title}</title>
        <main style={{ maxWidth: 420, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 14, color: "#ff8a3d" }}>albicocca</p>
          <h1 style={{ margin: "14px 0 0", fontSize: 32, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            {text.heading}
          </h1>
          <p style={{ margin: "14px 0 0", fontSize: 16, lineHeight: 1.5, color: "#a8a69e" }}>
            {text.body}
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 28 }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{
                minHeight: 46,
                padding: "0 22px",
                borderRadius: 999,
                border: "1px solid #f2f1ec",
                background: "#f2f1ec",
                color: "#0e0e0d",
                font: "inherit",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {text.retry}
            </button>
            {/* A full page load on purpose: the root layout (and maybe the router) just failed. */}
            <a
              href={`/${lang}`}
              style={{
                display: "inline-grid",
                placeItems: "center",
                minHeight: 46,
                padding: "0 22px",
                borderRadius: 999,
                border: "1px solid #3a3935",
                color: "#f2f1ec",
                textDecoration: "none",
              }}
            >
              {text.home}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
