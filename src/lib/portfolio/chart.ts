/**
 * Geometry for the value chart: what to draw, where, and how to label it.
 * Pure functions, so the chart's honesty rules are tested without a DOM:
 *
 * - Readings are only where the app was used. A stretch with no readings
 *   is drawn as a dotted connector, never as if values had been measured.
 * - The value axis does not start at zero (a wallet's line would be flat),
 *   but it never zooms in below MIN_SPAN_SHARE of the value: otherwise a
 *   few cents of price noise on $1,000 would look like a crash.
 */

import type { Locale } from "@/i18n/config";
import type { HistoryRange, ValuePoint } from "./history";

/** Below this share of the value, the axis stops zooming in. */
export const MIN_SPAN_SHARE = 0.02;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Longer than this between two readings is "no readings", per range. */
export const GAP_MS: Record<HistoryRange, number> = {
  "1d": 3 * HOUR_MS,
  "1w": 3 * HOUR_MS,
  "1m": 18 * HOUR_MS,
  all: 3 * DAY_MS,
};

export interface Segment {
  from: ValuePoint;
  to: ValuePoint;
  /** No readings in between. */
  gap: boolean;
}

/** Stored points plus the reading of right now, in time order, without duplicates. */
export function seriesWithNow(points: ValuePoint[], current: ValuePoint | null): ValuePoint[] {
  const series = points.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.usd)).sort((a, b) => a.t - b.t);
  if (current && Number.isFinite(current.usd) && (series.length === 0 || current.t > series[series.length - 1].t)) {
    series.push(current);
  }
  return series;
}

export function segments(series: ValuePoint[], range: HistoryRange): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i < series.length; i++) {
    const from = series[i - 1];
    const to = series[i];
    out.push({ from, to, gap: to.t - from.t > GAP_MS[range] });
  }
  return out;
}

/** The value window: padded, never below zero, never narrower than MIN_SPAN_SHARE. */
export function valueDomain(series: ValuePoint[]): [number, number] {
  if (series.length === 0) return [0, 1];
  let lo = Math.min(...series.map((p) => p.usd));
  let hi = Math.max(...series.map((p) => p.usd));
  const minSpan = Math.max(Math.abs(hi) * MIN_SPAN_SHARE, 0.01);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const pad = (hi - lo) * 0.12;
  lo = Math.max(0, lo - pad);
  hi = hi + pad;
  return [lo, hi];
}

/** A round step near span / count: 1, 2, 2.5 or 5 times a power of ten. */
export function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10;
  return Number((nice * power).toPrecision(12));
}

/** Round values inside [lo, hi] for gridlines, about `count` of them. */
export function valueTicks([lo, hi]: [number, number], count = 3): { ticks: number[]; step: number } {
  const step = niceStep(hi - lo, count);
  const ticks: number[] = [];
  for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + step * 1e-9; i++) ticks.push(Number((i * step).toPrecision(12)));
  return { ticks, step };
}

/** Decimals needed to write `step` exactly, at most four (0.005 → 3, 2.5 → 1, 50 → 0). */
function decimalsOf(step: number): number {
  const text = Number(step.toPrecision(12)).toString();
  if (text.includes("e-")) return 4;
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : Math.min(4, text.length - dot - 1);
}

/**
 * A tick label with as many decimals as the step needs, and no more:
 * "$1,200", "$12.5K", "$0.055". Ticks a cent apart must not all read "$0.06".
 */
export function formatTick(value: number, step: number, locale: Locale = "en"): string {
  const write = (n: number, decimals: number, suffix = "") => {
    const digits = n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    // Italian: "1.200 $", "12,5K $" (lib/format writes money the same way).
    return locale === "it" ? `${digits.replace(/[.,]/g, (c) => (c === "." ? "," : "."))}${suffix} $` : `$${digits}${suffix}`;
  };
  if (step >= 1000 && Math.abs(value) >= 1000) return write(value / 1000, decimalsOf(step / 1000), "K");
  return write(value, decimalsOf(step));
}

/** Change from the first point to the last. `percent` is null from zero. */
export function change(series: ValuePoint[]): { usd: number; percent: number | null } | null {
  if (series.length < 2) return null;
  const first = series[0].usd;
  const last = series[series.length - 1].usd;
  return { usd: last - first, percent: first > 0 ? ((last - first) / first) * 100 : null };
}

/** Index of the point whose time is closest to `t` (series in time order). */
export function nearestIndex(series: ValuePoint[], t: number): number {
  if (series.length === 0) return -1;
  let lo = 0;
  let hi = series.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t < t) lo = mid;
    else hi = mid;
  }
  return Math.abs(series[lo].t - t) <= Math.abs(series[hi].t - t) ? lo : hi;
}

/**
 * Times for the time axis, in local time: whole hours, days or months
 * inside [from, to], at most `max` of them. Steps are counted on the
 * calendar, not in milliseconds, so a daylight-saving change does not
 * shift the labels to 01:00.
 */
export function timeTicks(from: number, to: number, max: number): { ticks: number[]; unit: "hour" | "day" | "month" } {
  const span = to - from;
  if (!(span > 0) || max < 1) return { ticks: [], unit: "day" };
  const start = new Date(from);
  const ticks: number[] = [];

  const hours = [1, 2, 3, 6, 12].find((h) => span / (h * HOUR_MS) <= max);
  if (hours !== undefined) {
    for (let h = 0; ; h += hours) {
      const t = new Date(start.getFullYear(), start.getMonth(), start.getDate(), h).getTime();
      if (t > to) break;
      if (t >= from) ticks.push(t);
    }
    return { ticks, unit: "hour" };
  }
  // 3 and 4 days: a week on a phone gets three labels, not one.
  const days = [1, 2, 3, 4, 7, 14].find((d) => span / (d * DAY_MS) <= max);
  if (days !== undefined) {
    for (let d = 0; ; d += days) {
      const t = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d).getTime();
      if (t > to) break;
      if (t >= from) ticks.push(t);
    }
    return { ticks, unit: "day" };
  }
  const months = [1, 2, 3, 6, 12].find((m) => span / (m * 30 * DAY_MS) <= max) ?? 24;
  for (let m = 1; ; m += months) {
    const t = new Date(start.getFullYear(), start.getMonth() + m, 1).getTime();
    if (t > to) break;
    ticks.push(t);
  }
  return { ticks, unit: "month" };
}
