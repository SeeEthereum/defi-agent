import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT, systemPromptFor } from "./system-prompt";

describe("system prompt per language", () => {
  it("leaves the English app's prompt as it was", () => {
    expect(systemPromptFor("en")).toBe(SYSTEM_PROMPT);
  });

  it("makes Italian the default on the Italian app, the user's own language still first", () => {
    const it_ = systemPromptFor("it");
    expect(it_.startsWith(SYSTEM_PROMPT)).toBe(true);
    expect(it_).toMatch(/Reply in the language the user writes in; if you cannot tell, reply in Italian/);
    expect(it_).toMatch(/Conferma/);
    expect(it_.slice(SYSTEM_PROMPT.length)).not.toMatch(/[—–]/);
  });
});
