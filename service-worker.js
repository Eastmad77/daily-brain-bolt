/* BrainBolt Service Worker – minimal & safe */
const VERSION = 'v2.0.0';
const STATIC_CACHE = `bb-static-${VERSION}`;

// Assets you want cached for offline (add others as needed)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/firebase-config.js',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/app-icon.svg',
  '/header-graphic.svg',
  '/site.webmanifest',
  '/about.html',
  '/terms.html',
  '/privacy.html',
  '/contact.html',
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
      Promise.all(keys.map((k) => (k !== STATIC_CACHE ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// Network-first for CSV/Sheets; cache-first for static
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isSheets =
    url.hostname.includes('docs.google.com') ||
    url.pathname.endsWith('.csv');

  if (isSheets) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const resClone = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(event.request, resClone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        const resClone = res.clone();
        caches.open(STATIC_CACHE).then((c) => c.put(event.request, resClone));
        return res;
      }).catch(() => caches.match('/offline.html')); // optional
    })
  );
});
