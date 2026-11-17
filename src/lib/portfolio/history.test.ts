import { beforeEach, describe, expect, it } from "vitest";
import {
  DAY_MS,
  HOUR_MS,
  KEEP_DAYS,
  WRITE_EVERY_MS,
  bucketOf,
  downsample,
  historyKey,
  isHistoryRange,
  readHistory,
  recordValue,
  resetHistoryForTests,
  storeValue,
} from "./history";

// A fixed Wednesday 10:00 UTC, away from day and block edges.
const NOW = Date.UTC(2026, 10, 18, 10, 0, 0);

beforeEach(() => {
  delete process.env.DATABASE_URL; // memory store
  resetHistoryForTests();
});

describe("value history", () => {
  it("keys rows by a hash of the account, never the id itself", () => {
    const key = historyKey("8c1f2e0a-account");
    expect(key).toMatch(/^[0-9a-f]{40}$/);
    expect(key).not.toContain("8c1f2e0a");
    expect(historyKey("8c1f2e0a-account")).toBe(key);
    expect(historyKey("another")).not.toBe(key);
  });

  it("keeps one point per hour, the last reading winning, written at most every ten minutes", async () => {
    expect(await storeValue("acc", 100, {}, NOW + 1_000)).toBe(true);
    expect(await storeValue("acc", 101, {}, NOW + 2_000)).toBe(false); // throttled
    expect(await storeValue("acc", 105, {}, NOW + 1_000 + WRITE_EVERY_MS)).toBe(true);
    const { points } = await readHistory("acc", "1d", NOW + 30 * 60_000);
    expect(points).toEqual([{ t: bucketOf(NOW), usd: 105 }]);
  });

  it("starts a new hour at once, throttle or not", async () => {
    await storeValue("acc", 100, {}, NOW + HOUR_MS - 60_000);
    expect(await storeValue("acc", 90, {}, NOW + HOUR_MS + 60_000)).toBe(true);
    const { points } = await readHistory("acc", "1d", NOW + 2 * HOUR_MS);
    expect(points.map((p) => p.usd)).toEqual([100, 90]);
  });

  it("refuses totals that cannot be a wallet", async () => {
    for (const bad of [NaN, -1, Infinity, 1e12]) expect(await storeValue("acc", bad, {}, NOW)).toBe(false);
    expect(await storeValue("", 10, {}, NOW)).toBe(false);
    expect((await readHistory("acc", "all", NOW)).points).toEqual([]);
  });

  it("keeps accounts apart", async () => {
    await storeValue("a", 1, {}, NOW);
    await storeValue("b", 2, {}, NOW);
    expect((await readHistory("a", "1d", NOW)).points.map((p) => p.usd)).toEqual([1]);
    expect((await readHistory("b", "1d", NOW)).points.map((p) => p.usd)).toEqual([2]);
  });

  it("answers each range with its own window and spacing, and the first hour ever stored", async () => {
    // One reading per hour for 40 days, value = hours ago.
    const start = NOW - 40 * DAY_MS;
    for (let t = start; t <= NOW; t += HOUR_MS) await storeValue("acc", (NOW - t) / HOUR_MS, {}, t);

    const day = await readHistory("acc", "1d", NOW);
    expect(day.points.length).toBe(25);
    expect(day.points[0].t).toBe(NOW - DAY_MS);
    expect(day.since).toBe(start);

    const week = await readHistory("acc", "1w", NOW);
    expect(week.points.length).toBe(7 * 24 + 1);

    const month = await readHistory("acc", "1m", NOW);
    // Six-hour blocks, each showing its last hour.
    expect(month.points.length).toBeGreaterThanOrEqual(120);
    expect(month.points.length).toBeLessThanOrEqual(121);
    for (const p of month.points.slice(0, -1)) expect((p.t + HOUR_MS) % (6 * HOUR_MS)).toBe(0);
    expect(month.points.at(-1)!.t).toBe(NOW);

    const all = await readHistory("acc", "all", NOW);
    expect(all.points.length).toBe(41);
    expect(all.points.at(-1)).toEqual({ t: NOW, usd: 0 });
  });

  it("cuts days at the viewer's midnight, not at UTC's", async () => {
    // Rome in winter is UTC+1: 23:00 UTC is already the next day there.
    const day = Date.UTC(2026, 10, 16);
    await storeValue("acc", 1, {}, day + 20 * HOUR_MS); // 21:00 in Rome, Nov 16
    await storeValue("acc", 2, {}, day + 23 * HOUR_MS); // 00:00 in Rome, Nov 17
    await storeValue("acc", 3, {}, day + 30 * HOUR_MS); // 07:00 in Rome, Nov 17
    const utc = await readHistory("acc", "all", NOW, 0);
    expect(utc.points.map((p) => p.usd)).toEqual([2, 3]);
    const rome = await readHistory("acc", "all", NOW, 60);
    expect(rome.points.map((p) => p.usd)).toEqual([1, 3]);
    // Nonsense offsets fall back to UTC.
    expect((await readHistory("acc", "all", NOW, 99_999)).points.map((p) => p.usd)).toEqual([2, 3]);
    expect((await readHistory("acc", "all", NOW, 1.5)).points.map((p) => p.usd)).toEqual([2, 3]);
  });

  it("forgets readings older than the retention window", async () => {
    await storeValue("acc", 1, {}, NOW - (KEEP_DAYS + 1) * DAY_MS);
    await storeValue("acc", 2, {}, NOW);
    const { points, since } = await readHistory("acc", "all", NOW);
    expect(points.map((p) => p.usd)).toEqual([2]);
    expect(since).toBe(bucketOf(NOW));
  });

  it("has nothing for an account never seen", async () => {
    expect(await readHistory("nobody", "1w", NOW)).toEqual({ points: [], since: null });
  });

  it("never throws from the fire-and-forget entry point", () => {
    expect(() => recordValue("acc", NaN, {})).not.toThrow();
    expect(() => recordValue(undefined as unknown as string, 1, null as unknown as Record<string, number>)).not.toThrow();
  });

  it("downsamples to the last point of each block", () => {
    const points = [
      { t: 0, usd: 1 },
      { t: 5, usd: 2 },
      { t: 10, usd: 3 },
      { t: 19, usd: 4 },
    ];
    expect(downsample(points, 10)).toEqual([
      { t: 5, usd: 2 },
      { t: 19, usd: 4 },
    ]);
  });

  it("knows its ranges", () => {
    expect(["1d", "1w", "1m", "all"].every(isHistoryRange)).toBe(true);
    expect(isHistoryRange("1y")).toBe(false);
    expect(isHistoryRange("constructor")).toBe(false);
  });
});
