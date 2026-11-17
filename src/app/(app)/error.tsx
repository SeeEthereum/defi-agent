"use client";

/**
 * A page inside the app failed to render. The masthead and dock stay (this
 * boundary sits under the (app) layout), the error goes to Sentry when it is
 * on, and the user can try again or go back to the dashboard. Nothing about
 * the error itself is shown: it may carry addresses or internal detail.
 */

import { useEffect } from "react";
import Link from "next/link";
import { Empty } from "@/components/premium";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <div className="page">
      <Empty
        icon="alert"
        title="This page stopped working"
        text="If you had just confirmed a transaction, check Wallet activity before trying again."
        action={
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button type="button" className="btn btn--primary" onClick={() => retry()}>
              Try again
            </button>
            <Link className="btn" href="/">
              Dashboard
            </Link>
          </div>
        }
      />
    </div>
  );
}
