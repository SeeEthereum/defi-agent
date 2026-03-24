"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { authenticated, accountName, email } = useAuth();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/auth";
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-border/60 bg-background/80 backdrop-blur-xl px-4 md:px-6">
      {/* Hamburger button — mobile only */}
      <button
        className="flex md:hidden items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:bg-accent transition-colors"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <div className="hidden md:block" />

      <div className="flex items-center gap-3">
        {authenticated ? (
          <div className="flex items-center gap-2 rounded-full bg-accent/60 pl-3 pr-1 py-1">
            <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-xs font-medium text-foreground/80 truncate max-w-[80px] sm:max-w-none">
              {accountName || "Wallet"}
            </span>
            {email && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {email}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="h-7 rounded-full text-xs hover:bg-background/60"
            >
              Logout
            </Button>
          </div>
        ) : (
          <Link href="/auth">
            <Button size="sm" className="rounded-full px-5 h-8 text-xs font-medium shadow-sm">
              Connect Wallet
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
