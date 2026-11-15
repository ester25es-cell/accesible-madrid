// Funcionamiento sin conexión de Accesible Madrid.
// Con conexión: carga siempre la última versión y la guarda.
// Sin conexión: usa la copia guardada.
const CACHE = 'accesible-madrid-v2';
const FILES = ['./', 'index.html', 'engine.js', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  const propio = url.startsWith(self.location.origin);
  const fuente = url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com');
  if (!propio && !fuente) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then(hit => hit || caches.match('index.html')))
  );
});
