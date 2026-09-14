import { useId } from "react";

/**
 * albicocca wordmark — lowercase, weight 700, -0.045em, with the first "o"
 * replaced by the brand dot (apricot → pink). Same construction as the
 * landing's nav logo, so the app and the entry pages read as one product.
 *
 * `size` is the font size in px; the dot scales with it.
 */
export function BrandMark({ size = 22, className }: { size?: number; className?: string }) {
  // Gradient ids must be unique per document: the sidebar and the dashboard
  // can render a mark at the same time.
  const gradientId = `brand-${useId().replace(/:/g, "")}`;
  const dot = Math.round(size * 0.62);

  return (
    <span
      className={className}
      aria-label="albicocca"
      role="img"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        fontWeight: 700,
        fontSize: size,
        letterSpacing: "-0.045em",
        lineHeight: 1,
        color: "var(--foreground)",
      }}
    >
      <span aria-hidden="true">albic</span>
      <svg width={dot} height={dot} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, margin: `${Math.round(size * 0.08)}px 1px 0` }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff7a1a" />
            <stop offset="1" stopColor="#ff2d75" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="10" fill={`url(#${gradientId})`} />
      </svg>
      <span aria-hidden="true">cca</span>
    </span>
  );
}
