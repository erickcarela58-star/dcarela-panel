const APP_BUILD = "2026.09.09.1.0.78.0";
const CACHE = `dcarela-pos-shell-${APP_BUILD}`;
const SHELL = [
  `./panel.css?v=${APP_BUILD}`,
  `./panel-theme.css?v=${APP_BUILD}`,
  `./panel.js?v=${APP_BUILD}`,
  `./ticket-termico.js?v=${APP_BUILD}`,
  `./panel-sale-pending.js?v=${APP_BUILD}`,
  `./finance-core.js?v=${APP_BUILD}`,
  `./money-manager-core.js?v=${APP_BUILD}`,
  `./client-period-filter.js?v=${APP_BUILD}`,
  `./shell-assets/index-a8e27158.js?v=${APP_BUILD}`,
  `./shell-assets/index-BIq1Swuf.css?v=${APP_BUILD}`,
  `./mobile/assets/index-7e44ede9.js?v=${APP_BUILD}`,
  `./mobile/assets/index-BIq1Swuf.css?v=${APP_BUILD}`,
  "./supabase.min.js",
  "./jspdf.umd.min.js",
  "./jspdf.plugin.autotable.min.js",
  "./dcarela-logo.png",
  "./favicon.svg",
  "./manifest.webmanifest",
  "./app-version.json",
  "./config.js",
  "./firebase-config.js",
  "./firebase-adapter.js",
  "./assistant-local.js"
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

self.addEventListener("message", event => {
  if (event.data?.type === "DCARELA_SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "DCARELA_VERSION") {
    event.source?.postMessage({ type: "DCARELA_VERSION", build: APP_BUILD });
  }
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Versioned assets are immutable: a slow network must not blank a cached app.
  if (url.searchParams.has("v") && /\.(?:js|css)$/.test(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    })));
    return;
  }
  if (url.pathname.endsWith("/app-version.json")) {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(() => caches.match("./app-version.json")));
    return;
  }
  if (url.pathname.endsWith("/panel.html") || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html")) {
    event.respondWith((async () => {
      const canonical = url.pathname.endsWith("/panel.html") ? "./panel.html"
        : url.pathname.includes("/mobile/") ? "./mobile/index.html" : "./index.html";
      const cached = await caches.match(canonical);
      let timer;
      const network = fetch(request, { cache: "no-store" }).then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response;
      });
      try {
        if (!cached) return await network;
        return await Promise.race([network, new Promise(resolve => {
          timer = setTimeout(() => resolve(cached), 2500);
        })]);
      } catch (error) {
        if (cached) return cached;
        throw error;
      } finally { clearTimeout(timer); }
    })());
    return;
  }
  event.respondWith(fetch(request).then(response => {
    const copy = response.clone();
    if (response.ok) caches.open(CACHE).then(cache => cache.put(request, copy));
    return response;
  }).catch(() => caches.match(request).then(cached =>
    cached || Response.error())));
});
