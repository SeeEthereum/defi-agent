"use client";

import { createContext, useContext } from "react";
import useSWR from "swr";

interface AuthState {
  authenticated: boolean;
  /**
   * False until the server has answered once. A failed check (503
   * "status_unknown") keeps the last answer instead of reading as signed
   * out, so a slow server never shows "Sign in first" to a signed-in user.
   */
  known: boolean;
  email: string | null;
  accountId: string | null;
  accountName: string | null;
  accountCount: number;
  walletAddress: string | null;
  /** "idle" when the server signed this browser out after 30 minutes without activity. */
  signedOutReason: "idle" | null;
  isLoading: boolean;
  mutate: () => void;
}

const AuthContext = createContext<AuthState>({
  authenticated: false,
  known: false,
  email: null,
  accountId: null,
  accountName: null,
  accountCount: 0,
  walletAddress: null,
  signedOutReason: null,
  isLoading: true,
  mutate: () => {},
});

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Throws on "could not check", so SWR keeps the last known answer and retries. */
async function statusFetcher(url: string) {
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.success === false) throw new Error(body?.error ?? "Could not check your sign-in.");
  return body;
}

export function useAuthState(): AuthState {
  const { data, isLoading, mutate } = useSWR("/api/auth/status", statusFetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
    errorRetryInterval: 5000,
  });

  const authenticated = data?.authenticated === true;

  const { data: addrData } = useSWR(
    authenticated ? "/api/wallet/addresses" : null,
    fetcher
  );

  return {
    authenticated,
    known: data !== undefined,
    email: data?.email ?? null,
    accountId: data?.accountId ?? null,
    accountName: data?.accountName ?? null,
    accountCount: data?.accountCount ?? 0,
    walletAddress: addrData?.data?.evm?.[0]?.address ?? null,
    signedOutReason: !authenticated && data?.signedOutReason === "idle" ? "idle" : null,
    isLoading,
    mutate,
  };
}

export { AuthContext };
export function useAuth() {
  return useContext(AuthContext);
}
