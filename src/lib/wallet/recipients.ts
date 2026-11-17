/**
 * Recipients this browser has sent to, and addresses shown in full.
 *
 * Address poisoning works on "0x1234…abcd": an attacker makes an address
 * with the same first and last characters and plants it in the user's
 * history. So a confirmation shows the whole checksummed address in groups
 * of four, and says so when the address is new to this browser.
 */

import { getAddress } from "viem";

/** localStorage key: lowercase addresses, most recent first. */
export const KNOWN_RECIPIENTS_KEY = "albicocca-known-recipients";
const MAX_KNOWN = 100;

/** The checksummed address (EIP-55), or null when it is not a valid EVM address. */
export function checksumAddress(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    return getAddress(raw.trim());
  } catch {
    return null;
  }
}

/** "0x" then groups of four: ["0x", "1234", "AbCd", …], as the wallet's receive view shows it. */
export function addressGroups(address: string): string[] {
  const hex = address.startsWith("0x") ? address.slice(2) : address;
  return ["0x", ...(hex.match(/.{1,4}/g) ?? [])];
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readList(storage: StorageLike | null): string[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(KNOWN_RECIPIENTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === "string") : [];
  } catch {
    return [];
  }
}

/**
 * True when this browser has sent to `address` before; null when storage
 * can't be read (private mode, blocked), so the caller can say nothing
 * rather than something wrong.
 */
export function isKnownRecipient(address: string, storage: StorageLike | null = defaultStorage()): boolean | null {
  if (!storage) return null;
  try {
    storage.getItem(KNOWN_RECIPIENTS_KEY);
  } catch {
    return null;
  }
  return readList(storage).includes(address.trim().toLowerCase());
}

/** Remember a recipient after a send went out. Storage errors are ignored. */
export function rememberRecipient(address: string, storage: StorageLike | null = defaultStorage()): void {
  if (!storage || checksumAddress(address) == null) return;
  const a = address.trim().toLowerCase();
  const next = [a, ...readList(storage).filter((x) => x !== a)].slice(0, MAX_KNOWN);
  try {
    storage.setItem(KNOWN_RECIPIENTS_KEY, JSON.stringify(next));
  } catch {
    // Full or blocked storage: the next send to this address warns again.
  }
}
