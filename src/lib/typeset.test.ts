import { describe, it, expect } from "vitest";
import { typeset } from "./typeset";

const NBSP = " ";

describe("typeset", () => {
  it("joins the last two words with a no-break space", () => {
    expect(typeset("Start in a minute.")).toBe(`Start in a${NBSP}minute.`);
  });

  it("curls double quotes and apostrophes", () => {
    expect(typeset(`"Move half my USDC to Base." It's OKX's enclave`)).toBe(
      `“Move half my USDC to Base.” It’s OKX’s${NBSP}enclave`
    );
  });

  it("turns three dots into an ellipsis", () => {
    expect(typeset("Loading...")).toBe("Loading…");
  });

  it("leaves a single word alone", () => {
    expect(typeset("Swap")).toBe("Swap");
  });

  it("does not glue a long last word that could not wrap as a unit", () => {
    const long = "a".repeat(30);
    expect(typeset(`short ${long}`)).toBe(`short ${long}`);
  });
});
