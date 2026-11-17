import { RISK_CONFIRMATION_CODE, RISK_DECLINED_MESSAGE } from "./send-state";

/**
 * Client half of the wallet's risk prompts (server half: lib/okx/risk-confirmation).
 *
 * A route that would sign a flagged transaction answers 428
 * `risk_confirmation` with the backend's message and signs nothing. This
 * asks the user; if they accept, the same POST goes out again with
 * `acknowledgeRisk: true`; if not, the page gets a "Cancelled" answer.
 * Only a JSON object body can be re-sent (every page that moves funds sends
 * one); anything else gets the 428 back unchanged.
 */
export async function confirmRiskIfAsked(
  res: Response,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  send: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  ask: (message: string) => Promise<boolean>
): Promise<Response> {
  if (res.status !== 428 || (init?.method ?? "GET").toUpperCase() !== "POST") return res;
  if (typeof init?.body !== "string") return res;
  const data = (await res
    .clone()
    .json()
    .catch(() => null)) as { code?: unknown; error?: unknown } | null;
  if (data?.code !== RISK_CONFIRMATION_CODE) return res;

  let body: unknown;
  try {
    body = JSON.parse(init.body);
  } catch {
    return res;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return res;

  const accepted = await ask(typeof data.error === "string" ? data.error : "");
  if (!accepted) {
    return Response.json(
      { success: false, code: "risk_declined", error: RISK_DECLINED_MESSAGE },
      { status: 400 }
    );
  }
  return send(input, { ...init, body: JSON.stringify({ ...body, acknowledgeRisk: true }) });
}
