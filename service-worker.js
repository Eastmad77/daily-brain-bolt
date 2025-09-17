// Brain ⚡ Bolt — service-worker.js
// - Precaches core app shell
// - Always fetches Google Sheets CSV fresh (no caching)
// - SWR for runtime assets, cache-first for static shell
// - Avoids preload race warnings by waiting on promises

const STATIC = "bb-static-v1";
const RUNTIME = "bb-runtime-v1";

const ASSETS = [
  "/", "/index.html",
  "/style.css", "/app.js", "/shell.js",
  "/about.html", "/contact.html", "/privacy.html", "/terms.html",
  "/signin.html", "/pro.html", "/admin.html", "/menu.html", "/404.html",
  "/favicon.svg", "/app-icon.svg", "/header-graphic.svg",
  "/icon-192.png", "/icon-512.png",
  "/site.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC);
    await cache.addAll(ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Enable navigation preload if available
    if ("navigationPreload" in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      if (k !== STATIC && k !== RUNTIME) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

const isSheetsCsv = (url) => {
  try {
    const u = new URL(url);
    return (
      u.hostname.includes("docs.google.com") &&
      u.pathname.includes("/spreadsheets/") &&
      (u.search || "").includes("output=csv")
    );
  } catch { return false; }
};

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Always live-fetch the Google Sheets CSV
  if (isSheetsCsv(req.url)) {
    event.respondWith(fetch(req, { cache: "no-store" }).catch(() => Response.error()));
    return;
  }

  const url = new URL(req.url);

  // Navigations: network-first, fallback to cached index
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;

        const net = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(STATIC);
        cache.put(req, net.clone());
        return net;
      } catch {
        const cache = await caches.open(STATIC);
        return (await cache.match("/index.html")) || Response.error();
      }
    })());
    return;
  }

  // Same-origin static assets: cache-first
  if (url.origin === self.location.origin && ASSETS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const net = await fetch(req);
        if (net && net.ok) cache.put(req, net.clone());
        return net;
      } catch {
        return hit || Response.error();
      }
    })());
    return;
  }

  // Everything else: stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req).then((net) => {
      if (net && net.ok) cache.put(req, net.clone());
      return net;
    }).catch(() => cached || Response.error());
    return cached || fetchPromise;
  })());
});
