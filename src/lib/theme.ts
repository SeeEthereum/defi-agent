/**
 * Theme preference: "dark" (default), "light" or "auto" (follow the system).
 *
 * The preference lives in localStorage and on <html data-theme>. The inline
 * THEME_SCRIPT in app/layout.tsx applies it before first paint, so a light
 * user never sees a dark flash. CSS reads only the attribute; the helpers
 * here keep the attribute, storage and React in sync.
 */

export type ThemePref = "dark" | "light" | "auto";
export type ResolvedTheme = "dark" | "light";

export const THEME_KEY = "albicocca-theme";
export const DEFAULT_THEME: ThemePref = "dark";
const CHANGE_EVENT = "albicocca-theme-change";

export function isThemePref(value: unknown): value is ThemePref {
  return value === "dark" || value === "light" || value === "auto";
}

/** Runs in <head> before the body renders. Must not throw. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_KEY
)});document.documentElement.setAttribute("data-theme",t==="light"||t==="auto"||t==="dark"?t:${JSON.stringify(
  DEFAULT_THEME
)})}catch(e){document.documentElement.setAttribute("data-theme",${JSON.stringify(DEFAULT_THEME)})}})()`;

export function readThemePref(): ThemePref {
  if (typeof document === "undefined") return DEFAULT_THEME;
  const attr = document.documentElement.getAttribute("data-theme");
  return isThemePref(attr) ? attr : DEFAULT_THEME;
}

export function setThemePref(pref: ThemePref): void {
  document.documentElement.setAttribute("data-theme", pref);
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    // private mode or blocked storage: the choice lasts for this page only
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function resolveTheme(pref: ThemePref, systemPrefersLight: boolean): ResolvedTheme {
  if (pref === "auto") return systemPrefersLight ? "light" : "dark";
  return pref;
}

/** Subscribe to preference changes and, for "auto", to system changes. */
export function subscribeTheme(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: light)");
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
    media.removeEventListener("change", onChange);
  };
}

export function readResolvedTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return resolveTheme(readThemePref(), window.matchMedia("(prefers-color-scheme: light)").matches);
}
