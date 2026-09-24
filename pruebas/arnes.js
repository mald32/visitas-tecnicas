// Arnés mínimo para poder probar el código del navegador desde Node, sin dependencias externas.
// Carga los archivos reales de la app dentro de un contexto con "navegador de mentiras" (stubs),
// para poder ejercitar la lógica de verdad (cálculos, informe, sincronización) sin abrir Chrome.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");

// --- Mini framework de pruebas (suficiente para lo que necesitamos) ---
const resultados = { ok: 0, fallos: [] };

function prueba(nombre, fn) {
  try {
    fn();
    resultados.ok += 1;
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    resultados.fallos.push({ nombre, error: e });
    console.log(`  ✗ ${nombre}\n      ${e.message}`);
  }
}

async function pruebaAsync(nombre, fn) {
  try {
    await fn();
    resultados.ok += 1;
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    resultados.fallos.push({ nombre, error: e });
    console.log(`  ✗ ${nombre}\n      ${e.message}`);
  }
}

function igual(real, esperado, mensaje) {
  if (real !== esperado) throw new Error(`${mensaje || "valores distintos"}: esperado ${JSON.stringify(esperado)}, recibido ${JSON.stringify(real)}`);
}

function cerca(real, esperado, tolerancia, mensaje) {
  if (real == null || Math.abs(real - esperado) > (tolerancia ?? 1e-9)) {
    throw new Error(`${mensaje || "valor fuera de tolerancia"}: esperado ~${esperado}, recibido ${real}`);
  }
}

function contiene(texto, fragmento, mensaje) {
  if (!String(texto).includes(fragmento)) throw new Error(`${mensaje || "no contiene"}: no se encontró ${JSON.stringify(fragmento)}`);
}

function noContiene(texto, fragmento, mensaje) {
  if (String(texto).includes(fragmento)) throw new Error(`${mensaje || "no debería contener"}: se encontró ${JSON.stringify(fragmento)}`);
}

function cierto(valor, mensaje) {
  if (!valor) throw new Error(mensaje || "se esperaba un valor verdadero");
}

// --- Stubs del navegador ---

// Elemento DOM de mentiras: acepta cualquier propiedad y llamada sin romperse.
function elementoFalso() {
  const el = {
    value: "", textContent: "", innerHTML: "", hidden: false, disabled: false,
    dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {}, focus() {},
    scrollIntoView() {}, closest() { return elementoFalso(); },
    querySelector() { return elementoFalso(); }, querySelectorAll() { return []; },
    getContext() { return contextoCanvasFalso(); },
  };
  return el;
}

function contextoCanvasFalso() {
  const noop = () => {};
  return {
    canvas: { width: 0, height: 0 },
    clearRect: noop, fillRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, arc: noop,
    closePath: noop, fill: noop, stroke: noop, save: noop, restore: noop, translate: noop,
    rotate: noop, setLineDash: noop, fillText: noop, setTransform: noop, roundRect: noop,
  };
}

function crearSandbox(stubs = {}) {
  const almacen = new Map();
  const sandbox = {
    console, Math, Date, JSON, Number, String, Object, Array, Boolean, Set, Map, Promise, Error,
    isNaN, parseInt, parseFloat, setTimeout, clearTimeout,
    navigator: { onLine: true },
    localStorage: {
      getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
      setItem: (k, v) => almacen.set(k, String(v)),
      removeItem: (k) => almacen.delete(k),
    },
    document: {
      addEventListener() {},
      getElementById() { return elementoFalso(); },
      querySelectorAll() { return []; },
      querySelector() { return elementoFalso(); },
      createElement() { return elementoFalso(); },
    },
    ...stubs,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

// Carga en un mismo contexto los archivos pedidos (en orden), como lo haría el navegador.
// `exponer` lista nombres declarados con const/let (que en vm no quedan como globales) para
// poder alcanzarlos desde la prueba, por ejemplo "Informes".
function cargarApp(archivos, stubs = {}, exponer = []) {
  const sandbox = crearSandbox(stubs);
  for (const archivo of archivos) {
    const codigo = fs.readFileSync(path.join(RAIZ, archivo), "utf8");
    vm.runInContext(codigo, sandbox, { filename: archivo });
  }
  for (const nombre of exponer) {
    sandbox[nombre] = vm.runInContext(nombre, sandbox);
  }
  return sandbox;
}

function resumen() {
  console.log("");
  if (resultados.fallos.length === 0) {
    console.log(`✅ ${resultados.ok} pruebas pasaron.`);
    return 0;
  }
  console.log(`❌ ${resultados.fallos.length} prueba(s) fallaron de ${resultados.ok + resultados.fallos.length}.`);
  return 1;
}

module.exports = {
  RAIZ, prueba, pruebaAsync, igual, cerca, contiene, noContiene, cierto,
  cargarApp, elementoFalso, resumen, resultados,
};
