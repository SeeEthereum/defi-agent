import type { LineIconName } from "@/components/line-icon";
import type { Messages } from "@/i18n/messages/en";

export interface NavItem {
  /** App path without a language: the Link adds it. */
  href: string;
  /** Key in the "nav" messages. */
  label: keyof Messages["nav"];
  icon: LineIconName;
}

/** Sections in the island, in order. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/ai", label: "assistant", icon: "sparkle" },
  { href: "/", label: "dashboard", icon: "grid" },
  { href: "/wallet", label: "wallet", icon: "wallet" },
  { href: "/swap", label: "swap", icon: "swap" },
  { href: "/bridge", label: "bridge", icon: "bridge" },
  { href: "/earn", label: "earn", icon: "trending-up" },
  { href: "/trade", label: "trade", icon: "long" },
];

/** Sections behind "More". */
export const MORE_NAV: NavItem[] = [
  { href: "/signals", label: "signals", icon: "signal" },
  { href: "/security", label: "security", icon: "shield-check" },
];

/** The four sections that get their own slot in the phone dock. */
export const DOCK_NAV: NavItem[] = [PRIMARY_NAV[0], PRIMARY_NAV[1], PRIMARY_NAV[3], PRIMARY_NAV[5]];

/** `pathname` without its language (i18n/navigation usePathname). */
export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
