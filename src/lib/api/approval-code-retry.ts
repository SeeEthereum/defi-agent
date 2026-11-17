import { APPROVAL_CODE_CODE, RISK_DECLINED_MESSAGE } from "./send-state";

/**
 * Client half of approval verification (server half: lib/okx/approval-code).
 *
 * A route whose token approval OKX is holding for an email code answers 428
 * `approval_code` and sends nothing. This asks the user for the code and
 * sends the same POST again with `approvalCode`; the route then lets OKX
 * send the held approval and carries on. A wrong or expired code asks
 * again, with the reason; Cancel drops the held approval and gives the page
 * a "Cancelled. Nothing was sent." answer. Only a JSON object body can be
 * re-sent (every page that moves funds sends one).
 */

/** What the dialog returns: the code, or null when the user cancelled. */
export type AskApprovalCode = (prompt: { message: string; error?: string }) => Promise<string | null>;

const MAX_ATTEMPTS = 5;

async function codeOf(res: Response): Promise<{ code?: unknown; error?: unknown; retryable?: unknown } | null> {
  return (await res
    .clone()
    .json()
    .catch(() => null)) as { code?: unknown; error?: unknown; retryable?: unknown } | null;
}

export async function enterApprovalCodeIfAsked(
  res: Response,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  send: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  ask: AskApprovalCode
): Promise<Response> {
  if (res.status !== 428 || (init?.method ?? "GET").toUpperCase() !== "POST") return res;
  if (typeof init?.body !== "string") return res;
  const data = await codeOf(res);
  if (data?.code !== APPROVAL_CODE_CODE) return res;

  let body: unknown;
  try {
    body = JSON.parse(init.body);
  } catch {
    return res;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return res;

  const message = typeof data.error === "string" ? data.error : "";
  let error: string | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = await ask({ message, error });
    if (code === null) {
      await dropHeldApproval(send);
      return Response.json({ success: false, code: "risk_declined", error: RISK_DECLINED_MESSAGE }, { status: 400 });
    }
    const retry = await send(input, { ...init, body: JSON.stringify({ ...body, approvalCode: code }) });
    const answer = retry.status === 400 ? await codeOf(retry) : null;
    if (answer?.retryable === true && typeof answer.error === "string") {
      error = answer.error; // wrong or expired code: ask again, same held approval
      continue;
    }
    return retry;
  }
  await dropHeldApproval(send);
  return Response.json(
    { success: false, code: "risk_declined", error: "Too many attempts. Nothing was sent. Start again." },
    { status: 400 }
  );
}

/** Tell OKX to drop the held approval (best effort: it expires on its own). */
async function dropHeldApproval(send: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  await send("/api/wallet/approval-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "cancel" }),
  }).catch(() => undefined);
}

type Send = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** The same request without `approvalCode`: once a held approval was sent, it must not be checked again. */
function withoutApprovalCode(init: RequestInit | undefined): RequestInit | undefined {
  if (typeof init?.body !== "string") return init;
  try {
    const body = JSON.parse(init.body);
    if (!body || typeof body !== "object" || Array.isArray(body) || !("approvalCode" in body)) return init;
    const { approvalCode: _sent, ...rest } = body as Record<string, unknown>;
    void _sent;
    return { ...init, body: JSON.stringify(rest) };
  } catch {
    return init;
  }
}

/**
 * Answer every wallet prompt a request runs into, in the order they come:
 * the risk warning (lib/api/risk-retry) and the approval code. A bridge,
 * say, can hit the code on its approval and then a warning on the bridge
 * itself; each re-send keeps what the user already answered.
 */
export async function answerWalletPrompts(
  res: Response,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  send: Send,
  confirmRisk: (res: Response, input: RequestInfo | URL, init: RequestInit | undefined, send: Send) => Promise<Response>,
  askCode: AskApprovalCode
): Promise<Response> {
  let lastInit = init;
  const tracked: Send = (to, toInit) => {
    if (to === input) lastInit = toInit;
    return send(to, toInit);
  };
  let current = res;
  for (let round = 0; round < 4 && current.status === 428; round++) {
    const before = current;
    current = await confirmRisk(current, input, withoutApprovalCode(lastInit), tracked);
    current = await enterApprovalCodeIfAsked(current, input, lastInit, tracked, askCode);
    if (current === before) break;
  }
  return current;
}
