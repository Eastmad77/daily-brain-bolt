// Brain ⚡ Bolt Service Worker
// Cache version bumped to v3.2.0

const CACHE_NAME = "bb-cache-v3.2.0";
const ASSETS = [
  "/", "/index.html", "/style.css", "/app.js",
  "/about.html", "/contact.html", "/privacy.html", "/terms.html",
  "/signin.html", "/pro.html", "/admin.html", "/404.html",
  "/app-icon.svg", "/favicon.svg", "/header-graphic.svg",
  "/icon-192.png", "/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => k !== CACHE_NAME && caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  event.respondWith(
    caches.match(request).then((cached) => {
      return (
        cached ||
        fetch(request)
          .then((res) => {
            if (!res || res.status !== 200) return res;
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, resClone));
            return res;
          })
          .catch(() => cached)
      );
    })
  );
});
