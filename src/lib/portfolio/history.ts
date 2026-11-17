/**
 * The wallet's total value over time, for the dashboard chart.
 *
 * OKX has no history of a wallet's value: its balance endpoints answer with
 * today's figure only (checked against the v4.6.11 CLI and the Onchain OS
 * docs). So albicocca keeps its own: every time the server reads the
 * signed-in user's balances, the total of the six supported chains is
 * stored for the current hour (the last reading of an hour wins). The
 * chart therefore starts the day someone first signs in, and has gaps
 * while they are away: the server has no session to read balances with
 * then, and inventing the missing points would be worse than showing gaps.
 *
 * What is stored: a hash of the OKX account id (never the id itself), the
 * hour, the total in USD and the split by chain. No addresses, tokens or
 * emails. Rows older than KEEP_DAYS are deleted.
 *
 * Postgres when DATABASE_URL is set (table made on first use), else process
 * memory, like the other stores. Writes are best effort: `recordValue` never
 * throws and never slows the balances request it rides on.
 */

import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import { reportServerError } from "@/lib/monitoring/report";

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
/** One stored point per account per hour. */
export const BUCKET_MS = HOUR_MS;
/** Within an hour, a new reading is written at most this often. */
export const WRITE_EVERY_MS = 10 * 60 * 1000;
export const KEEP_DAYS = 400;
/** A total above this is a broken price, not a wallet: not stored. */
const MAX_PLAUSIBLE_USD = 1e11;

export type HistoryRange = "1d" | "1w" | "1m" | "all";

/** How far back each range looks, and how far apart its points are. */
export const RANGES: Record<HistoryRange, { spanMs: number; stepMs: number }> = {
  "1d": { spanMs: DAY_MS, stepMs: HOUR_MS },
  "1w": { spanMs: 7 * DAY_MS, stepMs: HOUR_MS },
  "1m": { spanMs: 30 * DAY_MS, stepMs: 6 * HOUR_MS },
  all: { spanMs: KEEP_DAYS * DAY_MS, stepMs: DAY_MS },
};

export function isHistoryRange(value: unknown): value is HistoryRange {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(RANGES, value);
}

export interface ValuePoint {
  /** Start of the hour, ms since epoch. */
  t: number;
  usd: number;
}

export interface History {
  points: ValuePoint[];
  /** The first hour ever stored for this account (any range), or null. */
  since: number | null;
}

/**
 * The stored key for an OKX account. Domain-separated SHA-256: the table
 * holds no account id, and its keys match no other table's.
 */
export function historyKey(accountId: string): string {
  return createHash("sha256").update(`albicocca-value-history:${accountId}`).digest("hex").slice(0, 40);
}

export function bucketOf(time: number): number {
  return Math.floor(time / BUCKET_MS) * BUCKET_MS;
}

/**
 * The last point of each step-wide block, oldest first. `shiftMs` moves the
 * block edges to the viewer's midnight (their UTC offset), so "one point a
 * day" means one per day as they live it, not per UTC day.
 */
export function downsample(points: ValuePoint[], stepMs: number, shiftMs = 0): ValuePoint[] {
  const byBlock = new Map<number, ValuePoint>();
  for (const p of points) {
    const block = Math.floor((p.t + shiftMs) / stepMs);
    const kept = byBlock.get(block);
    if (!kept || p.t > kept.t) byBlock.set(block, p);
  }
  return [...byBlock.values()].sort((a, b) => a.t - b.t);
}

function plausible(usd: number): boolean {
  return Number.isFinite(usd) && usd >= 0 && usd < MAX_PLAUSIBLE_USD;
}

// ── memory fallback (no DATABASE_URL) ────────────────────────────────────────

interface Stored {
  usd: number;
  byChain: Record<string, number>;
}

const MAX_MEMORY_ACCOUNTS = 2000;
const memory = new Map<string, Map<number, Stored>>();

function rememberValue(key: string, bucket: number, value: Stored, now: number): void {
  let rows = memory.get(key);
  if (!rows) {
    if (memory.size >= MAX_MEMORY_ACCOUNTS) memory.delete(memory.keys().next().value!);
    rows = new Map();
    memory.set(key, rows);
  }
  rows.set(bucket, value);
  const oldest = now - KEEP_DAYS * DAY_MS;
  for (const t of rows.keys()) if (t < oldest) rows.delete(t);
}

function memoryHistory(key: string, from: number): History {
  const rows = memory.get(key);
  if (!rows || rows.size === 0) return { points: [], since: null };
  const all = [...rows.entries()].map(([t, v]) => ({ t, usd: v.usd }));
  return {
    points: all.filter((p) => p.t >= from).sort((a, b) => a.t - b.t),
    since: Math.min(...all.map((p) => p.t)),
  };
}

// ── Postgres ─────────────────────────────────────────────────────────────────

let tableReady: Promise<void> | null = null;
let lastPruneAt = 0;
const PRUNE_EVERY_MS = 12 * HOUR_MS;

function ensureTable(q: NonNullable<ReturnType<typeof db>>): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await q`
        CREATE TABLE IF NOT EXISTS value_history (
          account    char(40) NOT NULL,
          bucket     timestamptz NOT NULL,
          usd        double precision NOT NULL,
          by_chain   jsonb NOT NULL DEFAULT '{}'::jsonb,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (account, bucket)
        )`;
    })().catch((error) => {
      tableReady = null; // retry on the next call
      throw error;
    });
  }
  return tableReady;
}

// ── writing ──────────────────────────────────────────────────────────────────

/** Per account: when it was last written, and for which hour. */
const lastWrite = new Map<string, { at: number; bucket: number }>();

/** Store one reading. Throws on a database error; callers want recordValue. */
export async function storeValue(accountId: string, usd: number, byChain: Record<string, number>, now = Date.now()): Promise<boolean> {
  if (!accountId || !plausible(usd)) return false;
  const key = historyKey(accountId);
  const bucket = bucketOf(now);
  const previous = lastWrite.get(key);
  if (previous && previous.bucket === bucket && now - previous.at < WRITE_EVERY_MS) return false;
  lastWrite.set(key, { at: now, bucket });
  if (lastWrite.size > MAX_MEMORY_ACCOUNTS * 2) lastWrite.delete(lastWrite.keys().next().value!);

  const chains: Record<string, number> = {};
  for (const [chain, value] of Object.entries(byChain)) if (plausible(value)) chains[chain] = value;

  const q = db();
  if (!q) {
    rememberValue(key, bucket, { usd, byChain: chains }, now);
    return true;
  }
  try {
    await ensureTable(q);
    await q`
      INSERT INTO value_history (account, bucket, usd, by_chain, updated_at)
      VALUES (${key}, ${new Date(bucket).toISOString()}, ${usd}, ${JSON.stringify(chains)}::jsonb, now())
      ON CONFLICT (account, bucket) DO UPDATE
        SET usd = EXCLUDED.usd, by_chain = EXCLUDED.by_chain, updated_at = now()`;
  } catch (error) {
    // Not written: let the next reading try again instead of waiting out the throttle.
    if (lastWrite.get(key)?.at === now) lastWrite.delete(key);
    throw error;
  }
  if (now - lastPruneAt > PRUNE_EVERY_MS) {
    lastPruneAt = now;
    await q`DELETE FROM value_history WHERE bucket < ${new Date(now - KEEP_DAYS * DAY_MS).toISOString()}`;
  }
  return true;
}

/** Fire and forget: returns at once, never throws. A failed write goes to Sentry. */
export function recordValue(accountId: string, usd: number, byChain: Record<string, number>): void {
  try {
    void storeValue(accountId, usd, byChain).catch(report);
  } catch (error) {
    report(error);
  }
}

function report(error: unknown): void {
  try {
    reportServerError("portfolio/history", error);
  } catch {
    // monitoring itself failed: nothing left to do
  }
}

// ── reading ──────────────────────────────────────────────────────────────────

/** The widest real UTC offsets are -12:00 and +14:00. */
export const MAX_UTC_OFFSET_MINUTES = 14 * 60;

/**
 * Stored points for a range. `utcOffsetMinutes` is the viewer's offset east
 * of UTC (Rome in winter: 60); wider steps start at their local midnight.
 */
export async function readHistory(accountId: string, range: HistoryRange, now = Date.now(), utcOffsetMinutes = 0): Promise<History> {
  const key = historyKey(accountId);
  const { spanMs, stepMs } = RANGES[range];
  const from = bucketOf(now - spanMs);
  const offset = Number.isInteger(utcOffsetMinutes) && Math.abs(utcOffsetMinutes) <= MAX_UTC_OFFSET_MINUTES ? utcOffsetMinutes : 0;
  // Hourly steps need no shift: a stored hour is one point either way.
  const shiftMs = stepMs > BUCKET_MS ? offset * 60_000 : 0;

  const q = db();
  if (!q) {
    const { points, since } = memoryHistory(key, from);
    return { points: downsample(points, stepMs, shiftMs), since };
  }
  await ensureTable(q);
  // Already one row per hour; for wider steps, the last row of each block.
  // The block is computed once in the subquery: written twice, the step
  // would be two parameters, and Postgres refuses a DISTINCT ON that does
  // not match its ORDER BY.
  const [rows, first] = await Promise.all([
    q`
      SELECT DISTINCT ON (block) t, usd
      FROM (
        SELECT floor((extract(epoch FROM bucket) * 1000 + ${shiftMs}) / ${stepMs}) AS block,
               extract(epoch FROM bucket) * 1000 AS t, usd, bucket
        FROM value_history
        WHERE account = ${key} AND bucket >= ${new Date(from).toISOString()}
      ) AS readings
      ORDER BY block, bucket DESC`,
    q`SELECT extract(epoch FROM min(bucket)) * 1000 AS since FROM value_history WHERE account = ${key}`,
  ]);
  const points = (rows as Array<{ t: string | number; usd: string | number }>)
    .map((r) => ({ t: Math.round(Number(r.t)), usd: Number(r.usd) }))
    .filter((p) => Number.isFinite(p.t) && plausible(p.usd))
    .sort((a, b) => a.t - b.t);
  const sinceRaw = (first as Array<{ since: string | number | null }>)[0]?.since;
  const since = sinceRaw == null ? null : Math.round(Number(sinceRaw));
  return { points, since: Number.isFinite(since) ? since : null };
}

export function resetHistoryForTests(): void {
  memory.clear();
  lastWrite.clear();
  tableReady = null;
  lastPruneAt = 0;
}
