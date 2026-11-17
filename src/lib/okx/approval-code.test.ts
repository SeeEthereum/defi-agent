import { beforeEach, describe, expect, it, vi } from "vitest";

const verify = vi.hoisted(() => vi.fn());
const waitForTransactionReceipt = vi.hoisted(() => vi.fn());

vi.mock("./cli", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./cli")>()),
  walletApprovalCodeVerify: verify,
}));
vi.mock("@/lib/fluid/client", () => ({ getPublicClient: () => ({ waitForTransactionReceipt }) }));

const { approvalCode, releasePausedApproval } = await import("./approval-code");
const HASH = "0x" + "ab".repeat(32);

beforeEach(() => {
  verify.mockReset();
  waitForTransactionReceipt.mockReset();
});

describe("releasePausedApproval", () => {
  it("checks the code, then waits until the approval is mined", async () => {
    verify.mockResolvedValue({ ok: true, data: { operation: "broadcast", txHash: HASH }, raw: "" });
    waitForTransactionReceipt.mockResolvedValue({ status: "success" });
    await expect(releasePausedApproval("123456", 1)).resolves.toBe(HASH);
    expect(verify).toHaveBeenCalledWith("123456");
    expect(waitForTransactionReceipt).toHaveBeenCalledWith(expect.objectContaining({ hash: HASH }));
  });

  it("says so when the approval failed on chain", async () => {
    verify.mockResolvedValue({ ok: true, data: { txHash: HASH }, raw: "" });
    waitForTransactionReceipt.mockResolvedValue({ status: "reverted" });
    await expect(releasePausedApproval("123456", 1)).rejects.toThrow(/failed on chain/);
  });

  it("says it is still confirming when the receipt does not come in time", async () => {
    verify.mockResolvedValue({ ok: true, data: { txHash: HASH }, raw: "" });
    waitForTransactionReceipt.mockRejectedValue(new Error("timed out"));
    await expect(releasePausedApproval("123456", 1)).rejects.toThrow(/still confirming.*start again/);
  });

  it("lets a wrong code through as the CLI's error", async () => {
    verify.mockRejectedValue(new Error("approval_code_invalid"));
    await expect(releasePausedApproval("000000", 1)).rejects.toThrow("approval_code_invalid");
    expect(waitForTransactionReceipt).not.toHaveBeenCalled();
  });
});

describe("approvalCode field", () => {
  it("takes exactly 6 digits", () => {
    expect(approvalCode.safeParse("123456").success).toBe(true);
    expect(approvalCode.safeParse(undefined).success).toBe(true);
    expect(approvalCode.safeParse("12345").success).toBe(false);
    expect(approvalCode.safeParse("12345a").success).toBe(false);
    expect(approvalCode.safeParse("--force").success).toBe(false);
  });
});
