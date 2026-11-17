import { describe, expect, it, vi } from "vitest";
import { answerWalletPrompts, enterApprovalCodeIfAsked } from "./approval-code-retry";
import { confirmRiskIfAsked } from "./risk-retry";

const init = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const held = () => Response.json({ success: false, code: "approval_code", error: "OKX sent a code." }, { status: 428 });
const risky = () => Response.json({ success: false, code: "risk_confirmation", error: "Risky." }, { status: 428 });
const ok = () => Response.json({ success: true, data: { txHash: "0x1" } });
const wrong = () =>
  Response.json({ success: false, code: "approval_code_invalid", error: "That code is not right.", retryable: true }, { status: 400 });

function bodies(send: ReturnType<typeof vi.fn>) {
  return send.mock.calls.map(([to, i]) => [String(to), JSON.parse((i as RequestInit).body as string)]);
}

describe("enterApprovalCodeIfAsked", () => {
  it("re-sends the same request with the code", async () => {
    const send = vi.fn().mockResolvedValueOnce(ok());
    const ask = vi.fn().mockResolvedValue("123456");
    const res = await enterApprovalCodeIfAsked(held(), "/api/swap/approve", init({ token: "0xa" }), send, ask);
    expect(res.status).toBe(200);
    expect(ask).toHaveBeenCalledWith({ message: "OKX sent a code.", error: undefined });
    expect(bodies(send)).toEqual([["/api/swap/approve", { token: "0xa", approvalCode: "123456" }]]);
  });

  it("asks again, with the reason, after a wrong code", async () => {
    const send = vi.fn().mockResolvedValueOnce(wrong()).mockResolvedValueOnce(ok());
    const ask = vi.fn().mockResolvedValueOnce("111111").mockResolvedValueOnce("222222");
    const res = await enterApprovalCodeIfAsked(held(), "/api/earn/approve", init({}), send, ask);
    expect(res.status).toBe(200);
    expect(ask.mock.calls[1][0]).toEqual({ message: "OKX sent a code.", error: "That code is not right." });
  });

  it("drops the held approval on Cancel and tells the page nothing was sent", async () => {
    const send = vi.fn().mockResolvedValue(ok());
    const res = await enterApprovalCodeIfAsked(held(), "/api/swap/approve", init({}), send, async () => null);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "risk_declined", error: "Cancelled. Nothing was sent." });
    expect(bodies(send)).toEqual([["/api/wallet/approval-code", { action: "cancel" }]]);
  });

  it("leaves other answers alone", async () => {
    const send = vi.fn();
    const res = risky();
    expect(await enterApprovalCodeIfAsked(res, "/x", init({}), send, vi.fn())).toBe(res);
    const get = held();
    expect(await enterApprovalCodeIfAsked(get, "/x", { method: "GET" }, send, vi.fn())).toBe(get);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("answerWalletPrompts", () => {
  it("handles a code on the approval, then a warning on the bridge, without re-checking the code", async () => {
    const send = vi.fn().mockResolvedValueOnce(risky()).mockResolvedValueOnce(ok());
    const res = await answerWalletPrompts(
      held(),
      "/api/bridge/execute",
      init({ quoteId: "q" }),
      send,
      (r, i, ri, s) => confirmRiskIfAsked(r, i, ri, s, async () => true),
      async () => "123456"
    );
    expect(res.status).toBe(200);
    expect(bodies(send)).toEqual([
      ["/api/bridge/execute", { quoteId: "q", approvalCode: "123456" }],
      ["/api/bridge/execute", { quoteId: "q", acknowledgeRisk: true }],
    ]);
  });

  it("handles a warning first, then a code, keeping the consent", async () => {
    const send = vi.fn().mockResolvedValueOnce(held()).mockResolvedValueOnce(ok());
    const res = await answerWalletPrompts(
      risky(),
      "/api/security/revoke",
      init({ tokenAddress: "0xa" }),
      send,
      (r, i, ri, s) => confirmRiskIfAsked(r, i, ri, s, async () => true),
      async () => "654321"
    );
    expect(res.status).toBe(200);
    expect(bodies(send)).toEqual([
      ["/api/security/revoke", { tokenAddress: "0xa", acknowledgeRisk: true }],
      ["/api/security/revoke", { tokenAddress: "0xa", acknowledgeRisk: true, approvalCode: "654321" }],
    ]);
  });
});
