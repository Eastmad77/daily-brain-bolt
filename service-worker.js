const CACHE = 'bb-fix3';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;

  if (url.origin === self.location.origin &&
      (url.pathname.endsWith('.html') || url.pathname.endsWith('.css') ||
       url.pathname.endsWith('.js') || url.pathname === '/')) {
    event.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return r;
      }).catch(() => caches.match(req))
    );
    return;
  }
  event.respondWith(caches.match(req).then(c => c || fetch(req)));
});
