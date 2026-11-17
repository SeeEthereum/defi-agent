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

/**
 * The browser bar and, in the installed app, the status bar take this
 * colour. Same values as --background in globals.css (dark and light).
 */
export const THEME_COLORS: Record<ResolvedTheme, string> = { dark: "#0e0e0d", light: "#f4f3ef" };

export function isThemePref(value: unknown): value is ThemePref {
  return value === "dark" || value === "light" || value === "auto";
}

/**
 * Runs in <head> before the body renders. Must not throw.
 *
 * Sets data-theme and the <meta name="theme-color"> tag. The tag is made
 * here, not by Next's viewport export: there it would hold one fixed colour,
 * and a light-theme user would get a dark status bar in the installed app.
 * React 19 leaves head elements it did not render alone when it hydrates.
 */
export const THEME_SCRIPT = `(function(){var d=document.documentElement,t;try{t=localStorage.getItem(${JSON.stringify(
  THEME_KEY
)})}catch(e){}if(t!=="light"&&t!=="auto"&&t!=="dark")t=${JSON.stringify(DEFAULT_THEME)};d.setAttribute("data-theme",t);try{var l=t==="light"||(t==="auto"&&matchMedia("(prefers-color-scheme: light)").matches),m=document.createElement("meta");m.name="theme-color";m.content=l?${JSON.stringify(
  THEME_COLORS.light
)}:${JSON.stringify(THEME_COLORS.dark)};document.head.appendChild(m)}catch(e){}})()`;

/** Point the browser bar at the theme on screen (after a switch, or a system change under "auto"). */
export function applyThemeColor(theme: ResolvedTheme): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  if (meta.content !== THEME_COLORS[theme]) meta.content = THEME_COLORS[theme];
}

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
