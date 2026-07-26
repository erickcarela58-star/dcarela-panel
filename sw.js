const CACHE = "dcarela-pos-shell-20260726-panel-total-v14";
const SHELL = [
  "./panel.css?v=20260726-panel-total-v14",
  "./panel.js?v=20260726-panel-total-v14",
  "./supabase.min.js",
  "./jspdf.umd.min.js",
  "./jspdf.plugin.autotable.min.js",
  "./dcarela-logo.png",
  "./manifest.webmanifest"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    await cache.addAll(SHELL);
    await Promise.all([
      cache.add("./index.html").catch(() => null),
      cache.add("./panel.html").catch(() => null),
      cache.add("./mobile/index.html").catch(() => null)
    ]);
  }));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith("dcarela-pos-shell-") && key !== CACHE).map(key => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(request).then(response => {
    const copy = response.clone();
    if (response.ok) caches.open(CACHE).then(cache => cache.put(request, copy));
    return response;
  }).catch(() => caches.match(request).then(async cached =>
    cached || await caches.match("./panel.html") || await caches.match("./index.html"))));
});
