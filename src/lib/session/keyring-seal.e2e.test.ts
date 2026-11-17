/**
 * Sealing against the real onchainos binary. Skipped unless RUN_ONCHAINOS_E2E=1
 * (it starts a login session at OKX, which expires unused):
 *
 *   RUN_ONCHAINOS_E2E=1 npx vitest run src/lib/session/keyring-seal.e2e.test.ts
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { IDENTITY_FILE, SEALED_FILE, seal, withUnsealedIdentity } from "./keyring-seal";

const BIN = process.env.ONCHAINOS_PATH ?? path.join(os.homedir(), ".local", "bin", "onchainos");
const enabled = process.env.RUN_ONCHAINOS_E2E === "1" && fs.existsSync(BIN);
const home = fs.mkdtempSync(path.join(os.tmpdir(), "seal-e2e-"));
const session = { sid: "t".repeat(43), home };
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  PATH: "/usr/bin:/bin",
  HOME: home,
  ONCHAINOS_HOME: home,
  ONCHAINOS_FORCE_FILE_KEYRING: "1",
  ONCHAINOS_NO_BROWSER: "1",
};

function onchainos(...args: string[]): string {
  try {
    return execFileSync(BIN, args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return `FAILED ${e.stdout ?? ""} ${e.stderr ?? ""}`;
  }
}

afterAll(() => fs.rmSync(home, { recursive: true, force: true }));

const sha = (file: string) => createHash("sha256").update(fs.readFileSync(path.join(home, file))).digest("hex");

describe.runIf(enabled)("keyring sealing with onchainos", () => {
  it("gives onchainos back the exact identity, and its keyring stays intact", async () => {
    onchainos("wallet", "login", "--phase", "init");
    expect(fs.existsSync(path.join(home, "keyring.enc"))).toBe(true);
    const identity = sha(IDENTITY_FILE);
    const keyring = sha("keyring.enc");

    seal(session);
    expect(fs.existsSync(path.join(home, IDENTITY_FILE))).toBe(false);
    expect(fs.existsSync(path.join(home, SEALED_FILE))).toBe(true);

    const status = await withUnsealedIdentity(session, async () => {
      expect(sha(IDENTITY_FILE)).toBe(identity);
      return onchainos("wallet", "status");
    });
    expect(JSON.parse(status).ok).toBe(true);
    expect(fs.existsSync(path.join(home, IDENTITY_FILE))).toBe(false);
    // The byte-identical identity above is what opens the keyring (scrypt of
    // it, cli/src/file_keyring.rs); the call left the keyring untouched.
    expect(sha("keyring.enc")).toBe(keyring);
  });
});
