import { describe, expect, it } from "vitest";
import { addressGroups, checksumAddress, isKnownRecipient, KNOWN_RECIPIENTS_KEY, rememberRecipient } from "./recipients";

const ADDR = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
const CHECKSUMMED = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe("checksumAddress", () => {
  it("checksums a valid address and rejects anything else", () => {
    expect(checksumAddress(ADDR)).toBe(CHECKSUMMED);
    expect(checksumAddress(` ${ADDR} `)).toBe(CHECKSUMMED);
    expect(checksumAddress("0x1234")).toBeNull();
    expect(checksumAddress(undefined)).toBeNull();
  });
});

describe("addressGroups", () => {
  it("splits into 0x and ten groups of four", () => {
    const g = addressGroups(CHECKSUMMED);
    expect(g[0]).toBe("0x");
    expect(g).toHaveLength(11);
    expect(g[1]).toBe("d8dA");
    expect(g.join("")).toBe(CHECKSUMMED);
  });
});

describe("known recipients", () => {
  it("is false for a new address and true after a send, in any case", () => {
    const s = memoryStorage();
    expect(isKnownRecipient(CHECKSUMMED, s)).toBe(false);
    rememberRecipient(CHECKSUMMED, s);
    expect(isKnownRecipient(ADDR, s)).toBe(true);
    expect(JSON.parse(s.data[KNOWN_RECIPIENTS_KEY])).toEqual([ADDR]);
  });

  it("keeps the most recent first, without duplicates", () => {
    const s = memoryStorage();
    const other = "0x0000000000000000000000000000000000000001";
    rememberRecipient(ADDR, s);
    rememberRecipient(other, s);
    rememberRecipient(ADDR, s);
    expect(JSON.parse(s.data[KNOWN_RECIPIENTS_KEY])).toEqual([ADDR, other]);
  });

  it("ignores invalid addresses and corrupt storage", () => {
    const s = memoryStorage({ [KNOWN_RECIPIENTS_KEY]: "{not json" });
    expect(isKnownRecipient(ADDR, s)).toBe(false);
    rememberRecipient("not an address", s);
    expect(s.data[KNOWN_RECIPIENTS_KEY]).toBe("{not json");
  });

  it("says nothing when storage is missing or throws", () => {
    expect(isKnownRecipient(ADDR, null)).toBeNull();
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(isKnownRecipient(ADDR, throwing)).toBeNull();
    expect(() => rememberRecipient(ADDR, throwing)).not.toThrow();
  });
});
