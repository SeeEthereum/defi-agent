import { describe, expect, it } from "vitest";
import {
  MIN_SPAN_SHARE,
  change,
  formatTick,
  nearestIndex,
  niceStep,
  segments,
  seriesWithNow,
  timeTicks,
  valueDomain,
  valueTicks,
} from "./chart";

const H = 3_600_000;

describe("value chart geometry", () => {
  it("adds the reading of now after the stored points, once", () => {
    const stored = [
      { t: 2 * H, usd: 2 },
      { t: 1 * H, usd: 1 },
    ];
    expect(seriesWithNow(stored, { t: 3 * H, usd: 3 }).map((p) => p.usd)).toEqual([1, 2, 3]);
    // A "now" not after the last reading is not added a second time.
    expect(seriesWithNow(stored, { t: 2 * H, usd: 9 }).map((p) => p.usd)).toEqual([1, 2]);
    expect(seriesWithNow([], null)).toEqual([]);
    expect(seriesWithNow([{ t: 0, usd: NaN }], { t: H, usd: 1 })).toEqual([{ t: H, usd: 1 }]);
  });

  it("marks stretches without readings as gaps, per range", () => {
    const series = [
      { t: 0, usd: 1 },
      { t: 1 * H, usd: 1 },
      { t: 9 * H, usd: 2 }, // eight hours away
    ];
    expect(segments(series, "1d").map((s) => s.gap)).toEqual([false, true]);
    // Six-hour points a month long: eight hours is no gap there.
    expect(segments(series, "1m").map((s) => s.gap)).toEqual([false, false]);
    expect(segments([{ t: 0, usd: 1 }], "1d")).toEqual([]);
  });

  it("never zooms a flat line into a cliff", () => {
    const [lo, hi] = valueDomain([
      { t: 0, usd: 1000 },
      { t: H, usd: 1000.4 },
    ]);
    // 40 cents on $1,000 spans at most a small part of the axis.
    expect(hi - lo).toBeGreaterThanOrEqual(1000 * MIN_SPAN_SHARE);
    expect(lo).toBeLessThan(1000);
    expect(hi).toBeGreaterThan(1000.4);
  });

  it("does not put the axis below zero", () => {
    const [lo] = valueDomain([
      { t: 0, usd: 0 },
      { t: H, usd: 50 },
    ]);
    expect(lo).toBe(0);
    expect(valueDomain([])).toEqual([0, 1]);
  });

  it("picks round steps and ticks inside the window", () => {
    expect(niceStep(100, 3)).toBe(50);
    expect(niceStep(0.012, 3)).toBe(0.005);
    expect(niceStep(7, 3)).toBe(2.5);
    const { ticks, step } = valueTicks([980, 1045], 3);
    expect(step).toBe(25);
    expect(ticks).toEqual([1000, 1025]);
    for (const t of valueTicks([0.054, 0.066], 3).ticks) expect(t).toBeGreaterThanOrEqual(0.054);
  });

  it("labels ticks with the decimals their step needs, so neighbours never read the same", () => {
    const { ticks, step } = valueTicks([0.0551, 0.0669], 3);
    const labels = ticks.map((t) => formatTick(t, step));
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain("$0.060");
    expect(formatTick(1200, 100)).toBe("$1,200");
    expect(formatTick(12500, 2500)).toBe("$12.5K");
    expect(formatTick(20000, 10000)).toBe("$20K");
    expect(formatTick(0, 10000)).toBe("$0");
    expect(formatTick(1.5, 0.5)).toBe("$1.5");
  });

  it("measures the change from the first point to the last", () => {
    expect(change([{ t: 0, usd: 100 }])).toBeNull();
    expect(
      change([
        { t: 0, usd: 100 },
        { t: H, usd: 90 },
      ])
    ).toEqual({ usd: -10, percent: -10 });
    expect(
      change([
        { t: 0, usd: 0 },
        { t: H, usd: 5 },
      ])
    ).toEqual({ usd: 5, percent: null });
  });

  it("finds the reading nearest to a time", () => {
    const series = [0, 10, 20, 30].map((t) => ({ t, usd: t }));
    expect(nearestIndex(series, -5)).toBe(0);
    expect(nearestIndex(series, 14)).toBe(1);
    expect(nearestIndex(series, 16)).toBe(2);
    expect(nearestIndex(series, 99)).toBe(3);
    expect(nearestIndex([], 5)).toBe(-1);
  });

  it("puts time ticks on whole local hours, days or months, within the window and the limit", () => {
    const from = new Date(2026, 10, 17, 9, 37).getTime();
    const day = timeTicks(from, from + 24 * H, 6);
    expect(day.unit).toBe("hour");
    expect(day.ticks.length).toBeLessThanOrEqual(6);
    for (const t of day.ticks) {
      expect(t).toBeGreaterThanOrEqual(from);
      expect(new Date(t).getMinutes()).toBe(0);
      expect(new Date(t).getHours() % 6).toBe(0);
    }

    const week = timeTicks(from, from + 7 * 24 * H, 7);
    expect(week.unit).toBe("day");
    for (const t of week.ticks) expect(new Date(t).getHours()).toBe(0);
    // A week on a phone (room for three labels) still gets three, not one.
    expect(timeTicks(from, from + 7 * 24 * H, 3).ticks.length).toBeGreaterThanOrEqual(2);

    const year = timeTicks(from, from + 300 * 24 * H, 5);
    expect(year.unit).toBe("month");
    expect(year.ticks.length).toBeLessThanOrEqual(5);
    for (const t of year.ticks) expect(new Date(t).getDate()).toBe(1);

    expect(timeTicks(from, from, 5).ticks).toEqual([]);
  });
});
