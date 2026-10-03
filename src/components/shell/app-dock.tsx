"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { motion } from "motion/react";
import { LineIcon } from "@/components/line-icon";
import { ThemeSwitch } from "@/components/theme-switch";
import { DOCK_NAV, MORE_NAV, PRIMARY_NAV, isActive } from "./nav";
import { useDismiss } from "./use-dismiss";
import { signOut } from "./app-masthead";

const PILL_SPRING = { type: "spring" as const, stiffness: 420, damping: 36, mass: 0.8 };

/** Every section not in the dock goes in the "More" sheet. */
const SHEET_NAV = [...PRIMARY_NAV.filter((i) => !DOCK_NAV.includes(i)), ...MORE_NAV];

/** Phone navigation: a floating pill bar at the bottom, plus a "More" sheet. */
export function AppDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  const moreActive = SHEET_NAV.some((i) => isActive(pathname, i.href));

  return (
    <div ref={ref}>
      {open && <div className="sheet-backdrop" aria-hidden="true" />}
      {open && (
        <nav id="app-sheet" className="sheet" aria-label="More sections">
          {SHEET_NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? "page" : undefined} onClick={close}>
              <LineIcon name={item.icon} size={18} />
              {item.label}
            </Link>
          ))}
          <button type="button" className="item" onClick={signOut}>
            <LineIcon name="exit" size={18} />
            Sign out
          </button>
          <div className="sheet-foot">
            <span>Theme</span>
            <ThemeSwitch />
          </div>
        </nav>
      )}
      <nav className="dock" aria-label="Sections">
        {DOCK_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
              {active && <motion.span layoutId="dock-pill" className="dock-pill" transition={PILL_SPRING} />}
              <LineIcon name={item.icon} size={20} />
              {item.label}
            </Link>
          );
        })}
        <button type="button" aria-expanded={open} aria-controls="app-sheet" data-active={moreActive} onClick={() => setOpen((o) => !o)}>
          {moreActive && !open && <motion.span layoutId="dock-pill" className="dock-pill" transition={PILL_SPRING} />}
          <LineIcon name="dots" size={20} strokeWidth={2.4} />
          More
        </button>
      </nav>
    </div>
  );
}
