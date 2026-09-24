// Sube la versión de la app en un solo paso:  node publicar.js
//
// Antes había que acordarse de tocar a mano APP_VERSION (app.js) y CACHE_NAME (sw.js), en dos
// archivos distintos y con el mismo número. Si uno se olvidaba, el celular seguía mostrando la
// versión vieja o el número del encabezado mentía. Esto lo hace de una sola vez y además corre
// las pruebas antes, para no publicar algo roto.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const RAIZ = __dirname;
const RUTA_APP = path.join(RAIZ, "app.js");
const RUTA_SW = path.join(RAIZ, "sw.js");
const RUTA_VERSION = path.join(RAIZ, "version.json");

function leer(ruta) { return fs.readFileSync(ruta, "utf8"); }

const app = leer(RUTA_APP);
const sw = leer(RUTA_SW);

const versionApp = app.match(/const APP_VERSION = "([\d.]+)";/);
const versionSw = sw.match(/const CACHE_NAME = "visitas-tecnicas-v([\d.]+)";/);

if (!versionApp || !versionSw) {
  console.error("No pude encontrar APP_VERSION en app.js o CACHE_NAME en sw.js.");
  process.exit(1);
}
if (versionApp[1] !== versionSw[1]) {
  console.error(`Están desincronizadas: app.js dice v${versionApp[1]} y sw.js dice v${versionSw[1]}. Ajústalas antes de publicar.`);
  process.exit(1);
}

console.log("Corriendo pruebas antes de publicar...\n");
try {
  execSync("node pruebas/correr.js", { cwd: RAIZ, stdio: "inherit" });
} catch (e) {
  console.error("\nHay pruebas fallando: no se sube la versión. Arregla primero.");
  process.exit(1);
}

// Numeración 2.0, 2.1, 2.2… (pedido del usuario: "ese conteo de 69 se ve feo"). Después de la 2.9
// sigue la 2.10. Si la versión actual es un número suelto (la numeración vieja), la siguiente es 2.0.
function siguienteVersion(actual) {
  const [mayor, menor] = String(actual).split(".");
  if (menor === undefined) return "2.0";
  return `${mayor}.${Number(menor) + 1}`;
}
const nueva = siguienteVersion(versionApp[1]);
fs.writeFileSync(RUTA_APP, app.replace(/const APP_VERSION = "[\d.]+";/, `const APP_VERSION = "${nueva}";`));
fs.writeFileSync(RUTA_SW, sw.replace(/const CACHE_NAME = "visitas-tecnicas-v[\d.]+";/, `const CACHE_NAME = "visitas-tecnicas-v${nueva}";`));

// La app compara su propia versión contra este archivo para saber si el celular se quedó atrás.
fs.writeFileSync(RUTA_VERSION, JSON.stringify({ version: String(nueva) }) + "\n");

console.log(`\n✅ Versión subida a v${nueva} (app.js, sw.js y version.json). Ya puedes hacer commit y push.`);
