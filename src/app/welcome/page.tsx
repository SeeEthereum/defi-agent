/**
 * albicocca landing — the public entry to the app.
 *
 * A Server Component: every word is in the HTML before any script runs.
 * Interactive and moving parts are small client islands (Masthead, Marquee,
 * LandingMotion). Every "Sign in" goes to /auth, which shows the risk
 * disclaimer and then the OKX sign-in.
 *
 * Copy is the approved copy, typeset for print: curly quotes, no em dashes,
 * last two words joined (see lib/typeset).
 */

import Image from "next/image";
import { BrandMark } from "@/components/brand-mark";
import { LineIcon } from "@/components/line-icon";
import { ThemeSwitch } from "@/components/theme-switch";
import { typeset as t } from "@/lib/typeset";
import { LandingMotion } from "./landing-motion";
import { Marquee } from "./marquee";
import { Masthead } from "./masthead";
import lightRoom from "./media/light-room.jpg";
import engraving from "./media/engraving.jpg";
import "./landing.css";

const MARQUEE = ["Swap", "Bridge", "Earn", "Perps", "Smart money signals", "Token safety", "Gas in stablecoins", "Six chains"];

/** A headline line split into words, each rising in turn (CSS only). */
function Words({ text, from = 0 }: { text: string; from?: number }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((w, i) => (
        <span key={i} className="w" style={{ "--i": from + i } as React.CSSProperties}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

function SignInButton({ large = false }: { large?: boolean }) {
  return (
    <a className={`btn btn--primary${large ? " btn--lg" : ""}`} href="/auth">
      Sign in
      <span className="well" aria-hidden="true">
        <LineIcon name="arrow-up-right" size={large ? 18 : 16} />
      </span>
    </a>
  );
}

export default function WelcomePage() {
  return (
    <div className="lp" id="top">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="lp-ambient" aria-hidden="true" />
      <div className="lp-grain" aria-hidden="true" />
      <span id="top-sentinel" aria-hidden="true" style={{ position: "absolute", top: 0, height: 1, width: 1 }} />

      <Masthead />

      <main id="main" tabIndex={-1}>
        {/* ───────── Hero ───────── */}
        <div className="wrap">
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-core">
              <div className="hero-art" aria-hidden="true">
                <Image src={lightRoom} alt="" fill priority sizes="(max-width: 1080px) 100vw, 75vw" placeholder="blur" />
              </div>

              <div className="hero-copy">
                <p className="kicker">Live on six chains</p>
                <h1 id="hero-title" className="h1">
                  <span className="line">
                    <Words text="Ask your wallet." />
                  </span>
                  <span className="line">
                    <Words text="It does the rest." from={3} />
                  </span>
                </h1>
                <p className="lead">
                  {t(
                    "albicocca is an onchain agent with a wallet built in. Swap, bridge, earn and trade across six chains by asking for it. No seed phrase, no bridge tabs, no gas token you forgot to buy."
                  )}
                </p>
                <div className="actions">
                  <SignInButton large />
                  <a className="btn btn--lg" href="#what">
                    See what it does
                  </a>
                </div>
              </div>

              <figure className="hero-card bezel" aria-label="Example: the assistant turns a request into a plan you confirm">
                <div className="core">
                  <p className="chat-me" data-seq style={{ "--s": 0 } as React.CSSProperties}>
                    {t("Move half my USDC to Base and earn on it")}
                  </p>
                  <p className="chat-ai" data-seq style={{ "--s": 1 } as React.CSSProperties}>
                    Found <span className="num">412 USDC</span> on Arbitrum. Bridging <span className="num">206</span> to Base, then supplying.
                    Two&nbsp;steps.
                  </p>
                  <ul className="plan" data-seq style={{ "--s": 2 } as React.CSSProperties}>
                    <li>
                      <span className="op">Bridge</span>
                      <span className="num">206 USDC → Base</span>
                    </li>
                    <li>
                      <span className="op then">Then supply</span>
                      <span>Lending pool</span>
                    </li>
                  </ul>
                  <div className="confirm" data-seq style={{ "--s": 3 } as React.CSSProperties} aria-hidden="true">
                    <span className="yes">Confirm</span>
                    <span className="no">Cancel</span>
                  </div>
                </div>
              </figure>
            </div>
          </section>

          {/* ───────── Feature deck ───────── */}
          <div className="deck-wrap">
            <div className="deck" data-loop="on" role="list" aria-label="What you can ask for">
              <div className="tile-slot" role="listitem" style={{ "--k": 0 } as React.CSSProperties}>
                <div className="tile tile--swap">
                  <div className="tile-icon" aria-hidden="true">
                    <LineIcon name="swap" size={26} strokeWidth={1.9} />
                  </div>
                  <div className="tile-body" aria-hidden="true">
                    <div className="rows">
                      <i style={{ "--d": "0s", "--w": "30px" } as React.CSSProperties}><b /><s /><u /></i>
                      <i style={{ "--d": "0.35s", "--w": "22px" } as React.CSSProperties}><b /><s /><u /></i>
                      <i style={{ "--d": "0.7s", "--w": "34px" } as React.CSSProperties}><b /><s /><u /></i>
                      <span className="badge">Best route</span>
                    </div>
                  </div>
                  <div>
                    <div className="tile-name">Swap</div>
                    <div className="tile-sub">500+ liquidity sources</div>
                  </div>
                </div>
              </div>

              <div className="tile-slot" role="listitem" style={{ "--k": 1 } as React.CSSProperties}>
                <div className="tile tile--earn">
                  <div className="tile-icon" aria-hidden="true">
                    <LineIcon name="bar-chart" size={26} strokeWidth={1.9} />
                  </div>
                  <div className="tile-body" aria-hidden="true">
                    <div style={{ fontSize: 12, opacity: 0.8 }}>Supplied</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: 15, opacity: 0.8 }}>$</span>
                      <span className="tick num">
                        <span>
                          <span>1,240</span>
                          <span>1,268</span>
                          <span>1,291</span>
                          <span>1,317</span>
                          <span>1,240</span>
                        </span>
                      </span>
                    </div>
                    <div className="bar">
                      <span />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.9 }}>
                      <span style={{ padding: "3px 8px", borderRadius: 999, background: "rgba(255,255,255,0.22)", fontWeight: 600 }}>Earning</span>
                      <span>every block</span>
                    </div>
                  </div>
                  <div>
                    <div className="tile-name">Earn</div>
                    <div className="tile-sub">Lending, no lock-up</div>
                  </div>
                </div>
              </div>

              <div className="tile-slot" role="listitem" style={{ "--k": 2 } as React.CSSProperties}>
                <div className="tile tile--trade">
                  <div className="tile-icon" aria-hidden="true">
                    <LineIcon name="trending-up" size={26} strokeWidth={1.9} />
                  </div>
                  <div className="tile-body" aria-hidden="true">
                    <div className="chart">
                      <svg width="100%" height="88" viewBox="0 0 200 88" fill="none" style={{ overflow: "visible", display: "block" }}>
                        <path pathLength={1} d="M4 72 L30 60 L54 66 L80 42 L106 48 L130 24 L156 32 L196 8" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="runner" />
                    </div>
                  </div>
                  <div>
                    <div className="tile-name">Trade</div>
                    <div className="tile-sub">Perps with a stop attached</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="deck-dots" aria-hidden="true">
              <span />
              <span data-on="true" />
              <span />
            </div>
          </div>
        </div>

        <Marquee items={MARQUEE} />

        {/* ───────── What it does ───────── */}
        <section id="what" className="section" aria-labelledby="what-title">
          <div className="wrap">
            <div data-reveal>
              <span className="label">What it does</span>
              <h2 id="what-title" className="h2">
                You say it. <span className="soft">It routes&nbsp;it.</span>
              </h2>
              <p className="sec-lead">
                {t("Every action is proposed before it runs. You see the chain, the token and the amount, and nothing moves until you confirm.")}
              </p>
            </div>

            <div className="bento">
              <article className="bezel cell-assistant" data-spot data-reveal="0">
                <div className="core">
                  <div>
                    <span className="cell-label">Assistant</span>
                    <h3 className="h3">Ask in plain words.</h3>
                    <p className="quote">{t(`"Move half my USDC to Base and put it to work."`)}</p>
                  </div>
                  <div>
                  <p className="cell-text">
                    {t("It reads your balances, picks the route, and hands you a card to approve. No dropdowns, no chain switcher, no copying addresses between tabs.")}
                  </p>
                  <div className="quote-rule" aria-hidden="true">
                    <span className="op">Swap</span>
                    <span className="op">Bridge</span>
                    <span className="op">Earn</span>
                    <span className="op">Perps</span>
                  </div>
                  </div>
                </div>
              </article>

              <article className="bezel cell-gas" data-spot data-reveal="0.08">
                <div className="core">
                  <span className="cell-label">Gas Station</span>
                  <h3 className="h3">No native token? Fine.</h3>
                  <p className="cell-text">
                    {t("Out of ETH on the chain you need? Pay the gas in USDC or USDT instead and keep going. A relayer fronts the native token and your stablecoin settles it in the same transaction.")}
                  </p>
                  <div className="mini" aria-label="Example: paying gas with a stablecoin">
                    <div className="mini-foot" style={{ paddingTop: 0 }}>
                      <span>Not enough ETH for gas</span>
                    </div>
                    <div className="mini-row on">
                      <span>USDC</span>
                      <span className="num">412.08</span>
                    </div>
                    <div className="mini-row">
                      <span>USDT</span>
                      <span className="num">96.40</span>
                    </div>
                    <div className="mini-foot">
                      <span>Network fee</span>
                      <span className="num">0.13 USDC</span>
                    </div>
                  </div>
                </div>
              </article>

              <article className="bezel cell-safety" data-spot data-reveal="0.16">
                <div className="core">
                  <span className="cell-label">Safety</span>
                  <h3 className="h3">It checks before you sign.</h3>
                  <p className="cell-text">
                    {t("Every transaction is scanned before it goes out, and unfamiliar tokens are screened for honeypots and hidden sell taxes. Old approvals you left behind are listed so you can revoke them in a tap.")}
                  </p>
                  <div className="mini" aria-label="Example: a safety check">
                    <div className="mini-row">
                      <span className="ok">
                        <LineIcon name="check" size={16} strokeWidth={2.2} />
                        Contract verified
                      </span>
                    </div>
                    <div className="mini-row">
                      <span className="ok">
                        <LineIcon name="check" size={16} strokeWidth={2.2} />
                        Not a honeypot
                      </span>
                    </div>
                    <div className="mini-row">
                      <span className="warn">
                        <span className="num">3</span> old approvals open
                      </span>
                      <span className="op">Revoke all</span>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ───────── How it works ───────── */}
        <section id="how" className="section" aria-labelledby="how-title">
          <div className="wrap how">
            <div className="how-head" data-reveal>
              <h2 id="how-title" className="h2">
                Three steps. <span className="soft">Then just&nbsp;ask.</span>
              </h2>
              <p className="sec-lead">
                {t("You are never asked to write down twelve words, install an extension, or approve a transaction you cannot read.")}
              </p>
            </div>
            <div className="steps">
              <span className="steps-track" aria-hidden="true" />
              <span className="steps-fill" aria-hidden="true" />
              <ol>
              <li className="step" data-reveal="0">
                <h3>Sign in</h3>
                <p>{t("Google, Apple or your email. A wallet is created for you in the same moment: nothing to write down, nothing to lose.")}</p>
              </li>
              <li className="step" data-reveal="0.05">
                <h3>Add funds</h3>
                <p>{t("Send crypto to your new address on any supported chain.")}</p>
              </li>
              <li className="step" data-reveal="0.1">
                <h3>Ask for it</h3>
                <p>{t("Swap, bridge, lend, open a position, check what the smart money is buying. Read the card it hands back, then confirm.")}</p>
              </li>
              </ol>
            </div>
          </div>
        </section>

        {/* ───────── Custody ───────── */}
        <section id="custody" className="section" aria-labelledby="custody-title" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="bezel vault" data-reveal>
              <div className="core">
                <div className="vault-copy">
                  <div>
                    <span className="label">Custody</span>
                    <h2 id="custody-title" className="h2">
                      Your keys stay <span className="soft">in the&nbsp;enclave.</span>
                    </h2>
                    <p className="sec-lead">
                      {t("Your private key is generated inside OKX's secure enclave and never leaves it. The assistant can prepare a transaction and ask you to sign it, but it cannot read your key, and neither can we.")}
                    </p>
                  </div>
                  <ul className="points">
                    <li>
                      <LineIcon name="lock" size={22} />
                      <div>
                        <h3>No seed phrase</h3>
                        <p>{t("Nothing to write on paper and nothing to lose. You sign in the way you already sign in everywhere else.")}</p>
                      </div>
                    </li>
                    <li>
                      <LineIcon name="shield-check" size={22} />
                      <div>
                        <h3>You confirm everything</h3>
                        <p>{t("The assistant proposes, you approve. It never signs on its own, however you phrase the request.")}</p>
                      </div>
                    </li>
                    <li>
                      <LineIcon name="exit" size={22} />
                      <div>
                        <h3>Leave whenever</h3>
                        <p>{t("It is your wallet on public chains. Send everything out the day you decide to stop. No notice, no queue.")}</p>
                      </div>
                    </li>
                  </ul>
                </div>
                <div className="vault-art" aria-hidden="true">
                  <Image src={engraving} alt="" fill sizes="(max-width: 1080px) 100vw, 45vw" placeholder="blur" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ───────── Closing ───────── */}
        <section id="access" className="closing" aria-labelledby="access-title">
          <div className="wrap" data-reveal>
            <h2 id="access-title" className="h-close">
              Start in a&nbsp;minute.
            </h2>
            <p className="sec-lead">
              {t("Sign in with Google, Apple or email. Your wallet is created on the spot, and you can ask for your first swap straight after.")}
            </p>
            <div className="actions">
              <SignInButton large />
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot-row">
          <BrandMark size={19} />
          <nav className="foot-links" aria-label="Footer">
            <a href="#what">What it does</a>
            <a href="#custody">Custody</a>
            <a href="/auth">Sign in</a>
          </nav>
          <ThemeSwitch />
          <small>© 2026 albicocca</small>
        </div>
      </footer>

      <LandingMotion />
    </div>
  );
}
