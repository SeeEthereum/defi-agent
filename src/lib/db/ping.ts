/**
 * Is Postgres reachable? For /api/health only.
 *
 * "absent" without DATABASE_URL (the stores then run in memory, which is a
 * supported mode, not a failure), "ok" when `SELECT 1` answers in time,
 * "error" otherwise. Never throws, never says why: the reason may hold the
 * host name, and the health answer is public.
 */

import { db } from "./client";

export type DbStatus = "ok" | "absent" | "error";

export async function pingDb(timeoutMs = 2500, query = db): Promise<DbStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const q = query();
    if (!q) return "absent";
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("db ping timed out")), timeoutMs);
    });
    const ping = q.query("SELECT 1", [], { fetchOptions: { signal: AbortSignal.timeout(timeoutMs) } });
    await Promise.race([ping, timeout]);
    return "ok";
  } catch {
    return "error";
  } finally {
    if (timer) clearTimeout(timer);
  }
}
