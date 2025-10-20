const CACHE_NAME = 'fs-v1';
const scopeUrl = new URL(self.registration.scope);
const shellEntries = [
  './',
  './index.php',
  './assets/css/app.css',
  './assets/js/app.js',
  './assets/js/api.js',
  './assets/js/db.js',
  './assets/js/editor.js',
  './assets/js/graph.js',
  './manifest.webmanifest'
];
const SHELL = shellEntries.map(path => new URL(path, scopeUrl).pathname);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(match => match || fetch(request))
  );
});
