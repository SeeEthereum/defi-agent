"use client";

/**
 * albicocca landing — the public entry to the app.
 *
 * Every "Sign in" call to action goes to /auth, which shows the risk
 * disclaimer and then the OKX sign-in. The (app) layout redirects here when
 * the disclaimer has not been accepted yet.
 *
 * Markup and styles come from the approved vocina-family design canvas; this
 * component only wires its behaviour. The logic mirrors the canvas script
 * value for value (reveal threshold, parallax factors, carousel scaling).
 * One deliberate difference: the canvas was a standalone page and never
 * removed its document-level listeners, which in a single-page app would keep
 * intercepting clicks and keys after you leave. Everything is torn down here.
 */

import { useEffect } from "react";
import "./albicocca.css";
import { LANDING_HTML } from "./landing-markup";

export default function WelcomePage() {
  useEffect(() => {
    const timers: number[] = [];
    const cleanups: Array<() => void> = [];
    const on = <K extends keyof WindowEventMap>(
      target: Window | Document | Element,
      type: K | string,
      fn: EventListener,
      opts?: AddEventListenerOptions
    ) => {
      target.addEventListener(type, fn, opts);
      cleanups.push(() => target.removeEventListener(type, fn, opts));
    };

    // In-page anchors (#what, #how, #custody) scroll smoothly on this page
    // only; the setting is restored when you navigate away.
    const root = document.documentElement;
    const prevScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "smooth";

    const qsa = <T extends Element = HTMLElement>(sel: string) =>
      Array.from(document.querySelectorAll<T & Element>(sel)) as T[];

    // ── Reveal on scroll ─────────────────────────────────────────────────
    // getBoundingClientRect rather than IntersectionObserver, as in the source.
    let pending = qsa<HTMLElement>("[data-reveal]");
    let ticking = false;
    let onScroll = () => {};

    // Sections with continuous animations pause while off screen.
    const animScopes = qsa<HTMLElement>("[data-anim]");
    let io: IntersectionObserver | null = null;
    if (animScopes.length && "IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => e.target.classList.toggle("anim-off", !e.isIntersecting));
        },
        { rootMargin: "25% 0px" }
      );
      animScopes.forEach((el) => io!.observe(el));
    }

    const reveal = (el: HTMLElement) => {
      el.classList.add("in");
      const d = parseFloat(getComputedStyle(el).getPropertyValue("--d")) || 0;
      timers.push(window.setTimeout(() => el.classList.add("done"), 1150 + d * 1000));
    };

    const check = () => {
      ticking = false;
      const vh = window.innerHeight || document.documentElement.clientHeight || 800;
      const limit = vh * 0.92;
      const hit: HTMLElement[] = [];
      pending = pending.filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < limit && r.bottom > 0) {
          hit.push(el);
          return false;
        }
        return true;
      });
      onScroll();
      hit.forEach(reveal);
    };
    const requestCheck = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(check);
      }
    };
    on(window, "scroll", requestCheck as EventListener, { passive: true });

    // ── Tile carousel (≤900px) ───────────────────────────────────────────
    const hero = document.querySelector<HTMLElement>("[data-hero]");
    const spreads = qsa<HTMLElement>("[data-spread]");
    const tilesEl = document.querySelector<HTMLElement>(".albi .tiles");
    const dots = [".dot-a", ".dot-b", ".dot-c"].map((s) => document.querySelector<HTMLElement>(s));
    const isCarousel = () => window.innerWidth <= 900;

    let tileTick = false;
    const syncTiles = () => {
      tileTick = false;
      if (!tilesEl || !isCarousel()) return;
      const c = tilesEl.getBoundingClientRect();
      const mid = c.left + c.width / 2;
      let best = 0;
      let bestD = Infinity;
      spreads.forEach((el, n) => {
        const r = el.getBoundingClientRect();
        const dist = Math.abs(r.left + r.width / 2 - mid);
        const d = Math.min(1, dist / Math.max(1, r.width));
        el.style.transform = `scale(${(1 - d * 0.08).toFixed(3)})`;
        el.style.opacity = (1 - d * 0.4).toFixed(3);
        if (dist < bestD) {
          bestD = dist;
          best = n;
        }
      });
      dots.forEach((d, n) => {
        if (d) d.style.background = n === best ? "#1d1d1f" : "rgba(0,0,0,0.2)";
      });
    };
    const requestTiles = () => {
      if (!tileTick) {
        tileTick = true;
        window.requestAnimationFrame(syncTiles);
      }
    };
    const centerTile = (n: number) => {
      if (!tilesEl || !spreads[n]) return;
      const r = spreads[n].getBoundingClientRect();
      const c = tilesEl.getBoundingClientRect();
      tilesEl.scrollLeft += r.left + r.width / 2 - (c.left + c.width / 2);
    };
    if (tilesEl) {
      on(tilesEl, "scroll", requestTiles as EventListener, { passive: true });
      if (isCarousel()) {
        centerTile(1);
        syncTiles();
      }
      timers.push(window.setTimeout(syncTiles, 400));
    }

    // ── Nav: scrolled state, dark section, mobile menu ───────────────────
    const navEl = document.querySelector<HTMLElement>("[data-nav]");
    const darkSec = document.querySelector<HTMLElement>("[data-dark]");
    const menuBtn = document.querySelector<HTMLElement>("[data-menu-btn]");
    const menuEl = document.querySelector<HTMLElement>("[data-menu]");
    const setMenu = (open: boolean) => {
      if (!navEl || !menuBtn) return;
      navEl.classList.toggle("menu-open", open);
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      menuBtn.setAttribute("aria-label", open ? "Close the menu" : "Open the menu");
    };
    if (menuBtn && menuEl && navEl) {
      on(menuBtn, "click", (() => setMenu(!navEl.classList.contains("menu-open"))) as EventListener);
      on(menuEl, "click", ((e: Event) => {
        if ((e.target as Element).closest("a")) setMenu(false);
      }) as EventListener);
      on(document, "keydown", ((e: KeyboardEvent) => {
        if (e.key === "Escape") setMenu(false);
      }) as EventListener);
      on(document, "click", ((e: Event) => {
        if (navEl.classList.contains("menu-open") && !navEl.contains(e.target as Node)) setMenu(false);
      }) as EventListener);
    }

    let lastY = 0;
    onScroll = () => {
      const y = Math.max(0, window.scrollY || window.pageYOffset || 0);
      const carousel = isCarousel();
      let overDark = false;
      if (navEl && darkSec) {
        const dr = darkSec.getBoundingClientRect();
        overDark = dr.top <= 56 && dr.bottom >= 56;
      }
      if (!carousel) {
        const k = Math.min(1, y / 500);
        spreads.forEach((el) => {
          const dir = parseFloat(el.getAttribute("data-spread") || "0") || 0;
          el.style.transform = `translate(${(dir * k * 90).toFixed(1)}px, ${(Math.abs(dir) * k * -30).toFixed(1)}px) rotate(${(dir * k * 4).toFixed(2)}deg)`;
        });
      }
      if (navEl) {
        navEl.classList.toggle("nav-scrolled", y > 8);
        if (darkSec) navEl.classList.toggle("nav-dark", overDark);
        if (navEl.classList.contains("menu-open") && Math.abs(y - lastY) > 80) setMenu(false);
      }
      lastY = y;
      if (!hero) return;
      if (carousel) {
        // On phones the hero slides under the tiles and fades, never overlapping.
        const pm = Math.min(1, y / 420);
        hero.style.transform = `translateY(${(y * 0.18).toFixed(1)}px) scale(${(1 - pm * 0.04).toFixed(3)})`;
        hero.style.opacity = String(1 - pm * 0.9);
        return;
      }
      const p = Math.min(1, y / 640);
      hero.style.transform = `translateY(${(y * 0.32).toFixed(1)}px) scale(${(1 - p * 0.06).toFixed(3)})`;
      hero.style.opacity = String(1 - p * 0.85);
    };

    const onResize = () => {
      if (isCarousel()) requestTiles();
      else spreads.forEach((el) => (el.style.opacity = ""));
      requestCheck();
    };
    on(window, "resize", onResize as EventListener);

    check();
    timers.push(window.setTimeout(check, 300));
    timers.push(window.setTimeout(check, 1200));

    return () => {
      cleanups.forEach((fn) => fn());
      timers.forEach((t) => window.clearTimeout(t));
      io?.disconnect();
      root.style.scrollBehavior = prevScrollBehavior;
    };
  }, []);

  return <div className="albi" dangerouslySetInnerHTML={{ __html: LANDING_HTML }} />;
}
