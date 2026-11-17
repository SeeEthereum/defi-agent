"use client";

/**
 * The user's OKX protections (limits, whitelist, approval verification),
 * as OKX reported them at sign-in (lib/okx/security-policy). OKX applies
 * them and only the user can change them, on OKX's site: we link there.
 * Nothing is guessed; what OKX did not report reads "Not set".
 */

import { useEffect, useState } from "react";
import { Panel, Skeleton } from "@/components/premium";
import type { SecurityPolicy } from "@/lib/okx/security-policy";

interface PolicyAnswer {
  policy: SecurityPolicy | null;
  savedAt: number | null;
  settingsUrl: string;
}

function usd(value: string | null): string {
  if (value === null) return "Not set";
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }) : "Not set";
}

function withUsed(limit: string | null, used: string | null): string {
  if (limit === null) return "Not set";
  return used !== null ? `${usd(limit)} a day, ${usd(used)} used today` : `${usd(limit)} a day`;
}

function rows(p: SecurityPolicy): Array<{ label: string; value: string; on: boolean }> {
  return [
    { label: "Per transaction", value: usd(p.singleTxLimit), on: p.singleTxLimit !== null },
    { label: "Transfers", value: withUsed(p.dailyTransferTxLimit, p.dailyTransferTxUsed), on: p.dailyTransferTxLimit !== null },
    { label: "Trades", value: withUsed(p.dailyTradeTxLimit, p.dailyTradeTxUsed), on: p.dailyTradeTxLimit !== null },
    {
      label: "Approval code by email",
      value: p.doubleConfirmation === true ? "On" : p.doubleConfirmation === false ? "Off" : "Not set",
      on: p.doubleConfirmation === true,
    },
    {
      label: "Allowed addresses only",
      value:
        p.whitelist === null
          ? "Not reported"
          : p.whitelist.enabled
            ? `On, ${p.whitelist.addressCount} address${p.whitelist.addressCount === 1 ? "" : "es"}`
            : "Not set",
      on: p.whitelist?.enabled === true,
    },
  ];
}

export function OkxProtections() {
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
  const since = answer?.savedAt ? new Date(answer.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;

  return (
    <Panel
      index={2}
      title="Protection set at OKX"
      sub={since ? `As of your sign-in on ${since}. Only you can change it, on OKX.` : "Only you can change it, on OKX."}
      action={
        answer ? (
          <a className="chip" href={answer.settingsUrl} target="_blank" rel="noopener noreferrer">
            Change at OKX
          </a>
        ) : null
      }
    >
      {!answer ? (
        <Skeleton height={120} />
      ) : !policy ? (
        <p className="sub">Shown after your next sign-in.</p>
      ) : policy.status === "unavailable" ? (
        <p className="sub">OKX did not report it at sign-in. Check it at OKX.</p>
      ) : (
        <>
          <ul className="rows">
            {rows(policy).map((r) => (
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
              This server signs for you while you are signed in. A limit at OKX caps what any single transaction can
              move, whatever happens here; the approval code covers token approvals, which limits do not.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
