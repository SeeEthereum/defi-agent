import { describe, it, expect } from "vitest";
import { checkScope, MAX_QUESTION_CHARS, refusalText } from "./guard";

describe("scope guard", () => {
  it("refuses very long messages without calling a model", async () => {
    const v = await checkScope("x".repeat(MAX_QUESTION_CHARS + 1));
    expect(v.inScope).toBe(false);
    if (!v.inScope) expect(v.reason).toBe("too_long");
  });

  it("answers refusals in the user's language, English otherwise", () => {
    expect(refusalText({ inScope: false, reason: "off_topic", language: "it" })).toMatch(/^Posso aiutarti solo con albicocca/);
    expect(refusalText({ inScope: false, reason: "off_topic", language: "ja" })).toMatch(/^I can only help with albicocca/);
  });

  it("uses no em dashes in refusals", () => {
    for (const lang of ["en", "it", "es", "fr", "de"]) {
      for (const reason of ["off_topic", "instructions", "too_long"] as const) {
        expect(refusalText({ inScope: false, reason, language: lang })).not.toMatch(/[—–]/);
      }
    }
  });
});
