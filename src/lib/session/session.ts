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
    return storage.run(session, () => handler(request, context));
  };
}
