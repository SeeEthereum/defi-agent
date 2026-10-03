/**
 * Who is using the app, as a stable key for per-person data (AI quota,
 * account names). It is the OKX login, not the browser: signing in from a
 * second browser shares the same quota and names.
 *
 * The key is a hash of the login email, so the database never holds the
 * address itself. Logins without an email fall back to the browser session.
 */

import { createHash } from "node:crypto";
import { walletStatus } from "@/lib/okx/cli";
import type { WalletStatus } from "@/lib/okx/types";
import { currentSession } from "./session";

export class NotSignedInError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "NotSignedInError";
  }
}

export interface Identity {
  owner: string;
  email: string | null;
  accountId: string | null;
  accountName: string | null;
  accountCount: number;
}

export function ownerKey(email: string | null | undefined, sid: string): string {
  const e = email?.trim().toLowerCase();
  if (e) return "u:" + createHash("sha256").update("albicocca-owner:" + e).digest("hex").slice(0, 40);
  return "s:" + sid;
}

/** The signed-in person behind the current request. Throws when signed out. */
export async function currentIdentity(): Promise<Identity> {
  const result = await walletStatus();
  const data = result.data as WalletStatus | null;
  if (!data?.loggedIn) throw new NotSignedInError();
  return {
    owner: ownerKey(data.email, currentSession().sid),
    email: data.email || null,
    accountId: data.currentAccountId || null,
    accountName: data.currentAccountName || null,
    accountCount: data.accountCount || 0,
  };
}
