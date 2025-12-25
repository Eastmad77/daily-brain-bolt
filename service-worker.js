/* Brain ⚡ Bolt — Service Worker (safe-cache, non-blocking) */
const CACHE_VERSION = "bb-v5103"; // 🔁 bump to force clients onto new cache
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/shell.js",
  "/menu.html",
  "/about.html",
  "/contact.html",
  "/privacy.html",
  "/terms.html",
  "/signin.html",
  "/pro.html",
  "/admin.html",
  "/404.html",
  "/site.webmanifest",
  "/favicon.svg",
  "/app-icon.svg",
  "/header-graphic.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/papaparse.min.js"
];

// Cache first for local assets; network for cross-origin (e.g., Google Sheets CSV).
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // ✅ Non-blocking precache: don't fail install if any single file 404s.
    await Promise.allSettled(
      CORE_ASSETS.map((url) => cache.add(new Request(url, { cache: "reload" })))
    );
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE_VERSION ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const href = url.href;

  // ✅ HARD RULE: never cache Sheets/CSV (even across redirects)
  // Covers:
  // - docs.google.com
  // - any URL containing output=csv (including published links)
  // - gviz/tq endpoints
  const isSheetsCsv =
    href.includes("docs.google.com") ||
    href.includes("output=csv") ||
    href.includes("/gviz/tq");

  if (isSheetsCsv) {
    event.respondWith(fetch(req, { cache: "no-store" }));
    return;
  }

  // Don't cache other cross-origin requests — always go network.
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(req));
    return;
  }

  // ✅ For navigations, go network-first so deploy updates show up immediately.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        if (fresh && fresh.ok && fresh.type === "basic") {
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        return (await cache.match(req)) || (await cache.match("/index.html")) || Response.error();
      }
    })());
    return;
  }

  // Cache-first for same-origin assets
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      // Cache successful basic responses
      if (res && res.ok && res.type === "basic") {
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      return Response.error();
    }
  })());
});
