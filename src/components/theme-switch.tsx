"use client";

import { CoreIcon } from "@/components/line-icon-core";
import { useThemePref } from "@/hooks/use-theme";
import { setThemePref, type ThemePref } from "@/lib/theme";

const OPTIONS: Array<{ value: ThemePref; label: string; icon: "monitor" | "moon" | "sun" }> = [
  { value: "auto", label: "Match system", icon: "monitor" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "light", label: "Light", icon: "sun" },
];

/**
 * Three-way theme choice as a small pill group. A radio group, so arrow keys
 * move between options and screen readers announce the current one.
 */
export function ThemeSwitch({ className = "" }: { className?: string }) {
  const pref = useThemePref();

  return (
    <div role="radiogroup" aria-label="Theme" className={`theme-switch ${className}`}>
      {OPTIONS.map((o) => {
        const checked = pref === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={o.label}
            title={o.label}
            tabIndex={checked ? 0 : -1}
            onClick={() => setThemePref(o.value)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const i = OPTIONS.findIndex((x) => x.value === pref);
              const next = OPTIONS[(i + (e.key === "ArrowRight" ? 1 : OPTIONS.length - 1)) % OPTIONS.length];
              setThemePref(next.value);
              (e.currentTarget.parentElement?.querySelector(`[aria-label="${next.label}"]`) as HTMLElement | null)?.focus();
            }}
          >
            <CoreIcon name={o.icon} size={15} />
          </button>
        );
      })}
    </div>
  );
}
