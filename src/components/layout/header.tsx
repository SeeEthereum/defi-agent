"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function Header() {
  const { authenticated, accountName, email } = useAuth();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/auth";
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-border/60 bg-background/80 backdrop-blur-xl px-6">
      <div />
      <div className="flex items-center gap-3">
        {authenticated ? (
          <>
            <div className="flex items-center gap-2 rounded-full bg-accent/60 pl-3 pr-1 py-1">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-foreground/80">
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
          </>
        ) : (
          <Link href="/auth">
            <Button
              size="sm"
              className="rounded-full px-5 h-8 text-xs font-medium shadow-sm"
            >
              Connect Wallet
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
