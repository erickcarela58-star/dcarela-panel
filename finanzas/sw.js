const CACHE = 'dcarela-finanzas-ui-v35-monochrome-8';
const SHELL = ['./index.html','./app.css','./minimal-v34.css','./monochrome-glass-v35.css','./assets/bancos/popular.png','./assets/bancos/banreservas.png','./assets/bancos/bhd.png','./assets/bancos/qik.png','./app.js','./data-source.js','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k.startsWith('dcarela-finanzas-ui-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  if (event.request.mode === 'navigate') return; // lectura/auth siempre por red
  if (!SHELL.some(path => new URL(path,self.registration.scope).pathname === url.pathname)) return;
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request)));
});
