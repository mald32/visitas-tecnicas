const CACHE_NAME = "visitas-tecnicas-v67";
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

// La página puede pedir que una versión nueva entre de una vez, sin esperar a cerrar la app.
self.addEventListener("message", (event) => {
  if (event.data === "activar-ya") self.skipWaiting();
});

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
  // version.json siempre va a la red: es justo el archivo que sirve para saber si hay algo nuevo.
  if (url.pathname.endsWith("version.json")) return;

  // Abrir la app (navegación): siempre la copia guardada, sin importar ?parámetros o #código que
  // agregue el login. Antes, sin internet, una URL distinta a la guardada mostraba el dinosaurio.
  // Abrir la app: se intenta primero la red (así una versión nueva entra de inmediato) y si en 3
  // segundos no responde, o no hay internet, se abre la copia guardada. Antes era siempre la copia,
  // y el celular se podía quedar pegado en una versión vieja.
  if (event.request.mode === "navigate") {
    const guardada = caches.match("./index.html");
    const red = fetch(event.request).then((respuesta) => {
      if (respuesta && respuesta.ok) {
        const copia = respuesta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copia));
      }
      return respuesta;
    });
    const limite = new Promise((resolve) => setTimeout(() => resolve(guardada), 3000));
    event.respondWith(Promise.race([red, limite]).catch(() => guardada).then((r) => r || red));
    return;
  }

  // Los archivos de la app se responden al instante desde la copia guardada, pero se vuelven a
  // pedir a la red en segundo plano y se guarda la versión nueva: así, si por lo que sea el service
  // worker no se actualizó, la próxima vez que abras la app ya tienes los archivos nuevos.
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cacheada) => {
      const deLaRed = fetch(event.request).then((respuesta) => {
        if (respuesta && respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        }
        return respuesta;
      }).catch(() => cacheada);
      return cacheada || deLaRed;
    })
  );
});
