"use client";

import { useSyncExternalStore } from "react";

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
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  );
  if (online) return null;
  return (
    <p className="note warn idle-note" role="status">
      <span>You&apos;re offline. Balances and prices on screen may be out of date, and nothing can be sent until the connection is back.</span>
    </p>
  );
}
