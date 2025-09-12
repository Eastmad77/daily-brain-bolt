/* Brain Bolt SW */
const VERSION = 'v1.0.9';
const STATIC_CACHE = `bb-static-${VERSION}`;
const ASSETS = [
  '/', '/index.html', '/style.css', '/app.js',
  '/favicon.svg', '/icon-192.png', '/icon-512.png',
  '/app-icon.svg', '/site.webmanifest'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(STATIC_CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => ![STATIC_CACHE].includes(k)).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  e.respondWith(
    caches.match(request).then(r => r || fetch(request).then(resp => resp))
  );
});
