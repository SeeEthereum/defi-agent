/**
 * The signed-in user's balances, one onchainos call for all chains.
 *
 * The pages ask for balances chain by chain (six requests per load, again
 * every minute). Each used to run `wallet balance --chain X`: six processes
 * in a row on the session's lock, about ten seconds of queue, enough with a
 * second tab to hit the per-session cap ("Too many wallet requests"). One
 * `wallet balance` returns every chain at once, each token tagged with its
 * chainIndex, so the per-chain answers are cut from it. Concurrent requests
 * share one call, and the answer is reused for a few seconds.
 *
 * Any request that moves funds drops the cached answer when it succeeds
 * (lib/api/duplicate-guard), so a page refreshing after a send sees it.
 */

import { invalidate, memoTTL } from "@/lib/cache";
import { walletBalance } from "@/lib/okx/cli";

const TTL_MS = 10_000;

interface TokenAsset {
  chainIndex?: string;
  usdValue?: string;
  [key: string]: unknown;
}

interface AllBalances {
  details?: Array<{ tokenAssets?: TokenAsset[] }>;
  totalValueUsd?: string;
  [key: string]: unknown;
}

function key(sid: string): string {
  return `wallet-balance-all|${sid}`;
}

/** Every chain's balances for this session, shared for a few seconds. */
export async function allBalances(sid: string): Promise<AllBalances> {
  return memoTTL(key(sid), TTL_MS, async () => (await walletBalance()).data as AllBalances);
}

/** One chain's slice, in the shape `wallet balance --chain X` printed. */
export function chainSlice(all: AllBalances, chainIndex: string): { details: Array<{ tokenAssets: TokenAsset[] }>; totalValueUsd: string } {
  const assets = (all.details ?? []).flatMap((d) => d.tokenAssets ?? []).filter((a) => String(a.chainIndex) === chainIndex);
  const total = assets.reduce((sum, a) => sum + (Number(a.usdValue) || 0), 0);
  // Not rounded: a total of crumbs must read "< $0.01", not "$0.00".
  return { details: [{ tokenAssets: assets }], totalValueUsd: String(total) };
}

/** Forget this session's balances (after a transaction). */
export function invalidateBalances(sid: string): void {
  invalidate(key(sid));
}
