import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { checkLifiContracts, LIFI_CONTRACTS } from "./contracts";
import { SUPPORTED_CHAIN_IDS } from "@/lib/chains";

const DIAMOND = "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE";
const ERC20_PROXY_ARB = "0x5741A7FfE7c39Ca175546a54985fA79211290b51";
const ATTACKER = "0x000000000000000000000000000000000000dEaD";

describe("checkLifiContracts", () => {
  it("lists every chain the app supports, with checksummed addresses", () => {
    for (const id of SUPPORTED_CHAIN_IDS) {
      const entry = LIFI_CONTRACTS[id];
      expect(entry, `chain ${id}`).toBeDefined();
      for (const a of [...entry.targets, ...entry.spenders]) expect(getAddress(a)).toBe(a);
    }
  });

  it("accepts the Diamond as target and spender, in any case", () => {
    expect(checkLifiContracts(42161, DIAMOND, DIAMOND)).toEqual({ ok: true });
    expect(checkLifiContracts(1, DIAMOND.toLowerCase(), DIAMOND.toUpperCase().replace("0X", "0x"))).toEqual({ ok: true });
    // Native token routes may carry no approval address.
    expect(checkLifiContracts(8453, DIAMOND, undefined)).toEqual({ ok: true });
    expect(checkLifiContracts(8453, DIAMOND, "")).toEqual({ ok: true });
  });

  it("refuses an unknown target", () => {
    const r = checkLifiContracts(42161, ATTACKER, DIAMOND);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(502);
      expect(r.error).toMatch(/don't recognize/);
    }
  });

  it("refuses an unknown or periphery spender", () => {
    expect(checkLifiContracts(42161, DIAMOND, ATTACKER).ok).toBe(false);
    // ERC20Proxy is a real LI.FI contract, but never a spender for the user.
    expect(checkLifiContracts(42161, DIAMOND, ERC20_PROXY_ARB).ok).toBe(false);
  });

  it("refuses a chain that is not on the list", () => {
    const r = checkLifiContracts(43114, DIAMOND, DIAMOND);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.error).toMatch(/not available/);
    }
  });
});
