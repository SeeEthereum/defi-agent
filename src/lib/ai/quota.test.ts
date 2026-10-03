import { describe, it, expect, beforeEach } from "vitest";
import { AI_DAILY_LIMIT, AI_WINDOW_MS, consumeQuestion, decide, readQuota, refundQuestion, resetQuotaMemoryForTests } from "./quota";

describe("assistant allowance (memory store, no DATABASE_URL)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetQuotaMemoryForTests();
  });

  it("allows exactly 20 questions, then refuses with a real reset time", async () => {
    const t0 = Date.UTC(2026, 9, 3, 10, 0, 0);
    for (let i = 1; i <= AI_DAILY_LIMIT; i++) {
      const r = await consumeQuestion("u:a", t0 + i * 1000);
      expect(r.ok).toBe(true);
      expect(r.remaining).toBe(AI_DAILY_LIMIT - i);
    }
    const refused = await consumeQuestion("u:a", t0 + 60_000);
    expect(refused.ok).toBe(false);
    expect(refused.remaining).toBe(0);
    // the window opened with the first question
    expect(refused.resetAt).toBe(new Date(t0 + 1000 + AI_WINDOW_MS).toISOString());
  });

  it("refills 24 hours after the first question, not at midnight", async () => {
    const t0 = Date.UTC(2026, 9, 3, 23, 30, 0);
    for (let i = 0; i < AI_DAILY_LIMIT; i++) await consumeQuestion("u:b", t0);
    expect((await consumeQuestion("u:b", Date.UTC(2026, 9, 4, 0, 30, 0))).ok).toBe(false);
    const after = await consumeQuestion("u:b", t0 + AI_WINDOW_MS);
    expect(after.ok).toBe(true);
    expect(after.used).toBe(1);
  });

  it("refunds a question that failed on our side", async () => {
    const now = Date.now();
    await consumeQuestion("u:c", now);
    await consumeQuestion("u:c", now);
    await refundQuestion("u:c");
    expect((await readQuota("u:c", now)).used).toBe(1);
  });

  it("keeps people apart", async () => {
    await consumeQuestion("u:d");
    expect((await readQuota("u:e")).used).toBe(0);
  });

  it("decide never lets the count pass the limit", () => {
    const row = { windowStart: 0, used: AI_DAILY_LIMIT };
    expect(decide(row, 1000).ok).toBe(false);
    expect(decide(row, AI_WINDOW_MS).next.used).toBe(1);
  });
});
