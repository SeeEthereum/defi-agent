"use client";

/**
 * NumberDisplay — thin wrapper around @number-flow/react so price / PnL /
 * balance updates animate digit-by-digit instead of snap-replacing.
 *
 * Keep the API boringly similar to `toFixed` so drop-in usage is trivial:
 *   Before: <span>{value.toFixed(2)}</span>
 *   After:  <NumberDisplay value={value} decimals={2} />
 *
 * Accepts string values (the HL API returns strings for precision) and
 * coerces once; if parsing fails we fall back to the raw string so the UI
 * never shows "NaN".
 */

import NumberFlow from "@number-flow/react";
import { useMemo } from "react";

interface NumberDisplayProps {
  value: string | number | null | undefined;
  /** Digits after the decimal. Default: 2. */
  decimals?: number;
  /** Minimum fraction digits. Default: decimals. */
  minDecimals?: number;
  /** Prefix (e.g. "$"). Applied by NumberFlow's format. */
  prefix?: string;
  /** Suffix (e.g. "%"). Applied by NumberFlow's format. */
  suffix?: string;
  /** Group thousands. Default: true. */
  grouped?: boolean;
  className?: string;
  /**
   * Render the plain number as a string instead of animating. Useful as
   * an escape hatch for contexts where the morph is distracting (e.g.
   * inside a spinner that's already moving).
   */
  static?: boolean;
}

function coerce(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function NumberDisplay({
  value,
  decimals = 2,
  minDecimals,
  prefix,
  suffix,
  grouped = true,
  className,
  static: isStatic,
}: NumberDisplayProps) {
  const num = useMemo(() => coerce(value), [value]);

  // Fallback: preserve the raw string for "—", "N/A", etc. (or empty for null)
  if (num === null) {
    return <span className={className}>{value == null ? "" : String(value)}</span>;
  }

  if (isStatic) {
    const formatted = num.toLocaleString(undefined, {
      minimumFractionDigits: minDecimals ?? decimals,
      maximumFractionDigits: decimals,
      useGrouping: grouped,
    });
    return (
      <span className={className}>
        {prefix}
        {formatted}
        {suffix}
      </span>
    );
  }

  return (
    <NumberFlow
      value={num}
      format={{
        minimumFractionDigits: minDecimals ?? decimals,
        maximumFractionDigits: decimals,
        useGrouping: grouped,
      }}
      prefix={prefix}
      suffix={suffix}
      className={className}
    />
  );
}
