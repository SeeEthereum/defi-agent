/**
 * public/sw.js, run in a fake worker scope: what it caches, what it touches,
 * and what a page gets online, offline and on a server error.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const SW_SOURCE = readFileSync(path.join(ROOT, "public/sw.js"), "utf8");
const OFFLINE_PAGE = readFileSync(path.join(ROOT, "public/offline.html"));

type Listener = (event: unknown) => void;

function fakeCacheStorage(existing: string[] = []) {
  const stores = new Map<string, Map<string, Response>>(existing.map((name) => [name, new Map()]));
  const added: Request[] = [];
  return {
    added,
    names: () => [...stores.keys()],
    api: {
      open: async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const store = stores.get(name)!;
        return {
          add: async (request: Request) => {
            added.push(request);
            store.set(new URL(request.url, "https://app.test").pathname, new Response("offline page", { status: 200 }));
          },
        };
      },
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      match: async (url: string, options?: { cacheName?: string }) => {
        const store = options?.cacheName ? stores.get(options.cacheName) : undefined;
        return store?.get(url)?.clone();
      },
    },
  };
}

function loadWorker(options: { fetch?: (r: Request) => Promise<Response>; caches?: ReturnType<typeof fakeCacheStorage> } = {}) {
  const listeners = new Map<string, Listener>();
  const caches = options.caches ?? fakeCacheStorage();
  const self = {
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
    registration: { navigationPreload: { enable: vi.fn(async () => {}) } },
  };
  const fetchSpy = vi.fn(options.fetch ?? (async () => new Response("page", { status: 200 })));
  // In a worker, relative URLs resolve against the worker's own origin.
  class WorkerRequest extends Request {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(typeof input === "string" ? new URL(input, "https://app.test").href : input, init);
    }
  }
  vm.runInNewContext(SW_SOURCE, { self, caches: caches.api, fetch: fetchSpy, Request: WorkerRequest, Response, URL, Promise });
  return { listeners, self, caches, fetchSpy };
}

/** Dispatch an ExtendableEvent and wait for what it waits on. */
async function lifecycle(listener: Listener) {
  let pending: Promise<unknown> = Promise.resolve();
  listener({ waitUntil: (p: Promise<unknown>) => (pending = p) });
  await pending;
}

/** Dispatch a FetchEvent; resolves to the response, or null when the worker stays out of it. */
async function navigate(listener: Listener, request: Request, preloadResponse: Promise<Response | undefined> = Promise.resolve(undefined)) {
  const box: { responded: Promise<Response> | null } = { responded: null };
  listener({ request, preloadResponse, respondWith: (p: Promise<Response>) => (box.responded = p) });
  return box.responded === null ? null : await box.responded;
}

/** Request.mode can't be set to "navigate" from the constructor; this stands in for one. */
function pageRequest(url: string, method = "GET") {
  return { url, method, mode: "navigate" } as unknown as Request;
}

describe("service worker", () => {
  it("names its cache after the offline page it holds", () => {
    const revision = createHash("sha256").update(OFFLINE_PAGE).digest("hex").slice(0, 12);
    // If this fails, public/offline.html changed: put the new hash in sw.js
    // so installed apps fetch the new page.
    expect(SW_SOURCE).toContain(`const OFFLINE_REVISION = "${revision}";`);
  });

  it("caches the offline page alone, bypassing the HTTP cache", async () => {
    const { listeners, caches, self } = loadWorker();
    await lifecycle(listeners.get("install")!);
    expect(caches.added.map((r) => new URL(r.url, "https://app.test").pathname)).toEqual(["/offline.html"]);
    expect(caches.added[0].cache).toBe("reload");
    expect(self.skipWaiting).toHaveBeenCalled();
  });

  it("drops its own old caches on activate and leaves other caches alone", async () => {
    const storage = fakeCacheStorage(["albicocca-offline-000000000000", "someone-else"]);
    const { listeners, self, caches } = loadWorker({ caches: storage });
    await lifecycle(listeners.get("install")!);
    await lifecycle(listeners.get("activate")!);
    expect(caches.names()).toEqual(["someone-else", expect.stringMatching(/^albicocca-offline-[0-9a-f]{12}$/)]);
    expect(self.registration.navigationPreload.enable).toHaveBeenCalled();
    expect(self.clients.claim).toHaveBeenCalled();
  });

  it("stays out of everything that is not a page load", async () => {
    const { listeners, fetchSpy } = loadWorker();
    const onFetch = listeners.get("fetch")!;
    for (const request of [
      new Request("https://app.test/api/wallet/balances"),
      new Request("https://app.test/api/swap/execute", { method: "POST", body: "{}" }),
      new Request("https://app.test/_next/static/chunks/app.js"),
      new Request("https://app.test/swap?_rsc=1", { headers: { RSC: "1" } }),
      pageRequest("https://app.test/form", "POST"),
    ]) {
      expect(await navigate(onFetch, request)).toBeNull();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("loads pages from the network when online", async () => {
    const { listeners, fetchSpy } = loadWorker({ fetch: async () => new Response("live dashboard") });
    const response = await navigate(listeners.get("fetch")!, pageRequest("https://app.test/"));
    expect(await response!.text()).toBe("live dashboard");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("uses the navigation preload when the browser made one", async () => {
    const { listeners, fetchSpy } = loadWorker();
    const response = await navigate(listeners.get("fetch")!, pageRequest("https://app.test/wallet"), Promise.resolve(new Response("preloaded")));
    expect(await response!.text()).toBe("preloaded");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows the offline page when the network fails", async () => {
    const { listeners } = loadWorker({
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    await lifecycle(listeners.get("install")!);
    const response = await navigate(listeners.get("fetch")!, pageRequest("https://app.test/swap"));
    expect(await response!.text()).toBe("offline page");
  });

  it("shows the offline page when the preload itself fails", async () => {
    const { listeners } = loadWorker();
    await lifecycle(listeners.get("install")!);
    const response = await navigate(listeners.get("fetch")!, pageRequest("https://app.test/swap"), Promise.reject(new TypeError("offline")));
    expect(await response!.text()).toBe("offline page");
  });

  it("passes a server error through instead of claiming the device is offline", async () => {
    const { listeners } = loadWorker({ fetch: async () => new Response("bad gateway", { status: 502 }) });
    await lifecycle(listeners.get("install")!);
    const response = await navigate(listeners.get("fetch")!, pageRequest("https://app.test/"));
    expect(response!.status).toBe(502);
  });
});
