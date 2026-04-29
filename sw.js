const CACHE_NAME = "todo-pwa-v3"; // <-- incrémente à chaque déploiement

const APP_SHELL = [
  "/ToDoList/",
  "/ToDoList/index.html",
  "/ToDoList/app.js",
  "/ToDoList/manifest.webmanifest",
  "/ToDoList/icon-192.png",
  "/ToDoList/icon-512.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

// Network-first pour index.html + app.js (évite "ancienne version")
// Cache-first pour icônes
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin) return; // laisse le navigateur gérer les CDN (Supabase JS, etc.)

  const path = url.pathname;

  const isAppShell =
    path === "/ToDoList/" ||
    path === "/ToDoList/index.html" ||
    path === "/ToDoList/app.js" ||
    path === "/ToDoList/manifest.webmanifest";

  const isIcon = path === "/ToDoList/icon-192.png" || path === "/ToDoList/icon-512.png";

  if (isAppShell) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        return cached || caches.match("/ToDoList/index.html");
      }
    })());
    return;
  }

  if (isIcon) {
    event.respondWith(caches.match(req).then(r => r || fetch(req)));
    return;
  }

  // reste : cache-first simple
  event.respondWith(caches.match(req).then(r => r || fetch(req)));
});
