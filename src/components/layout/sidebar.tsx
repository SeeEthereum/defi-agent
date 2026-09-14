"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";

interface SidebarProps {
  onClose?: () => void;
}

const primaryItem = { href: "/ai", label: "AI Assistant", icon: "sparkles" };

const navItems = [
  { href: "/", label: "Dashboard", icon: "grid" },
  { href: "/wallet", label: "Wallet", icon: "wallet" },
  { href: "/earn", label: "Earn", icon: "trending-up" },
  { href: "/swap", label: "Swap", icon: "repeat" },
  { href: "/bridge", label: "Bridge", icon: "bridge" },
  { href: "/trade", label: "Trade", icon: "trade" },
  { href: "/security", label: "Security", icon: "shield" },
  { href: "/signals", label: "Intelligence", icon: "signal" },
];

const icons: Record<string, React.ReactNode> = {
  grid: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  wallet: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  ),
  "trending-up": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  ),
  repeat: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  bridge: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 16V4m0 0L3 8m4-4l4 4" />
      <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  ),
  shield: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  signal: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h.01" />
      <path d="M7 20v-4" />
      <path d="M12 20v-8" />
      <path d="M17 20V8" />
      <path d="M22 4v16" />
    </svg>
  ),
  // Hyperliquid official symbol
  trade: (
    <svg width="18" height="18" viewBox="0 0 144 144" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M144 71.6991C144 119.306 114.866 134.582 99.5156 120.98C86.8804 109.889 83.1211 86.4521 64.116 84.0456C39.9942 81.0113 37.9057 113.133 22.0334 113.133C3.5504 113.133 0 86.2428 0 72.4315C0 58.3063 3.96809 39.0542 19.736 39.0542C38.1146 39.0542 39.1588 66.5722 62.132 65.1073C85.0007 63.5379 85.4184 34.8689 100.247 22.6271C113.195 12.0593 144 23.4641 144 71.6991Z" fill="currentColor" />
    </svg>
  ),
  sparkles: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  ),
  x: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
};

export function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-[260px] flex-col border-r border-border/60 bg-sidebar">
      <div className="flex h-16 items-center gap-3 px-6">
        <div className="flex-1 min-w-0">
          <BrandMark size={22} />
          <p className="text-[10px] text-muted-foreground leading-none mt-0.5">by 0xSalvo</p>
        </div>
        {/* Close button — mobile only */}
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
          >
            {icons["x"]}
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 pt-4 space-y-0.5">
        {/* AI Assistant — primary entry point */}
        <Link
          href={primaryItem.href}
          onClick={onClose}
          className={cn(
            "relative flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold transition-all duration-200 mb-3 overflow-hidden",
            pathname === primaryItem.href
              ? "bg-gradient-to-r from-violet-600 to-pink-500 text-white shadow-[0_4px_14px_rgba(138,92,255,0.35)]"
              : "ai-shimmer-bg animate-ai-glow text-violet-700 border border-violet-400/30 hover:border-violet-400/50"
          )}
        >
          {pathname !== primaryItem.href && (
            <span className="pointer-events-none absolute inset-x-0 top-0 h-px animate-ai-scan bg-gradient-to-r from-transparent via-pink-400/80 to-transparent" />
          )}
          <span className={cn(
            "relative flex h-7 w-7 items-center justify-center rounded-lg shrink-0 overflow-visible",
            pathname === primaryItem.href ? "bg-white/20" : "bg-violet-500/15"
          )}>
            {pathname !== primaryItem.href && (
              <>
                <span className="pointer-events-none absolute top-1/2 left-1/2 h-1.5 w-1.5 rounded-full bg-violet-500 shadow-[0_0_5px_2px_rgba(138,92,255,0.7)] animate-ai-orbit-sm-1" />
                <span className="pointer-events-none absolute top-1/2 left-1/2 h-1 w-1 rounded-full bg-pink-500 shadow-[0_0_5px_2px_rgba(255,45,117,0.6)] animate-ai-orbit-sm-2" />
              </>
            )}
            <span className={cn(pathname !== primaryItem.href && "animate-ai-pulse-icon")}>
              {icons[primaryItem.icon]}
            </span>
          </span>
          <span className={cn("flex-1", pathname !== primaryItem.href && "ai-gradient-text")}>
            {primaryItem.label}
          </span>
          {pathname !== primaryItem.href && (
            <span className="text-[10px] font-bold tracking-wide uppercase bg-violet-500/15 text-violet-600 px-1.5 py-0.5 rounded-md animate-pulse">
              Start
            </span>
          )}
        </Link>

        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 px-3 pb-2">
          Manual
        </p>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200",
              pathname === item.href
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {icons[item.icon]}
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="p-4 mx-3 mb-3 rounded-xl bg-accent/50">
        <p className="text-[11px] font-medium text-foreground/80">Secured by</p>
        <p className="text-[11px] text-muted-foreground">OKX TEE Wallet</p>
      </div>
    </aside>
  );
}
