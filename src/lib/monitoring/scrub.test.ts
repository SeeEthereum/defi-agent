import { describe, it, expect } from "vitest";
import { scrubDeep, scrubEvent, scrubString } from "./scrub";

const ADDRESS = "0xd858a1b2c3d4e5f60718293a4b5c6d7e8f909580";
const HASH = "0x" + "ab".repeat(32);
const SID = "3ustp2Aw-53rgssNJN8xbu_Bbk6gydo8X5rGS3Di42o";

describe("scrubString", () => {
  it("hides wallet addresses and transaction hashes", () => {
    expect(scrubString(`send to ${ADDRESS} failed, tx ${HASH}`)).toBe("send to [address] failed, tx [hash]");
  });

  it("hides emails, JWTs and the session id in a path", () => {
    expect(scrubString("user mario.rossi@example.com")).toBe("user [email]");
    expect(scrubString("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl")).toBe("Bearer [jwt]");
    expect(scrubString(`Binary not found at /opt/render/project/src/.data/sessions/${SID}/bin`)).toBe(
      "Binary not found at /opt/render/project/src/.data/sessions/[sid]/bin"
    );
  });

  it("hides long opaque tokens but keeps ordinary text and short ids", () => {
    expect(scrubString(`cookie ${SID}`)).toBe("cookie [token]");
    expect(scrubString("onchainos wallet balance failed: Not logged in (chunk 1s0cs27mc1ki9)")).toBe(
      "onchainos wallet balance failed: Not logged in (chunk 1s0cs27mc1ki9)"
    );
  });
});

describe("scrubDeep", () => {
  it("scrubs every string in nested objects and arrays without touching the input", () => {
    const event = {
      message: `quote for ${ADDRESS}`,
      exception: { values: [{ value: `revert ${HASH}`, stacktrace: { frames: [{ lineno: 12 }] } }] },
      breadcrumbs: [{ data: { url: `/api/portfolio/pnl?address=${ADDRESS}` } }],
    };
    const out = scrubDeep(event);
    expect(out.message).toBe("quote for [address]");
    expect(out.exception.values[0].value).toBe("revert [hash]");
    expect(out.exception.values[0].stacktrace.frames[0].lineno).toBe(12);
    expect(out.breadcrumbs[0].data.url).toBe("/api/portfolio/pnl?address=[address]");
    expect(event.message).toContain(ADDRESS);
  });

  it("keeps the release (a 40-character commit SHA) and environment as they are", () => {
    const event = {
      release: "d5d9fdb2370dea277a9782594fb9b5add32f3182",
      environment: "production",
      message: `failed for ${ADDRESS}`,
    };
    expect(scrubEvent(event)).toEqual({
      release: "d5d9fdb2370dea277a9782594fb9b5add32f3182",
      environment: "production",
      message: "failed for [address]",
    });
  });

  it("survives cycles", () => {
    const a: Record<string, unknown> = { name: ADDRESS };
    a.self = a;
    expect(scrubDeep(a)).toEqual({ name: "[address]", self: "[cycle]" });
  });
});
