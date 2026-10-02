/**
 * In-memory bookkeeping for confidential swaps, scoped to the session.
 *
 * - A quote id can start at most one deposit. The shared quote store lets an
 *   id be retried until it expires; here that would risk a second transfer
 *   if the first one's response was lost. Only a failure that provably sent
 *   nothing (a Gas Station prompt) releases the id.
 * - Status lookups are limited to deposit addresses this session created,
 *   so one browser cannot poll another browser's swap.
 *
 * Nothing here is persisted: a restart forgets both, which only means a
 * pending swap must be followed on the NEAR Intents explorer instead.
 */

import { currentSession } from "@/lib/session/session";

const STARTED_TTL_MS = 10 * 60_000;
const DEPOSIT_TTL_MS = 3 * 24 * 60 * 60_000;
const MAX_ENTRIES = 5000;

const started = new Map<string, number>();
const deposits = new Map<string, { sid: string; at: number }>();

function prune<V>(map: Map<string, V>, ttl: number, at: (v: V) => number): void {
  const now = Date.now();
  for (const [key, value] of map) if (now - at(value) > ttl) map.delete(key);
  while (map.size >= MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

/** Claim a quote for execution. False if it already started a deposit. */
export function claimQuote(quoteId: string): boolean {
  prune(started, STARTED_TTL_MS, (t) => t);
  const key = `${currentSession().sid}:${quoteId}`;
  if (started.has(key)) return false;
  started.set(key, Date.now());
  return true;
}

/** Release a claim when the attempt provably sent nothing. */
export function releaseQuote(quoteId: string): void {
  started.delete(`${currentSession().sid}:${quoteId}`);
}

export function registerDeposit(depositAddress: string): void {
  prune(deposits, DEPOSIT_TTL_MS, (d) => d.at);
  deposits.set(depositAddress.toLowerCase(), { sid: currentSession().sid, at: Date.now() });
}

export function ownsDeposit(depositAddress: string): boolean {
  return deposits.get(depositAddress.toLowerCase())?.sid === currentSession().sid;
}
