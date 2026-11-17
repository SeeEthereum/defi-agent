/**
 * One request, one transaction.
 *
 * Routes that sign and broadcast are wrapped with `guardDuplicates`. While a
 * request is running, the same request from the same session (same route,
 * same body) is refused instead of being signed a second time: a double tap,
 * a second tab, or a retry fired because the first answer was slow.
 *
 * After a success the same request stays refused for a short window
 * (`recentMs`), with the hash of the transaction that already went out.
 * When the outcome is unknown (the wallet backend timed out while it may
 * already have broadcast), the window is longer and the user is told to
 * check their activity before trying again.
 *
 * Any answer that is not a success clears the entry, so a rejected or failed
 * request can be retried right away. State is in process memory: this
 * deployment runs one instance.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { currentSession } from "@/lib/session/session";
import { markActive } from "@/lib/session/activity";
import { IN_FLIGHT_MESSAGE, recentMessage, UNKNOWN_OUTCOME_MESSAGE } from "./send-state";

/** Default time a successful request stays blocked as a repeat. */
export const RECENT_MS = 60_000;
/** Time a request with an unknown outcome stays blocked. */
export const UNKNOWN_OUTCOME_MS = 120_000;
/** A request running longer than this is assumed lost (its entry is dropped). */
const PENDING_MAX_MS = 5 * 60_000;
const MAX_ENTRIES = 5000;

/** Body fields that must not make two requests count as different. */
const IGNORED_FIELDS = new Set(["acknowledgeRisk"]);

type Entry =
  | { state: "pending"; since: number }
  | { state: "done"; at: number; until: number; txHash: string | null }
  | { state: "unknown"; at: number; until: number };

const entries = new Map<string, Entry>();

interface OutcomeContext {
  unknown: boolean;
}
const outcome = new AsyncLocalStorage<OutcomeContext>();

/**
 * Called by the CLI wrapper when a command that broadcasts timed out: the
 * transaction may or may not be on its way. No-op outside a guarded route.
 */
export function markOutcomeUnknown(): void {
  const ctx = outcome.getStore();
  if (ctx) ctx.unknown = true;
}

/** JSON with object keys sorted, so key order never changes the hash. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (IGNORED_FIELDS.has(key)) continue;
      out[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Hash of a request body, independent of key order and of ignored fields. */
export function bodyHash(text: string): string {
  let material = text;
  try {
    material = JSON.stringify(canonical(JSON.parse(text)));
  } catch {
    // not JSON: hash the raw text
  }
  return createHash("sha256").update(material).digest("hex");
}

function prune(now: number): void {
  for (const [key, entry] of entries) {
    const expired =
      entry.state === "pending" ? now - entry.since > PENDING_MAX_MS : now >= entry.until;
    if (expired) entries.delete(key);
  }
  while (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

function conflict(code: string, error: string, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ success: false, code, error, ...extra }, { status: 409 });
}

function secondsSince(at: number, now: number): number {
  return Math.max(1, Math.round((now - at) / 1000));
}

/** Read `{ success, data: { txHash } }` from a JSON response without consuming it. */
async function readResult(res: Response): Promise<{ success: boolean; txHash: string | null }> {
  if (res.status < 200 || res.status >= 300) return { success: false, txHash: null };
  try {
    const body = (await res.clone().json()) as {
      success?: unknown;
      data?: { txHash?: unknown; hash?: unknown };
    };
    if (body?.success !== true) return { success: false, txHash: null };
    const hash = body.data?.txHash ?? body.data?.hash;
    return { success: true, txHash: typeof hash === "string" ? hash : null };
  } catch {
    return { success: false, txHash: null };
  }
}

export interface GuardOptions {
  /** How long a successful request stays blocked as a repeat. 0 = only while running. */
  recentMs?: number;
}

/**
 * Wrap a route handler (inside `withSession`) so the same request from the
 * same session cannot run twice at once, nor again right after it succeeded.
 */
export function guardDuplicates<Ctx = unknown>(
  scope: string,
  handler: (request: NextRequest, context: Ctx) => Promise<Response> | Response,
  options: GuardOptions = {}
) {
  const recentMs = options.recentMs ?? RECENT_MS;

  return async (request: NextRequest, context: Ctx): Promise<Response> => {
    // Sending a transaction is activity, whatever the page's heartbeat did.
    markActive(currentSession());
    const text = await request.clone().text();
    const key = `${currentSession().sid}|${scope}|${bodyHash(text)}`;
    const now = Date.now();
    prune(now);

    const existing = entries.get(key);
    if (existing?.state === "pending") {
      return conflict("duplicate_in_flight", IN_FLIGHT_MESSAGE);
    }
    if (existing?.state === "unknown") {
      return conflict("outcome_unknown", UNKNOWN_OUTCOME_MESSAGE);
    }
    if (existing?.state === "done") {
      return conflict("duplicate_recent", recentMessage(secondsSince(existing.at, now)), {
        txHash: existing.txHash,
      });
    }

    entries.set(key, { state: "pending", since: now });
    const ctx: OutcomeContext = { unknown: false };
    let res: Response;
    try {
      res = await outcome.run(ctx, () => handler(request, context));
    } catch (error) {
      if (ctx.unknown) {
        const at = Date.now();
        entries.set(key, { state: "unknown", at, until: at + UNKNOWN_OUTCOME_MS });
      } else {
        entries.delete(key);
      }
      throw error;
    }

    const at = Date.now();
    const result = await readResult(res);
    if (result.success) {
      if (recentMs > 0) {
        entries.set(key, { state: "done", at, until: at + recentMs, txHash: result.txHash });
      } else {
        entries.delete(key);
      }
      return res;
    }
    if (ctx.unknown) {
      // The route's own error would read like a plain failure. Say instead
      // that the transaction may be on its way, with a code pages can match.
      entries.set(key, { state: "unknown", at, until: at + UNKNOWN_OUTCOME_MS });
      return NextResponse.json(
        { success: false, code: "outcome_unknown", error: UNKNOWN_OUTCOME_MESSAGE },
        { status: 504 }
      );
    }
    entries.delete(key);
    return res;
  };
}

/** Test helper: forget every entry. */
export function resetDuplicateGuard(): void {
  entries.clear();
}
