/**
 * FlowTask Service Worker v2
 *
 * Strategy:
 *  - App shell (HTML, manifest, icons) → Cache-first, fallback to network
 *  - Firebase / API / external CDN     → Network-only (never cached)
 *  - Everything else same-origin       → Network-first, cache as fallback
 *
 * Bump CACHE_VERSION whenever you deploy a new build so old caches are purged.
 */

const CACHE_VERSION = 'flowtask-v2';

// App shell — pre-cached on install so the app loads offline
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

/* ── INSTALL ─────────────────────────────────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()) // activate immediately, don't wait for old SW to die
      .catch(err => console.warn('[SW] Pre-cache failed (non-fatal):', err))
  );
});

/* ── ACTIVATE ────────────────────────────────────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION) // delete all old cache versions
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim()) // take control of all open tabs immediately
  );
});

/* ── FETCH ───────────────────────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // ── Never intercept: non-GET, Firebase, Anthropic API, external CDNs ──
  if (
    request.method !== 'GET'                          ||
    url.pathname.startsWith('/api/')                  ||
    url.hostname.includes('firebaseio.com')           ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('googleapis.com')           ||
    url.hostname.includes('gstatic.com')              ||
    url.hostname.includes('anthropic.com')
  ) {
    return; // let the browser handle it normally
  }

  // ── App shell (navigation requests) → Cache-first ──
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html')
        .then(cached => cached || fetch(request))
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // ── Static assets (icons, manifest) → Cache-first ──
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(c => c.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // ── Everything else same-origin → Network-first, cache as fallback ──
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(c => c.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
