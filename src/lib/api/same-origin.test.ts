import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import { isSameOrigin } from "./same-origin";

const req = (headers: Record<string, string>) => ({ headers: new Headers(headers) }) as unknown as NextRequest;

describe("same-origin check for costly routes", () => {
  it("accepts the app's own pages", () => {
    expect(isSameOrigin(req({ "sec-fetch-site": "same-origin", origin: "https://app.example", host: "app.example" }))).toBe(true);
  });
  it("rejects other sites", () => {
    expect(isSameOrigin(req({ "sec-fetch-site": "cross-site", origin: "https://evil.example", host: "app.example" }))).toBe(false);
    expect(isSameOrigin(req({ origin: "https://evil.example", host: "app.example" }))).toBe(false);
  });
  it("trusts the forwarded host behind the proxy", () => {
    expect(isSameOrigin(req({ origin: "https://app.example", host: "10.0.0.1:10000", "x-forwarded-host": "app.example" }))).toBe(true);
  });
});
