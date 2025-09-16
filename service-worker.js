// Minimal SW (fix1) — avoids serving stale HTML/JS/CSS during rapid updates
const CACHE = 'bb-fix1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });

// Network-first for HTML/CSS/JS to prevent white-screen after deploy
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;

  // network-first for our app shell
  if (url.origin === self.location.origin && (url.pathname.endsWith('.html') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.pathname === '/')) {
    event.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return r;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // default: try cache, then network
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});
