/**
 * Keep each session's wallet credentials unreadable on disk.
 *
 * onchainos stores a signed-in session's tokens and signing key in
 * `keyring.enc` (AES-256-GCM), but the key that opens it is derived from
 * `machine-identity`, a random value saved as plain text in the same
 * directory (cli/src/file_keyring.rs). Anyone who can read the directory,
 * from a disk snapshot, a backup or a file-read bug, can open the keyring
 * and act as the user.
 *
 * So between onchainos calls the identity is not on disk in the clear: it
 * is sealed (AES-256-GCM, key derived from SESSION_SECRET, bound to the
 * session id) into `.machine-identity.sealed`, and the plain file is
 * deleted. Right before a call it is unsealed again, and sealed right after.
 * The directory alone is then useless without the server's secret, which
 * lives in the environment, not on the disk.
 *
 * What this does not cover: a live attacker inside the server process sees
 * the secret, and while a call runs (a second or two; a login poll, up to a
 * few minutes) the identity is briefly in the clear.
 *
 * Calls for one session can overlap (a login poll runs beside the locked
 * calls), so a per-session counter seals only when the last one ends.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { UserSession } from "./session";
import { sessionSecret, SID_PATTERN } from "./token";

export const IDENTITY_FILE = "machine-identity";
export const SEALED_FILE = ".machine-identity.sealed";
const VERSION = 1;

/** The sealed identity could not be opened (e.g. SESSION_SECRET changed). */
export class SealedSessionError extends Error {
  constructor() {
    super("Your session could not be opened. Please sign in again.");
    this.name = "SealedSessionError";
  }
}

function key(): Buffer {
  return Buffer.from(hkdfSync("sha256", sessionSecret(), "albicocca", "onchainos-keyring-identity/v1", 32));
}

/** Encrypt `identity` for session `sid`: version, nonce, tag, ciphertext. */
export function sealIdentity(identity: string, sid: string): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(Buffer.from(sid));
  const ciphertext = Buffer.concat([cipher.update(identity, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), nonce, cipher.getAuthTag(), ciphertext]);
}

/** Decrypt a sealed identity. Throws SealedSessionError when it does not open. */
export function openIdentity(sealed: Buffer, sid: string): string {
  try {
    if (sealed[0] !== VERSION || sealed.length < 1 + 12 + 16 + 1) throw new Error("bad format");
    const decipher = createDecipheriv("aes-256-gcm", key(), sealed.subarray(1, 13));
    decipher.setAAD(Buffer.from(sid));
    decipher.setAuthTag(sealed.subarray(13, 29));
    return Buffer.concat([decipher.update(sealed.subarray(29)), decipher.final()]).toString("utf8");
  } catch {
    throw new SealedSessionError();
  }
}

function writePrivate(file: string, data: string | Buffer): void {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Seal the plain identity of a session, if there is one, and delete it. */
export function seal(session: UserSession): void {
  const plain = path.join(session.home, IDENTITY_FILE);
  let identity: string;
  try {
    identity = fs.readFileSync(plain, "utf8");
  } catch {
    return; // nothing to seal (no login yet, or already sealed)
  }
  if (identity.trim() === "") return;
  writePrivate(path.join(session.home, SEALED_FILE), sealIdentity(identity, session.sid));
  fs.rmSync(plain, { force: true });
}

/** Put the plain identity back for a call. No-op when it is already there or was never created. */
export function unseal(session: UserSession): void {
  const plain = path.join(session.home, IDENTITY_FILE);
  if (fs.existsSync(plain)) return;
  let sealed: Buffer;
  try {
    sealed = fs.readFileSync(path.join(session.home, SEALED_FILE));
  } catch {
    return; // never signed in: onchainos creates a fresh identity itself
  }
  writePrivate(plain, openIdentity(sealed, session.sid));
}

const open = new Map<string, number>();

/**
 * Unseal the identity for one onchainos call and return the function that
 * ends it (safe to call twice). The identity is sealed again once no call
 * for that session is running. Throws SealedSessionError if it does not open.
 */
export function holdUnsealedIdentity(session: UserSession): () => void {
  const count = open.get(session.sid) ?? 0;
  if (count === 0 && fs.existsSync(session.home)) unseal(session);
  open.set(session.sid, count + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (open.get(session.sid) ?? 1) - 1;
    if (left > 0) {
      open.set(session.sid, left);
      return;
    }
    open.delete(session.sid);
    try {
      if (fs.existsSync(session.home)) seal(session);
    } catch (error) {
      console.error("[keyring-seal] could not seal a session identity", error);
    }
  };
}

/** Run `fn` (which runs onchainos for `session`) with the identity unsealed. */
export async function withUnsealedIdentity<T>(session: UserSession, fn: () => Promise<T>): Promise<T> {
  const release = holdUnsealedIdentity(session);
  try {
    return await fn();
  } finally {
    release();
  }
}

/** Number of sessions with a call running. For tests. */
export function openSessions(): number {
  return open.size;
}

/**
 * Seal every identity left in the clear: sessions from before this change,
 * or a call cut short by a crash. Run at server start, when no call runs.
 */
export function sealAllSessions(root: string): number {
  let sealed = 0;
  let names: string[] = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return 0;
  }
  for (const sid of names) {
    if (!SID_PATTERN.test(sid) || open.has(sid)) continue;
    const home = path.join(root, sid);
    try {
      if (!fs.existsSync(path.join(home, IDENTITY_FILE))) continue;
      seal({ sid, home });
      sealed += 1;
    } catch (error) {
      console.error("[keyring-seal] could not seal a session identity", error);
    }
  }
  if (sealed > 0) console.info(`[keyring-seal] sealed ${sealed} session identit${sealed === 1 ? "y" : "ies"}`);
  return sealed;
}
