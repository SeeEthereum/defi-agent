/**
 * Guards for the redesign: what must never change silently, and the design
 * rules that are easy to break by accident. They read source files, so they
 * run in plain Node without building the app.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function pageRoutes(dir = join(ROOT, "src", "app")): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "api") continue;
      out.push(...pageRoutes(full));
    } else if (name === "page.tsx") {
      const rel = relative(join(ROOT, "src", "app"), dir)
        .split("/")
        .filter((s) => s && !s.startsWith("("))
        .join("/");
      out.push("/" + rel);
    }
  }
  return out.sort();
}

describe("addresses, titles and logo do not change", () => {
  it("keeps every page address", () => {
    expect(pageRoutes()).toEqual(
      ["/", "/ai", "/auth", "/bridge", "/earn", "/security", "/signals", "/swap", "/trade", "/wallet", "/welcome"].sort()
    );
  });

  it("keeps the landing section anchors used by links and the menu", () => {
    const page = read("src/app/welcome/page.tsx");
    for (const id of ["what", "how", "custody", "access", "main", "top"]) {
      expect(page).toMatch(new RegExp(`id="${id}"`));
    }
  });

  it("keeps the search title and description", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('title: "albicocca — ask your wallet"');
    expect(layout).toContain(
      "An onchain agent with a wallet built in. Swap, bridge, earn and trade across six chains by asking for it — sign in with Google, Apple or email, keys held in OKX's secure enclave, no seed phrase."
    );
  });

  it("keeps the wordmark and its apricot-to-pink dot", () => {
    const mark = read("src/components/brand-mark.tsx");
    expect(mark).toContain(">albic<");
    expect(mark).toContain(">cca<");
    expect(mark).toMatch(/stopColor="#ff7a1a"[\s\S]*stopColor="#ff2d75"/);
    const icon = read("src/app/icon.svg");
    expect(icon).toMatch(/stop-color="#ff7a1a"[\s\S]*stop-color="#ff2d75"/);
  });
});

describe("design rules on the public pages", () => {
  const files = ["src/app/welcome/page.tsx", "src/app/auth/page.tsx", "src/components/risk-disclaimer.tsx"];

  it("has no em or en dashes in visible copy", () => {
    for (const f of files) {
      // Comments may use them; strip block and line comments first.
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code, f).not.toMatch(/[—–]|&mdash;|&ndash;/);
    }
  });

  it("never hides content by default: reveal styles are added by script only", () => {
    const css = read("src/app/welcome/landing.css");
    expect(css).not.toMatch(/\[data-reveal\][^{]*\{[^}]*opacity:\s*0/);
    const motion = read("src/app/welcome/landing-motion.tsx");
    // hiding happens only after the reduced-motion early return
    expect(motion.indexOf("if (reduce) return")).toBeGreaterThan(-1);
    expect(motion.indexOf("if (reduce) return")).toBeLessThan(motion.indexOf("opacity: 0, y: 28"));
  });

  it("stops every animation under reduced motion", () => {
    expect(read("src/app/welcome/landing.css")).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*& \*, & \*::before, & \*::after \{ animation: none !important; transition: none !important; \}/
    );
    expect(read("src/app/globals.css")).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0\.01ms !important/);
  });

  it("uses no hand-written scroll listeners on the landing", () => {
    for (const f of ["src/app/welcome/landing-motion.tsx", "src/app/welcome/masthead.tsx", "src/app/welcome/marquee.tsx"]) {
      expect(read(f), f).not.toMatch(/addEventListener\(\s*["']scroll["']/);
    }
  });

  it("uses dvh, never vh, for full-height layouts", () => {
    expect(read("src/app/welcome/landing.css")).not.toMatch(/\b100vh\b/);
    expect(read("src/app/(app)/layout.tsx")).not.toMatch(/h-screen|100vh/);
  });
});

describe("design rules inside the app", () => {
  const appDir = join(ROOT, "src", "app", "(app)");
  const tsx = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const full = join(dir, n);
      return statSync(full).isDirectory() ? tsx(full) : n.endsWith(".tsx") ? [relative(ROOT, full)] : [];
    });
  const files = [
    ...tsx(appDir),
    ...tsx(join(ROOT, "src", "components", "premium")),
    ...tsx(join(ROOT, "src", "components", "shell")),
  ];

  it("has no em or en dashes in visible copy", () => {
    for (const f of files) {
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code, f).not.toMatch(/[—–]|&mdash;|&ndash;/);
    }
  });

  it("follows the user's reduced-motion setting", () => {
    expect(read("src/app/(app)/layout.tsx")).toContain('<MotionConfig reducedMotion="user">');
    // block entrances only run when motion is welcome, and end visible
    const css = read("src/app/(app)/app.css");
    expect(css).toMatch(/prefers-reduced-motion: no-preference\)\s*\{\s*& \.in \{ animation: app-in/);
    expect(css).toMatch(/@keyframes app-in \{ from \{ transform: translateY\(10px\); opacity: 0\.001; \} \}/);
  });

  it("uses no hand-written scroll listeners and no vh heights", () => {
    for (const f of files) expect(read(f), f).not.toMatch(/addEventListener\(\s*["']scroll["']/);
    expect(read("src/app/(app)/app.css")).not.toMatch(/\b100vh\b/);
  });

  it("keeps every section reachable from the navigation", () => {
    const nav = read("src/components/shell/nav.ts");
    for (const href of ["/ai", "/", "/wallet", "/swap", "/bridge", "/earn", "/trade", "/signals", "/security"]) {
      expect(nav).toContain(`href: "${href}"`);
    }
  });

  it("keeps the chat history key", () => {
    expect(read("src/app/(app)/ai/page.tsx")).toContain('const CHAT_STORAGE_KEY = "defi-agent-chat-history";');
  });
});
