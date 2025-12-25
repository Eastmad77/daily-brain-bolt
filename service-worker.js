// ======================================================
// The Daily Brain ⚡ Bolt — Service Worker v3.9.0
// Fix: network-only for Google Sheets / CSV (no caching)
// ======================================================

const STATIC = "tdbb-static-v3.9.0";
const RUNTIME = "tdbb-runtime-v3.9.0";

const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/shell.js",
  "/about.html",
  "/contact.html",
  "/privacy.html",
  "/terms.html",
  "/signin.html",
  "/pro.html",
  "/admin.html",
  "/menu.html",
  "/404.html",
  "/favicon.svg",
  "/app-icon.svg",
  "/header-graphic.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/site.webmanifest",
];

// --- helpers ---
function isGoogleSheetsCSV(url) {
  const u = typeof url === "string" ? url : url.url || "";
  return (
    u.includes("docs.google.com") ||
    u.includes("spreadsheets/d/") ||
    u.includes("gviz/tq") ||
    u.includes("output=csv") ||
    u.includes("tqx=out:csv") ||
    u.includes("/pub?") ||
    u.includes("/pubhtml")
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached || Response.error());
  return cached || fetchPromise;
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC);
      await cache.addAll(ASSETS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC && k !== RUNTIME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // ✅ Rule you asked for: network-only for Sheets/CSV
  if (isGoogleSheetsCSV(url.href)) {
    event.respondWith(fetch(req));
    return;
  }

  // Navigation: network-first (so new deploys show up)
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }

  // CSS/JS: stale-while-revalidate (fast + updates soon)
  if (req.destination === "script" || req.destination === "style") {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Images/icons: cache-first
  if (req.destination === "image") {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Default
  event.respondWith(staleWhileRevalidate(req));
});
