import { execFile, type ChildProcess } from "child_process";
import { ONCHAINOS_BIN } from "./cli";

/**
 * Background driver for the CLI v4 browser login.
 *
 * `wallet login --phase poll` long-polls until the user finishes the social
 * login in their browser — measured still running after 45s, and it can
 * legitimately take as long as the person takes. That makes it a bad fit
 * for runCli: the 30s execFile timeout would kill it, and withOnchainosLock
 * would hold the keystore mutex for the entire login, starving every other
 * route (including the 30s `wallet status` poll driving the UI).
 *
 * So the poll runs as a detached child here, deliberately bypassing the
 * mutex, and its outcome is tracked in memory. The UI then watches this
 * in-memory state instead of shelling out per check, which keeps the login
 * screen free of CLI calls entirely.
 *
 * Bypassing the mutex is safe in practice for this one command: it only
 * writes the keystore at the very end, on success, and during a login the
 * account is by definition logged out — every other wallet command is
 * failing with "Invalid Authority" anyway, so there is nothing to race
 * with. It is the only command allowed to skip the lock.
 *
 * State is per-process and deliberately not persisted: a server restart
 * mid-login just means the operator starts over. Only one login may be in
 * flight — starting a new one kills the previous child.
 */

export type LoginPhase = "pending" | "done" | "error";

export interface LoginSession {
  authSessionId: string;
  loginUrl: string;
  phase: LoginPhase;
  /** Populated when phase === "error". */
  error?: string;
  startedAt: number;
}

// Give the operator a generous window to complete login in the browser,
// but don't leak a child process forever if they walk away.
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

let current: LoginSession | null = null;
let child: ChildProcess | null = null;

/** Abort any in-flight login poll (called before starting a new one). */
export function cancelLoginPoll(): void {
  if (child && !child.killed) child.kill();
  child = null;
}

/**
 * Begin watching for completion of the login minted by
 * `wallet login --phase init`. Returns immediately; progress is observable
 * via getLoginSession().
 */
export function startLoginPoll(authSessionId: string, loginUrl: string): LoginSession {
  cancelLoginPoll();

  current = { authSessionId, loginUrl, phase: "pending", startedAt: Date.now() };
  const session = current;

  child = execFile(
    ONCHAINOS_BIN,
    ["wallet", "login", "--phase", "poll", "--session-id", authSessionId],
    {
      timeout: POLL_TIMEOUT_MS,
      env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` },
    },
    (error, stdout) => {
      // A newer login superseded this one — drop the stale result.
      if (current !== session) return;

      if (error) {
        session.phase = "error";
        session.error =
          error.killed || (error as { signal?: string }).signal
            ? "Login timed out. Please start again."
            : error.message;
        return;
      }

      // The CLI reports failures in-band as { ok: false, error }.
      try {
        const json = JSON.parse(stdout);
        if (json.ok === false) {
          session.phase = "error";
          session.error = json.error ?? "Login failed. Please try again.";
          return;
        }
      } catch {
        // Non-JSON stdout on a zero exit — treat as success and let
        // `wallet status` be the source of truth.
      }

      session.phase = "done";
    }
  );

  return session;
}

export function getLoginSession(): LoginSession | null {
  return current;
}

export function clearLoginSession(): void {
  cancelLoginPoll();
  current = null;
}
