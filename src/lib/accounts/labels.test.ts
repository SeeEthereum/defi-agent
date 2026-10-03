import { describe, it, expect, beforeEach } from "vitest";
import { cleanLabel, getLabels, LABEL_MAX, setLabel } from "./labels";
import { ownerKey } from "@/lib/session/identity";

describe("account names", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  it("cleans names and caps their length", () => {
    expect(cleanLabel("  Savings\n  vault ")).toBe("Savings vault");
    expect(cleanLabel("a\u0007b")).toBe("ab");
    expect(cleanLabel("x".repeat(100))).toHaveLength(LABEL_MAX);
  });

  it("sets, reads and clears a name per person", async () => {
    await setLabel("u:1", "7", "Trading");
    expect(await getLabels("u:1")).toEqual({ "7": "Trading" });
    expect(await getLabels("u:2")).toEqual({});
    await setLabel("u:1", "7", "   ");
    expect(await getLabels("u:1")).toEqual({});
  });

  it("keys people by a hash of their login, never the email itself", () => {
    const k = ownerKey("Me@Example.com", "sid");
    expect(k).toBe(ownerKey("me@example.com ", "other-sid"));
    expect(k).not.toContain("example");
    expect(ownerKey(null, "sid123")).toBe("s:sid123");
  });
});
