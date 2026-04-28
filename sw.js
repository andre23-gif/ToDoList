const CACHE_NAME = "todo-pwa-v1";
const ASSETS = [
  "/ToDoList/",
  "/ToDoList/index.html",
  "/ToDoList/app.js",
  "/ToDoList/manifest.webmanifest"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});
