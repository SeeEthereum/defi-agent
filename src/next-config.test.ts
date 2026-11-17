import { describe, expect, it } from "vitest";
import nextConfig, {
  BROWSER_RPC_ORIGINS,
  contentSecurityPolicy,
  securityHeaders,
  sentryIngestOrigin,
} from "../next.config";
import { CHAINS } from "@/lib/chains";

const DSN = "https://0123456789abcdef@o4500000000000000.ingest.de.sentry.io/4500000000000001";

/** "script-src 'self' x; img-src y" → { "script-src": ["'self'", "x"], ... } */
function parse(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...sources]) => [name, sources])
  );
}

function headerMap(options: Parameters<typeof securityHeaders>[0]): Record<string, string> {
  return Object.fromEntries(securityHeaders(options).map((h) => [h.key, h.value]));
}

describe("security headers", () => {
  const prod = headerMap({ dev: false, production: true, sentryDsn: DSN });

  it("sets the fixed hardening headers", () => {
    expect(prod["X-Content-Type-Options"]).toBe("nosniff");
    expect(prod["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(prod["X-Frame-Options"]).toBe("DENY");
    const permissions = prod["Permissions-Policy"];
    for (const feature of ["camera=()", "microphone=()", "geolocation=()"]) {
      expect(permissions).toContain(feature);
    }
  });

  it("sends HSTS in production only", () => {
    expect(prod["Strict-Transport-Security"]).toMatch(/^max-age=\d{8,}; includeSubDomains$/);
    expect(headerMap({ dev: true, production: false })["Strict-Transport-Security"]).toBeUndefined();
  });

  it("keeps the CSP tight in production", () => {
    const csp = parse(prod["Content-Security-Policy"]);
    expect(csp["default-src"]).toEqual(["'self'"]);
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
    expect(csp["form-action"]).toEqual(["'self'"]);
    expect(csp["script-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp["script-src"]).not.toContain("'unsafe-eval'");
    expect(csp["img-src"]).toEqual(["'self'", "data:", "blob:", "https:"]);
    expect(csp["font-src"]).toEqual(["'self'"]);
  });

  it("never allows any host for scripts or connections", () => {
    for (const options of [
      { dev: false, production: true, sentryDsn: DSN },
      { dev: true, production: false, sentryDsn: DSN },
      { dev: false, production: true },
    ]) {
      const csp = parse(contentSecurityPolicy(options));
      for (const directive of ["script-src", "connect-src", "default-src", "style-src", "font-src"]) {
        for (const source of csp[directive]) {
          expect(source, `${directive} ${source}`).not.toMatch(/^(\*|https?:|https?:\/\/\*|data:|blob:)$/);
          expect(source, `${directive} ${source}`).not.toContain("*");
        }
      }
    }
  });

  it("allows every RPC the pages poll, and Sentry's ingest host", () => {
    const connect = parse(prod["Content-Security-Policy"])["connect-src"];
    expect(connect[0]).toBe("'self'");
    for (const chain of Object.values(CHAINS)) {
      expect(connect, chain.name).toContain(new URL(chain.rpcUrl).origin);
    }
    expect(connect).toContain("https://o4500000000000000.ingest.de.sentry.io");
    expect(connect.join(" ")).not.toContain("0123456789abcdef"); // the DSN key stays out
    expect(connect).toHaveLength(1 + BROWSER_RPC_ORIGINS.length + 1);
  });

  it("drops Sentry from connect-src without a usable DSN", () => {
    expect(sentryIngestOrigin(undefined)).toBeNull();
    expect(sentryIngestOrigin("")).toBeNull();
    expect(sentryIngestOrigin("not a url")).toBeNull();
    expect(sentryIngestOrigin("http://key@sentry.example/1")).toBeNull();
    const connect = parse(contentSecurityPolicy({ dev: false, production: true }))["connect-src"];
    expect(connect).toEqual(["'self'", ...BROWSER_RPC_ORIGINS]);
  });

  it("adds eval and the HMR websocket in development only", () => {
    const csp = parse(contentSecurityPolicy({ dev: true, production: false }));
    expect(csp["script-src"]).toContain("'unsafe-eval'");
    expect(csp["connect-src"]).toEqual(expect.arrayContaining(["ws:", "wss:"]));
  });

  it("applies the headers to every path", async () => {
    const config = typeof nextConfig === "function" ? null : nextConfig;
    expect(config?.headers).toBeTypeOf("function");
    const rules = await config!.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    const keys = rules[0].headers.map((h) => h.key);
    expect(keys).toEqual(expect.arrayContaining(["Content-Security-Policy", "X-Frame-Options", "Permissions-Policy"]));
    expect(config?.poweredByHeader).toBe(false);
  });
});
