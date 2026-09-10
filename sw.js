/* Service worker — mantém o app funcionando sem internet,
   mas sem ficar teimoso quando há versão nova.

   Estratégia: rede primeiro, cache como rede de segurança.
   - Com internet: sempre a versão mais recente (e o cache é atualizado).
   - Sem internet, ou rede lenta (mais de 3s): entra o cache e o app abre igual.
   Ao publicar uma versão nova, mude o número do CACHE. */
const CACHE = 'pedras-v11';
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
const ESPERA_REDE = 3000;

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
  if(url.origin !== self.location.origin) return;   // Firebase e fontes: direto da rede

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);

    // 1) tenta a rede, com prazo — assim uma conexão ruim não trava a abertura
    try{
      const res = await Promise.race([
        fetch(e.request),
        new Promise((_, rej) => setTimeout(() => rej(new Error('lenta')), ESPERA_REDE))
      ]);
      if(res && res.status === 200) cache.put(e.request, res.clone());
      return res;
    }catch(err){
      // 2) rede fora ou lenta: entrega o que está guardado
      const hit = await cache.match(e.request) || await cache.match('./index.html');
      if(hit) return hit;
      throw err;
    }
  })());
});
