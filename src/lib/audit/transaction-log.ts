/**
 * Transaction log: one row per attempt to move funds.
 *
 * Every route that signs and broadcasts goes through guardDuplicates
 * (lib/api/duplicate-guard), which records each attempt here: when, which
 * route, who (a SHA-256 of the session id, never the id itself), which
 * request (the body hash the guard already computes), how it ended, the HTTP
 * status, the transaction hash if one came back, and how long it took.
 * Nothing else: no amounts, addresses, recipients, tokens or emails.
 *
 * Postgres when DATABASE_URL is set (table created on first use, like the
 * other stores), else the last MEMORY_LIMIT attempts in process memory.
 *
 * Best effort by design: `logTransactionAttempt` returns at once, never
 * throws, and a failed write goes to Sentry (lib/monitoring/report), never to
 * the user's request.
 */

import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import { reportServerError } from "@/lib/monitoring/report";

export type TxOutcome = "success" | "failed" | "outcome_unknown" | "declined";

export interface TxLogEntry {
  /** ISO time the attempt reached the server. */
  at: string;
  /** Guard scope, e.g. "swap/execute". */
  scope: string;
  /** SHA-256 (hex) of the session id. */
  sessionHash: string;
  /** SHA-256 (hex) of the canonical request body (duplicate-guard bodyHash). */
  bodyHash: string;
  outcome: TxOutcome;
  /** HTTP status the user got (500 when the handler threw). */
  status: number;
  /** Machine code of a non-success answer ("duplicate_recent", "risk_confirmation"…). */
  code: string | null;
  txHash: string | null;
  durationMs: number;
}

export interface TxAttempt {
  scope: string;
  /** Raw session id: hashed here, never stored. */
  sid: string;
  bodyHash: string;
  /** Date.now() when the attempt started. */
  startedAt: number;
  outcome: TxOutcome;
  status: number;
  txHash?: string | null;
  code?: string | null;
}

export const MEMORY_LIMIT = 1000;

/** EVM (0x + 64 hex), Solana (base58) and similar: letters and digits only. */
const TX_HASH = /^(0x)?[0-9A-Za-z]{16,128}$/;
const CODE = /^[a-z][a-z0-9_]{0,47}$/;
const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Hash of a session id for the log. Domain-separated, so the value cannot be
 * matched against a plain SHA-256 of the same id kept anywhere else.
 */
export function hashSessionId(sid: string): string {
  return createHash("sha256").update(`albicocca-txlog:${sid}`).digest("hex");
}

/**
 * What the attempt came to, from the answer the user got.
 * - success: 2xx with `success: true`.
 * - declined: refused or paused before anything was signed: a duplicate or a
 *   stale quote (409), the wallet asking the user to confirm (428), the rate
 *   limit (429).
 * - failed: any other answer.
 * Outcome unknown (the backend timed out mid-broadcast) is decided by the
 * guard, which is the only one to know.
 */
export function outcomeFor(status: number, success: boolean): Exclude<TxOutcome, "outcome_unknown"> {
  if (success && status >= 200 && status < 300) return "success";
  if (status === 409 || status === 428 || status === 429) return "declined";
  return "failed";
}

/** Build the stored row: hash the session, keep only well-formed values. */
export function toEntry(attempt: TxAttempt, now = Date.now()): TxLogEntry {
  const txHash = typeof attempt.txHash === "string" && TX_HASH.test(attempt.txHash) ? attempt.txHash : null;
  const code = typeof attempt.code === "string" && CODE.test(attempt.code) ? attempt.code : null;
  return {
    at: new Date(attempt.startedAt).toISOString(),
    scope: attempt.scope.slice(0, 64),
    sessionHash: hashSessionId(attempt.sid),
    bodyHash: HEX64.test(attempt.bodyHash) ? attempt.bodyHash : createHash("sha256").update(attempt.bodyHash).digest("hex"),
    outcome: attempt.outcome,
    status: Math.trunc(attempt.status),
    code,
    txHash,
    durationMs: Math.max(0, Math.round(now - attempt.startedAt)),
  };
}

// ── memory fallback (no DATABASE_URL) ────────────────────────────────────────

const memory: TxLogEntry[] = [];

function remember(entry: TxLogEntry): void {
  memory.push(entry);
  if (memory.length > MEMORY_LIMIT) memory.splice(0, memory.length - MEMORY_LIMIT);
}

/** Newest last. A copy: callers cannot edit the log. */
export function memoryTransactionLog(): TxLogEntry[] {
  return memory.map((e) => ({ ...e }));
}

export function resetTransactionLogForTests(): void {
  memory.length = 0;
  tableReady = null;
}

// ── Postgres ─────────────────────────────────────────────────────────────────

let tableReady: Promise<void> | null = null;

/** Create the table once per process (idempotent), like lib/db/client ensureSchema. */
function ensureTable(q: NonNullable<ReturnType<typeof db>>): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await q`
        CREATE TABLE IF NOT EXISTS transaction_log (
          id           bigserial PRIMARY KEY,
          at           timestamptz NOT NULL,
          scope        text NOT NULL,
          session_hash char(64) NOT NULL,
          body_hash    char(64) NOT NULL,
          outcome      text NOT NULL CHECK (outcome IN ('success', 'failed', 'outcome_unknown', 'declined')),
          http_status  smallint NOT NULL,
          code         text,
          tx_hash      text,
          duration_ms  integer NOT NULL
        )`;
      await q`CREATE INDEX IF NOT EXISTS transaction_log_at_idx ON transaction_log (at)`;
      await q`CREATE INDEX IF NOT EXISTS transaction_log_session_idx ON transaction_log (session_hash, at)`;
    })().catch((error) => {
      tableReady = null; // retry on the next attempt
      throw error;
    });
  }
  return tableReady;
}

/** Store one row. Throws on a database error; callers want logTransactionAttempt. */
export async function recordTransaction(entry: TxLogEntry): Promise<void> {
  const q = db();
  if (!q) {
    remember(entry);
    return;
  }
  await ensureTable(q);
  await q`
    INSERT INTO transaction_log
      (at, scope, session_hash, body_hash, outcome, http_status, code, tx_hash, duration_ms)
    VALUES
      (${entry.at}, ${entry.scope}, ${entry.sessionHash}, ${entry.bodyHash}, ${entry.outcome},
       ${entry.status}, ${entry.code}, ${entry.txHash}, ${entry.durationMs})`;
}

/**
 * Fire and forget: returns immediately, never throws, never rejects. A write
 * that fails is reported to Sentry and dropped.
 */
export function logTransactionAttempt(attempt: TxAttempt): void {
  try {
    void recordTransaction(toEntry(attempt)).catch(reportLogError);
  } catch (error) {
    reportLogError(error);
  }
}

function reportLogError(error: unknown): void {
  try {
    reportServerError("audit/transaction-log", error);
  } catch {
    // monitoring itself failed: nothing left to do
  }
}
