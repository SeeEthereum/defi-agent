import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { DEFAULT_THEME, THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Geist and Geist Mono (SIL Open Font License, see fonts/LICENSE-Geist.txt),
// served by the app itself. The Arial-based fallback is size-adjusted by
// next/font so the page does not shift when the real font arrives.
const geist = localFont({
  src: "./fonts/geist.woff2",
  weight: "100 900",
  variable: "--font-geist",
  display: "swap",
  preload: false,
});
const geistMono = localFont({
  src: "./fonts/geist-mono.woff2",
  weight: "100 900",
  variable: "--font-geist-mono",
  display: "swap",
  // Figures only: not worth a high-priority download on the critical path.
  preload: false,
});

// Search and link-preview copy. Plain words, no em dashes (house rule).
const TITLE = "albicocca: ask your wallet";
const DESCRIPTION =
  "An onchain agent with a wallet built in. Swap, bridge, earn and trade across six chains by asking for it. Sign in with Google, Apple or email, keys held in OKX's secure enclave, no seed phrase.";

export const metadata: Metadata = {
  // Absolute base for the share image; Render sets RENDER_EXTERNAL_URL.
  metadataBase: new URL(process.env.RENDER_EXTERNAL_URL ?? "http://localhost:3000"),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "albicocca",
  // Link previews in social apps read these. The image comes from
  // opengraph-image.tsx and twitter-image.tsx.
  openGraph: { type: "website", siteName: "albicocca", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  // The name under the icon when added to an iPhone home screen.
  appleWebApp: { title: "albicocca" },
};

export const viewport: Viewport = {
  themeColor: "#0e0e0d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // data-theme is replaced before first paint by THEME_SCRIPT with the
    // stored preference, hence suppressHydrationWarning on this element only.
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
