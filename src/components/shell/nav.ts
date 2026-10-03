import type { LineIconName } from "@/components/line-icon";

export interface NavItem {
  href: string;
  label: string;
  icon: LineIconName;
}

/** Sections in the island, in order. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/ai", label: "Assistant", icon: "sparkle" },
  { href: "/", label: "Dashboard", icon: "grid" },
  { href: "/wallet", label: "Wallet", icon: "wallet" },
  { href: "/swap", label: "Swap", icon: "swap" },
  { href: "/bridge", label: "Bridge", icon: "bridge" },
  { href: "/earn", label: "Earn", icon: "trending-up" },
  { href: "/trade", label: "Trade", icon: "long" },
];

/** Sections behind "More". */
export const MORE_NAV: NavItem[] = [
  { href: "/signals", label: "Intelligence", icon: "signal" },
  { href: "/security", label: "Security", icon: "shield-check" },
];

/** The four sections that get their own slot in the phone dock. */
export const DOCK_NAV: NavItem[] = [PRIMARY_NAV[0], PRIMARY_NAV[1], PRIMARY_NAV[3], PRIMARY_NAV[5]];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
