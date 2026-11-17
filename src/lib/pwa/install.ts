/**
 * Installing albicocca as an app, and knowing when it already is one.
 *
 * Browsers differ, so the menu item does what each one allows:
 *   - Chromium (Chrome, Edge, Samsung Internet) on Android and desktop fires
 *     `beforeinstallprompt`; the item opens the browser's own install dialog.
 *   - iPhone and iPad have no such event; installing is Share, then Add to
 *     Home Screen, so the item shows those steps. In-app browsers (Instagram,
 *     Facebook…) cannot install at all: the steps start with "open Safari".
 *   - Safari 17+ on a Mac: File, then Add to Dock.
 *   - Android without the event (Firefox, or Chrome after a dismissal): the
 *     browser menu still has the install entry.
 *   - Anything else (Firefox on a computer): no item.
 *
 * The event can fire before React hydrates, so INSTALL_SCRIPT, inline in
 * <head>, keeps it on window until the menu reads it. It does not call
 * preventDefault: the browser's own install hint stays as it is.
 */

/** Chromium's install event. Not in TypeScript's DOM types. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

/** A plain string, so useSyncExternalStore can compare snapshots. */
export type InstallRoute = "installed" | "prompt" | "ios" | "ios-in-app" | "safari-mac" | "android-menu" | "none";

export interface InstallEnvironment {
  /** Running as the installed app (display-mode standalone, or iOS's navigator.standalone). */
  standalone: boolean;
  /** A `beforeinstallprompt` event is waiting to be used. */
  hasPrompt: boolean;
  userAgent: string;
  maxTouchPoints: number;
}

const IN_APP_BROWSER = /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Line\/|Twitter|TwitterAndroid|musical_ly|TikTok|BytedanceWebview|Snapchat|Pinterest|GSA\//;

/** iPadOS 13+ reports a Mac user agent; a touch screen gives it away. */
function isIos(ua: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}

function safariMacVersion(ua: string): number | null {
  if (!/Macintosh/.test(ua) || !/Safari\//.test(ua)) return null;
  if (/Chrome|Chromium|CriOS|Edg\/|OPR\/|Firefox|FxiOS/.test(ua)) return null;
  const match = ua.match(/Version\/(\d+)/);
  return match ? Number(match[1]) : null;
}

export function installRoute(env: InstallEnvironment): InstallRoute {
  if (env.standalone) return "installed";
  if (env.hasPrompt) return "prompt";
  const ua = env.userAgent;
  if (isIos(ua, env.maxTouchPoints)) return IN_APP_BROWSER.test(ua) ? "ios-in-app" : "ios";
  const safari = safariMacVersion(ua);
  if (safari !== null && safari >= 17 && env.maxTouchPoints <= 1) return "safari-mac";
  // "; wv)" marks an Android WebView inside another app: no install there.
  if (/Android/.test(ua) && !IN_APP_BROWSER.test(ua) && !/; wv\)/.test(ua)) return "android-menu";
  return "none";
}

// ── The held event ──────────────────────────────────────────────────────────

const PROMPT_KEY = "__albicoccaInstallPrompt";
const CHANGE_EVENT = "albicocca-install-change";

/** Inline in <head>, before hydration. Must not throw. */
export const INSTALL_SCRIPT = `(function(){try{var k=${JSON.stringify(PROMPT_KEY)},c=${JSON.stringify(
  CHANGE_EVENT
)};addEventListener("beforeinstallprompt",function(e){window[k]=e;dispatchEvent(new Event(c))});addEventListener("appinstalled",function(){window[k]=null;dispatchEvent(new Event(c))})}catch(e){}})()`;

type PromptWindow = Window & { [PROMPT_KEY]?: BeforeInstallPromptEvent | null };

export function heldInstallPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  return (window as PromptWindow)[PROMPT_KEY] ?? null;
}

/** A prompt works once: after it is shown (accepted or not), drop it. */
export function releaseInstallPrompt(): void {
  (window as PromptWindow)[PROMPT_KEY] = null;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

/** For useSyncExternalStore: the held prompt and the display mode. */
export function subscribeInstall(onChange: () => void): () => void {
  const media = window.matchMedia("(display-mode: standalone)");
  window.addEventListener(CHANGE_EVENT, onChange);
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    media.removeEventListener("change", onChange);
  };
}

/** The route for this browser, now. */
export function currentInstallRoute(): InstallRoute {
  return installRoute({
    standalone: isStandalone(),
    hasPrompt: heldInstallPrompt() !== null,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  });
}
