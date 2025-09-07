// Simple service worker with a versioned cache-first strategy.
// Caches: app shell (index.html + manifest + sw itself) and phrases.json for offline use.
// Note: update CACHE_VERSION when you deploy a new build to force refresh.
const CACHE_VERSION = 'mh-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/phrases.json',
  // add other static assets if you add them (icons etc.)
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(err => {
        // best-effort caching
        console.warn('Precache failed', err);
      });
    })
  );
});

self.addEventListener('activate', event => {
  // clean up old caches
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // For navigation requests return the cached index.html (app shell) first, then network fallback
  if (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'))) {
    event.respondWith(
      caches.match('/index.html').then(cached => {
        const network = fetch(req).then(resp => {
          // update cache in background
          caches.open(CACHE_VERSION).then(cache => cache.put('/index.html', resp.clone()));
          return resp.clone();
        }).catch(() => null);
        return cached || network;
      })
    );
    return;
  }

  // For API/static assets (phrases.json etc.) use cache-first
  if (req.url.endsWith('/phrases.json') || req.url.includes('/static/') || req.destination === 'script') {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(resp => {
          if (resp && resp.status === 200) {
            caches.open(CACHE_VERSION).then(cache => cache.put(req, resp.clone()));
          }
          return resp;
        }).catch(err => {
          // offline fallback: return cached if available
          return caches.match('/phrases.json');
        });
      })
    );
    return;
  }

  // Default: try network then fallback to cache
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});