// ======================================================
// The Daily Brain ⚡ Bolt — Service Worker v3.8.0
// (Fix: always bypass cache for Google Sheets CSV)
// ======================================================

const STATIC = 'tdbb-static-v3.8.0';
const RUNTIME = 'tdbb-runtime-v3.8.0';

const ASSETS = [
  '/', '/index.html',
  '/style.css', '/app.js', '/shell.js',
  '/about.html', '/contact.html', '/privacy.html', '/terms.html', '/signin.html', '/pro.html', '/admin.html', '/menu.html', '/404.html',
  '/favicon.svg', '/app-icon.svg', '/header-graphic.svg', '/icon-192.png', '/icon-512.png',
  '/site.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch { }
    }
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (![STATIC, RUNTIME].includes(key)) return caches.delete(key);
    }));
    await self.clients.claim();
  })());
});

/**
 * Robust matcher for published Google Sheets CSV URLs.
 * Examples:
 * - https://docs.google.com/spreadsheets/d/e/<pubid>/pub?gid=...&single=true&output=csv
 * - https://docs.google.com/spreadsheets/d/<id>/gviz/tq?tqx=out:csv&gid=...
 */
const isSheetsCsv = (inputUrl) => {
  try {
    const u = new URL(inputUrl);
    if (u.hostname !== 'docs.google.com') return false;

    const path = u.pathname || '';
    const query = u.search || '';

    const isSpreadsheetPath =
      path.startsWith('/spreadsheets/') ||
      path.includes('/spreadsheets/d/') ||
      path.includes('/spreadsheets/d/e/') ||
      path.includes('/spreadsheets/d/') ||
      path.includes('/gviz/');

    const isCsv =
      query.includes('output=csv') ||
      query.includes('out:csv') ||
      query.includes('tqx=out:csv');

    return isSpreadsheetPath && isCsv;
  } catch {
    return false;
  }
};

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // ✅ Always bypass caches for Google Sheets CSV
  if (isSheetsCsv(req.url)) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => Response.error())
    );
    return;
  }

  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;

        const network = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(STATIC);
        cache.put(req, network.clone());
        return network;
      } catch {
        const cache = await caches.open(STATIC);
        return (await cache.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    // For your own assets we still cache-first
    if (ASSETS.includes(url.pathname)) {
      event.respondWith(cacheFirst(req));
    } else {
      event.respondWith(staleWhileRevalidate(req));
    }
    return;
  }

  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  // ignoreSearch=true ensures /app.js?v=xxxx resolves to cached /app.js
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((res) => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => cached || Response.error());
  return cached || fetchPromise;
}
