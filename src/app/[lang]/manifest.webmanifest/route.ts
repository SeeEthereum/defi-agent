import { notFound } from "next/navigation";
import { LOCALES, isLocale } from "@/i18n/config";
import { manifestFor } from "@/lib/pwa/manifest";

// One manifest per language, built ahead like the pages.
export const dynamic = "force-static";
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return new Response(JSON.stringify(manifestFor(lang)), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8" },
  });
}
