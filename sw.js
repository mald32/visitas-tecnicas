const CACHE_NAME = "visitas-tecnicas-v2.12";
const ARCHIVOS = [
  "./",
  "./index.html",
  "./styles.css",
  // Todos los scripts de index.html deben estar aquí: sin ellos la app no abre sin señal
  // (hay una prueba que lo revisa).
  "./config.js",
  "./esquema.js",
  "./db.js",
  "./graph.js",
  "./informes.js",
  "./informe-estilos.js",
  "./informe-html.js",
  "./app.js",
  "./visita.js",
  "./productividad.js",
  "./manejo.js",
  "./captura.js",
  "./pantalla-informes.js",
  "./historial.js",
  "./sincronizacion.js",
  "./arranque.js",
  "./manifest.json",
  "./lib/msal-browser.min.js",
  "./logo.png",
  "./icons/icon-192.png",
];

// La página puede pedir que una versión nueva entre de una vez, sin esperar a cerrar la app.
self.addEventListener("message", (event) => {
  if (event.data === "activar-ya") self.skipWaiting();
});

// GitHub Pages le dice al navegador que guarde cada archivo 10 minutos (Cache-Control: max-age=600).
// Bug real (05/10/2026, "recargo y recargo y nada"): al instalar la versión nueva, sus archivos se
// descargaban de esa copia de 10 minutos y quedaba guardado el contenido VIEJO con el nombre nuevo.
// Con cache: "reload" se pide siempre al servidor.
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) =>
    cache.addAll(ARCHIVOS.map((url) => new Request(url, { cache: "reload" })))));
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
    // "no-cache": se le pregunta al servidor si cambió (respuesta liviana si no), en vez de usar la
    // copia de 10 minutos del navegador.
    const red = fetch(event.request.url, { cache: "no-cache", credentials: "same-origin" }).then((respuesta) => {
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

  // Los archivos de la app llevan la versión en la dirección (app.js?v=2.12, la pone publicar.js):
  // si ya está guardada ESA dirección exacta se responde al instante y se revisa en segundo plano;
  // si no (versión nueva), se pide al servidor. Sin señal, se usa la copia guardada del archivo
  // aunque sea de otra versión (ignorando el ?v=), para que la app abra igual.
  event.respondWith(
    caches.match(event.request).then((exacta) => {
      const deLaRed = fetch(event.request, { cache: "no-cache" }).then((respuesta) => {
        if (respuesta && respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        }
        return respuesta;
      });
      if (exacta) {
        deLaRed.catch(() => {});
        return exacta;
      }
      return deLaRed.catch(() => caches.match(event.request, { ignoreSearch: true }));
    })
  );
});
