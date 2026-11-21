// DCARELA_PWA_VERSION: 35.63
const CACHE = 'dcarela-finanzas-v35-63';
const SHELL = [
  '../nube-config.js',
  '../nube-sdk/compat.mjs',
  '../nube-sdk/core.mjs',
  '../nube-sdk/app.mjs',
  '../nube-sdk/auth.mjs',
  '../nube-sdk/firestore.mjs',
  './facturador-sales.mjs?v=35.63',
  './facturador-sales.css?v=35.63',
  './',
  './index.html',
  './plaza.html',
  './manifest.webmanifest',
  './manifest-plaza.webmanifest',
  './app.css?v=35.63',
  './minimal-v34.css',
  './monochrome-glass-v35.css?v=35.63',
  './apple-motion.css?v=35.63',
  './v35-26-motion.css?v=35.63',
  './apple-motion.mjs?v=35.63',
  './app.js?v=35.63',
  './data-source.js?v=35.63',
  './demo-data.js?v=35.63',
  './v35-26-category-emojis.js?v=35.63',
  './v35-26-inbox-fiscal.js?v=35.63',
  './cut-review.js?v=35.63',
  './icons/dcarela-logo.png',
  './icons/apple-touch-icon.png',
  './icons/apple-touch-icon-plaza.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-plaza-192.png',
  './icons/icon-plaza-512.png',
  './assets/bancos/popular.png',
  './assets/bancos/banreservas.png',
  './assets/bancos/bhd.png',
  './assets/bancos/qik.png',
  './assets/emojis/1f4b8.png',
  './assets/emojis/1f4b0.png',
  './assets/emojis/1f501.png',
  './assets/emojis/23f0.png',
  './assets/emojis/1f514.png',
  './assets/emojis/1f4b3.png',
  './assets/emojis/1f9fe.png',
  './assets/emojis/2709.png',
  './assets/emojis/1f4d1.png',
  './assets/emojis/1f5a5.png',
  './assets/emojis/1f3a8.png',
  './assets/emojis/1f58c.png',
  './assets/emojis/2600.png',
  './assets/emojis/1f319.png',
  './assets/emojis/1f3e2.png',
  './assets/emojis/1f310.png',
  './assets/emojis/1f4b1.png',
  './assets/emojis/2728.png',
  './assets/emojis/2705.png',
  './assets/emojis/26a0.png',
  './assets/emojis/1f6a8.png',
  './assets/emojis/1f4cb.png',
  './assets/emojis/1f4e5.png',
  './assets/emojis/1f4e4.png',
  './assets/emojis/1f3e6.png',
  './assets/emojis/1f4b5.png',
  './assets/emojis/1f3f7.png',
  './assets/emojis/1f50d.png',
  './assets/emojis/1f4c5.png',
  './assets/emojis/1f5d3.png',
  './assets/emojis/1f4ca.png',
  './assets/emojis/2699.png',
  './assets/emojis/1f4f8.png',
  './assets/emojis/1f3ac.png',
  './assets/emojis/1f4bb.png',
  './assets/emojis/1f4e3.png',
  './assets/emojis/1f697.png',
  './assets/emojis/26a1.png',
  './assets/emojis/1f37d.png',
  './assets/emojis/1f527.png',
  './assets/emojis/1f465.png',
  './assets/emojis/1f3e7.png',
  './assets/emojis/1f916.png',
  './assets/emojis/1f695.png',
  './assets/emojis/1f6d2.png',
  './assets/emojis/1f4f6.png',
  './assets/emojis/1f48a.png',
  './assets/emojis/2615.png',
  './assets/emojis/1f512.png',
  './assets/emojis/1f7e2.png',
  './assets/emojis/1f7e1.png',
  './assets/emojis/23f3.png',
  './assets/emojis/1f4dd.png',
];

async function precacheShellInBatches(cache, urls, batchSize = 6) {
  for (let i = 0; i < urls.length; i += batchSize) {
    await Promise.allSettled(urls.slice(i, i + batchSize).map((url) => cache.add(url)));
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => precacheShellInBatches(cache, SHELL, 6))
      .then(() => (!self.registration?.active ? self.skipWaiting() : undefined))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data?.type === 'CLEAR_OLD_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    );
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for Finanzas documents/modules so version upgrades land immediately on iPhone,
  // with full offline fallback from cache.
  const bypassDiskCache = req.mode === 'navigate' || url.pathname.endsWith('/sw.js');
  const networkReq = bypassDiskCache ? new Request(req.url, { cache: 'no-cache' }) : req;
  event.respondWith(
    fetch(networkReq)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => (
        cached
        || (req.mode === 'navigate' ? caches.match(req, { ignoreSearch: true }) : undefined)
      )).then((matched) => (
        matched || (req.mode === 'navigate' ? caches.match(url.pathname.endsWith('/plaza.html') ? './plaza.html' : './index.html') : undefined)
      )))
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
