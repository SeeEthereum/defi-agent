"use client";

/**
 * The dashboard's "Value over time": the total of the six supported chains,
 * from the readings the server stores (lib/portfolio/history) plus the
 * total right now.
 *
 * One series, so no legend: the panel title names it. The line is the
 * brand colour; text stays in text colours. Stretches with no readings are
 * dotted. A crosshair and readout follow the pointer, the arrow keys do the
 * same from the keyboard, and every value is also in the table view.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import useSWR from "swr";
import { Empty, Panel, Segmented, Skeleton } from "@/components/premium";
import { formatPercent, formatUsd } from "@/lib/format";
import type { HistoryRange, ValuePoint } from "@/lib/portfolio/history";
import {
  change,
  formatTick,
  nearestIndex,
  segments,
  seriesWithNow,
  timeTicks,
  valueDomain,
  valueTicks,
} from "@/lib/portfolio/chart";

const LOCALE = "en-US";
const PLOT_H = 180;
const AXIS_H = 26;
const PAD_TOP = 10;
const PAD_RIGHT = 10;

const RANGE_OPTIONS: Array<{ value: HistoryRange; label: string }> = [
  { value: "1d", label: "1D" },
  { value: "1w", label: "1W" },
  { value: "1m", label: "1M" },
  { value: "all", label: "All" },
];

interface HistoryData {
  range: HistoryRange;
  points: ValuePoint[];
  since: number | null;
  current: ValuePoint;
}

async function fetchHistory(url: string): Promise<HistoryData> {
  const res = await fetch(url);
  const body = (await res.json().catch(() => null)) as { success?: boolean; data?: HistoryData; error?: string } | null;
  if (!res.ok || !body?.success || !body.data) throw new Error(body?.error ?? "Could not load your value history.");
  return body.data;
}

const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayFormat = new Intl.DateTimeFormat(LOCALE, { month: "short", day: "numeric" });
const monthFormat = new Intl.DateTimeFormat(LOCALE, { month: "short" });
const monthYearFormat = new Intl.DateTimeFormat(LOCALE, { month: "short", year: "numeric" });
const fullFormat = new Intl.DateTimeFormat(LOCALE, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dateFormat = new Intl.DateTimeFormat(LOCALE, { month: "short", day: "numeric", year: "numeric" });

/** When a reading was taken, as precise as its range: hours, or days for "All". */
function readingTime(p: ValuePoint, isNow: boolean, range: HistoryRange): string {
  if (isNow) return "Now";
  return range === "all" ? dateFormat.format(p.t) : fullFormat.format(p.t);
}

function axisLabel(t: number, unit: "hour" | "day" | "month"): string {
  if (unit === "hour") return timeFormat.format(t);
  if (unit === "day") return dayFormat.format(t);
  return new Date(t).getMonth() === 0 ? monthYearFormat.format(t) : monthFormat.format(t);
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setWidth(Math.round(entries[0].contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function Plot({ series, range, nowT }: { series: ValuePoint[]; range: HistoryRange; nowT: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const domain = valueDomain(series);
  const { ticks: yTicks, step } = valueTicks(domain, 3);
  const yLabels = yTicks.map((v) => formatTick(v, step, LOCALE));
  const gutter = Math.max(...yLabels.map((l) => l.length), 3) * 6.6 + 10;

  const t0 = series[0].t;
  const last = series[series.length - 1];
  const t1 = last.t;
  const x = (t: number) => gutter + ((t - t0) / Math.max(1, t1 - t0)) * Math.max(1, width - gutter - PAD_RIGHT);
  const y = (v: number) => PAD_TOP + (1 - (v - domain[0]) / (domain[1] - domain[0])) * (PLOT_H - PAD_TOP);

  const parts = segments(series, range);
  // Solid runs between gaps: one line path (and one area) per run.
  const runs: ValuePoint[][] = [];
  let run: ValuePoint[] = [series[0]];
  for (const s of parts) {
    if (s.gap) {
      runs.push(run);
      run = [s.to];
    } else run.push(s.to);
  }
  runs.push(run);

  const line = (pts: ValuePoint[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.usd).toFixed(1)}`).join("");
  // One wash under the whole series, gaps included: cut per run, short runs
  // turned into bars. The dotted line on top still says "no readings".
  const area = `${line(series)}L${x(last.t).toFixed(1)},${PLOT_H}L${x(t0).toFixed(1)},${PLOT_H}Z`;

  // About one date label per 64px: "Nov 17" is ~45px wide.
  const { ticks: xTicks, unit } = timeTicks(t0, t1, Math.max(2, Math.floor((width - gutter - PAD_RIGHT) / 64)));
  const point = active !== null ? series[active] : null;
  const readout = point ? `${formatUsd(point.usd)}, ${readingTime(point, point.t === nowT, range)}` : "";

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    const t = t0 + ((px - gutter) / Math.max(1, width - gutter - PAD_RIGHT)) * (t1 - t0);
    setActive(nearestIndex(series, t));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const lastIndex = series.length - 1;
    const keys: Record<string, number> = {
      ArrowLeft: Math.max(0, (active ?? lastIndex + 1) - 1),
      ArrowRight: Math.min(lastIndex, (active ?? -1) + 1),
      Home: 0,
      End: lastIndex,
    };
    if (e.key in keys) {
      e.preventDefault();
      setActive(keys[e.key]);
    } else if (e.key === "Escape") setActive(null);
  };

  const first = series[0];
  const summary = `Value from ${readingTime(first, false, range)}: ${formatUsd(first.usd)}, now ${formatUsd(last.usd)}.`;

  return (
    <div
      ref={ref}
      className="vchart"
      tabIndex={0}
      role="group"
      aria-label={`${summary} Use the left and right arrow keys to read each point.`}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
    >
      {width > 0 ? (
        <svg
          width={width}
          height={PLOT_H + AXIS_H}
          role="img"
          aria-label={summary}
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={() => setActive(null)}
        >
          {yTicks.map((v, i) => (
            <g key={v}>
              <line x1={gutter} x2={width - PAD_RIGHT} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} shapeRendering="crispEdges" />
              <text x={gutter - 8} y={y(v)} dy="0.32em" textAnchor="end" className="vchart-tick">
                {yLabels[i]}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={PLOT_H + 18} textAnchor="middle" className="vchart-tick">
              {axisLabel(t, unit)}
            </text>
          ))}

          <path d={area} fill="var(--brand)" fillOpacity={0.08} stroke="none" />
          {/* The axis line the wash rests on. */}
          <line x1={gutter} x2={width - PAD_RIGHT} y1={PLOT_H} y2={PLOT_H} stroke="var(--border)" strokeWidth={1} shapeRendering="crispEdges" />
          {parts
            .filter((s) => s.gap)
            .map((s, i) => (
              <line
                key={`g${i}`}
                x1={x(s.from.t)}
                y1={y(s.from.usd)}
                x2={x(s.to.t)}
                y2={y(s.to.usd)}
                stroke="var(--muted-foreground)"
                strokeOpacity={0.7}
                strokeWidth={1.5}
                strokeDasharray="1 4"
                strokeLinecap="round"
              />
            ))}
          {runs.map((pts, i) =>
            pts.length > 1 ? (
              <path key={`l${i}`} d={line(pts)} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ) : (
              // A lone reading between two gaps: a small dot, so it is not lost.
              <circle key={`l${i}`} cx={x(pts[0].t)} cy={y(pts[0].usd)} r={2.5} fill="var(--brand)" />
            )
          )}

          <circle cx={x(last.t)} cy={y(last.usd)} r={4} fill="var(--brand)" stroke="var(--card)" strokeWidth={2} />

          {point && (
            <g pointerEvents="none">
              <line x1={x(point.t)} x2={x(point.t)} y1={PAD_TOP / 2} y2={PLOT_H} stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeWidth={1} />
              <circle cx={x(point.t)} cy={y(point.usd)} r={4.5} fill="var(--brand)" stroke="var(--card)" strokeWidth={2} />
            </g>
          )}
        </svg>
      ) : (
        <div style={{ height: PLOT_H + AXIS_H }} />
      )}

      {point && width > 0 && (
        <div
          className="vchart-tip"
          aria-hidden="true"
          style={{ left: Math.min(Math.max(x(point.t), 70), width - 70) }}
        >
          <strong className="num">{formatUsd(point.usd)}</strong>
          <span>{readingTime(point, point.t === nowT, range)}</span>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {readout}
      </p>
    </div>
  );
}

function TableView({ series, range, nowT }: { series: ValuePoint[]; range: HistoryRange; nowT: number }) {
  return (
    <details className="vchart-table">
      <summary>Show as a table</summary>
      <div className="vchart-table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Total value</th>
            </tr>
          </thead>
          <tbody>
            {[...series].reverse().map((p) => (
              <tr key={p.t}>
                <td>{readingTime(p, p.t === nowT, range)}</td>
                <td className="num">{formatUsd(p.usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function ValueChart({ index }: { index?: number }) {
  const [range, setRange] = useState<HistoryRange>("1w");
  // Minutes east of UTC, so the server cuts days at this viewer's midnight.
  const offset = -new Date().getTimezoneOffset();
  const { data, error, isLoading, isValidating } = useSWR(`/api/portfolio/history?range=${range}&offset=${offset}`, fetchHistory, {
    refreshInterval: 60_000,
    keepPreviousData: true,
  });

  const series = useMemo(() => (data ? seriesWithNow(data.points, data.current) : []), [data]);
  // Two stored readings at least: one hour plus "now" is not yet a line.
  const enough = (data?.points.length ?? 0) >= 2 && series.length >= 2;
  const delta = enough ? change(series) : null;
  const shownRange = data?.range ?? range;

  return (
    <Panel
      index={index}
      title="Value over time"
      sub="All six chains, in US dollars"
      action={<Segmented id="value-range" label="Time range" value={range} options={RANGE_OPTIONS} onChange={setRange} />}
    >
      {!data && isLoading ? (
        <Skeleton height={PLOT_H + AXIS_H + 40} />
      ) : !data && error ? (
        <Empty icon="bar-chart" title="History unavailable" text="Your value history could not be loaded. It will try again by itself." />
      ) : data && !enough ? (
        !data.since || new Date(data.since).toDateString() === new Date().toDateString() ? (
          <Empty
            icon="bar-chart"
            title="Your chart starts today"
            text="albicocca saves your total about once an hour while you use the app. Come back later to see it move."
          />
        ) : (
          <Empty
            icon="bar-chart"
            title="No readings in this period"
            text={`albicocca saves your total about once an hour while you use the app. Your readings go back to ${dateFormat.format(data.since)}: choose a longer period to see them.`}
          />
        )
      ) : data ? (
        <div style={{ opacity: isValidating && data.range !== range ? 0.5 : 1, transition: "opacity 0.2s" }}>
          {delta && (
            <p className="vchart-head">
              <span className={`num ${delta.usd > 0 ? "text-gain-ink" : delta.usd < 0 ? "text-loss-ink" : ""}`}>
                {formatUsd(delta.usd, { sign: true })}
                {delta.percent !== null && ` (${formatPercent(delta.percent, { sign: true })})`}
              </span>{" "}
              <span className="muted">since {readingTime(series[0], false, shownRange)}</span>
            </p>
          )}
          <Plot series={series} range={shownRange} nowT={data.current.t} />
          <p className="vchart-foot">
            Recorded while you use albicocca, about once an hour; dotted stretches had no readings. Changes include money
            sent in or out, not only price moves.
          </p>
          <TableView series={series} range={shownRange} nowT={data.current.t} />
        </div>
      ) : null}
    </Panel>
  );
}
