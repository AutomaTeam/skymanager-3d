/* Service worker de SkyManager 3D (E01) : le jeu marche hors ligne apres un premier chargement.
   - Le tampon de version vient de l'URL d'enregistrement (sw.js?v=NNN) : un bump du tampon
     (`npm run bump`) change le nom du cache et efface les anciens.
   - Page, css : reseau d'abord (nouveautes), cache en secours.
   - js ?v=, three.js (CDN), modeles .glb, icones : cache d'abord, rempli a la volee. */
const V = new URL(self.location.href).searchParams.get('v') || '0';
const CACHE = 'skymanager-' + V;

/* Coquille minimale mise en cache des l'installation (la page et ses styles). */
const SHELL = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'assets/icons/icon-192.png', 'https://cdn.tailwindcss.com'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const u of SHELL) {
      try {
        const cross = u.startsWith('http');
        const res = await fetch(u, cross ? { mode: 'no-cors' } : undefined);
        if (res.ok || res.type === 'opaque') await cache.put(u, res);
      } catch (err) { /* sera repris au prochain chargement */ }
    }
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('skymanager-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;
  /* Cache d'abord seulement pour ce qui ne change jamais a URL egale : fichiers a tampon ?v=,
     CDN (three.js, tailwind) et assets. Le reste (page, css, outils) : reseau d'abord. */
  const stable = url.searchParams.has('v') || url.origin !== self.location.origin || url.pathname.includes('/assets/');
  const isPage = !stable;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (isPage) {
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        return (await cache.match(req)) || (await cache.match('./')) || Response.error();
      }
    }
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    } catch (err) {
      return Response.error();
    }
  })());
});

/* Au premier chargement la page n'est pas encore controlee : elle nous envoie la liste de ce
   qu'elle a deja telecharge (performance.getEntriesByType('resource')) pour le mettre en cache. */
self.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'precache' || !Array.isArray(e.data.urls)) return;
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const u of e.data.urls) {
      try {
        const url = new URL(u);
        if (!/^https?:$/.test(url.protocol) || await cache.match(u)) continue;
        let res = await fetch(u).catch(() => null);
        if (!res) res = await fetch(u, { mode: 'no-cors' });          // CDN sans en-tete CORS (script classique)
        if (res.ok || res.type === 'opaque') await cache.put(u, res);
      } catch (err) { /* ressource ignoree */ }
    }
  })());
});
