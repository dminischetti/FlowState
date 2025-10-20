const CACHE_NAME = 'fs-v4';
const scopeUrl = new URL(self.registration.scope);

// Only static assets, no .php or root requests
const shellEntries = [
  './assets/css/app.css',
  './assets/js/app.js',
  './assets/js/api.js',
  './assets/js/db.js',
  './assets/js/editor.js',
  './assets/js/graph.js',
  './manifest.webmanifest'
];

const SHELL = shellEntries.map(path => new URL(path, scopeUrl).href);

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      for (const url of SHELL) {
        try {
          const response = await fetch(url, { cache: 'no-store' });
          if (response.ok) {
            await cache.put(url, response);
            console.log('[SW] Cached:', url);
          } else {
            console.warn('[SW] Skipped (bad status):', url, response.status);
          }
        } catch (err) {
          console.warn('[SW] Failed to cache:', url, err.message);
        }
      }
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)));
      console.log('[SW] Active, old caches cleared');
      self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 🚫 Skip PHP or root fetches to avoid 500
  if (url.pathname === '/' || url.pathname.endsWith('.php')) {
    return; // let browser handle it normally (no interception)
  }

  // Network-first for API routes
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  // Cache-first for static assets
  event.respondWith(caches.match(request).then(match => match || fetch(request)));
});
