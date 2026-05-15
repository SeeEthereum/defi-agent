import crypto from "crypto";

/**
 * Resolve a required env var or throw a clear error.
 *
 * Prior code used `process.env.X!` non-null assertions. If a var was
 * unset, HMAC would compute against the literal string "undefined" and
 * OKX would return a generic 401 — nearly impossible to diagnose. Now
 * we fail loud with a message that names the missing key.
 *
 * Resolved on every request (not at module load) so that tests can
 * monkey-patch process.env between cases, and Render env-var rotations
 * take effect on the next request rather than requiring a redeploy.
 */
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function signRequest(
  timestamp: string,
  method: string,
  path: string,
  body: string
): string {
  const prehash = timestamp + method.toUpperCase() + path + body;
  return crypto
    .createHmac("sha256", requireEnv("OKX_SECRET_KEY"))
    .update(prehash)
    .digest("base64");
}

export async function okxApiRequest<T = unknown>(
  method: string,
  path: string,
  body?: object
): Promise<T> {
  const timestamp = new Date().toISOString();
  const bodyStr = body ? JSON.stringify(body) : "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "OK-ACCESS-KEY": requireEnv("OKX_API_KEY"),
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": requireEnv("OKX_PASSPHRASE"),
    "OK-ACCESS-SIGN": signRequest(timestamp, method, path, bodyStr),
  };

  if (process.env.OKX_PROJECT_ID) {
    headers["OK-ACCESS-PROJECT"] = process.env.OKX_PROJECT_ID;
  }

  const res = await fetch(`https://www.okx.com${path}`, {
    method,
    headers,
    body: method !== "GET" ? bodyStr || undefined : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OKX API ${method} ${path} failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}
