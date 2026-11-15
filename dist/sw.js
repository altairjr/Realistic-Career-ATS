/* Service worker: deixa o app abrir sem internet.
   - Página: tenta a rede primeiro (sempre sem o cache do navegador, para pegar a versão nova) e cai para a cópia guardada se estiver offline ou lento.
   - Ícones e manifesto: cópia guardada primeiro.
   - Fontes do Google: cópia guardada, atualizada em segundo plano.
   - Chamadas ao servidor de sincronização nunca passam por aqui.
   A marca de versão (no nome do cache abaixo) é trocada pelo build a cada versão, o que renova o cache. */
const CACHE = 'carreira-ats-0.20.0-f520fa89';
const FONTS = 'carreira-ats-fontes';
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  // cache: 'reload' busca no servidor, ignorando a cópia de até 10 min que o GitHub Pages deixa no navegador
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('carreira-ats-') && k !== CACHE && k !== FONTS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const timeout = (ms, p) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('lento')), ms); p.then(v => { clearTimeout(t); res(v); }, x => { clearTimeout(t); rej(x); }); });

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      e.respondWith((async () => {
        const cache = await caches.open(CACHE);
        try { const res = await timeout(4000, fetch(req.url, { cache: 'no-store', credentials: 'same-origin' })); if (res.ok) cache.put('./', res.clone()); return res; }
        catch (x) { return (await cache.match('./')) || Response.error(); }
      })());
      return;
    }
    e.respondWith(caches.open(CACHE).then(async cache => {
      const hit = await cache.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res;
    }));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async cache => {
      const hit = await cache.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; });
      if (hit) { net.catch(() => {}); return hit; }
      return net;
    }));
  }
});
