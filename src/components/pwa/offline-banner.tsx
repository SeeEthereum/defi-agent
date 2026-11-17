"use client";

import { useSyncExternalStore } from "react";
import { useT } from "@/i18n/client";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Says so when the device loses its connection, so figures already on
 * screen are not read as current. Nothing is blocked here: a send or swap
 * without a connection fails at its own request, with its own message.
 */
export function OfflineBanner() {
  const t = useT("shell");
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  );
  if (online) return null;
  return (
    <p className="note warn idle-note" role="status">
      <span>{t("offline")}</span>
    </p>
  );
}
