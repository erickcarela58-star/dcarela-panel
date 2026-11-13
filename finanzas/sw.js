const CACHE = 'dcarela-finanzas-v35-26';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app.css',
  './minimal-v34.css',
  './monochrome-glass-v35.css?v=35.26',
  './v35-26-motion.css?v=35.26',
  './app.js?v=35.26',
  './data-source.js?v=35.26',
  './demo-data.js',
  './v35-26-category-emojis.js?v=35.26',
  './v35-26-inbox-fiscal.js?v=35.26',
  './icons/dcarela-logo.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/bancos/popular.png',
  './assets/bancos/banreservas.png',
  './assets/bancos/bhd.png',
  './assets/bancos/qik.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for Finanzas documents/modules so version upgrades land immediately on iPhone,
  // with full offline fallback from cache.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }
  const title = String(payload.title || "D' Carela · Finanzas");
  const body = String(payload.body || 'Tienes una actualización financiera pendiente.');
  const targetUrl = String(payload.url || payload.data?.url || './?inbox=all');
  const kind = String(payload.kind || payload.data?.kind || 'finance');
  const urgent = ['cut', 'consumption', 'payment_alert', 'mail_movement'].includes(kind);

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: String(payload.tag || `dcarela-${kind}-${Date.now()}`),
      renotify: true,
      requireInteraction: urgent,
      data: { ...(payload.data || {}), url: targetUrl, kind },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification?.data?.url || './?inbox=all', self.location.href).href;

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.focus();
        client.postMessage({ type: 'DCARELA_PUSH_OPEN', url: targetUrl });
        if ('navigate' in client) {
          try { await client.navigate(targetUrl); } catch { /* Safari standalone fallback via postMessage */ }
        }
        return;
      }
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});
