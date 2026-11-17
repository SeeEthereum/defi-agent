/**
 * RiskDisclaimer: what every user accepts before they get a wallet (sign-in
 * page). Three points a newcomer reads in twenty seconds, with the full
 * terms one tap away in a native <details> (works without JavaScript, opens
 * with the keyboard, read in order by screen readers).
 *
 * The full terms are the approved wording. Only punctuation was changed to
 * the house rules (no em dashes, typographic quotes). The accepted flag lives
 * in localStorage under DISCLAIMER_KEY and is what the (app) layout checks
 * before letting anyone in.
 */

import { typeset as t } from "@/lib/typeset";

export const DISCLAIMER_KEY = "defi-agent-disclaimer-accepted";

/** The summary: custody, losses, and the protections only the user controls. */
export const RISK_POINTS: Array<{ title: string; body: string }> = [
  {
    title: "Who can sign for you",
    body: "Your key stays in OKX's secure enclave. While you are signed in, our server holds a session that can ask it to sign, used only for what you confirm. It is deleted when you sign out or after 30 minutes idle.",
  },
  {
    title: "You can lose money",
    body: "Prices move fast, and trades, bridges and loans can go wrong. Nothing here is financial advice, including what the assistant suggests.",
  },
  {
    title: "Your OKX protections",
    body: "Spending limits and approval codes are OKX's own protections. You set them in your OKX account, and only you can change them.",
  },
];

interface Clause {
  label?: string;
  body: React.ReactNode;
}
interface Section {
  title: string;
  intro?: React.ReactNode;
  clauses: Clause[];
  outro?: React.ReactNode;
}

export const RISK_TERMS: Section[] = [
  {
    title: "What you accept",
    intro: (
      <>
        <strong>albicocca</strong> provides access to decentralized finance
        protocols across multiple chains, including swap aggregation,
        cross-chain bridging, lending, security tooling, and an AI assistant. By
        using this application, you acknowledge and accept the
        following&nbsp;risks.
      </>
    ),
    clauses: [],
  },
  {
    title: "Markets and contracts",
    clauses: [
      {
        label: "Market risk",
        body: (
          <>
            Cryptocurrency values are highly volatile and can result in
            significant financial&nbsp;loss.
          </>
        ),
      },
      {
        label: "Smart contract risk",
        body: (
          <>
            DeFi protocols interact with smart contracts that may contain bugs,
            exploits, or governance failures, including those of routing
            aggregators, bridge protocols, and lending markets used by
            this&nbsp;app.
          </>
        ),
      },
      {
        label: "Token approvals",
        body: (
          <>
            Swapping, bridging, and lending require granting ERC-20 spending
            rights to third-party contracts. Unlimited approvals left active are
            a long-term risk vector: use the Security Center to review and
            revoke approvals you no longer&nbsp;need.
          </>
        ),
      },
    ],
  },
  {
    title: "Lending and bridges",
    clauses: [
      {
        label: "Lending protocol risk",
        body: (
          <>
            Supplying assets to lending markets (e.g. Fluid Protocol) exposes
            you to oracle failures, liquidity shortages, frozen reserves, and
            protocol-level insolvency. Past APR rates are not guarantees of
            future returns and can fluctuate or go to&nbsp;zero.
          </>
        ),
      },
      {
        label: "Cross-chain bridge risk",
        body: (
          <>
            Bridge transactions route through third-party protocols (Stargate,
            Across, Hop, and others via LI.FI) and can stall, take longer than
            estimated, or require manual recovery via the bridge’s own
            interface. Funds can remain in transit for extended&nbsp;periods.
          </>
        ),
      },
    ],
  },
  {
    title: "Trading",
    clauses: [
      {
        label: "Leveraged perpetual futures",
        body: (
          <>
            Perpetual futures use borrowed margin and can be liquidated.
            Liquidation can wipe out the entire margin posted to a position.
            Funding is charged continuously while a position stays open. Higher
            leverage increases both potential returns and the risk of rapid,
            total loss of margin. Never use more leverage than you can afford
            to&nbsp;lose.
          </>
        ),
      },
      {
        label: "Slippage & MEV",
        body: (
          <>
            Swap and bridge executions may settle at a different price than
            quoted due to volatility or MEV. MEV protection is best-effort on
            supported chains and is not a&nbsp;guarantee.
          </>
        ),
      },
    ],
  },
  {
    title: "The assistant and its data",
    clauses: [
      {
        label: "AI assistant disclaimer",
        body: (
          <>
            Proposals from the in-app AI assistant are generated by a language
            model and may be inaccurate, outdated, or unsafe. The AI never
            executes without explicit user confirmation.{" "}
            <strong>
              Always verify the chain, token address, and amount before
              approving any&nbsp;action.
            </strong>
          </>
        ),
      },
      {
        label: "Informational data only",
        body: (
          <>
            Smart money signals, KOL/whale activity feeds, leaderboards, token
            safety scans, and DApp phishing checks are <em>educational</em>, not
            financial advice. Security scanners reduce risk but cannot detect
            every exploit; new attacks can pass&nbsp;screening.
          </>
        ),
      },
    ],
  },
  {
    title: "Key custody",
    intro: (
      <>
        Your wallet is powered by <strong>OKX Agentic Wallet</strong>. Private
        keys are generated and stored inside a{" "}
        <strong>Trusted Execution Environment (TEE)</strong>, a
        hardware-isolated secure enclave. This&nbsp;means:
      </>
    ),
    clauses: [
      {
        body: (
          <>
            <strong>
              You cannot export, extract, or back up your private keys.
            </strong>{" "}
            There is no seed phrase, no mnemonic, and no recovery file. This is
            by&nbsp;design.
          </>
        ),
      },
      {
        body: (
          <>
            No one (not you, not OKX, not this application) can access the raw
            private key. All transaction signing happens inside the&nbsp;TEE.
          </>
        ),
      },
      {
        body: (
          <>
            <strong>
              While you are signed in, this application&rsquo;s server holds a
              session credential issued by OKX.
            </strong>{" "}
            It lets the server ask the enclave to sign, and the application uses
            it only for transactions you confirm. Someone who took control of
            that server could misuse it. Signing out deletes it from the server, and so do
            30 minutes without&nbsp;activity.
          </>
        ),
      },
      {
        body: (
          <>
            <strong>You depend on OKX infrastructure</strong> to access and
            operate your wallet. If OKX discontinues the Agentic Wallet service,
            you will not be able to recover your keys&nbsp;independently.
          </>
        ),
      },
      {
        body: (
          <>
            Your wallet is linked to the account you sign in with (Google, Apple
            or email). Losing access to that account may result in permanent
            loss of wallet&nbsp;access.
          </>
        ),
      },
    ],
  },
  {
    title: "Your responsibility",
    clauses: [
      {
        label: "Regulatory risk",
        body: (
          <>
            Cryptocurrency regulations vary by jurisdiction and may change at
            any time. You are responsible for compliance with the laws
            applicable to&nbsp;you.
          </>
        ),
      },
    ],
    outro: (
      <>
        This application does not provide financial advice. You are solely
        responsible for your investment decisions. Never invest more than you
        can afford to&nbsp;lose.
      </>
    ),
  },
];

/** The three points, numbered, then the full terms behind one tap. */
export function RiskDisclaimer() {
  return (
    <div className="risk">
      <ol className="risk-points">
        {RISK_POINTS.map((p, i) => (
          <li key={p.title}>
            <span className="risk-n" aria-hidden="true">
              {i + 1}
            </span>
            <div>
              <h2>{p.title}</h2>
              <p>{t(p.body)}</p>
            </div>
          </li>
        ))}
      </ol>

      <details className="risk-full">
        <summary>
          <span>Read the full terms</span>
          <svg className="risk-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <div className="risk-sections">
          {RISK_TERMS.map((s) => (
            <section key={s.title} aria-label={s.title}>
              <h3 className="risk-title">{s.title}</h3>
              {s.intro && <p className="risk-intro">{s.intro}</p>}
              {s.clauses.length > 0 && (
                <ul className="risk-clauses">
                  {s.clauses.map((c, k) => (
                    <li key={k}>
                      {c.label && <h4>{c.label}</h4>}
                      <p>{c.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              {s.outro && <p className="risk-outro">{s.outro}</p>}
            </section>
          ))}
        </div>
      </details>
    </div>
  );
}
