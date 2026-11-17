import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

const ROOT = path.resolve(__dirname, "../..");

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
  const page = url === "/" ? "src/app/(app)/page.tsx" : `src/app/(app)${url}/page.tsx`;
  return existsSync(path.join(ROOT, page)) ? path.join(ROOT, page) : null;
}

describe("web app manifest", () => {
  const m = manifest();

  it("installs as a standalone app with a fixed identity", () => {
    expect(m.display).toBe("standalone");
    expect(m.id).toBe("/");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
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

  it("opens shortcuts on pages that exist, inside the app's scope", () => {
    for (const shortcut of m.shortcuts ?? []) {
      expect(shortcut.url.startsWith("/"), shortcut.url).toBe(true);
      expect(sourceOf(shortcut.url), shortcut.url).not.toBeNull();
      for (const icon of shortcut.icons ?? []) expect(sourceOf(icon.src), icon.src).not.toBeNull();
    }
  });
});
