import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

function request(path: string, init: { headers?: Record<string, string>; method?: string } = {}) {
  return new NextRequest(`http://localhost:3000${path}`, { method: init.method ?? "GET", headers: init.headers });
}

describe("proxy: languages", () => {
  it("sends a page without a language to the browser's", async () => {
    const res = await proxy(request("/", { headers: { "accept-language": "it-IT,it;q=0.9,en;q=0.8" } }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/it");
  });

  it("prefers the language used last, and keeps the query", async () => {
    const res = await proxy(
      request("/wallet?tab=receive", { headers: { "accept-language": "it-IT", cookie: "albicocca-lang=en" } })
    );
    expect(res.headers.get("location")).toBe("http://localhost:3000/en/wallet?tab=receive");
  });

  it("falls back to English", async () => {
    const res = await proxy(request("/swap", { headers: { "accept-language": "de-DE,de" } }));
    expect(res.headers.get("location")).toBe("http://localhost:3000/en/swap");
  });

  it("leaves the API, files and share images alone", async () => {
    for (const path of ["/api/wallet/balances", "/opengraph-image", "/twitter-image", "/icon.svg"]) {
      const res = await proxy(request(path, { headers: { "accept-language": "it" } }));
      expect(res.headers.get("location"), path).toBeNull();
    }
  });

  it("remembers the language of the page opened", async () => {
    const res = await proxy(request("/it/swap", { headers: { cookie: "albicocca-lang=en" } }));
    expect(res.headers.get("location")).toBeNull();
    expect(res.cookies.get("albicocca-lang")?.value).toBe("it");
    const same = await proxy(request("/it/swap", { headers: { cookie: "albicocca-lang=it" } }));
    expect(same.cookies.get("albicocca-lang")).toBeUndefined();
  });

  it("still gives a first visit its session", async () => {
    const res = await proxy(request("/en"));
    expect(res.cookies.get("albicocca_sid")?.value).toBeTruthy();
  });
});

describe("proxy: cross-site requests", () => {
  it("rejects a state change from another site", async () => {
    const res = await proxy(request("/api/wallet/send", { method: "POST", headers: { origin: "https://evil.example" } }));
    expect(res.status).toBe(403);
  });

  it("lets the app's own pages through", async () => {
    const res = await proxy(request("/api/wallet/send", { method: "POST", headers: { origin: "http://localhost:3000", host: "localhost:3000" } }));
    expect(res.status).toBe(200);
  });
});
