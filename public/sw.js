// Service worker : l'appli s'ouvre même sans réseau (dernière version en cache)
const CACHE = 'mercato-v1'
self.addEventListener('install', (e) => { self.skipWaiting() })
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  // Réseau d'abord (pour recevoir les mises à jour), cache si hors ligne
  e.respondWith(
    fetch(req).then((res) => {
      const copie = res.clone()
      caches.open(CACHE).then((c) => c.put(req, copie))
      return res
    }).catch(() => caches.match(req).then((r) => r || caches.match('/')))
  )
})
