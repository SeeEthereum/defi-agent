/**
 * Server-side binding between a quote and its execution.
 *
 * A quote route hands out an opaque id together with a fingerprint of the
 * parameters it was computed for. The matching execute route refuses to
 * sign anything unless the caller presents that id, the fingerprint of the
 * request it is executing is identical, and the quote is still fresh. That
 * closes the gap where the UI showed one quote and the server silently
 * re-quoted something else at signing time.
 *
 * Ids are scoped to the session that created them, so one browser cannot
 * execute against another browser's quote.
 */

import { createHash, randomUUID } from "node:crypto";
import { currentSession } from "@/lib/session/session";

/** How long a quote may be executed after it was issued. */
export const QUOTE_TTL_MS = 60_000;

const MAX_ENTRIES = 2000;

interface QuoteEntry {
  sid: string;
  fingerprint: string;
  /** Quoted output in base units, when the aggregator reported one. */
  expectedOut: string | null;
  issuedAt: number;
}

const quotes = new Map<string, QuoteEntry>();

/** Stable hash of the parameters a quote was computed for. */
export function quoteFingerprint(parts: Array<string | number | boolean | undefined>): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function prune(now: number): void {
  for (const [id, entry] of quotes) {
    if (now - entry.issuedAt > QUOTE_TTL_MS) quotes.delete(id);
  }
  while (quotes.size >= MAX_ENTRIES) {
    const oldest = quotes.keys().next().value;
    if (oldest === undefined) break;
    quotes.delete(oldest);
  }
}

/** Issue an id for a freshly computed quote. */
export function issueQuote(fingerprint: string, expectedOut: string | null): string {
  const now = Date.now();
  prune(now);
  const id = randomUUID();
  quotes.set(id, { sid: currentSession().sid, fingerprint, expectedOut, issuedAt: now });
  return id;
}

export type QuoteCheck =
  | { ok: true; expectedOut: string | null }
  | { ok: false; error: string };

/**
 * Verify that this session may execute `id` for exactly these parameters.
 * The entry stays usable until it expires, so a retry after a transient
 * failure does not force the user to re-quote.
 */
export function checkQuote(id: string | undefined, fingerprint: string): QuoteCheck {
  if (!id) return { ok: false, error: "Missing quote. Refresh the quote and try again." };
  const entry = quotes.get(id);
  if (!entry || entry.sid !== currentSession().sid) {
    return { ok: false, error: "Unknown quote. Refresh the quote and try again." };
  }
  if (Date.now() - entry.issuedAt > QUOTE_TTL_MS) {
    quotes.delete(id);
    return { ok: false, error: "Quote expired. Refresh the quote and try again." };
  }
  if (entry.fingerprint !== fingerprint) {
    return { ok: false, error: "Quote does not match this request. Refresh the quote." };
  }
  return { ok: true, expectedOut: entry.expectedOut };
}

/**
 * True when the amount about to be signed is materially worse than what was
 * quoted — more than `tolerancePercent` below the quoted output.
 */
export function outputDegraded(
  expectedOut: string | null,
  actualOut: string | null | undefined,
  tolerancePercent: number
): boolean {
  if (!expectedOut || !actualOut) return false;
  try {
    const expected = BigInt(expectedOut);
    const actual = BigInt(actualOut);
    if (expected <= 0n) return false;
    const bps = BigInt(Math.round(tolerancePercent * 100));
    const floor = (expected * (10_000n - bps)) / 10_000n;
    return actual < floor;
  } catch {
    return false;
  }
}
