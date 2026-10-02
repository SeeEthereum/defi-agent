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
});
const geistMono = localFont({
  src: "./fonts/geist-mono.woff2",
  weight: "100 900",
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "albicocca — ask your wallet",
  description:
    "An onchain agent with a wallet built in. Swap, bridge, earn and trade across six chains by asking for it — sign in with Google, Apple or email, keys held in OKX's secure enclave, no seed phrase.",
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
