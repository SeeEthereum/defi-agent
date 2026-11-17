/**
 * Signed calls to OKX's REST API (web3.okx.com) with the app's own API key.
 *
 * Public market data (prices, charts, token search, signals, leaderboards,
 * security scans, gas) used to come from the onchainos CLI. That had two
 * problems:
 *
 * - The CLI only runs for a signed-in session, so a visitor who had not
 *   signed in got "Not logged in" on every market page.
 * - From CLI v4.6.x the binary no longer accepts an API key at all: a
 *   signed-in user's calls go out under their own login, everyone else is
 *   anonymous, and OKX blocks anonymous market calls unless they are paid.
 *
 * Calling the API directly fixes both, spawns no process, and lets one
 * cached answer serve every visitor (./market-data).
 *
 * Cost. OKX's market API is free up to a monthly quota per API key
 * (100,000 "basic" and 100,000 "premium" calls, reset on the 1st), then
 * it asks for a payment per call (x402, USDG on X Layer). This client never
 * pays: it has no wallet and never sends a payment signature. To make the
 * free quota last the whole month, each tier gets a daily share of it; when
 * the share is used up, or OKX starts asking for payment (HTTP 402), the
 * tier pauses and callers get MarketDataPausedError (./market-data then
 * serves the last good answer). Which paths are metered, and in which tier,
 * comes from OKX itself (/api/v6/dex/market/config, which is free).
 *
 * Token names and symbols are attacker-chosen text that ends up in the
 * assistant's context: like the CLI (cli/src/token_metadata.rs), DEX
 * responses get them cut to 80 characters.
 */

import { createHmac } from "node:crypto";
import { reportServerError } from "@/lib/monitoring/report";

const BASE_URL = "https://web3.okx.com";
const TIMEOUT_MS = 10_000;
const USER_AGENT = "albicocca-server/1.0";

export type Tier = "basic" | "premium";

/**
 * Free calls per API key and month. OKX's market-api-fee page (read
 * 2026-11-17) says 100,000 for both tiers; the CLI's own notice text still
 * says 1,000,000 basic. The lower figure is used.
 */
export const MONTHLY_FREE: Record<Tier, number> = { basic: 100_000, premium: 100_000 };

/** OKX answered with an error, or did not answer properly. */
export class OkxApiError extends Error {
  constructor(
    readonly path: string,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "OkxApiError";
  }
}

/** The tier's free share is used up for now: nothing was requested. */
export class MarketDataPausedError extends Error {
  constructor(readonly tier: Tier) {
    super("Market data is temporarily unavailable. Please try again later.");
    this.name = "MarketDataPausedError";
  }
}

// ── signing ──────────────────────────────────────────────────────────────────

function credentials() {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  if (!apiKey || !secretKey || !passphrase) {
    throw new OkxApiError("", "not_configured", "Market data is not configured on this server.");
  }
  return { apiKey, secretKey, passphrase, projectId: process.env.OKX_PROJECT_ID };
}

/** OKX v5/v6 signature: base64(HMAC-SHA256(timestamp + METHOD + path?query + body)). */
export function signature(secret: string, timestamp: string, method: string, requestPath: string, body: string): string {
  return createHmac("sha256", secret).update(timestamp + method + requestPath + body).digest("base64");
}

function headers(method: string, requestPath: string, body: string): Record<string, string> {
  const { apiKey, secretKey, passphrase, projectId } = credentials();
  const timestamp = new Date().toISOString();
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": signature(secretKey, timestamp, method, requestPath, body),
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
  };
  if (projectId) h["OK-ACCESS-PROJECT"] = projectId;
  return h;
}

// ── token metadata ───────────────────────────────────────────────────────────

const MAX_METADATA_CHARS = 80;

function cut(text: string): string {
  const chars = Array.from(text);
  return chars.length <= MAX_METADATA_CHARS ? text : chars.slice(0, MAX_METADATA_CHARS).join("") + "...";
}

/**
 * Cut token names and symbols to 80 characters, in place, everywhere in a
 * response. A bare `name` counts only next to a `symbol` (elsewhere `name`
 * is a chain, a DEX or EIP-712 data). Same rule as the CLI's.
 */
export function truncateTokenMetadata(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) truncateTokenMetadata(item);
    return;
  }
  if (!value || typeof value !== "object") return;
  const fields = value as Record<string, unknown>;
  const pair = "name" in fields && "symbol" in fields;
  for (const [key, field] of Object.entries(fields)) {
    if (typeof field === "string" && (key === "symbol" || key === "tokenName" || key === "tokenSymbol" || (key === "name" && pair))) {
      fields[key] = cut(field);
    } else {
      truncateTokenMetadata(field);
    }
  }
}

// ── tiers and the daily share ────────────────────────────────────────────────

const CONFIG_PATH = "/api/v6/dex/market/config";
const CONFIG_TTL_MS = 6 * 60 * 60_000;

/**
 * The tiers OKX reported for the paths we call (2026-11-17). Used until the
 * live config has been read, and if reading it fails.
 */
const KNOWN_TIERS: Record<string, Tier> = {
  "/api/v6/dex/market/price": "basic",
  "/api/v6/dex/market/candles": "basic",
  "/api/v6/dex/market/token/search": "basic",
  "/api/v6/dex/market/token/hot-token": "basic",
  "/api/v6/dex/market/signal/list": "premium",
  "/api/v6/dex/market/leaderboard/list": "premium",
  "/api/v6/dex/market/portfolio/overview": "premium",
  "/api/v6/dex/market/portfolio/recent-pnl": "premium",
};

let tierMap: { map: Record<string, Tier>; at: number } | null = null;
let tierMapLoading: Promise<void> | null = null;

function loadTierMap(now: number): Promise<void> {
  tierMapLoading ??= (async () => {
    try {
      const data = await send<unknown>("GET", CONFIG_PATH, "", "");
      const item = Array.isArray(data) ? data[0] : data;
      const list = (item as { endpointList?: unknown } | undefined)?.endpointList;
      if (list && typeof list === "object") {
        const map: Record<string, Tier> = {};
        for (const [path, tier] of Object.entries(list as Record<string, unknown>)) {
          if (tier === "basic" || tier === "premium") map[path] = tier;
        }
        tierMap = { map, at: now };
      }
    } catch (error) {
      console.warn("[okx/openapi] could not read the market tier config, using the known tiers", error);
      tierMap = { map: tierMap?.map ?? KNOWN_TIERS, at: now };
    } finally {
      tierMapLoading = null;
    }
  })();
  return tierMapLoading;
}

/** The metered tier of a path, or null when OKX does not meter it. */
export async function tierOf(path: string, now = Date.now()): Promise<Tier | null> {
  if (!tierMap || now - tierMap.at > CONFIG_TTL_MS) await loadTierMap(now);
  return (tierMap?.map ?? KNOWN_TIERS)[path] ?? null;
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function daysInMonth(now: number): number {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Calls a tier may make today: its monthly free quota spread evenly, with 10% kept back. */
export function dailyShare(tier: Tier, now = Date.now()): number {
  return Math.floor((MONTHLY_FREE[tier] * 0.9) / daysInMonth(now));
}

const used: Record<Tier, { day: string; count: number }> = {
  basic: { day: "", count: 0 },
  premium: { day: "", count: 0 },
};
const pausedUntil: Record<Tier, number> = { basic: 0, premium: 0 };
/** After OKX asks for payment, try again this much later. */
const PAYMENT_PAUSE_MS = 60 * 60_000;

function takeShare(tier: Tier, now: number): boolean {
  if (now < pausedUntil[tier]) return false;
  const day = utcDay(now);
  const u = used[tier];
  if (u.day !== day) {
    u.day = day;
    u.count = 0;
  }
  if (u.count >= dailyShare(tier, now)) return false;
  u.count += 1;
  return true;
}

function pause(tier: Tier, now: number, reason: string): void {
  const first = now >= pausedUntil[tier];
  pausedUntil[tier] = now + PAYMENT_PAUSE_MS;
  if (first) reportServerError("okx/openapi", new Error(`OKX market ${tier} tier paused: ${reason}`));
}

/** Calls made today per tier, and whether a tier is paused. For diagnostics and tests. */
export function meterState(now = Date.now()) {
  const day = utcDay(now);
  return {
    basic: { used: used.basic.day === day ? used.basic.count : 0, share: dailyShare("basic", now), paused: now < pausedUntil.basic },
    premium: { used: used.premium.day === day ? used.premium.count : 0, share: dailyShare("premium", now), paused: now < pausedUntil.premium },
  };
}

/** Test hook. */
export function resetOpenApiState(): void {
  tierMap = null;
  tierMapLoading = null;
  for (const tier of ["basic", "premium"] as const) {
    used[tier] = { day: "", count: 0 };
    pausedUntil[tier] = 0;
  }
}

// ── requests ─────────────────────────────────────────────────────────────────

let chargingNoticeAt = 0;

/** OKX reports in `ok-web3-openapi-pay` whether a tier is past its free quota. */
function noticeCharging(header: string | null, now: number): void {
  if (!header || !/(Basic|Premium)=1/.test(header)) return;
  if (now - chargingNoticeAt < 60 * 60_000) return;
  chargingNoticeAt = now;
  console.warn(`[okx/openapi] OKX reports a charging market tier: ${header}`);
}

async function send<T>(method: "GET" | "POST", path: string, query: string, body: string): Promise<T> {
  const requestPath = path + query;
  let res: Response;
  try {
    res = await fetch(BASE_URL + requestPath, {
      method,
      headers: headers(method, requestPath, body),
      body: method === "POST" ? body : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof OkxApiError) throw error;
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new OkxApiError(path, timedOut ? "timeout" : "network", "OKX did not answer. Please try again.");
  }

  noticeCharging(res.headers.get("ok-web3-openapi-pay"), Date.now());

  if (res.status === 402) throw new OkxApiError(path, "payment_required", "OKX asks for a payment for this data.");
  if (res.status === 429) throw new OkxApiError(path, "rate_limited", "OKX is busy. Try again in a few seconds.");

  const text = await res.text();
  let json: { code?: unknown; msg?: unknown; data?: unknown };
  try {
    json = JSON.parse(text);
  } catch {
    throw new OkxApiError(path, `http_${res.status}`, "OKX sent an unreadable answer. Please try again.");
  }
  const code = String(json.code ?? "");
  if (!res.ok || code !== "0") {
    const msg = typeof json.msg === "string" && json.msg ? json.msg : `HTTP ${res.status}`;
    throw new OkxApiError(path, code || `http_${res.status}`, `OKX: ${msg}`);
  }
  if (path.startsWith("/api/v6/dex/")) truncateTokenMetadata(json.data);
  return json.data as T;
}

async function request<T>(method: "GET" | "POST", path: string, query: string, body: string): Promise<T> {
  const tier = await tierOf(path);
  const now = Date.now();
  if (tier && !takeShare(tier, now)) throw new MarketDataPausedError(tier);
  try {
    return await send<T>(method, path, query, body);
  } catch (error) {
    if (tier && error instanceof OkxApiError && error.code === "payment_required") {
      pause(tier, Date.now(), "OKX asked for a payment (free quota used up)");
      throw new MarketDataPausedError(tier);
    }
    throw error;
  }
}

/** GET a path with query parameters (empty values are left out). Returns OKX's `data`. */
export function okxGet<T = unknown>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const entries = Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined && e[1] !== "");
  const query = entries.length ? "?" + new URLSearchParams(entries).toString() : "";
  return request<T>("GET", path, query, "");
}

/** POST a JSON body to a path. Returns OKX's `data`. */
export function okxPost<T = unknown>(path: string, body: unknown): Promise<T> {
  return request<T>("POST", path, "", JSON.stringify(body));
}
