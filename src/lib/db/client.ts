/**
 * Postgres on Neon, reached over HTTP (one round trip per query, no pool to
 * manage). DATABASE_URL comes from the environment and is never logged.
 *
 * Without DATABASE_URL the stores fall back to process memory, which is fine
 * for local work and tests but forgets everything on restart: production
 * must set it, and a warning says so once.
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sql: NeonQueryFunction<false, false> | null | undefined;
let schemaReady: Promise<void> | null = null;
let warned = false;

export function db(): NeonQueryFunction<false, false> | null {
  if (sql !== undefined) return sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (!warned && process.env.NODE_ENV === "production") {
      console.warn("[db] DATABASE_URL is not set: AI quotas and account names live in memory and reset on restart.");
    }
    warned = true;
    sql = null;
    return sql;
  }
  sql = neon(url);
  return sql;
}

/** Create the tables once per process. Idempotent, safe on every boot. */
export function ensureSchema(): Promise<void> {
  const q = db();
  if (!q) return Promise.resolve();
  if (!schemaReady) {
    schemaReady = (async () => {
      await q`
        CREATE TABLE IF NOT EXISTS ai_quota (
          owner        text PRIMARY KEY,
          window_start timestamptz NOT NULL,
          used         integer NOT NULL
        )`;
      await q`
        CREATE TABLE IF NOT EXISTS account_labels (
          owner      text NOT NULL,
          account_id text NOT NULL,
          label      text NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (owner, account_id)
        )`;
      await q`
        CREATE TABLE IF NOT EXISTS account_seen (
          owner       text NOT NULL,
          account_id  text NOT NULL,
          okx_name    text,
          evm_address text,
          seen_at     timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (owner, account_id)
        )`;
    })().catch((error) => {
      schemaReady = null; // retry on the next call
      throw error;
    });
  }
  return schemaReady;
}

/** Test hook: forget the cached client (e.g. after changing DATABASE_URL). */
export function resetDbForTests(): void {
  sql = undefined;
  schemaReady = null;
}
