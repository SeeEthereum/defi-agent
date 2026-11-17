"use client";

/**
 * A page inside the app failed to render. The masthead and dock stay (this
 * boundary sits under the (app) layout), the error goes to Sentry when it is
 * on, and the user can try again or go back to the dashboard. Nothing about
 * the error itself is shown: it may carry addresses or internal detail.
 */

import { useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { useT } from "@/i18n/client";
import { Empty } from "@/components/premium";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT("appError");
  const tc = useT("common");
  useEffect(() => {
    void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <div className="page">
      <Empty
        icon="alert"
        title={t("title")}
        text={t("text")}
        action={
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button type="button" className="btn btn--primary" onClick={() => retry()}>
              {tc("tryAgain")}
            </button>
            <Link className="btn" href="/">
              {tc("dashboard")}
            </Link>
          </div>
        }
      />
    </div>
  );
}
