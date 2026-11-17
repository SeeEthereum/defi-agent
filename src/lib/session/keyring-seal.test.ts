import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  IDENTITY_FILE,
  SEALED_FILE,
  SealedSessionError,
  holdUnsealedIdentity,
  openIdentity,
  openSessions,
  sealAllSessions,
  sealIdentity,
  withUnsealedIdentity,
} from "./keyring-seal";

const SID = "a".repeat(43);
const OTHER = "b".repeat(43);
const IDENTITY = "3f".repeat(32);

let root: string;
let home: string;

function plain() {
  return path.join(home, IDENTITY_FILE);
}
function sealed() {
  return path.join(home, SEALED_FILE);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "seal-"));
  home = path.join(root, SID);
  fs.mkdirSync(home);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.SESSION_SECRET;
});

describe("sealing", () => {
  it("round-trips, and only for the same session", () => {
    const box = sealIdentity(IDENTITY, SID);
    expect(box.includes(Buffer.from(IDENTITY))).toBe(false);
    expect(openIdentity(box, SID)).toBe(IDENTITY);
    expect(() => openIdentity(box, OTHER)).toThrow(SealedSessionError);
  });

  it("does not open after SESSION_SECRET changes", () => {
    const box = sealIdentity(IDENTITY, SID);
    process.env.SESSION_SECRET = "x".repeat(40);
    expect(() => openIdentity(box, SID)).toThrow(SealedSessionError);
  });
});

describe("withUnsealedIdentity", () => {
  it("leaves only the sealed file on disk after a call", async () => {
    fs.writeFileSync(plain(), IDENTITY);
    await withUnsealedIdentity({ sid: SID, home }, async () => {
      expect(fs.readFileSync(plain(), "utf8")).toBe(IDENTITY);
    });
    expect(fs.existsSync(plain())).toBe(false);
    expect(fs.existsSync(sealed())).toBe(true);
    expect(fs.statSync(sealed()).mode & 0o777).toBe(0o600);

    // The next call gets the same identity back.
    await withUnsealedIdentity({ sid: SID, home }, async () => {
      expect(fs.readFileSync(plain(), "utf8")).toBe(IDENTITY);
      expect(fs.statSync(plain()).mode & 0o777).toBe(0o600);
    });
    expect(fs.existsSync(plain())).toBe(false);
  });

  it("seals an identity onchainos created during the call (first login)", async () => {
    await withUnsealedIdentity({ sid: SID, home }, async () => {
      fs.writeFileSync(plain(), IDENTITY);
    });
    expect(fs.existsSync(plain())).toBe(false);
    expect(openIdentity(fs.readFileSync(sealed()), SID)).toBe(IDENTITY);
  });

  it("seals even when the call fails", async () => {
    fs.writeFileSync(plain(), IDENTITY);
    await expect(
      withUnsealedIdentity({ sid: SID, home }, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(fs.existsSync(plain())).toBe(false);
    expect(openSessions()).toBe(0);
  });

  it("keeps the identity unsealed until the last overlapping call ends", async () => {
    fs.writeFileSync(plain(), IDENTITY);
    const releasePoll = holdUnsealedIdentity({ sid: SID, home }); // a login poll
    await withUnsealedIdentity({ sid: SID, home }, async () => {});
    expect(fs.existsSync(plain())).toBe(true); // the poll still runs
    releasePoll();
    releasePoll(); // idempotent
    expect(fs.existsSync(plain())).toBe(false);
    expect(openSessions()).toBe(0);
  });

  it("does nothing for a session that never signed in", async () => {
    fs.rmSync(home, { recursive: true });
    await withUnsealedIdentity({ sid: SID, home }, async () => {});
    expect(fs.existsSync(home)).toBe(false);
  });
});

describe("sealAllSessions", () => {
  it("seals identities left in the clear and skips other entries", () => {
    fs.writeFileSync(plain(), IDENTITY);
    fs.mkdirSync(path.join(root, "not-a-session"));
    fs.writeFileSync(path.join(root, "not-a-session", IDENTITY_FILE), IDENTITY);
    expect(sealAllSessions(root)).toBe(1);
    expect(fs.existsSync(plain())).toBe(false);
    expect(fs.existsSync(path.join(root, "not-a-session", IDENTITY_FILE))).toBe(true);
  });
});
