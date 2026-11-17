/**
 * The user's OKX Agentic Wallet protections, as OKX reported them at sign-in.
 *
 * OKX enforces these on its side, and only the user can change them, on
 * OKX's site (our server has no way to): a per-transaction limit, daily
 * transfer and trade limits, an address whitelist for transfers, and
 * approval verification (an email code for every token approval, which the
 * limits do not cover). With the server holding a signing session, they are
 * the strongest protection a user has, so the wallet page shows them.
 *
 * onchainos (v4.6.11+) returns them only in the login result, so they are
 * saved in the session directory then and shown "as of sign-in". Values
 * are never guessed: anything OKX did not report reads "Not set".
 */

import fs from "node:fs";
import path from "node:path";
import type { UserSession } from "@/lib/session/session";

/** Where the user changes them (link from OKX's own skill docs). */
export const POLICY_SETTINGS_URL = "https://web3.okx.com/portfolio/agentic-wallet-policy?tab=limit";

const FILE = ".albicocca-policy.json";

export interface SecurityPolicy {
  status: "available" | "unavailable";
  singleTxLimit: string | null;
  dailyTransferTxLimit: string | null;
  dailyTransferTxUsed: string | null;
  dailyTradeTxLimit: string | null;
  dailyTradeTxUsed: string | null;
  doubleConfirmation: boolean | null;
  /** null: OKX did not say. */
  whitelist: { enabled: boolean; addressCount: number } | null;
}

export interface SavedPolicy {
  policy: SecurityPolicy;
  savedAt: number;
}

function amount(value: unknown): string | null {
  return typeof value === "string" && /^\d+(\.\d+)?$/.test(value) ? value : null;
}

/** Read `securityPolicy` from a login result, strictly. Null when absent or malformed. */
export function parseSecurityPolicy(value: unknown): SecurityPolicy | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (p.status === "unavailable") {
    return {
      status: "unavailable",
      singleTxLimit: null,
      dailyTransferTxLimit: null,
      dailyTransferTxUsed: null,
      dailyTradeTxLimit: null,
      dailyTradeTxUsed: null,
      doubleConfirmation: null,
      whitelist: null,
    };
  }
  if (p.status !== "available") return null;
  const w = p.whitelist as Record<string, unknown> | null | undefined;
  return {
    status: "available",
    singleTxLimit: amount(p.singleTxLimit),
    dailyTransferTxLimit: amount(p.dailyTransferTxLimit),
    dailyTransferTxUsed: amount(p.dailyTransferTxUsed),
    dailyTradeTxLimit: amount(p.dailyTradeTxLimit),
    dailyTradeTxUsed: amount(p.dailyTradeTxUsed),
    doubleConfirmation: typeof p.doubleConfirmation === "boolean" ? p.doubleConfirmation : null,
    whitelist:
      w && typeof w === "object" && typeof w.enabled === "boolean"
        ? { enabled: w.enabled, addressCount: typeof w.addressCount === "number" ? w.addressCount : 0 }
        : null,
  };
}

/** Save the policy from a finished login's output. Never throws. */
export function savePolicyFromLogin(session: UserSession, stdout: string, now = Date.now()): void {
  try {
    const policy = parseSecurityPolicy(JSON.parse(stdout)?.data?.securityPolicy);
    if (!policy || !fs.existsSync(session.home)) return;
    const saved: SavedPolicy = { policy, savedAt: now };
    fs.writeFileSync(path.join(session.home, FILE), JSON.stringify(saved), { mode: 0o600 });
  } catch {
    // not JSON, or the directory went away: nothing to show
  }
}

/** The policy saved at the last sign-in, or null. */
export function readSavedPolicy(session: UserSession): SavedPolicy | null {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(session.home, FILE), "utf8")) as SavedPolicy;
    const policy = parseSecurityPolicy(saved?.policy);
    return policy && typeof saved.savedAt === "number" ? { policy, savedAt: saved.savedAt } : null;
  } catch {
    return null;
  }
}
