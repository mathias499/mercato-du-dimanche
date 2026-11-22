// Service worker : l'appli s'ouvre même sans réseau (dernière version en cache) + notifications
const CACHE = 'mercato-v2'
self.addEventListener('install', (e) => { self.skipWaiting() })
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  if (new URL(req.url).pathname.startsWith('/api/')) return
  // Réseau d'abord (pour recevoir les mises à jour), cache si hors ligne
  e.respondWith(
    fetch(req).then((res) => {
      const copie = res.clone()
      caches.open(CACHE).then((c) => c.put(req, copie))
      return res
    }).catch(() => caches.match(req).then((r) => r || caches.match('/')))
  )
})
// Notification reçue
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch (err) { d = { body: e.data && e.data.text() } }
  e.waitUntil(self.registration.showNotification(d.title || 'Le Mercato du dimanche', {
    body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', data: { url: d.url || '/' }, tag: d.tag || undefined,
  }))
})
// Appui sur la notification : ouvre l'appli
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ('focus' in c) { try { c.postMessage({ type: 'notif-clic', url }) } catch (err) {} return c.focus() } }
    return self.clients.openWindow(url)
  }))
})
