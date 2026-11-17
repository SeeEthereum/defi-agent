/**
 * Health report for /api/health (Render's health check, uptime monitors).
 *
 * The app is useless without the onchainos binary, so a missing or broken
 * binary makes the instance unhealthy (503). A slow `--version` (a busy
 * free instance) and a database problem only show in `checks`: restarting
 * the instance would not fix either, and the memory stores keep working.
 *
 * Render probes every few seconds and wants an answer within five, so each
 * check is cached for a minute (one run shared by concurrent probes): the
 * binary gets three seconds, the database 2.5 (in parallel). The cache also
 * keeps the probes from waking Neon every few seconds. Nothing in the answer
 * is secret: no paths, hosts, error messages or environment values.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { ONCHAINOS_BIN } from "@/lib/okx/cli";
import { pingDb, type DbStatus } from "@/lib/db/ping";

export const ONCHAINOS_TIMEOUT_MS = 3000;
export const CHECK_CACHE_MS = 60_000;

/** ok: answered; missing: no executable file; broken: ran and failed; timeout: no answer in time. */
export type OnchainosStatus = "ok" | "missing" | "broken" | "timeout";

export interface OnchainosCheck {
  status: OnchainosStatus;
  /** First line of `onchainos --version`, e.g. "onchainos 4.6.11". */
  version: string | null;
}

export interface HealthReport {
  status: "ok" | "unavailable";
  version: string | null;
  uptimeSeconds: number;
  checks: { onchainos: OnchainosCheck; db: DbStatus };
}

/** Run `<bin> --version` with an empty environment: no secrets reach it, no keystore is touched. */
export function checkOnchainos(bin: string = ONCHAINOS_BIN, timeoutMs = ONCHAINOS_TIMEOUT_MS): Promise<OnchainosCheck> {
  try {
    // The path comes from ONCHAINOS_PATH or HOME at runtime; keep it out of output tracing.
    fs.accessSync(/*turbopackIgnore: true*/ bin, fs.constants.X_OK);
  } catch {
    return Promise.resolve({ status: "missing", version: null });
  }
  const home = os.tmpdir();
  return new Promise((resolve) => {
    execFile(
      bin,
      ["--version"],
      {
        timeout: timeoutMs,
        killSignal: "SIGKILL",
        maxBuffer: 64 * 1024,
        encoding: "utf8",
        env: {
          NODE_ENV: process.env.NODE_ENV,
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          HOME: home,
          ONCHAINOS_HOME: home,
          ONCHAINOS_NO_BROWSER: "1",
        },
      },
      (error, stdout) => {
        if (error) {
          const timedOut = (error as NodeJS.ErrnoException & { killed?: boolean }).killed === true;
          resolve({ status: timedOut ? "timeout" : "broken", version: null });
          return;
        }
        const line = stdout.split("\n")[0].trim();
        const version = /^[\w .+-]{1,64}$/.test(line) ? line : null;
        resolve({ status: "ok", version });
      }
    );
  });
}

type Cached<T> = { at: number; result: Promise<T> } | null;
let onchainosCache: Cached<OnchainosCheck> = null;
let dbCache: Cached<DbStatus> = null;

/** checkOnchainos, run at most once a minute. */
export function cachedOnchainosCheck(
  now = Date.now(),
  check: () => Promise<OnchainosCheck> = () => checkOnchainos()
): Promise<OnchainosCheck> {
  if (!onchainosCache || now - onchainosCache.at >= CHECK_CACHE_MS) {
    onchainosCache = { at: now, result: check() };
  }
  return onchainosCache.result;
}

/** pingDb, run at most once a minute. */
export function cachedDbPing(now = Date.now(), ping: () => Promise<DbStatus> = () => pingDb()): Promise<DbStatus> {
  if (!dbCache || now - dbCache.at >= CHECK_CACHE_MS) {
    dbCache = { at: now, result: ping() };
  }
  return dbCache.result;
}

export function resetHealthCacheForTests(): void {
  onchainosCache = null;
  dbCache = null;
}

/**
 * Commit being served: Render sets RENDER_GIT_COMMIT at runtime; the build
 * inlines the same value as NEXT_PUBLIC_SENTRY_RELEASE (next.config env).
 */
export function deployedVersion(
  sha: string | undefined = process.env.RENDER_GIT_COMMIT || process.env.NEXT_PUBLIC_SENTRY_RELEASE
): string | null {
  return sha && /^[0-9a-f]{7,40}$/i.test(sha) ? sha : null;
}

export async function healthReport(
  deps: { onchainos?: () => Promise<OnchainosCheck>; db?: () => Promise<DbStatus> } = {}
): Promise<HealthReport> {
  const [onchainos, dbStatus] = await Promise.all([
    (deps.onchainos ?? (() => cachedOnchainosCheck()))(),
    (deps.db ?? (() => cachedDbPing()))(),
  ]);
  const usable = onchainos.status === "ok" || onchainos.status === "timeout";
  return {
    status: usable ? "ok" : "unavailable",
    version: deployedVersion(),
    uptimeSeconds: Math.floor(process.uptime()),
    checks: { onchainos, db: dbStatus },
  };
}
