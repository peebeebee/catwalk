// Service worker: lets the installed game start without a network.
// Network first, so a new deploy shows up as soon as the game is opened
// online; every file fetched is kept, and the kept copy is used offline.
const CACHE = "catwalk-v1";
const FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./vendor/matter.min.js",
  "./src/cat-motion.js",
  "./src/cat-physics.js",
  "./src/dog.js",
  "./src/game-rules.js",
  "./src/high-scores.js",
  "./src/sfx.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});
