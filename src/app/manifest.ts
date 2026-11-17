import type { MetadataRoute } from "next";

// Install metadata. Colours are the dark theme's background token
// (globals.css --background); the page itself switches the bar colour to the
// stored theme once it loads (lib/theme.ts THEME_SCRIPT).
export default function manifest(): MetadataRoute.Manifest {
  return {
    // A fixed identity: start_url can change later without the browser
    // treating it as a different app (and installing it twice).
    id: "/",
    name: "albicocca",
    short_name: "albicocca",
    description: "Ask your wallet. Swap, bridge, earn and trade across six chains by asking for it.",
    lang: "en",
    dir: "ltr",
    start_url: "/",
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
      { name: "Assistant", short_name: "Assistant", url: "/ai", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Wallet", short_name: "Wallet", url: "/wallet", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Swap", short_name: "Swap", url: "/swap", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
