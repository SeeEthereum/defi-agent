#!/usr/bin/env node
/**
 * Browser checks for the public pages (landing and sign in).
 *
 *   BASE_URL=http://localhost:3000 node scripts/check-pages.mjs
 *
 * Runs against a running server (use the production build for timing).
 * Needs a local Chromium: CHROME_PATH, or Brave / Chrome in /Applications.
 * Not part of `npm test`, which must run without a browser.
 *
 * Checks, in dark and light, on a phone (390) and a computer (1440):
 *   - no console errors and no failed same-origin requests;
 *   - no horizontal scroll;
 *   - layout shift (CLS) under 0.1 after a full scroll;
 * and once each:
 *   - JavaScript off: every heading and paragraph is visible;
 *   - reduced motion: nothing is left hidden or moving after a scroll.
 */
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PAGES = ["/welcome", "/auth"];
const VIEWPORTS = [
  { name: "phone", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: "computer", width: 1440, height: 900, deviceScaleFactor: 1 },
];
const THEMES = ["dark", "light"];

const candidates = [
  process.env.CHROME_PATH,
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean);
const executablePath = candidates.find((c) => existsSync(c));
if (!executablePath) {
  console.error("No Chromium browser found: set CHROME_PATH.");
  process.exit(2);
}

const failures = [];
const fail = (msg) => failures.push(msg);
const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-first-run", "--hide-scrollbars"] });

async function open({ path, viewport, theme, js = true, reducedMotion = false }) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.setJavaScriptEnabled(js);
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }]);
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => {
    if (r.url().startsWith(BASE) && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  // Theme preference is read from localStorage before first paint.
  await page.evaluateOnNewDocument((t) => {
    try {
      localStorage.setItem("albicocca-theme", t);
    } catch {}
  }, theme);
  await page.evaluateOnNewDocument(() => {
    window.__cls = 0;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
  });
  await page.goto(BASE + path, { waitUntil: "networkidle0" });
  return { page, errors };
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.round(innerHeight * 0.7);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await new Promise((r) => setTimeout(r, 400));
}

for (const path of PAGES) {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      const label = `${path} ${viewport.name} ${theme}`;
      const { page, errors } = await open({ path, viewport, theme });
      await scrollThrough(page);
      const r = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        cls: window.__cls,
        theme: document.documentElement.getAttribute("data-theme"),
      }));
      if (r.theme !== theme) fail(`${label}: theme is ${r.theme}`);
      if (r.overflow > 0) fail(`${label}: horizontal scroll of ${r.overflow}px`);
      if (r.cls >= 0.1) fail(`${label}: CLS ${r.cls.toFixed(3)}`);
      if (errors.length) fail(`${label}: console/network errors:\n    ${errors.join("\n    ")}`);
      console.log(`${failures.length ? "…" : "ok"} ${label}  CLS ${r.cls.toFixed(3)}  overflow ${r.overflow}px`);
      await page.close();
    }
  }
}

// JavaScript off: all copy must be readable.
{
  const { page } = await open({ path: "/welcome", viewport: VIEWPORTS[1], theme: "dark", js: false });
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll("h1, h2, h3, p, li, a.btn")]
      .filter((el) => {
        const s = getComputedStyle(el);
        return el.textContent.trim() && (s.opacity === "0" || s.visibility === "hidden" || s.display === "none");
      })
      .map((el) => el.textContent.trim().slice(0, 40))
  );
  if (hidden.length) fail(`JS off: hidden text: ${hidden.join(" | ")}`);
  console.log(`${hidden.length ? "FAIL" : "ok"} /welcome with JavaScript off (${hidden.length} hidden)`);
  await page.close();
}

// Reduced motion: after a full scroll nothing is hidden or transformed by script.
{
  const { page } = await open({ path: "/welcome", viewport: VIEWPORTS[1], theme: "dark", reducedMotion: true });
  await scrollThrough(page);
  const r = await page.evaluate(() => {
    const hidden = [...document.querySelectorAll("[data-reveal]")].filter((el) => getComputedStyle(el).opacity !== "1").length;
    const moving = [...document.querySelectorAll(".lp *")].filter((el) => {
      const s = getComputedStyle(el);
      return s.animationName !== "none" && s.animationPlayState === "running";
    }).length;
    const art = document.querySelector(".hero-art img");
    return { hidden, moving, artTransform: art ? getComputedStyle(art).transform : "none" };
  });
  if (r.hidden) fail(`reduced motion: ${r.hidden} blocks not fully visible`);
  if (r.moving) fail(`reduced motion: ${r.moving} elements still animating`);
  if (r.artTransform !== "none") fail(`reduced motion: hero image transformed (${r.artTransform})`);
  console.log(`${r.hidden || r.moving || r.artTransform !== "none" ? "FAIL" : "ok"} /welcome with reduced motion`);
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nAll page checks passed.");
