/**
 * LineIcon — the app's small set of stroke icons.
 *
 * The design system allows line SVG icons only (24 grid, 1.5–2 stroke) and
 * never emoji; these replace the emoji that were used as icons in the
 * dashboard, swap and the AI proposal cards. Stroke is currentColor, so an
 * icon takes the colour of its container.
 */

export type LineIconName =
  | "swap"
  | "trending-up"
  | "trending-down"
  | "send"
  | "long"
  | "short"
  | "close"
  | "bar-chart"
  | "coins"
  | "layers"
  | "alert"
  | "flame";

const PATHS: Record<LineIconName, React.ReactNode> = {
  swap: (
    <>
      <path d="M4 8h13l-3.5-3.5" />
      <path d="M20 16H7l3.5 3.5" />
    </>
  ),
  "trending-up": (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  "trending-down": (
    <>
      <path d="M3 7l6 6 4-4 8 8" />
      <path d="M15 17h6v-6" />
    </>
  ),
  send: (
    <>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </>
  ),
  long: (
    <>
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </>
  ),
  short: (
    <>
      <path d="M12 5v14" />
      <path d="M18 13l-6 6-6-6" />
    </>
  ),
  close: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6" />
      <path d="M9 9l6 6" />
    </>
  ),
  "bar-chart": (
    <>
      <path d="M4 18V9" />
      <path d="M10 18V5" />
      <path d="M16 18v-7" />
      <path d="M3 21h18" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6" />
      <path d="M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3 3 8l9 5 9-5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.3 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  flame: (
    <path d="M12 21c-3.9 0-7-2.9-7-6.5 0-2.8 1.6-4.6 3-6 .3 1.7 1.2 2.9 2.3 3.2C9.9 8.8 11 5.6 13.5 3c.4 3 2 4.8 3.3 6.3C18 10.6 19 12.3 19 14.5 19 18.1 15.9 21 12 21z" />
  ),
};

export function LineIcon({
  name,
  size = 18,
  className,
  strokeWidth = 1.75,
}: {
  name: LineIconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
