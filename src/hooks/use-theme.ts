"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_THEME,
  readResolvedTheme,
  readThemePref,
  subscribeTheme,
  type ResolvedTheme,
  type ThemePref,
} from "@/lib/theme";

/** The stored preference. On the server it is the default ("dark"). */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribeTheme, readThemePref, () => DEFAULT_THEME);
}

/** What is actually on screen, with "auto" resolved against the system. */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeTheme, readResolvedTheme, () => "dark");
}
