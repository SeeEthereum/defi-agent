/**
 * Assistant allowance: AI_DAILY_LIMIT questions per person in a rolling
 * 24-hour window that opens with the first question. The window's end is a
 * real timestamp, so the app can show an exact countdown.
 *
 * Counting is atomic in Postgres (one conditional upsert), so parallel
 * requests or several server instances cannot overspend. A question that
 * fails on our side is refunded; one refused as off-topic is not.
 */

import { db, ensureSchema } from "@/lib/db/client";

export const AI_DAILY_LIMIT = 20;
export const AI_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface QuotaState {
  limit: number;
  used: number;
  remaining: number;
  /** ISO time when the allowance refills; null while the window is unopened. */
  resetAt: string | null;
}

export interface ConsumeResult extends QuotaState {
  ok: boolean;
}

interface Row {
  windowStart: number;
  used: number;
}

function toState(row: Row | null, now: number): QuotaState {
  if (!row || row.windowStart + AI_WINDOW_MS <= now) {
    return { limit: AI_DAILY_LIMIT, used: 0, remaining: AI_DAILY_LIMIT, resetAt: null };
  }
  const used = Math.min(row.used, AI_DAILY_LIMIT);
  return {
    limit: AI_DAILY_LIMIT,
    used,
    remaining: AI_DAILY_LIMIT - used,
    resetAt: new Date(row.windowStart + AI_WINDOW_MS).toISOString(),
  };
}

// ── memory fallback (no DATABASE_URL) ────────────────────────────────────────

const memory = new Map<string, Row>();

/** Pure decision, shared by the memory store and the tests. */
export function decide(row: Row | null, now: number, limit = AI_DAILY_LIMIT): { ok: boolean; next: Row } {
  if (!row || row.windowStart + AI_WINDOW_MS <= now) return { ok: true, next: { windowStart: now, used: 1 } };
  if (row.used >= limit) return { ok: false, next: row };
  return { ok: true, next: { windowStart: row.windowStart, used: row.used + 1 } };
}

// ── public API ───────────────────────────────────────────────────────────────

export async function readQuota(owner: string, now = Date.now()): Promise<QuotaState> {
  const q = db();
  if (!q) return toState(memory.get(owner) ?? null, now);
  await ensureSchema();
  const rows = (await q`SELECT window_start, used FROM ai_quota WHERE owner = ${owner}`) as Array<{ window_start: string | Date; used: number }>;
  const r = rows[0];
  return toState(r ? { windowStart: new Date(r.window_start).getTime(), used: r.used } : null, now);
}

/** Spend one question if any are left. */
export async function consumeQuestion(owner: string, now = Date.now()): Promise<ConsumeResult> {
  const q = db();
  if (!q) {
    const { ok, next } = decide(memory.get(owner) ?? null, now);
    if (ok) memory.set(owner, next);
    return { ok, ...toState(memory.get(owner) ?? null, now) };
  }
  await ensureSchema();
  const windowSeconds = AI_WINDOW_MS / 1000;
  const rows = (await q`
    INSERT INTO ai_quota (owner, window_start, used)
    VALUES (${owner}, now(), 1)
    ON CONFLICT (owner) DO UPDATE SET
      window_start = CASE WHEN ai_quota.window_start <= now() - make_interval(secs => ${windowSeconds})
                          THEN now() ELSE ai_quota.window_start END,
      used         = CASE WHEN ai_quota.window_start <= now() - make_interval(secs => ${windowSeconds})
                          THEN 1 ELSE ai_quota.used + 1 END
    WHERE ai_quota.window_start <= now() - make_interval(secs => ${windowSeconds})
       OR ai_quota.used < ${AI_DAILY_LIMIT}
    RETURNING window_start, used`) as Array<{ window_start: string | Date; used: number }>;
  if (rows[0]) {
    return { ok: true, ...toState({ windowStart: new Date(rows[0].window_start).getTime(), used: rows[0].used }, now) };
  }
  return { ok: false, ...(await readQuota(owner, now)) };
}

/** Give back a question whose answer failed on our side. */
export async function refundQuestion(owner: string): Promise<void> {
  const q = db();
  if (!q) {
    const row = memory.get(owner);
    if (row && row.used > 0) memory.set(owner, { ...row, used: row.used - 1 });
    return;
  }
  await ensureSchema();
  await q`UPDATE ai_quota SET used = used - 1 WHERE owner = ${owner} AND used > 0`;
}

export function resetQuotaMemoryForTests(): void {
  memory.clear();
}
