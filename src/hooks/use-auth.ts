"use client";

import { createContext, useContext } from "react";
import useSWR from "swr";

interface AuthState {
  authenticated: boolean;
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

export function useAuthState(): AuthState {
  const { data, isLoading, mutate } = useSWR("/api/auth/status", fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  });

  const authenticated = data?.authenticated ?? false;

  const { data: addrData } = useSWR(
    authenticated ? "/api/wallet/addresses" : null,
    fetcher
  );

  return {
    authenticated,
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
