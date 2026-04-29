const CACHE_NAME = "todo-pwa-v2"; // <-- incrémente à chaque mise à jour
const ASSETS = [
  "/ToDoList/",
  "/ToDoList/index.html",
  "/ToDoList/app.js",
  "/ToDoList/manifest.webmanifest",
  "/ToDoList/icon-192.png",
  "/ToDoList/icon-512.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

// Network-first pour éviter de rester bloqué sur une vieille version
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  const isAppShell =
    url.pathname === "/ToDoList/" ||
    url.pathname.endsWith("/ToDoList/index.html") ||
    url.pathname.endsWith("/ToDoList/app.js") ||
    url.pathname.endsWith("/ToDoList/manifest.webmanifest");

  if (isAppShell) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(event.request, { cache: "no-store" });
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(event.request);
        return cached || Response.error();
      }
    })());
    return;
  }

  // Cache-first pour les autres ressources
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});
