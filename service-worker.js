/* Brain ⚡ Bolt — Service Worker (CSV freshness hardened) */
const VERSION = 'v2.0.1';
const STATIC_CACHE = `bb-static-${VERSION}`;
const RUNTIME_CACHE = `bb-runtime-${VERSION}`;

const STATIC_ASSETS = [
  '/',
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
  '/signin.html',
  '/404.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => {
        if (![STATIC_CACHE, RUNTIME_CACHE].includes(k)) return caches.delete(k);
      })
    );
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

const isSameOrigin = (url) => new URL(url, self.location.origin).origin === self.location.origin;
const isSheetsCsv = (url) => {
  const u = new URL(url, self.location.origin);
  return (
    u.hostname.includes('docs.google.com') &&
    u.pathname.includes('/spreadsheets/')
  ) || (u.search && /(^|[?&])output=csv(&|$)/i.test(u.search));
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const urlStr = request.url;

  // Always fetch published Google Sheets CSV fresh
  if (isSheetsCsv(urlStr)) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  // Same-origin handling
  if (isSameOrigin(urlStr)) {
    const url = new URL(urlStr);

    // Navigations: prefer network, fall back to cached index
    if (request.mode === 'navigate') {
      event.respondWith(networkFirstNavigate(event));
      return;
    }

    // Known static assets: cache-first
    if (STATIC_ASSETS.includes(url.pathname)) {
      event.respondWith(cacheFirst(request));
      return;
    }

    // Other same-origin requests: stale-while-revalidate
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Cross-origin: just fetch
  event.respondWith(fetch(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request, { ignoreVary: true, ignoreSearch: true });
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached || Promise.reject(new Error('Network error')));
  return cached || fetchPromise;
}

async function networkFirstNavigate(event) {
  const cache = await caches.open(STATIC_CACHE);
  const preloaded = await event.preloadResponse;
  if (preloaded) {
    cache.put(event.request, preloaded.clone());
    return preloaded;
  }
  try {
    const res = await fetch(event.request, { cache: 'no-store' });
    if (res && res.ok) cache.put(event.request, res.clone());
    return res;
  } catch (err) {
    const fallback = await cache.match('/index.html');
    if (fallback) return fallback;
    throw err;
  }
}
