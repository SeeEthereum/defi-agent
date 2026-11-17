import type { MetadataRoute } from "next";

// Install metadata. Colours are the dark theme's background token
// (globals.css --background), the same as the viewport theme colour.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "albicocca",
    short_name: "albicocca",
    description: "Ask your wallet. Swap, bridge, earn and trade across six chains by asking for it.",
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
  };
}
