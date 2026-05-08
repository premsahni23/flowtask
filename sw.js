/* ============================================================
   FlowTask Service Worker  —  v3
   Cache-first for app shell, network-only for Firebase/API.
   Bump the version string on every deploy to bust old caches.
   ============================================================ */

const CACHE = 'flowtask-v3';

const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

/* ── INSTALL: pre-cache the app shell ─────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: delete every old cache version ─────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── FETCH: serve from cache, fall back to network ─────────── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Pass through — never cache these */
  if (
    event.request.method !== 'GET'                          ||
    url.pathname.startsWith('/api/')                        ||
    url.hostname.includes('firebaseio.com')                 ||
    url.hostname.includes('firestore.googleapis.com')       ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com')     ||
    url.hostname.includes('googleapis.com')                 ||
    url.hostname.includes('gstatic.com')
  ) {
    return;
  }

  /* Navigation requests → always serve index.html from cache */
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then(r => r || fetch(event.request))
    );
    return;
  }

  /* Everything else → cache-first, populate cache on miss */
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        /* Offline fallback for navigation */
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
