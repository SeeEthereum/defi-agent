import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/i18n/config";
import { manifestFor } from "./manifest";

const ROOT = path.resolve(__dirname, "../../..");

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string): string {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString("ascii"), file).toBe("PNG");
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

/** Where a manifest URL's file or page lives in this repo. */
function sourceOf(url: string): string | null {
  if (url === "/icon.svg") return path.join(ROOT, "src/app/icon.svg");
  const pub = path.join(ROOT, "public", url);
  if (existsSync(pub)) return pub;
  const page = url.replace(/^\/(en|it)/, "");
  const file = page === "" || page === "/" ? "src/app/[lang]/(app)/page.tsx" : `src/app/[lang]/(app)${page}/page.tsx`;
  return /^\/(en|it)(\/|$)/.test(url) && existsSync(path.join(ROOT, file)) ? path.join(ROOT, file) : null;
}

describe.each(LOCALES)("web app manifest (%s)", (locale) => {
  const m = manifestFor(locale);

  it("installs as a standalone app with one identity for every language", () => {
    expect(m.display).toBe("standalone");
    expect(m.id).toBe("/");
    expect(m.start_url).toBe(`/${locale}`);
    expect(m.scope).toBe("/");
    expect(m.lang).toBe(locale);
    expect(m.name).toBe("albicocca");
  });

  it("points every icon at a real file of the declared size", () => {
    expect(m.icons?.length).toBeGreaterThan(0);
    for (const icon of m.icons ?? []) {
      const file = sourceOf(icon.src);
      expect(file, icon.src).not.toBeNull();
      if (icon.type === "image/png") expect(pngSize(file!), icon.src).toBe(icon.sizes);
    }
    // Chrome needs 192 and 512; Android crops a maskable one to its shape.
    const sizes = (m.icons ?? []).map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(m.icons?.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("opens shortcuts on pages that exist, in the same language", () => {
    for (const shortcut of m.shortcuts ?? []) {
      expect(shortcut.url.startsWith(`/${locale}/`), shortcut.url).toBe(true);
      expect(sourceOf(shortcut.url), shortcut.url).not.toBeNull();
      for (const icon of shortcut.icons ?? []) expect(sourceOf(icon.src), icon.src).not.toBeNull();
    }
  });
});

it("names the shortcuts in each language", () => {
  expect(manifestFor("it").shortcuts?.map((s) => s.name)).toEqual(["Assistente", "Wallet", "Scambia"]);
  expect(manifestFor("en").shortcuts?.map((s) => s.name)).toEqual(["Assistant", "Wallet", "Swap"]);
});
