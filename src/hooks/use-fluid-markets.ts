"use client";

import useSWR from "swr";
import type { FluidMarket, FluidUserPosition } from "@/lib/fluid/resolver";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useFluidMarkets() {
  const { data, error, isLoading, mutate } = useSWR(
    "/api/earn/markets",
    fetcher,
    { refreshInterval: 120000 }
  );

  return {
    markets: (data?.data as FluidMarket[]) ?? [],
    error: data?.error ?? error?.message,
    isLoading,
    mutate,
  };
}

export function useFluidPositions(walletAddress: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    walletAddress
      ? `/api/earn/positions?address=${walletAddress.toLowerCase()}`
      : null,
    fetcher,
    { refreshInterval: 120000 }
  );

  return {
    positions: (data?.data as FluidUserPosition[]) ?? [],
    error: data?.error ?? error?.message,
    isLoading,
    mutate,
  };
}
