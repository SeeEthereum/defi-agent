"use client";

/**
 * Shared building blocks for the app pages, styled by app/(app)/app.css.
 * One visual language for every page: page head, double-bezel panels, pill
 * tabs with a sliding indicator, figures without boxes, calm empty states.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { LineIcon, type LineIconName } from "@/components/line-icon";

const SPRING = { type: "spring" as const, stiffness: 420, damping: 36, mass: 0.8 };

export function PageHead({
  title,
  lede,
  actions,
  children,
}: {
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-head in">
      <div className="page-head-row">
        <div style={{ display: "grid", gap: 12 }}>
          <h1 className="page-title">{title}</h1>
          {lede && <p className="page-lede">{lede}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** Double-bezel container. `spot` lights the border under the pointer. */
export function Panel({
  children,
  title,
  sub,
  action,
  flush = false,
  spot = true,
  className = "",
  index,
}: {
  children: ReactNode;
  title?: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  flush?: boolean;
  spot?: boolean;
  className?: string;
  index?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  return (
    <section
      ref={ref}
      className={`bezel in ${flush ? "flush" : ""} ${className}`}
      data-spot={spot ? "" : undefined}
      style={index != null ? ({ "--i": index } as React.CSSProperties) : undefined}
      onPointerMove={
        spot
          ? (e) => {
              const r = e.currentTarget.getBoundingClientRect();
              e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
              e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
            }
          : undefined
      }
    >
      <div className="core">
        {(title || action) && (
          <div className="panel-head">
            <div>
              {title && <h2>{title}</h2>}
              {sub && <p>{sub}</p>}
            </div>
            {action}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

/** Pill tabs; the light pill slides to the selected tab. */
export function PillTabs<T extends string>({
  value,
  onChange,
  options,
  label,
  id = "tabs",
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode; count?: number }>;
  label: string;
  id?: string;
}) {
  return (
    <div className="pills" role="tablist" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="tab" aria-selected={on} onClick={() => onChange(o.value)}>
            {on && <motion.span layoutId={`${id}-pill`} className="pill-bg" transition={SPRING} />}
            {o.label}
            {o.count != null && <span className="n">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A number that counts up once it is on screen (static under reduced motion). */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (!inView || reduce || !Number.isFinite(value)) return;
    const controls = animate(0, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setShown(v),
    });
    return () => controls.stop();
  }, [inView, reduce, value]);

  return <span ref={ref}>{format(reduce || !inView ? value : shown)}</span>;
}

export function Metric({ value, label, sub }: { value: ReactNode; label: ReactNode; sub?: ReactNode }) {
  return (
    <div className="metric">
      <span className="l">{label}</span>
      <span className="v">{value}</span>
      {sub && <span className="s">{sub}</span>}
    </div>
  );
}

export function Empty({
  icon = "sparkle",
  title,
  text,
  action,
}: {
  icon?: LineIconName;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="ico" aria-hidden="true">
        <LineIcon name={icon} size={20} />
      </span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

/** Gain/loss pill for a percentage. */
export function Change({ value, digits = 2 }: { value: number | null | undefined; digits?: number }) {
  if (value == null || !Number.isFinite(value)) return <span className="glp flat">n/a</span>;
  const cls = value > 0 ? "pos" : value < 0 ? "neg" : "flat";
  const sign = value > 0 ? "+" : "";
  return <span className={`glp ${cls}`}>{`${sign}${value.toFixed(digits)}%`}</span>;
}

export function Skeleton({ height = 16, width = "100%" }: { height?: number; width?: number | string }) {
  return <span className="skel" style={{ display: "block", height, width }} aria-hidden="true" />;
}

export { Picker, PickRow } from "./picker";
