const CACHE_NAME = 'route-planner-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // DO NOT intercept API calls or external requests - let them pass through
  if (url.includes('/api/') || url.includes('nominatim') || url.includes('photon.komoot') || url.includes('tile.openstreetmap')) {
    return; // Let the browser handle it normally
  }

  // Cache-first for local static assets only
  event.respondWith(
    caches.match(event.request).then(r => r || fetch(event.request))
  );
});
