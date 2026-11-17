import type { MetadataRoute } from "next";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/server";

/**
 * The web app manifest, one per language (served at /en/manifest.webmanifest
 * and /it/manifest.webmanifest; each page links its own). The installed app
 * opens in the language it was installed in.
 *
 * Colours are the dark theme's background token (globals.css --background);
 * the page itself switches the bar colour to the stored theme once it loads
 * (lib/theme.ts THEME_SCRIPT).
 */
export function manifestFor(locale: Locale): MetadataRoute.Manifest {
  const { meta, pwa } = messagesFor(locale);
  const icon192 = [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }];
  return {
    // A fixed identity across languages and start pages: one app, never
    // installed twice because its start_url changed.
    id: "/",
    name: "albicocca",
    short_name: "albicocca",
    description: meta.manifestDescription,
    lang: locale,
    dir: "ltr",
    start_url: `/${locale}`,
    scope: "/",
    display: "standalone",
    background_color: "#0e0e0d",
    theme_color: "#0e0e0d",
    categories: ["finance"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press on the icon (Android), right-click in the Dock or taskbar.
    shortcuts: [
      { name: pwa.shortcutAssistant, short_name: pwa.shortcutAssistant, url: `/${locale}/ai`, icons: icon192 },
      { name: pwa.shortcutWallet, short_name: pwa.shortcutWallet, url: `/${locale}/wallet`, icons: icon192 },
      { name: pwa.shortcutSwap, short_name: pwa.shortcutSwap, url: `/${locale}/swap`, icons: icon192 },
    ],
  };
}
