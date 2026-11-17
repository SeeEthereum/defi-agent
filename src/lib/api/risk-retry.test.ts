import { describe, expect, it, vi } from "vitest";
import { confirmRiskIfAsked } from "./risk-retry";

const RISK = Response.json(
  { success: false, code: "risk_confirmation", error: "Possible significant loss" },
  { status: 428 }
);
const POST = { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"amount":"1"}' };

function ok(): Response {
  return Response.json({ success: true, data: { txHash: "0x1" } });
}

describe("confirmRiskIfAsked", () => {
  it("shows the wallet's words and re-sends with acknowledgeRisk when accepted", async () => {
    const send = vi.fn(async () => ok());
    const ask = vi.fn(async () => true);
    const res = await confirmRiskIfAsked(RISK.clone(), "/api/wallet/send", POST, send, ask);

    expect(ask).toHaveBeenCalledWith("Possible significant loss");
    expect(send).toHaveBeenCalledWith("/api/wallet/send", {
      ...POST,
      body: JSON.stringify({ amount: "1", acknowledgeRisk: true }),
    });
    expect(await res.json()).toMatchObject({ success: true });
  });

  it("sends nothing and answers Cancelled when declined", async () => {
    const send = vi.fn(async () => ok());
    const res = await confirmRiskIfAsked(RISK.clone(), "/api/wallet/send", POST, send, async () => false);

    expect(send).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({
      success: false,
      code: "risk_declined",
      error: "Cancelled. Nothing was sent.",
    });
  });

  it("leaves every other response alone", async () => {
    const send = vi.fn(async () => ok());
    const ask = vi.fn(async () => true);
    const plain = Response.json({ success: false, error: "x" }, { status: 400 });
    const otherCode = Response.json({ code: "something_else" }, { status: 428 });

    expect(await confirmRiskIfAsked(plain, "/a", POST, send, ask)).toBe(plain);
    expect(await confirmRiskIfAsked(otherCode, "/a", POST, send, ask)).toBe(otherCode);
    const get = RISK.clone();
    expect(await confirmRiskIfAsked(get, "/a", { method: "GET" }, send, ask)).toBe(get);
    const form = RISK.clone();
    expect(await confirmRiskIfAsked(form, "/a", { method: "POST", body: new FormData() }, send, ask)).toBe(form);
    expect(ask).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
