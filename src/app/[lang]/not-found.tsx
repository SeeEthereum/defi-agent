import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { BrandMark } from "@/components/brand-mark";
import { isLocale } from "@/i18n/config";
import { translator } from "@/i18n/server";

/** A page that does not exist, in the visitor's language. */
export default async function NotFound() {
  const locale = await lang();
  if (!isLocale(locale)) notFound();
  const t = translator(locale, "notFound");
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div style={{ display: "grid", gap: 16, justifyItems: "center", maxWidth: 420 }}>
        <BrandMark size={26} />
        <h1 style={{ margin: "12px 0 0", fontSize: 30, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.15 }}>{t("title")}</h1>
        <p style={{ margin: 0, color: "var(--muted-foreground)", lineHeight: 1.5 }}>{t("text")}</p>
        <a
          href={`/${locale}`}
          style={{
            marginTop: 8,
            display: "inline-grid",
            placeItems: "center",
            minHeight: 46,
            padding: "0 22px",
            borderRadius: 999,
            background: "var(--primary)",
            color: "var(--primary-foreground)",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          {t("back")}
        </a>
      </div>
    </main>
  );
}
