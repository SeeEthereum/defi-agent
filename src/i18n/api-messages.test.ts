import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { IN_FLIGHT_MESSAGE, RISK_DECLINED_MESSAGE, UNKNOWN_OUTCOME_MESSAGE, isSendStateMessage, recentMessage, userFacingError } from "@/lib/api/send-state";
import { highRiskMessage } from "@/lib/bridge/safety";
import { TRANSLATED_MESSAGES, localizeResponse, toEnglishApiMessage, translateApiMessage } from "./api-messages";

const ROOT = path.resolve(__dirname, "../..");

describe("API messages in Italian", () => {
  it("translates known messages, leaves the rest and English alone", () => {
    expect(translateApiMessage("Quote expired. Refresh the quote and try again.", "it")).toBe("Il preventivo è scaduto. Aggiornalo e riprova.");
    expect(translateApiMessage("Quote expired. Refresh the quote and try again.", "en")).toBe("Quote expired. Refresh the quote and try again.");
    expect(translateApiMessage("Something OKX said", "it")).toBe("Something OKX said");
    expect(translateApiMessage("Too many sign-in attempts. Try again in 1 minute.", "it")).toBe("Troppi tentativi di accesso. Riprova tra 1 minuto.");
    expect(translateApiMessage("Too many sign-in attempts. Try again in 5 minutes.", "it")).toBe("Troppi tentativi di accesso. Riprova tra 5 minuti.");
  });

  it("has no dashes and no leftover English sentence in the Italian", () => {
    for (const english of TRANSLATED_MESSAGES) {
      const italian = translateApiMessage(english, "it");
      expect(italian, english).not.toMatch(/[—–]/);
      expect(italian, english).not.toBe(english);
    }
  });

  it("goes back to the same English, so pages decide as before", () => {
    for (const english of TRANSLATED_MESSAGES) {
      const back = toEnglishApiMessage(translateApiMessage(english, "it"));
      // Two English messages may share one Italian (Approve/Approval failed):
      // they must then mean the same thing to the pages.
      expect(isSendStateMessage(back), english).toBe(isSendStateMessage(english));
    }
    expect(toEnglishApiMessage(translateApiMessage(recentMessage(12), "it"))).toBe(recentMessage(12));
    const flagged = highRiskMessage("destination token", ["honeypot"]);
    expect(toEnglishApiMessage(translateApiMessage(flagged, "it"))).toBe(flagged);
  });

  it("keeps the 'money may have moved' answers recognisable in Italian", () => {
    for (const english of [IN_FLIGHT_MESSAGE, UNKNOWN_OUTCOME_MESSAGE, RISK_DECLINED_MESSAGE, recentMessage(7)]) {
      const italian = translateApiMessage(english, "it");
      expect(italian).not.toBe(english);
      expect(isSendStateMessage(italian), italian).toBe(true);
      expect(userFacingError(italian, "fallback"), italian).toBe(italian);
    }
    expect(userFacingError(translateApiMessage("Quote failed", "it"), "fallback")).toBe("fallback");
  });
});

describe("localizeResponse", () => {
  const json = (body: unknown, status = 400) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "X-Test": "1" } });

  it("translates the message fields, at the top and in data, keeping status and headers", async () => {
    const res = await localizeResponse(
      json({ success: false, error: "Unknown range", code: "invalid_request", data: { message: "Swap failed", amount: "1" } }),
      "it"
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("X-Test")).toBe("1");
    expect(await res.json()).toEqual({ success: false, error: "Periodo sconosciuto", code: "invalid_request", data: { message: "Scambio non riuscito", amount: "1" } });
  });

  it("passes English, other content types and unknown words through untouched", async () => {
    const english = json({ error: "Unknown range" });
    expect(await localizeResponse(english, "en")).toBe(english);
    const text = new Response("Unknown range", { headers: { "Content-Type": "text/plain" } });
    expect(await localizeResponse(text, "it")).toBe(text);
    const unknown = json({ error: "nothing to translate" });
    expect(await localizeResponse(unknown, "it")).toBe(unknown);
  });
});

/** Every `error: "…"` literal and apiError fallback in the API routes. */
function routeMessages(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "route.ts") {
        const code = readFileSync(full, "utf8");
        for (const m of code.matchAll(/error: "([^"]{3,})"/g)) out.set(m[1], path.relative(ROOT, full));
        for (const m of code.matchAll(/apiError\(\s*"[^"]*",\s*\w+,\s*"([^"]+)"/g)) out.set(m[1], path.relative(ROOT, full));
      }
    }
  };
  walk(path.join(ROOT, "src/app/api"));
  return out;
}

/** Answers only a hand-made request can get: the app's pages never trigger them. */
const DEVELOPER_ONLY = new Set([
  "Address required",
  "Missing address parameter",
  "address and chain parameters are required",
  "chain parameter is required",
  "query parameter 'q' is required",
  "amount is required",
  "Invalid tokens format.",
  "Not found",
  "Cross-origin request rejected",
  "Bridge quote did not match the request",
]);

it("translates every message an API route can show to a person", () => {
  const missing = [...routeMessages()].filter(([message]) => !DEVELOPER_ONLY.has(message) && translateApiMessage(message, "it") === message);
  expect(missing).toEqual([]);
});
