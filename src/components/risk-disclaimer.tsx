"use client";

/**
 * RiskDisclaimer: what every user accepts before they get a wallet (sign-in
 * page). Three points a newcomer reads in twenty seconds, with the full
 * terms one tap away in a native <details> (works without JavaScript, opens
 * with the keyboard, read in order by screen readers).
 *
 * The words live in the dictionary (i18n/messages, "disclaimer"). The
 * English full terms are the approved wording, only punctuation changed to
 * the house rules (no em dashes, typographic quotes); the Italian is a
 * translation to be reviewed by a lawyer. The accepted flag lives in
 * localStorage under DISCLAIMER_KEY and is what the (app) layout checks
 * before letting anyone in. It means the same in both languages.
 */

import type { ReactNode } from "react";
import { typeset } from "@/lib/typeset";
import { useT, type ClientTranslator } from "@/i18n/client";
import type { At, Paths } from "@/i18n/translate";
import type { Messages } from "@/i18n/messages/en";

export const DISCLAIMER_KEY = "defi-agent-disclaimer-accepted";

type Key = Paths<At<Messages, "disclaimer">>;

const POINTS: Array<[Key, Key]> = [
  ["point1Title", "point1Body"],
  ["point2Title", "point2Body"],
  ["point3Title", "point3Body"],
];

interface Section {
  title: Key;
  intro?: Key;
  clauses: Array<{ label?: Key; body: Key }>;
  outro?: Key;
}

const SECTIONS: Section[] = [
  { title: "acceptTitle", intro: "acceptIntro", clauses: [] },
  {
    title: "marketsTitle",
    clauses: [
      { label: "marketLabel", body: "market" },
      { label: "contractsLabel", body: "contracts" },
      { label: "approvalsLabel", body: "approvals" },
    ],
  },
  {
    title: "lendingTitle",
    clauses: [
      { label: "lendingLabel", body: "lending" },
      { label: "bridgeLabel", body: "bridge" },
    ],
  },
  {
    title: "tradingTitle",
    clauses: [
      { label: "perpsLabel", body: "perps" },
      { label: "slippageLabel", body: "slippage" },
    ],
  },
  {
    title: "assistantTitle",
    clauses: [
      { label: "aiLabel", body: "ai" },
      { label: "dataLabel", body: "data" },
    ],
  },
  {
    title: "custodyTitle",
    intro: "custodyIntro",
    clauses: [{ body: "custody1" }, { body: "custody2" }, { body: "custody3" }, { body: "custody4" }, { body: "custody5" }],
  },
  { title: "responsibilityTitle", clauses: [{ label: "regulatoryLabel", body: "regulatory" }], outro: "outro" },
];

/** A clause with its bold and italic parts. */
function richText(t: ClientTranslator<Key>, key: Key): ReactNode {
  return t.node(key, { b: (s) => <strong>{s}</strong>, em: (s) => <em>{s}</em> });
}

/** The three points, numbered, then the full terms behind one tap. */
export function RiskDisclaimer() {
  const t = useT("disclaimer");
  return (
    <div className="risk">
      <ol className="risk-points">
        {POINTS.map(([title, body], i) => (
          <li key={title}>
            <span className="risk-n" aria-hidden="true">
              {i + 1}
            </span>
            <div>
              <h2>{t(title)}</h2>
              <p>{typeset(t(body))}</p>
            </div>
          </li>
        ))}
      </ol>

      <details className="risk-full">
        <summary>
          <span>{t("readFull")}</span>
          <svg className="risk-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <div className="risk-sections">
          {SECTIONS.map((s) => (
            <section key={s.title} aria-label={t(s.title)}>
              <h3 className="risk-title">{t(s.title)}</h3>
              {s.intro && <p className="risk-intro">{richText(t, s.intro)}</p>}
              {s.clauses.length > 0 && (
                <ul className="risk-clauses">
                  {s.clauses.map((c) => (
                    <li key={c.body}>
                      {c.label && <h4>{t(c.label)}</h4>}
                      <p>{richText(t, c.body)}</p>
                    </li>
                  ))}
                </ul>
              )}
              {s.outro && <p className="risk-outro">{richText(t, s.outro)}</p>}
            </section>
          ))}
        </div>
      </details>
    </div>
  );
}
