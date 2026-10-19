/* Service worker: keeps the app files (and the two libraries) cached so Chrono Map opens offline and
 * installs to the home screen. Map tiles and Google APIs always go straight to the network.
 * Bump VERSION when you want every device to drop its old cache on the next visit. */
const VERSION = 'chronomap-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/config.js', './js/dates.js', './js/ui.js', './js/sample.js', './js/store.js', './js/photos.js', './js/graph.js', './js/map.js',
  './js/editor.js', './js/ties.js', './js/network.js', './js/data.js', './js/sync.js', './js/app.js',
  './assets/chronomap.png', './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cacheable = url.origin === location.origin || url.host === 'cdnjs.cloudflare.com';
  if (!cacheable) return; // tiles, Google sign-in, Drive: network only

  // The page itself: network first so a new release shows up, cache when offline.
  if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  // Everything else: serve from cache at once, refresh the cache in the background.
  e.respondWith(caches.match(req).then(cached => {
    const net = fetch(req).then(r => { if (r && r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; }).catch(() => cached);
    return cached || net;
  }));
});
