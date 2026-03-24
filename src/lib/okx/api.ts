import crypto from "crypto";

function signRequest(
  timestamp: string,
  method: string,
  path: string,
  body: string
): string {
  const prehash = timestamp + method.toUpperCase() + path + body;
  return crypto
    .createHmac("sha256", process.env.OKX_SECRET_KEY!)
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
    "OK-ACCESS-KEY": process.env.OKX_API_KEY!,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": process.env.OKX_PASSPHRASE!,
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
