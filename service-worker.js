/* Brain ⚡ Bolt — Service Worker */
const VERSION = 'v1.1.0';
const STATIC_CACHE = `bb-static-${VERSION}`;
const RUNTIME_CACHE = `bb-runtime-${VERSION}`;

const STATIC_ASSETS = [
  '/',                       // index
  '/index.html',
  '/style.css',
  '/app.js',
  '/firebase-config.js',
  '/site.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/app-icon.svg',
  '/header-graphic.svg',
  '/about.html',
  '/terms.html',
  '/privacy.html',
  '/contact.html',
  '/menu.html',
  '/pro.html',
  '/404.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Helper: is same-origin request
const isSameOrigin = (url) => new URL(url, self.location.origin).origin === self.location.origin;

// We do:
// - cache-first for same-origin static files
// - network-first (no-cache) for Google Sheets CSV requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET
  if (request.method !== 'GET') return;

  // Google Sheets CSV (live/bank) → network-first with fallback to cache
  const isSheets = url.hostname.includes('docs.google.com') && url.pathname.includes('/spreadsheets/');

  if (isSheets) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Same-origin static → cache-first
  if (isSameOrigin(request.url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else → just fetch
  event.respondWith(fetch(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    // Offline fallback for navigations
    if (request.mode === 'navigate') {
      const fallback = await cache.match('/index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await fetch(request, { cache: 'no-store' });
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}
