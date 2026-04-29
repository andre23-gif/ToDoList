const CACHE_NAME = "todo-pwa-v5"; // <-- incrémente v2, v3… à chaque mise à jour

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

// Network-first pour l'app shell (évite "ancienne version"), cache-first pour le reste
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ne touche pas aux appels externes (cdn, supabase…)
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  const isAppShell =
    path === "/ToDoList/" ||
    path === "/ToDoList/index.html" ||
    path === "/ToDoList/app.js" ||
    path === "/ToDoList/manifest.webmanifest";

  if (isAppShell) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match("/ToDoList/index.html");
      }
    })());
    return;
  }

  event.respondWith(caches.match(req).then(r => r || fetch(req)));
});
