/**
 * Sign out every session idle for longer than the timeout (./activity).
 *
 * Runs every minute in the Node.js server (started from instrumentation.ts).
 * For each session directory that holds a signed-in wallet and has not been
 * used in time, it does what the Sign out button does: OKX `wallet logout`
 * (best effort), then deletes the directory and its credential. The next
 * status check in that browser reports `signedOutReason: "idle"`.
 */

import fs from "node:fs";
import path from "node:path";
import { walletLogout } from "@/lib/okx/cli";
import { clearLoginSession } from "@/lib/okx/login-session";
import { invalidateHlClients } from "@/lib/hyperliquid/http";
import { invalidateHlSigningAddressCache } from "@/lib/hyperliquid/probe";
import { idleTimeoutMs, lastActiveMs, noteIdleSignOut } from "./activity";
import { destroySessionHome, holdsSignedInWallet, runWithSession, sessionsRoot, type UserSession } from "./session";
import { SID_PATTERN } from "./token";

const SWEEP_EVERY_MS = 60_000;

/** Sessions idle for longer than `timeoutMs` at `now`. */
export function idleSessions(timeoutMs: number, now = Date.now()): UserSession[] {
  const root = sessionsRoot();
  if (timeoutMs <= 0 || !fs.existsSync(root)) return [];
  const idle: UserSession[] = [];
  for (const name of fs.readdirSync(root)) {
    if (!SID_PATTERN.test(name)) continue;
    const dir = path.join(root, name);
    try {
      if (!fs.statSync(dir).isDirectory() || !holdsSignedInWallet(dir)) continue;
      if (now - lastActiveMs(dir) > timeoutMs) idle.push({ sid: name, home: dir });
    } catch {
      // removed meanwhile, or unreadable: skip it
    }
  }
  return idle;
}

/** Sign one session out, like the Sign out button. Never throws. */
export async function signOutIdle(session: UserSession): Promise<void> {
  await runWithSession(session, async () => {
    clearLoginSession();
    try {
      await walletLogout();
    } catch (error) {
      console.warn("[idle] wallet logout failed, deleting the session anyway", error);
    }
    try {
      invalidateHlClients();
      invalidateHlSigningAddressCache();
      destroySessionHome();
    } catch (error) {
      console.error("[idle] could not delete an idle session", error);
      return;
    }
    noteIdleSignOut(session.sid);
  });
}

let running = false;

/** One pass: sign out every idle session. Returns how many were signed out. */
export async function sweepIdleSessions(timeoutMs = idleTimeoutMs()): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const idle = idleSessions(timeoutMs);
    for (const session of idle) await signOutIdle(session);
    if (idle.length > 0) {
      console.info(`[idle] signed out ${idle.length} idle session${idle.length === 1 ? "" : "s"}`);
    }
    return idle.length;
  } catch (error) {
    console.error("[idle] sweep failed", error);
    return 0;
  } finally {
    running = false;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Start the minute-by-minute sweep (once per process; no-op when turned off). */
export function startIdleSweeper(): void {
  if (timer || idleTimeoutMs() <= 0) return;
  timer = setInterval(() => void sweepIdleSessions(), SWEEP_EVERY_MS);
  timer.unref();
}
