"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "motion/react";
import { BrandMark } from "@/components/brand-mark";
import { LineIcon } from "@/components/line-icon";
import { ThemeSwitch } from "@/components/theme-switch";
import { LanguageSwitch } from "@/components/language-switch";
import { useAuth } from "@/hooks/use-auth";
import { InstallAppItem } from "@/components/pwa/install-app";
import { useT } from "@/i18n/client";
import { Link, useLocalizedPath, usePathname } from "@/i18n/navigation";
import { MORE_NAV, PRIMARY_NAV, isActive } from "./nav";
import { useDismiss } from "./use-dismiss";

const PILL_SPRING = { type: "spring" as const, stiffness: 420, damping: 36, mass: 0.8 };

/** Sign out, then a full load of the sign-in page (in `authPath`'s language). */
export async function signOut(authPath = "/auth") {
  await fetch("/api/auth/logout", { method: "POST" });
  // A full load on purpose: it drops every cached client state of the session.
  window.location.href = authPath;
}

/** signOut bound to the page's language. */
export function useSignOut(): () => Promise<void> {
  const localized = useLocalizedPath();
  return useCallback(() => signOut(localized("/auth")), [localized]);
}

function shortAddress(a: string | null): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

/** Account pill and its menu: who is signed in, the address, sign out. */
export function AccountMenu() {
  const { accountName, email, walletAddress } = useAuth();
  const t = useT("shell");
  const tc = useT("common");
  const doSignOut = useSignOut();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);

  const initial = (accountName || email || "A").trim().charAt(0).toUpperCase();

  return (
    <div className="pop" ref={ref}>
      <button type="button" className="acct" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="name">{accountName || t("wallet")}</span>
        <LineIcon name="chevron-down" size={14} className="chev" />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <div>{accountName || t("wallet")}</div>
            {email && <small>{email}</small>}
          </div>
          {walletAddress && (
            <button
              type="button"
              role="menuitem"
              className="item"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(walletAddress);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                } catch {
                  // clipboard blocked: the address stays visible to select
                }
              }}
            >
              <LineIcon name={copied ? "check" : "copy"} size={16} />
              <span className="num">{copied ? tc("copied") : shortAddress(walletAddress)}</span>
            </button>
          )}
          <InstallAppItem className="item" role="menuitem" iconSize={16} onSelect={() => setOpen(false)} />
          <div className="menu-row">
            <span>{t("language")}</span>
            <LanguageSwitch />
          </div>
          <button type="button" role="menuitem" className="item danger" onClick={doSignOut}>
            <LineIcon name="exit" size={16} />
            {t("signOut")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Top bar: wordmark, floating island of sections, theme and account (language is in its menu). */
export function AppMasthead() {
  const pathname = usePathname();
  const t = useT("nav");
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  useDismiss(moreOpen, moreRef, closeMore);
  const moreActive = MORE_NAV.some((i) => isActive(pathname, i.href));

  return (
    <header className="mast">
      <div className="wrap mast-row">
        <Link className="wordmark" href="/" aria-label={t("homeLabel")}>
          <BrandMark size={22} />
        </Link>

        <nav className="island" aria-label={t("sections")}>
          {PRIMARY_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
                {active && <motion.span layoutId="nav-pill" className="nav-pill" transition={PILL_SPRING} />}
                {t(item.label)}
              </Link>
            );
          })}
          <div className="pop" ref={moreRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              data-active={moreActive}
              onClick={() => setMoreOpen((o) => !o)}
              className="more-btn"
            >
              {moreActive && <motion.span layoutId="nav-pill" className="nav-pill" transition={PILL_SPRING} />}
              {t("more")}
              <LineIcon name="chevron-down" size={13} />
            </button>
            {moreOpen && (
              <div className="menu left" role="menu">
                {MORE_NAV.map((item) => (
                  <Link key={item.href} href={item.href} role="menuitem" aria-current={isActive(pathname, item.href) ? "page" : undefined} onClick={closeMore}>
                    <LineIcon name={item.icon} size={16} />
                    {t(item.label)}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="mast-side">
          <ThemeSwitch />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
