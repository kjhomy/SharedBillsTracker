// Minimal offline-viewing cache — no write-queueing, per the roadmap decision
// that offline support is view-only. Two strategies, both scoped to
// same-origin GET requests so Supabase calls and mutations are never touched:
//
//   - hashed /_next/static/ assets: cache-first (the URL changes when the
//     content does, so a cached copy is always safe to reuse)
//   - page navigations: network-first, falling back to the last cached copy
//     (or the cached dashboard) when the network fetch fails
//
// Client-side route transitions in Next.js are RSC data fetches, not
// `navigate`-mode requests, so they're deliberately left untouched here —
// only real browser navigations and static assets are cached.

const CACHE_NAME = 'household-bills-v1';
const PRECACHE_URLS = ['/', '/bills', '/bills/recurring', '/household', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
  }
});
