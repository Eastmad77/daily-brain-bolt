const VERSION='v1.4.0'; // bump this whenever you change CSV URLs or assets
const STATIC_CACHE=`bb-static-${VERSION}`;
const APP_SHELL=[
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/favicon.svg',
  '/app-icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/site.webmanifest'
];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(STATIC_CACHE).then(c=>c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>
    Promise.all(keys.filter(k=>k!==STATIC_CACHE).map(k=>caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(/docs\.google\.com/.test(url.hostname)){
    // always fetch live/bank directly (don’t cache Google Sheets)
    return;
  }
  e.respondWith(
    fetch(e.request).then(res=>{
      const copy=res.clone();
      caches.open(STATIC_CACHE).then(c=>c.put(e.request,copy));
      return res;
    }).catch(()=>caches.match(e.request))
  );
});
