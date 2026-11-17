import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { DEFAULT_THEME, THEME_SCRIPT } from "@/lib/theme";
import { INSTALL_SCRIPT } from "@/lib/pwa/install";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker";
import { ThemeColorSync } from "@/components/theme-color";
import { I18nProvider } from "@/i18n/client";
import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from "@/i18n/config";
import { clientMessages, messagesFor } from "@/i18n/server";
import "../globals.css";

// Geist and Geist Mono (SIL Open Font License, see fonts/LICENSE-Geist.txt),
// served by the app itself. The Arial-based fallback is size-adjusted by
// next/font so the page does not shift when the real font arrives.
const geist = localFont({
  src: "../fonts/geist.woff2",
  weight: "100 900",
  variable: "--font-geist",
  display: "swap",
  preload: false,
});
const geistMono = localFont({
  src: "../fonts/geist-mono.woff2",
  weight: "100 900",
  variable: "--font-geist-mono",
  display: "swap",
  // Figures only: not worth a high-priority download on the critical path.
  preload: false,
});

const OG_LOCALE: Record<Locale, string> = { en: "en_US", it: "it_IT" };

/** Every page exists once per language, built ahead like before. */
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}
export const dynamicParams = false;

type Props = { children: React.ReactNode; params: Promise<{ lang: string }> };

// Search and link-preview copy, per language (i18n/messages, "meta").
// Plain words, no em dashes (house rule).
export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { lang } = await params;
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  const { meta } = messagesFor(locale);
  return {
    // Absolute base for the share image; Render sets RENDER_EXTERNAL_URL.
    metadataBase: new URL(process.env.RENDER_EXTERNAL_URL ?? "http://localhost:3000"),
    title: meta.title,
    description: meta.description,
    applicationName: "albicocca",
    // Link previews in social apps read these. The image comes from
    // opengraph-image.tsx and twitter-image.tsx.
    openGraph: {
      type: "website",
      siteName: "albicocca",
      title: meta.title,
      description: meta.description,
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
    },
    twitter: { card: "summary_large_image", title: meta.title, description: meta.description },
    // The name under the icon when added to an iPhone home screen. Opens
    // full screen from there (the manifest says the same to other browsers).
    appleWebApp: { title: "albicocca", capable: true, statusBarStyle: "default" },
    // The installed app opens in the language it was installed in.
    manifest: `/${locale}/manifest.webmanifest`,
  };
}

// No themeColor here: THEME_SCRIPT writes the tag with the colour of the
// stored theme (lib/theme.ts), and ThemeColorSync follows later switches.
export const viewport: Viewport = {};

export default async function RootLayout({ children, params }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return (
    // data-theme is replaced before first paint by THEME_SCRIPT with the
    // stored preference, hence suppressHydrationWarning on this element only.
    <html
      lang={lang}
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: INSTALL_SCRIPT }} />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <I18nProvider locale={lang} messages={clientMessages(lang)}>
          {children}
          <Toaster />
          <ThemeColorSync />
          <ServiceWorkerRegistration />
        </I18nProvider>
      </body>
    </html>
  );
}
