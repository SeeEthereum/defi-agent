import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/auth/login", { headers });
}

describe("clientIp", () => {
  it("trusts Cloudflare's header over anything the caller wrote", () => {
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("falls back to the entry the nearest proxy added, not the caller's", () => {
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("uses a fixed key with no proxy at all", () => {
    expect(clientIp(req({}))).toBe("local");
  });
});
