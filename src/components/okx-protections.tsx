"use client";

/**
 * The user's OKX protections (limits, whitelist, approval verification),
 * as OKX reported them at sign-in (lib/okx/security-policy). OKX applies
 * them and only the user can change them, on OKX's site: we link there.
 * Nothing is guessed; what OKX did not report reads "Not set".
 */

import { useEffect, useState } from "react";
import { Panel, Skeleton } from "@/components/premium";
import { useFormat, useT, type Formatters } from "@/i18n/client";
import type { SecurityPolicy } from "@/lib/okx/security-policy";

interface PolicyAnswer {
  policy: SecurityPolicy | null;
  savedAt: number | null;
  settingsUrl: string;
}

type Translate = ReturnType<typeof useT<"protections">>;

function usd(value: string | null, t: Translate, f: Formatters): string {
  if (value === null) return t("notSet");
  const n = Number(value);
  return Number.isFinite(n) ? f.usd(n) : t("notSet");
}

function withUsed(limit: string | null, used: string | null, t: Translate, f: Formatters): string {
  if (limit === null) return t("notSet");
  return used !== null
    ? t("perDayUsed", { limit: usd(limit, t, f), used: usd(used, t, f) })
    : t("perDay", { limit: usd(limit, t, f) });
}

function rows(p: SecurityPolicy, t: Translate, f: Formatters): Array<{ label: string; value: string; on: boolean }> {
  return [
    { label: t("perTransaction"), value: usd(p.singleTxLimit, t, f), on: p.singleTxLimit !== null },
    { label: t("transfers"), value: withUsed(p.dailyTransferTxLimit, p.dailyTransferTxUsed, t, f), on: p.dailyTransferTxLimit !== null },
    { label: t("trades"), value: withUsed(p.dailyTradeTxLimit, p.dailyTradeTxUsed, t, f), on: p.dailyTradeTxLimit !== null },
    {
      label: t("approvalCode"),
      value: p.doubleConfirmation === true ? t("on") : p.doubleConfirmation === false ? t("off") : t("notSet"),
      on: p.doubleConfirmation === true,
    },
    {
      label: t("allowedOnly"),
      value:
        p.whitelist === null
          ? t("notReported")
          : p.whitelist.enabled
            ? t("whitelistOn", { count: p.whitelist.addressCount })
            : t("notSet"),
      on: p.whitelist?.enabled === true,
    },
  ];
}

export function OkxProtections() {
  const t = useT("protections");
  const f = useFormat();
  const [answer, setAnswer] = useState<PolicyAnswer | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/wallet/policy")
      .then((r) => r.json())
      .then((json) => {
        if (live && json?.success) setAnswer(json.data as PolicyAnswer);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const policy = answer?.policy;
  const since = answer?.savedAt ? f.date(answer.savedAt, { day: "numeric", month: "short" }) : null;

  return (
    <Panel
      index={2}
      title={t("title")}
      sub={since ? t("subSince", { date: since }) : t("sub")}
      action={
        answer ? (
          <a className="chip" href={answer.settingsUrl} target="_blank" rel="noopener noreferrer">
            {t("change")}
          </a>
        ) : null
      }
    >
      {!answer ? (
        <Skeleton height={120} />
      ) : !policy ? (
        <p className="sub">{t("afterSignIn")}</p>
      ) : policy.status === "unavailable" ? (
        <p className="sub">{t("unavailable")}</p>
      ) : (
        <>
          <ul className="rows">
            {rows(policy, t, f).map((r) => (
              <li key={r.label}>
                <div className="row" style={{ gridTemplateColumns: "minmax(0, 1fr) auto", minHeight: 48 }}>
                  <span className="t">{r.label}</span>
                  <span className={`end num${r.on ? "" : " sub"}`}>{r.value}</span>
                </div>
              </li>
            ))}
          </ul>
          {policy.singleTxLimit === null && policy.doubleConfirmation !== true && (
            <p className="sub" style={{ marginTop: 12 }}>
              {t("serverNote")}
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
