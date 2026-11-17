import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseSecurityPolicy, readSavedPolicy, savePolicyFromLogin } from "./security-policy";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "policy-"));
const session = { sid: "p".repeat(43), home };
afterEach(() => fs.rmSync(path.join(home, ".albicocca-policy.json"), { force: true }));

describe("parseSecurityPolicy", () => {
  it("keeps what OKX reported and never fills in a value", () => {
    // Shape from onchainos v4.6.11 account.rs (build_security_policy).
    const p = parseSecurityPolicy({
      status: "available",
      singleTxLimit: "100",
      dailyTransferTxLimit: null,
      dailyTransferTxUsed: "50",
      dailyTradeTxLimit: "300",
      dailyTradeTxUsed: "0",
      doubleConfirmation: true,
      whitelist: { enabled: true, addressCount: 2 },
    });
    expect(p).toEqual({
      status: "available",
      singleTxLimit: "100",
      dailyTransferTxLimit: null,
      dailyTransferTxUsed: "50",
      dailyTradeTxLimit: "300",
      dailyTradeTxUsed: "0",
      doubleConfirmation: true,
      whitelist: { enabled: true, addressCount: 2 },
    });
  });

  it("treats odd values as unknown", () => {
    const p = parseSecurityPolicy({ status: "available", singleTxLimit: "lots", doubleConfirmation: "yes", whitelist: null });
    expect(p?.singleTxLimit).toBeNull();
    expect(p?.doubleConfirmation).toBeNull();
    expect(p?.whitelist).toBeNull();
    expect(parseSecurityPolicy({ status: "unavailable" })?.status).toBe("unavailable");
    expect(parseSecurityPolicy({})).toBeNull();
    expect(parseSecurityPolicy(undefined)).toBeNull();
  });
});

describe("saved at sign-in", () => {
  it("is read back from the login output", () => {
    savePolicyFromLogin(session, JSON.stringify({ ok: true, data: { securityPolicy: { status: "available", singleTxLimit: "25" } } }), 1000);
    expect(readSavedPolicy(session)).toMatchObject({ savedAt: 1000, policy: { singleTxLimit: "25" } });
  });

  it("saves nothing for a login without a policy (onchainos before 4.6.11)", () => {
    savePolicyFromLogin(session, JSON.stringify({ ok: true, data: { email: "x" } }));
    expect(readSavedPolicy(session)).toBeNull();
    savePolicyFromLogin(session, "not json");
    expect(readSavedPolicy(session)).toBeNull();
  });
});
