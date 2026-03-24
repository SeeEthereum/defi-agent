"use client";

import useSWR from "swr";
import { CHAINS } from "@/lib/chains";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useBalances(chain?: string) {
  const url = chain
    ? `/api/wallet/balances?chain=${chain}`
    : "/api/wallet/balances";

  const { data, error, isLoading, mutate } = useSWR(url, fetcher, {
    refreshInterval: 60000,
  });

  return {
    balances: data?.data ?? null,
    error: data?.error ?? error?.message,
    isLoading,
    mutate,
  };
}

export interface ChainBalance {
  tokens: Array<{
    symbol: string;
    balance: string;
    tokenAddress?: string;
    tokenPrice?: string;
    isNative?: boolean;
  }>;
  totalValueUsd: string;
  isLoading: boolean;
  error?: string;
}

const chainFetcher = async (url: string): Promise<{ success: boolean; data?: unknown; error?: string }> => {
  const res = await fetch(url);
  return res.json();
};

export function useAllChainBalances() {
  const chains = Object.values(CHAINS);

  const results = chains.map((chain) => {
    const url = `/api/wallet/balances?chain=${chain.chainIndex}`;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useSWR(url, chainFetcher, { refreshInterval: 60000 });
  });

  const balancesByChain: Record<number, ChainBalance> = {};

  chains.forEach((chain, i) => {
    const { data, error, isLoading } = results[i];
    const rawData = data?.data as Record<string, unknown> | undefined;

    // Parse token list from the balance response
    const tokens: ChainBalance["tokens"] = [];
    let totalUsd = 0;

    if (rawData) {
      // Real CLI structure: { details: [{tokenAssets: [...]}, ...], totalValueUsd: "..." }
      // Fallbacks for any legacy shapes
      let tokenList: Record<string, unknown>[] = [];

      if (Array.isArray(rawData)) {
        tokenList = rawData as Record<string, unknown>[];
      } else if (Array.isArray((rawData as Record<string, unknown>).details)) {
        // Flatten tokenAssets from all detail entries
        const details = (rawData as Record<string, unknown>).details as Array<{ tokenAssets?: Record<string, unknown>[] }>;
        tokenList = details.flatMap((d) => d.tokenAssets ?? []);
      } else if (Array.isArray((rawData as Record<string, unknown>).tokens)) {
        tokenList = (rawData as Record<string, unknown>).tokens as Record<string, unknown>[];
      }

      for (const t of tokenList) {
        const symbol = (t.tokenSymbol ?? t.symbol ?? "???") as string;
        const balance = (t.balance ?? t.holdingAmount ?? "0") as string;
        const tokenAddress = (t.tokenContractAddress ?? t.tokenAddress ?? "") as string;
        const tokenPrice = (t.tokenPrice ?? t.price ?? "0") as string;
        const isNative = tokenAddress === "" || tokenAddress === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

        const usdValue = parseFloat(balance) * parseFloat(tokenPrice || "0");
        if (!isNaN(usdValue)) totalUsd += usdValue;

        if (parseFloat(balance) > 0) {
          tokens.push({ symbol, balance, tokenAddress, tokenPrice, isNative });
        }
      }

      // If the response has a totalValueUsd field, prefer it
      if ((rawData as Record<string, unknown>).totalValueUsd) {
        totalUsd = parseFloat((rawData as Record<string, unknown>).totalValueUsd as string);
      }
    }

    balancesByChain[chain.chainIndex] = {
      tokens,
      totalValueUsd: totalUsd.toFixed(2),
      isLoading,
      error: data?.error ?? error?.message,
    };
  });

  const isLoading = results.some((r) => r.isLoading);
  const mutateAll = () => results.forEach((r) => r.mutate());

  return { balancesByChain, isLoading, mutateAll };
}
