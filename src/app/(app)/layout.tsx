"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { AuthContext, useAuthState } from "@/hooks/use-auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const authState = useAuthState();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem("defi-agent-disclaimer-accepted");
    if (!accepted) {
      router.replace("/welcome");
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <AuthContext value={authState}>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-5xl px-6 py-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AuthContext>
  );
}
