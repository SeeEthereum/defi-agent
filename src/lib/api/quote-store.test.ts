import { describe, expect, it } from "vitest";
import { runWithSession } from "@/lib/session/session";
import { checkQuote, consumeQuote, issueQuote, quoteFingerprint } from "./quote-store";

const SESSION = { sid: "q".repeat(43), home: "/tmp/never-used-q" };
const FP = quoteFingerprint(["swap", 1, "0xfrom", "0xto", "1000"]);

describe("quote store", () => {
  it("binds a quote to its parameters and session", () =>
    runWithSession(SESSION, () => {
      const id = issueQuote(FP, "500");
      expect(checkQuote(id, FP)).toEqual({ ok: true, expectedOut: "500" });
      expect(checkQuote(id, quoteFingerprint(["swap", 1, "0xfrom", "0xto", "2000"])).ok).toBe(false);
      runWithSession({ sid: "r".repeat(43), home: "/tmp/never-used-r" }, () => {
        expect(checkQuote(id, FP).ok).toBe(false);
      });
    }));

  it("can be used for one transaction only", () =>
    runWithSession(SESSION, () => {
      const id = issueQuote(FP, null);
      consumeQuote(id);
      expect(checkQuote(id, FP)).toMatchObject({ ok: false });
    }));

  it("comes back when the wallet stopped before signing", () =>
    runWithSession(SESSION, () => {
      const id = issueQuote(FP, "500");
      const restore = consumeQuote(id);
      restore();
      expect(checkQuote(id, FP)).toEqual({ ok: true, expectedOut: "500" });
    }));
});
