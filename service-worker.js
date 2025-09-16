// Brain ⚡ Bolt SW — v3.2.1 (navigation preload handled)

const STATIC = 'bb-static-v3.2.1';
const RUNTIME = 'bb-runtime-v3.2.1';

const ASSETS = [
  '/', '/index.html', '/style.css', '/app.js',
  '/about.html','/contact.html','/privacy.html','/terms.html','/signin.html','/pro.html','/admin.html','/404.html',
  '/app-icon.svg','/favicon.svg','/header-graphic.svg','/icon-192.png','/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Enable navigation preload to speed up navigations
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (![STATIC, RUNTIME].includes(k)) && caches.delete(k)));
    await self.clients.claim();
  })());
});

// Treat Google Sheets CSV as network-only (fresh)
const isSheetsCsv = (url) => {
  const u = new URL(url, self.location.origin);
  return (u.hostname.includes('docs.google.com') && u.pathname.includes('/spreadsheets/')) ||
         (u.search && /(^|[?&])output=csv(&|$)/i.test(u.search));
};

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Always bypass cache for the live CSV
  if (isSheetsCsv(url.href)) {
    event.respondWith(fetch(req, { cache: 'no-store' }).catch(() => Response.error()));
    return;
  }

  // Handle navigations using navigationPreload (preloadResponse), avoiding the console warning
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;     // ✅ wait for preloadResponse
        if (preload) return preload;
        const net = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(STATIC);
        cache.put(req, net.clone());
        return net;
      } catch {
        const cache = await caches.open(STATIC);
        return (await cache.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  // Same-origin: cache-first for static, then SWR for others
  if (url.origin === self.location.origin) {
    if (ASSETS.includes(url.pathname)) {
      event.respondWith(cacheFirst(req));
    } else {
      event.respondWith(staleWhileRevalidate(req));
    }
    return;
  }

  // Cross-origin: network then fallback
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

async function cacheFirst(request){
  const cache = await caches.open(STATIC);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}
async function staleWhileRevalidate(request){
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(res => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => cached || Response.error());
  return cached || fetchPromise;
}
