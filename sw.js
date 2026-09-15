const CACHE_NAME = "visitas-tecnicas-v39";
const ARCHIVOS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./esquema.js",
  "./db.js",
  "./graph.js",
  "./informes.js",
  "./manifest.json",
  "./lib/msal-browser.min.js",
  "./logo.png",
  "./icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return; // Graph y login de Microsoft van directo a la red
  if (event.request.method !== "GET") return;

  // Abrir la app (navegación): siempre la copia guardada, sin importar ?parámetros o #código que
  // agregue el login. Antes, sin internet, una URL distinta a la guardada mostraba el dinosaurio.
  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then((cacheada) => cacheada || fetch(event.request))
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then((cacheada) => cacheada || fetch(event.request))
  );
});
