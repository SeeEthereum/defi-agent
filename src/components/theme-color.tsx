"use client";

import { useEffect } from "react";
import { useResolvedTheme } from "@/hooks/use-theme";
import { applyThemeColor, readResolvedTheme } from "@/lib/theme";

/**
 * Keeps <meta name="theme-color"> on the theme on screen. THEME_SCRIPT sets
 * it before first paint; this follows later switches and, under "auto",
 * the system's light/dark change.
 */
export function ThemeColorSync() {
  // The hook only triggers the effect. The effect reads the live value: on
  // hydration the hook first returns the server's "dark", which would flash
  // the bar dark for a light-theme user.
  const theme = useResolvedTheme();
  useEffect(() => {
    applyThemeColor(readResolvedTheme());
  }, [theme]);
  return null;
}
