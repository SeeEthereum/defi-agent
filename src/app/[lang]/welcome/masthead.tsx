"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { CoreIcon } from "@/components/line-icon-core";
import { ThemeSwitch } from "@/components/theme-switch";
import { LanguageSwitch } from "@/components/language-switch";
import { useLocale, useT } from "@/i18n/client";

const LINKS = [
  { id: "what", label: "linkWhat" },
  { id: "how", label: "linkHow" },
  { id: "custody", label: "linkCustody" },
] as const;

/**
 * Floating island navigation.
 *
 * - The active pill follows the section in view (IntersectionObserver).
 * - The veil behind the bar appears once the page has scrolled, detected by
 *   a sentinel at the top of the page, not by a scroll listener.
 * - On phones the island becomes a menu sheet.
 */
export function Masthead() {
  const t = useT("landing");
  const locale = useLocale();
  const [active, setActive] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const islandRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const mastRef = useRef<HTMLElement>(null);

  // Section in view → active link.
  useEffect(() => {
    const sections = LINKS.map((l) => document.getElementById(l.id)).filter(Boolean) as HTMLElement[];
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        let best: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of visible) {
          if (ratio > bestRatio) {
            best = id;
            bestRatio = ratio;
          }
        }
        setActive(best);
      },
      { rootMargin: "-35% 0px -45% 0px", threshold: [0, 0.01, 0.2, 0.5, 1] }
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  // Top sentinel → scrolled state.
  useEffect(() => {
    const sentinel = document.getElementById("top-sentinel");
    if (!sentinel) return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting));
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  // Slide the pill under the active link (transform + width only).
  useLayoutEffect(() => {
    const island = islandRef.current;
    const pill = indicatorRef.current;
    if (!island || !pill) return;
    const link = active ? island.querySelector<HTMLElement>(`a[href="#${active}"]`) : null;
    if (!link) {
      pill.style.opacity = "0";
      return;
    }
    pill.style.opacity = "1";
    pill.style.width = `${link.offsetWidth}px`;
    pill.style.transform = `translateX(${link.offsetLeft}px)`;
  }, [active]);

  // Menu: close on Escape, on outside click, and when a link is followed.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (mastRef.current && !mastRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <header ref={mastRef} className="mast" data-scrolled={scrolled ? "true" : "false"}>
      <div className="wrap mast-row">
        <a className="wordmark" href="#top" aria-label={t("backToTop")}>
          <BrandMark size={22} />
        </a>

        <nav ref={islandRef} className="island" aria-label={t("sections")}>
          <span ref={indicatorRef} className="pill-indicator" aria-hidden="true" />
          {LINKS.map((l) => (
            <a key={l.id} href={`#${l.id}`} aria-current={active === l.id ? "true" : undefined}>
              {t(l.label)}
            </a>
          ))}
        </nav>

        <div className="mast-side">
          <LanguageSwitch />
          <ThemeSwitch />
          <a className="btn btn--sm" href={`/${locale}/auth`}>
            {t("signIn")}
          </a>
          <button
            type="button"
            className="menu-btn"
            aria-expanded={open}
            aria-controls="lp-sheet"
            aria-label={open ? t("closeMenu") : t("openMenu")}
            onClick={() => setOpen((o) => !o)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>

      <nav id="lp-sheet" className="sheet" aria-label={t("menu")} hidden={!open} onClick={(e) => (e.target as Element).closest("a") && setOpen(false)}>
        {LINKS.map((l) => (
          <a key={l.id} href={`#${l.id}`}>
            {t(l.label)}
            <CoreIcon name="arrow-right" size={16} />
          </a>
        ))}
        <a href={`/${locale}/auth`}>
          {t("signIn")}
          <CoreIcon name="arrow-up-right" size={16} />
        </a>
        <div className="sheet-foot">
          <span>{t("theme")}</span>
          <ThemeSwitch />
        </div>
        <div className="sheet-foot">
          <span>{t("language")}</span>
          <LanguageSwitch />
        </div>
      </nav>
    </header>
  );
}
