/**
 * Per-browser wallet isolation.
 *
 * Each session id owns a private onchainos home directory
 * (`<ONCHAINOS_SESSIONS_DIR>/<sid>`), passed to the binary as ONCHAINOS_HOME
 * with the file keyring forced on, so one browser's OKX login, keystore and
 * signing key are never visible to another.
 *
 * Route handlers are wrapped with `withSession`, which verifies the signed
 * cookie (minted by src/proxy.ts) and runs the handler inside an
 * AsyncLocalStorage context. Everything downstream (runCli, the Hyperliquid
 * signer, the login poll) reads the current session from that context, so
 * no function signatures had to change and a call outside a session fails
 * closed instead of falling back to a shared wallet.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SID_PATTERN, verifySessionToken } from "./token";

export interface UserSession {
  sid: string;
  /** Private ONCHAINOS_HOME for this session. */
  home: string;
}

export class NoSessionError extends Error {
  constructor() {
    super("No active session");
    this.name = "NoSessionError";
  }
}

const storage = new AsyncLocalStorage<UserSession>();

export function sessionsRoot(): string {
  return process.env.ONCHAINOS_SESSIONS_DIR ?? path.join(process.cwd(), ".data", "sessions");
}

export function sessionHome(sid: string): string {
  if (!SID_PATTERN.test(sid)) throw new NoSessionError();
  return path.join(sessionsRoot(), sid);
}

/** The session of the request being handled. Throws outside `withSession`. */
export function currentSession(): UserSession {
  const session = storage.getStore();
  if (!session) throw new NoSessionError();
  return session;
}

/** Whether this session has ever started a login (its home exists). */
export function sessionHomeExists(session: UserSession = currentSession()): boolean {
  return fs.existsSync(session.home);
}

export function ensureSessionHome(session: UserSession = currentSession()): void {
  fs.mkdirSync(session.home, { recursive: true, mode: 0o700 });
}

/** Delete the session's keystore directory (logout). */
export function destroySessionHome(session: UserSession = currentSession()): void {
  fs.rmSync(session.home, { recursive: true, force: true });
}

const KEYSTORE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const ABANDONED_LOGIN_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

let lastSweepAt = 0;

/**
 * Newest mtime of a session directory and the files sitting directly in it.
 * Nested paths are ignored; a permission error on one entry is skipped.
 */
function newestDirectMtimeMs(dir: string): number {
  const dirStat = fs.statSync(dir);
  let newest = dirStat.mtimeMs;
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return newest;
  }
  for (const name of names) {
    try {
      const st = fs.statSync(path.join(dir, name));
      if (st.mtimeMs > newest) newest = st.mtimeMs;
    } catch {
      // unreadable entry — keep sweeping the rest
    }
  }
  return newest;
}

/**
 * Delete abandoned per-session keystore directories.
 *
 * A directory whose name matches the session-id pattern is removed when the
 * newest mtime of the directory and the files directly inside it is older
 * than 30 days (if it holds a keystore: `wallets.json` or `session.json`) or
 * 2 hours (if it holds neither).
 * All filesystem work is try/caught so a permission error cannot take down
 * a request.
 */
export function sweepAbandonedSessions(): void {
  try {
    const root = sessionsRoot();
    if (!fs.existsSync(root)) return;

    const names = fs.readdirSync(root);
    const now = Date.now();
    let deleted = 0;

    for (const name of names) {
      if (!SID_PATTERN.test(name)) continue;
      const dir = path.join(root, name);
      try {
        if (!fs.statSync(dir).isDirectory()) continue;
        // Either file means a real signed-in wallet lives here; a directory
        // with neither is a login someone started and walked away from.
        const hasKeystore =
          fs.existsSync(path.join(dir, "wallets.json")) ||
          fs.existsSync(path.join(dir, "session.json"));
        const cutoff = hasKeystore ? KEYSTORE_MAX_AGE_MS : ABANDONED_LOGIN_MAX_AGE_MS;
        if (now - newestDirectMtimeMs(dir) <= cutoff) continue;
        fs.rmSync(dir, { recursive: true, force: true });
        deleted += 1;
      } catch {
        // permission / race on this directory — skip it
      }
    }

    if (deleted > 0) {
      console.info(
        `[session] swept ${deleted} abandoned session director${deleted === 1 ? "y" : "ies"}`
      );
    }
  } catch {
    // root missing or unreadable — never throw out of a sweep
  }
}

function scheduleAbandonedSessionSweep(): void {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  void Promise.resolve()
    .then(() => {
      sweepAbandonedSessions();
    })
    .catch(() => {
      // a sweep failure must never affect the response
    });
}

const PASSTHROUGH_ENV = /^(PATH|LANG|LC_[A-Z]+|TZ|TMPDIR|SSL_CERT_(FILE|DIR)|NODE_EXTRA_CA_CERTS|HTTPS?_PROXY|NO_PROXY|https?_proxy|no_proxy|OKX_.+|ONCHAINOS_(PATH|BASE_URL|WS_URL))$/;

/**
 * Environment for an onchainos child process in the current session.
 * Only allowlisted variables are passed through, so LLM keys and
 * SESSION_SECRET never reach the binary.
 */
export function onchainosEnv(session: UserSession = currentSession()): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && PASSTHROUGH_ENV.test(key)) env[key] = value;
  }
  env.PATH = `${process.env.HOME}/.local/bin:${process.env.PATH}`;
  env.HOME = session.home;
  env.ONCHAINOS_HOME = session.home;
  env.ONCHAINOS_FORCE_FILE_KEYRING = "1";
  env.ONCHAINOS_NO_BROWSER = "1";
  return env;
}

export function runWithSession<T>(session: UserSession, fn: () => T): T {
  return storage.run(session, fn);
}

/** Read and verify the session cookie of a request. */
export async function sessionFromRequest(request: NextRequest): Promise<UserSession | null> {
  const sid = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  return sid ? { sid, home: sessionHome(sid) } : null;
}

/**
 * Wrap a route handler so it only runs with a verified session, and every
 * onchainos call inside it uses that session's keystore.
 */
export function withSession<Ctx = unknown>(
  handler: (request: NextRequest, context: Ctx) => Promise<Response> | Response
) {
  return async (request: NextRequest, context: Ctx): Promise<Response> => {
    const session = await sessionFromRequest(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session expired. Reload the page.", code: "no_session" },
        { status: 401 }
      );
    }
    scheduleAbandonedSessionSweep();
    return storage.run(session, () => handler(request, context));
  };
}
