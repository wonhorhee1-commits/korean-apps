const CACHE_NAME = 'korean-coach-v14';
const ASSETS = [
  './',
  './index.html',
  '../korean-core.js',
  './data/vocab.json',
  './data/grammar.json',
  './data/error_drills.json',
  './data/grammar_context.json',
  './data/reading_drills.json',
  './data/register_drills.json',
  './data/dialogue_drills.json'
];

// Install: cache all core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for data files (to get updates), cache-first for everything else
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Data JSON files: try network first, fall back to cache
  if (url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Firebase SDK: network only (not cacheable / not needed offline)
  if (url.hostname === 'www.gstatic.com') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else: network first, fall back to cache (ensures updates reach users)
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
