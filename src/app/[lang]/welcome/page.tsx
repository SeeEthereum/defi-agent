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

import { Fragment, type ReactNode } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BrandMark } from "@/components/brand-mark";
import { LineIcon } from "@/components/line-icon";
import { ThemeSwitch } from "@/components/theme-switch";
import { LanguageSwitch } from "@/components/language-switch";
import { typeset } from "@/lib/typeset";
import { LOCALES, isLocale, type Locale } from "@/i18n/config";
import { translator } from "@/i18n/server";
import { LandingMotion } from "./landing-motion";
import { Marquee } from "./marquee";
import { Masthead } from "./masthead";
import lightRoom from "./media/light-room.jpg";
import engraving from "./media/engraving.jpg";
import "./landing.css";

type Props = { params: Promise<{ lang: string }> };

/** The landing in each language points search engines at the other (hreflang). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return {
    alternates: {
      canonical: `/${lang}/welcome`,
      languages: Object.fromEntries([...LOCALES.map((l) => [l, `/${l}/welcome`]), ["x-default", "/en/welcome"]]),
    },
  };
}

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

function SignInButton({ large = false, locale, label }: { large?: boolean; locale: Locale; label: string }) {
  return (
    <a className={`btn btn--primary${large ? " btn--lg" : ""}`} href={`/${locale}/auth`}>
      {label}
      <span className="well" aria-hidden="true">
        <LineIcon name="arrow-up-right" size={large ? 18 : 16} />
      </span>
    </a>
  );
}

/** A tagged message as React nodes: <soft> and <num> become styled spans. */
function rich(parts: Array<string | ReactNode>): ReactNode {
  return parts.map((part, i) => <Fragment key={i}>{part}</Fragment>);
}

export default async function WelcomePage({ params }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = translator(lang, "landing");
  const tc = translator(lang, "common");
  const soft = (text: string) => <span className="soft">{text}</span>;
  const num = (text: string) => <span className="num">{text}</span>;

  return (
    <div className="lp" id="top">
      <a className="skip-link" href="#main">
        {tc("skipToContent")}
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
                {/* Phones never show the photo (landing.css): a 1vw slot makes them preload the smallest variant, not a full one. */}
                <Image src={lightRoom} alt="" fill priority quality={60} sizes="(max-width: 760px) 1vw, (max-width: 1080px) 90vw, 75vw" />
              </div>

              <div className="hero-copy">
                <p className="kicker">{t("kicker")}</p>
                <h1
                  id="hero-title"
                  className="h1"
                  // Longer than "It does the rest." (17): landing.css shrinks it to fit.
                  data-long={Math.max(t("heroLine1").length, t("heroLine2").length) > 17 ? "" : undefined}
                >
                  <span className="line">
                    <Words text={t("heroLine1")} />
                  </span>
                  <span className="line">
                    <Words text={t("heroLine2")} from={t("heroLine1").split(" ").length} />
                  </span>
                </h1>
                <p className="lead">{typeset(t("lead"))}</p>
                <div className="actions">
                  <SignInButton large locale={lang} label={t("signIn")} />
                  <a className="btn btn--lg" href="#what">
                    {t("seeWhat")}
                  </a>
                </div>
              </div>

              <figure className="hero-card bezel" aria-label={t("heroCardLabel")}>
                <div className="core">
                  <p className="chat-me" data-seq style={{ "--s": 0 } as React.CSSProperties}>
                    {typeset(t("chatMe"))}
                  </p>
                  <p className="chat-ai" data-seq style={{ "--s": 1 } as React.CSSProperties}>
                    {rich(t.rich("chatAi", { num }))}
                  </p>
                  <ul className="plan" data-seq style={{ "--s": 2 } as React.CSSProperties}>
                    <li>
                      <span className="op">{t("planBridge")}</span>
                      <span className="num">{t("planBridgeValue")}</span>
                    </li>
                    <li>
                      <span className="op then">{t("planThen")}</span>
                      <span>{t("planPool")}</span>
                    </li>
                  </ul>
                  <div className="confirm" data-seq style={{ "--s": 3 } as React.CSSProperties} aria-hidden="true">
                    <span className="yes">{t("confirm")}</span>
                    <span className="no">{t("cancel")}</span>
                  </div>
                </div>
              </figure>
            </div>
          </section>
        </div>

        <Marquee items={t("marquee").split("|")} />

        {/* ───────── What it does ───────── */}
        <section id="what" className="section" aria-labelledby="what-title">
          <div className="wrap">
            <div data-reveal>
              <span className="label">{t("whatLabel")}</span>
              <h2 id="what-title" className="h2">
                {rich(t.rich("whatTitle", { soft }))}
              </h2>
              <p className="sec-lead">{typeset(t("whatLead"))}</p>
            </div>

            <div className="bento">
              <article className="bezel cell-assistant" data-spot data-reveal="0">
                <div className="core">
                  <div>
                    <span className="cell-label">{t("assistantLabel")}</span>
                    <h3 className="h3">{t("assistantTitle")}</h3>
                    <p className="quote">{typeset(t("assistantQuote"))}</p>
                  </div>
                  <div>
                  <p className="cell-text">{typeset(t("assistantText"))}</p>
                  <div className="quote-rule" aria-hidden="true">
                    <span className="op">{t("opSwap")}</span>
                    <span className="op">{t("opBridge")}</span>
                    <span className="op">{t("opEarn")}</span>
                    <span className="op">{t("opPerps")}</span>
                  </div>
                  </div>
                </div>
              </article>

              <article className="bezel cell-gas" data-spot data-reveal="0.08">
                <div className="core">
                  <span className="cell-label">{t("gasLabel")}</span>
                  <h3 className="h3">{t("gasTitle")}</h3>
                  <p className="cell-text">{typeset(t("gasText"))}</p>
                  <div className="mini" aria-label={t("gasExample")}>
                    <div className="mini-foot" style={{ paddingTop: 0 }}>
                      <span>{t("gasNotEnough")}</span>
                    </div>
                    <div className="mini-row on">
                      <span>USDC</span>
                      <span className="num">{t("gasUsdc")}</span>
                    </div>
                    <div className="mini-row">
                      <span>USDT</span>
                      <span className="num">{t("gasUsdt")}</span>
                    </div>
                    <div className="mini-foot">
                      <span>{t("gasFee")}</span>
                      <span className="num">{t("gasFeeValue")}</span>
                    </div>
                  </div>
                </div>
              </article>

              <article className="bezel cell-safety" data-spot data-reveal="0.16">
                <div className="core">
                  <span className="cell-label">{t("safetyLabel")}</span>
                  <h3 className="h3">{t("safetyTitle")}</h3>
                  <p className="cell-text">{typeset(t("safetyText"))}</p>
                  <div className="mini" aria-label={t("safetyExample")}>
                    <div className="mini-row">
                      <span className="ok">
                        <LineIcon name="check" size={16} strokeWidth={2.2} />
                        {t("safetyVerified")}
                      </span>
                    </div>
                    <div className="mini-row">
                      <span className="ok">
                        <LineIcon name="check" size={16} strokeWidth={2.2} />
                        {t("safetyHoneypot")}
                      </span>
                    </div>
                    <div className="mini-row">
                      <span className="warn">{rich(t.rich("safetyApprovals", { num }))}</span>
                      <span className="op">{t("safetyRevoke")}</span>
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
                {rich(t.rich("howTitle", { soft }))}
              </h2>
              <p className="sec-lead">{typeset(t("howLead"))}</p>
            </div>
            <div className="steps">
              <span className="steps-track" aria-hidden="true" />
              <span className="steps-fill" aria-hidden="true" />
              <ol>
              <li className="step" data-reveal="0">
                <h3>{t("step1")}</h3>
                <p>{typeset(t("step1Text"))}</p>
              </li>
              <li className="step" data-reveal="0.05">
                <h3>{t("step2")}</h3>
                <p>{typeset(t("step2Text"))}</p>
              </li>
              <li className="step" data-reveal="0.1">
                <h3>{t("step3")}</h3>
                <p>{typeset(t("step3Text"))}</p>
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
                    <span className="label">{t("custodyLabel")}</span>
                    <h2 id="custody-title" className="h2">
                      {rich(t.rich("custodyTitle", { soft }))}
                    </h2>
                    <p className="sec-lead">{typeset(t("custodyLead"))}</p>
                  </div>
                  <ul className="points">
                    <li>
                      <LineIcon name="lock" size={22} />
                      <div>
                        <h3>{t("noSeed")}</h3>
                        <p>{typeset(t("noSeedText"))}</p>
                      </div>
                    </li>
                    <li>
                      <LineIcon name="shield-check" size={22} />
                      <div>
                        <h3>{t("youConfirm")}</h3>
                        <p>{typeset(t("youConfirmText"))}</p>
                      </div>
                    </li>
                    <li>
                      <LineIcon name="exit" size={22} />
                      <div>
                        <h3>{t("leave")}</h3>
                        <p>{typeset(t("leaveText"))}</p>
                      </div>
                    </li>
                  </ul>
                </div>
                <div className="vault-art" aria-hidden="true">
                  <Image src={engraving} alt="" fill quality={70} sizes="(max-width: 1080px) 100vw, 45vw" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ───────── Closing ───────── */}
        <section id="access" className="closing" aria-labelledby="access-title">
          <div className="wrap" data-reveal>
            <h2 id="access-title" className="h-close">
              {t("closingTitle")}
            </h2>
            <p className="sec-lead">{typeset(t("closingLead"))}</p>
            <div className="actions">
              <SignInButton large locale={lang} label={t("signIn")} />
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot-row">
          <BrandMark size={19} />
          <nav className="foot-links" aria-label={t("footer")}>
            <a href="#what">{t("linkWhat")}</a>
            <a href="#custody">{t("linkCustody")}</a>
            <a href={`/${lang}/auth`}>{t("signIn")}</a>
          </nav>
          <div className="foot-switches">
            <LanguageSwitch />
            <ThemeSwitch />
          </div>
          <small>© 2026 albicocca</small>
        </div>
      </footer>

      <LandingMotion />
    </div>
  );
}
