/**
 * When a signed-in session was last used by a person.
 *
 * The server holds each signed-in session's credential, which can ask OKX's
 * enclave to sign. Keeping it for someone who walked away only adds risk,
 * so sessions idle for IDLE_TIMEOUT_MS are signed out (./idle-sweeper).
 *
 * "Used" means the person did something: the page sends a heartbeat on
 * clicks, keys and scrolling (at most every few minutes), and starting a
 * login or a transaction counts too. Background polling does not, or an
 * open tab would keep the credential alive forever.
 *
 * The time lives in a marker file in the session's own directory, so it
 * survives a server restart together with the credential it protects.
 * This module only touches files: the sweeper does the signing out.
 */

import fs from "node:fs";
import path from "node:path";
import type { UserSession } from "./session";

const MARKER = ".albicocca-active";
/** Write the marker at most this often per session. */
const TOUCH_EVERY_MS = 30_000;

function minutes(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Idle time before sign-out: IDLE_SIGNOUT_MINUTES, else 30 minutes in
 * production. 0 turns it off; it is off by default in development, so a
 * local session is not wiped while the app is being worked on.
 */
export function idleTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const configured = minutes(env.IDLE_SIGNOUT_MINUTES);
  if (configured !== null) return configured * 60_000;
  return env.NODE_ENV === "production" ? 30 * 60_000 : 0;
}

const lastTouch = new Map<string, number>();
const signedOutIdle = new Map<string, number>();
const SIGNED_OUT_MEMORY_MS = 24 * 60 * 60_000;

/** Record that the person behind `session` is here. No-op when not signed in. */
export function markActive(session: UserSession, now = Date.now()): void {
  if (now - (lastTouch.get(session.sid) ?? 0) < TOUCH_EVERY_MS) return;
  if (!fs.existsSync(session.home)) return;
  try {
    fs.writeFileSync(path.join(session.home, MARKER), String(now), { mode: 0o600 });
    lastTouch.set(session.sid, now);
  } catch {
    // a missing or read-only directory: the sweeper falls back to mtimes
  }
}

/**
 * Last activity of a session directory: the marker's time, or for a
 * session without one, the newest file directly in the directory.
 */
export function lastActiveMs(dir: string): number {
  try {
    return fs.statSync(path.join(dir, MARKER)).mtimeMs;
  } catch {
    // no marker yet
  }
  let newest = fs.statSync(dir).mtimeMs;
  for (const name of fs.readdirSync(dir)) {
    try {
      const st = fs.statSync(path.join(dir, name));
      if (st.mtimeMs > newest) newest = st.mtimeMs;
    } catch {
      // unreadable entry
    }
  }
  return newest;
}

/** Remember that this session was signed out for being idle, to tell the person. */
export function noteIdleSignOut(sid: string, now = Date.now()): void {
  lastTouch.delete(sid);
  for (const [key, at] of signedOutIdle) {
    if (now - at > SIGNED_OUT_MEMORY_MS) signedOutIdle.delete(key);
  }
  signedOutIdle.set(sid, now);
}

/** Whether this session was signed out for being idle (and has not signed in since). */
export function wasSignedOutIdle(sid: string): boolean {
  return signedOutIdle.has(sid);
}

/** Forget the idle sign-out once the person is signed in again. */
export function clearIdleSignOut(sid: string): void {
  signedOutIdle.delete(sid);
}
