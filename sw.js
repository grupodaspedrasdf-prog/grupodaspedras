/* Service worker — deixa o app abrir sem internet.
   Ao publicar uma versão nova, mude o número do CACHE. */
const CACHE = 'pedras-v3';
const ARQUIVOS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './sync.js',
  './manifest.webmanifest',
  './icons/logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(e.request.method !== 'GET') return;

  // Firebase e fontes: sempre da rede, nunca do cache
  if(url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com') ||
     url.hostname.includes('firebaseio.com') || url.hostname.includes('firebaseapp.com')) return;

  // o app: cache primeiro (abre instantâneo e offline), atualizando por trás
  e.respondWith(
    caches.match(e.request).then(hit => {
      const rede = fetch(e.request).then(res => {
        if(res && res.status === 200 && res.type === 'basic'){
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copia));
        }
        return res;
      }).catch(() => hit);
      return hit || rede;
    })
  );
});
