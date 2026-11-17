import { describe, expect, it } from "vitest";
import { isLocalizablePath, localeOfPath, localizedPath, negotiateLocale, stripLocale } from "./config";
import { createTranslator, interpolate } from "./translate";

describe("language from the browser", () => {
  it("picks the best supported language by quality, then order", () => {
    expect(negotiateLocale("it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7")).toBe("it");
    expect(negotiateLocale("en-GB,en;q=0.9,it;q=0.8")).toBe("en");
    expect(negotiateLocale("de-DE,de;q=0.9,it;q=0.5,en;q=0.4")).toBe("it");
    expect(negotiateLocale("fr;q=0.9, en;q=0.2, it;q=0.8")).toBe("it");
    expect(negotiateLocale("de,fr")).toBeNull();
    expect(negotiateLocale("it;q=0")).toBeNull();
    expect(negotiateLocale("*")).toBeNull();
    expect(negotiateLocale("")).toBeNull();
    expect(negotiateLocale(null)).toBeNull();
  });
});

describe("paths", () => {
  it("reads and strips the language", () => {
    expect(localeOfPath("/it/swap")).toBe("it");
    expect(localeOfPath("/en")).toBe("en");
    expect(localeOfPath("/swap")).toBeNull();
    expect(localeOfPath("/item")).toBeNull();
    expect(stripLocale("/it/swap")).toBe("/swap");
    expect(stripLocale("/it")).toBe("/");
    expect(stripLocale("/swap")).toBe("/swap");
  });

  it("puts any app path in a language, keeping the query", () => {
    expect(localizedPath("it", "/")).toBe("/it");
    expect(localizedPath("it", "/wallet?tab=receive")).toBe("/it/wallet?tab=receive");
    expect(localizedPath("en", "/it/swap#top")).toBe("/en/swap#top");
    expect(localizedPath("it", "/en")).toBe("/it");
    expect(localizedPath("it", "https://etherscan.io/tx/0x1")).toBe("https://etherscan.io/tx/0x1");
    expect(localizedPath("it", "//evil.example")).toBe("//evil.example");
  });

  it("gives a language to pages only", () => {
    for (const page of ["/", "/swap", "/wallet", "/welcome", "/it", "/ai"]) expect(isLocalizablePath(page), page).toBe(true);
    for (const other of [
      "/api/health",
      "/_next/static/chunks/a.js",
      "/sw.js",
      "/offline.html",
      "/robots.txt",
      "/sitemap.xml",
      "/manifest.webmanifest",
      "/icon.svg",
      "/apple-icon.png",
      "/opengraph-image",
      "/twitter-image",
      "/opengraph-image-1a2b3c",
    ]) {
      expect(isLocalizablePath(other), other).toBe(false);
    }
  });
});

describe("translator", () => {
  const messages = {
    nav: { swap: "Scambia" },
    trades: { zero: "Nessuna operazione", one: "{count} operazione", other: "{count} operazioni" },
    note: "Esci e <link>accedi di nuovo</link> per continuare, {name}.",
  };

  it("fills placeholders and leaves unknown ones visible", () => {
    expect(interpolate("Ciao {name}", { name: "Salvo" })).toBe("Ciao Salvo");
    expect(interpolate("Ciao {name}", {})).toBe("Ciao {name}");
  });

  it("looks keys up, inside a namespace too", () => {
    expect(createTranslator(messages, "it")("nav.swap")).toBe("Scambia");
    expect(createTranslator(messages, "it", "nav")("swap")).toBe("Scambia");
  });

  it("picks plural forms by the language's rules, with an optional zero", () => {
    const t = createTranslator(messages, "it");
    expect(t("trades", { count: 0 })).toBe("Nessuna operazione");
    expect(t("trades", { count: 1 })).toBe("1 operazione");
    expect(t("trades", { count: 3 })).toBe("3 operazioni");
  });

  it("splits tagged messages into text and elements", () => {
    const t = createTranslator(messages, "it");
    expect(t.rich("note", { link: (text) => ({ a: text }) }, { name: "Salvo" })).toEqual([
      "Esci e ",
      { a: "accedi di nuovo" },
      " per continuare, Salvo.",
    ]);
  });

  it("shows the key, not a crash, when a message is missing", () => {
    const t = createTranslator(messages, "it");
    expect(t("nav.nothing" as never)).toBe("nav.nothing");
    expect(t.has("nav.swap")).toBe(true);
    expect(t.has("nav.nothing")).toBe(false);
    expect(t.has("nav")).toBe(false);
  });
});
