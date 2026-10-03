/**
 * Integration test against a real Postgres (Neon). Skipped unless
 * RUN_DB_TESTS=1 and DATABASE_URL are set, so `npm test` stays offline.
 *
 *   DATABASE_URL="$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-)" RUN_DB_TESTS=1 npx vitest run src/lib/ai/quota.db.test.ts
 */
import { describe, it, expect, afterAll } from "vitest";
import { AI_DAILY_LIMIT, consumeQuestion, readQuota, refundQuestion } from "./quota";
import { db, ensureSchema } from "@/lib/db/client";

const enabled = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
const owner = `test:${Date.now()}:${Math.random().toString(36).slice(2)}`;

describe.skipIf(!enabled)("assistant allowance on Postgres", () => {
  afterAll(async () => {
    const q = db();
    if (q) await q`DELETE FROM ai_quota WHERE owner = ${owner}`;
  });

  it("never lets parallel requests pass the limit", async () => {
    await ensureSchema();
    const results = await Promise.all(Array.from({ length: AI_DAILY_LIMIT + 7 }, () => consumeQuestion(owner)));
    expect(results.filter((r) => r.ok)).toHaveLength(AI_DAILY_LIMIT);
    expect(results.filter((r) => !r.ok)).toHaveLength(7);
    const state = await readQuota(owner);
    expect(state.used).toBe(AI_DAILY_LIMIT);
    expect(state.remaining).toBe(0);
    expect(state.resetAt).not.toBeNull();
  }, 60_000);

  it("refunds one and lets exactly one more through", async () => {
    await refundQuestion(owner);
    expect((await consumeQuestion(owner)).ok).toBe(true);
    expect((await consumeQuestion(owner)).ok).toBe(false);
  }, 30_000);
});
