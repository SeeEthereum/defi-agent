/*
 * albicocca service worker.
 *
 * One job: when a page cannot load because the device is offline, show
 * /offline.html instead of the browser's error. That page is the only thing
 * cached. Pages, balances, prices and quotes always come from the network:
 * a wallet that shows an old balance as if it were current is worse than one
 * that says it is offline.
 *
 * Only GET navigations are handled. API calls, the router's own requests,
 * scripts, images and every POST go to the network as if there were no
 * service worker (no respondWith, so the browser handles them itself).
 *
 * Updates: the browser re-fetches this file on navigation (it is served with
 * Cache-Control: no-cache, see next.config.ts) and installs the new worker
 * when a byte changes; skipWaiting and clients.claim make it take over at
 * once. OFFLINE_REVISION is the first 12 hex digits of the SHA-256 of
 * public/offline.html, so a new offline page means a new worker and a fresh
 * copy (src/lib/pwa/service-worker.test.ts fails if they drift apart).
 *
 * Off switch, if this ever misbehaves: ship a version whose activate handler
 * deletes the caches and calls self.registration.unregister(), with no fetch
 * handler. Registered browsers pick it up on their next visit.
 */

const OFFLINE_REVISION = "aaaa078be3cb";
const CACHE_PREFIX = "albicocca-offline-";
const CACHE = CACHE_PREFIX + OFFLINE_REVISION;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // "reload": straight from the server, not from the HTTP cache.
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE).map((name) => caches.delete(name)));
      // The page request starts while the worker boots, instead of after.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.mode !== "navigate" || request.method !== "GET") return;

  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(request);
      } catch {
        // Only a network failure lands here. A server error (a 500, Render
        // waking up) is a response and goes to the page as it is.
        const offline = await caches.match(OFFLINE_URL, { cacheName: CACHE });
        return offline ?? Response.error();
      }
    })()
  );
});
