import { describe, it, expect } from "vitest";
import { checkRecipient } from "./recipient";

const SENDER = "0xd85800253ae9ef3d4382ade1394b42f1d6bd9580";
// EIP-55 checksummed form of a valid address.
const CHECKSUMMED = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";

describe("checkRecipient", () => {
  it("accepts a checksummed address and normalizes it to lowercase", () => {
    expect(checkRecipient(CHECKSUMMED, SENDER)).toEqual({
      ok: true,
      address: CHECKSUMMED.toLowerCase(),
    });
  });

  it("accepts all-lowercase addresses, which carry no checksum", () => {
    expect(checkRecipient(CHECKSUMMED.toLowerCase(), SENDER).ok).toBe(true);
  });

  it("accepts all-uppercase hex, which EIP-55 treats as unchecksummed", () => {
    expect(checkRecipient(`0x${CHECKSUMMED.slice(2).toUpperCase()}`, SENDER).ok).toBe(true);
  });

  it("trims surrounding whitespace from pasted input", () => {
    expect(checkRecipient(`  ${CHECKSUMMED}\n`, SENDER).ok).toBe(true);
  });

  it("rejects a mixed-case address whose checksum is wrong (a typo)", () => {
    const typo = CHECKSUMMED.replace("aAeb", "aaEb");
    const result = checkRecipient(typo, SENDER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/checksum/);
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "0x123", CHECKSUMMED.slice(2), `${CHECKSUMMED}00`, "alice.near"]) {
      expect(checkRecipient(bad, SENDER).ok).toBe(false);
    }
  });

  it("rejects the zero address", () => {
    expect(checkRecipient("0x0000000000000000000000000000000000000000", SENDER).ok).toBe(false);
  });

  it("rejects the sending wallet in any letter case", () => {
    for (const self of [SENDER, SENDER.toUpperCase().replace("0X", "0x")]) {
      const result = checkRecipient(self, SENDER);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/sending from/);
    }
  });
});
