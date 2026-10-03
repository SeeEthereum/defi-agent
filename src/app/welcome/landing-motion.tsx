"use client";

/**
 * Scroll and pointer motion for the landing, with Motion.
 *
 * Every block is visible in the server HTML. A [data-reveal] block is hidden
 * only here, only if it starts below the fold, and only when the user has
 * not asked to reduce motion; it then springs in when it reaches the screen.
 * A safety net shows anything still hidden once it is on screen, so a missed
 * observer callback can never leave a gap in the page.
 *
 * No hand-written scroll listeners: entrances use inView (an
 * IntersectionObserver), scroll-linked effects use Motion's scroll().
 */

import { useEffect } from "react";
import { animate, inView, scroll } from "motion";

const SPRING = { type: "spring" as const, stiffness: 120, damping: 22, mass: 0.9 };

export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".lp");
    if (!root) return;
    const cleanups: Array<() => void> = [];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ── The marquee pauses while off screen ─────────────────────────────
    root.querySelectorAll<HTMLElement>("[data-loop]").forEach((scope) => {
      cleanups.push(
        inView(scope, () => {
          scope.dataset.loop = "on";
          return () => {
            scope.dataset.loop = "off";
          };
        }, { margin: "20% 0px" })
      );
    });

    // ── Spotlight border under the pointer ───────────────────────────────
    const onPointer = (e: PointerEvent) => {
      const card = (e.target as Element).closest<HTMLElement>("[data-spot]");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    if (window.matchMedia("(hover: hover)").matches) {
      root.addEventListener("pointermove", onPointer, { passive: true });
      cleanups.push(() => root.removeEventListener("pointermove", onPointer));
    }

    if (reduce) return () => cleanups.forEach((fn) => fn());

    // ── Blocks that start below the fold spring in on arrival ────────────
    const fold = window.innerHeight;
    const pending = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]")).filter(
      (el) => el.getBoundingClientRect().top > fold * 0.92
    );
    for (const el of pending) {
      animate(el, { opacity: 0, y: 28 }, { duration: 0 });
      const delay = Number(el.dataset.reveal) || 0;
      cleanups.push(
        inView(
          el,
          () => {
            animate(el, { opacity: 1, y: 0 }, { ...SPRING, delay });
          },
          { amount: 0.15 }
        )
      );
    }
    // Safety net: anything on screen but still hidden is shown.
    const net = window.setInterval(() => {
      for (const el of pending) {
        if (getComputedStyle(el).opacity !== "0") continue;
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) animate(el, { opacity: 1, y: 0 }, { duration: 0.4 });
      }
    }, 1500);
    cleanups.push(() => window.clearInterval(net));
    const showAll = () => pending.forEach((el) => animate(el, { opacity: 1, y: 0 }, { duration: 0 }));
    window.addEventListener("beforeprint", showAll);
    cleanups.push(() => window.removeEventListener("beforeprint", showAll));

    // ── The steps line fills while you read ─────────────────────────────
    const steps = root.querySelector<HTMLElement>(".steps");
    const fill = root.querySelector<HTMLElement>(".steps-fill");
    if (steps && fill) {
      cleanups.push(
        scroll(animate(fill, { scaleY: [0, 1] }, { ease: "linear" }), {
          target: steps,
          offset: ["start 70%", "end 55%"],
        })
      );
    }

    // ── Depth while scrolling: computer only ────────────────────────────
    if (window.matchMedia("(min-width: 1081px) and (hover: hover)").matches) {
      const hero = root.querySelector<HTMLElement>(".hero");
      const art = root.querySelector<HTMLElement>(".hero-art img");
      if (hero && art) {
        cleanups.push(
          scroll(animate(art, { y: [-24, 60], scale: [1.1, 1.1] }, { ease: "linear" }), {
            target: hero,
            offset: ["start start", "end start"],
          })
        );
      }
      const vaultArt = root.querySelector<HTMLElement>(".vault-art img");
      const vault = root.querySelector<HTMLElement>(".vault");
      if (vault && vaultArt) {
        cleanups.push(
          scroll(animate(vaultArt, { y: [-30, 30], scale: [1.08, 1.08] }, { ease: "linear" }), {
            target: vault,
            offset: ["start end", "end start"],
          })
        );
      }
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
