/* Brain ⚡ Bolt — Service Worker */
const VERSION = 'v1.7.0';  // bumped: success splash + splash fix
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
  '/pro.html',
  '/admin.html',
  '/signin.html',
  '/404.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

const isSameOrigin = (url) => new URL(url, self.location.origin).origin === self.location.origin;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSheets = url.hostname.includes('docs.google.com') && url.pathname.includes('/spreadsheets/');

  if (isSheets) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isSameOrigin(request.url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

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
