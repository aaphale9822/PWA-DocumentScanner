// sw.js – Service Worker for PrivateScan PWA
// Cache core assets for offline use (HTML, CSS, JS, manifest, icons)
const CACHE_NAME = 'privatescan-v1';
const CORE_ASSETS = [
  '/',
  'index.html',
  'manifest.json',
  'css/styles.css',
  'js/opencv.js',
  'js/db.js',
  'js/camera.js',
  'js/cropper.js',
  'js/processor.js',
  'js/export.js',
  'js/main.js',
  // URLs for external libs (CDN) – they will be cached when fetched
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.0/jszip.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      })
    ))
  );
});

self.addEventListener('fetch', event => {
  // Use cache-first strategy for core assets, network fallback for others
  const url = new URL(event.request.url);
  if (CORE_ASSETS.includes(url.pathname) || CORE_ASSETS.includes(event.request.url)) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request).then(resp => {
        // Update cache with fresh copy
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return resp;
      }))
    );
  } else {
    // Network first for dynamic content (e.g., images fetched via Blob URLs are not cached anyway)
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
  }
});
