// Núcleo de la app: estado compartido, utilidades, arranque de sesión y visitas en curso.
// El resto del flujo está repartido por tema (se cargan en este orden desde index.html):
//   visita.js → productividad.js → manejo.js → captura.js → pantalla-informes.js → historial.js
//   → sincronizacion.js → arranque.js (va de último: conecta los botones al terminar de cargar).
// Antes todo estaba en un solo archivo de 2.700 líneas y cada cambio obligaba a buscar en todo.

// Version visible en el encabezado. Se sube junto con CACHE_NAME en sw.js en cada cambio, para
// poder verificar de un vistazo que el celular ya esta viendo la version mas reciente.
const APP_VERSION = "2.3";

let clientesFincas = []; // [{cliente, finca, numeroLotes}]
let parametros = { hojasEvaluadas: 10, severidadMoluscos: 0.1 };

let visita = null; // {cliente, finca, fecha, numeroLotes}
let loteActual = null;
let puntoActual = 1;
let puntoMostrado = 1; // numero de punto que se ve en el formulario ahora (puede ser uno anterior si se esta corrigiendo)
let editandoPuntoId = null; // id del item en DB.listarItems() que se esta corrigiendo, o null si es un punto nuevo
let capturandoLote = false; // mientras es true, no se sincroniza (para poder fijar el Potrero antes de subir los puntos)
let manejoActual = {}; // manejo agronomico del lote que se esta capturando ahora mismo
let catalogoProductos = []; // [{nombre, tipo, formulacion, unidad}] cargado de la hoja Productos
let contadorProductos = 0;

// Productividad de la visita: "" (sin elegir), "general", "lotes" o "sin_datos".
let productividadModo = "";
// Datos escritos por el usuario, por clave: "general" o el numero de lote (como texto), ej: {"general":{...}} o {"1":{...},"2":{...}}.
let productividadDatos = {};
// Copia (JSON) de la productividad tal como se cargó, para no volver a subirla si no cambió.
let productividadCargada = "";

// Manejo agronómico escrito en cada lote de esta visita ({"1": {campos, productos}}), para poder
// copiarlo al siguiente lote aunque el primero todavía no tenga puntos.
let manejoModo = "general"; // "general" (igual para toda la finca) o "lotes"
let manejoDatos = {}; // {"general": {campos, productos}, "1": {...}, "2": {...}}
let manejoPropios = new Set(); // lotes (del 2 en adelante) con manejo propio; los demás copian el del Lote 1
let productividadPropios = new Set(); // igual, para productividad por lotes
let manejoRenderizado = false; // si el formulario de manejo en pantalla corresponde a la visita abierta
// Pantalla del flujo de captura en la que va la visita (para volver ahí desde Informes o al recargar).
let pantallaFlujo = null;

// Tipo y formulacion de producto salen del catalogo real (hoja Productos de Excel), no de una lista fija.
let tiposProducto = [];
let formulacionesProducto = [];

// Marca un campo como invalido (borde rojo + su label en rojo) en vez de un alert() flotante.
// Se limpia solo apenas el usuario edite el campo. Le pone foco y hace scroll hasta el.
function marcarCampoInvalido(input) {
  if (!input) return;
  const label = input.closest("label") || input.parentElement.querySelector("label");
  input.classList.add("campo-invalido");
  if (label) label.classList.add("campo-invalido");
  input.scrollIntoView({ behavior: "smooth", block: "center" });
  input.focus();
  const limpiar = () => {
    input.classList.remove("campo-invalido");
    if (label) label.classList.remove("campo-invalido");
    input.removeEventListener("input", limpiar);
    input.removeEventListener("change", limpiar);
  };
  input.addEventListener("input", limpiar);
  input.addEventListener("change", limpiar);
}

function actualizarOpcionesCatalogo() {
  tiposProducto = [...new Set(catalogoProductos.map((p) => p.tipo).filter(Boolean))].sort();
  formulacionesProducto = [...new Set(catalogoProductos.map((p) => p.formulacion).filter(Boolean))].sort();
  el("datalist-productos").innerHTML = catalogoProductos.map((p) => `<option value="${p.nombre}">`).join("");
}

// El tipo de fumigacion aplica a toda la recomendacion (se elige una sola vez, arriba de la lista de
// productos), pero cada producto sigue necesitando su propia dosis, con la etiqueta que corresponda
// al equipo elegido.
const ETIQUETAS_DOSIS_RECOMENDACION = {
  "Aerea (Dron)": "Dosis del producto/Hectárea",
  "Terrestre (Estacionaria)": "Dosis del producto/Caneca 200L",
  "Terrestre (Bomba de espalda)": "Dosis del producto/Bomba 20L",
};

function etiquetaDosisRecomendacionActual() {
  const tipo = el("informe-tipo-fumigacion") ? el("informe-tipo-fumigacion").value : "";
  return ETIQUETAS_DOSIS_RECOMENDACION[tipo] || "Dosis del producto";
}

// Al cambiar el tipo de fumigacion global, se actualiza la etiqueta de dosis de todos los productos ya agregados.
function actualizarEtiquetasDosisRecomendacion() {
  const etiqueta = etiquetaDosisRecomendacionActual();
  el("lista-productos-informe").querySelectorAll(".p-dosis-label").forEach((span) => { span.textContent = etiqueta; });
}

// Agrega un bloque de "producto" (Manejo agronomico o Recomendaciones). valores permite prellenar (cache/edicion).
// En Manejo agronomico es lo que realmente se aplico en este lote durante la visita (una sola dosis).
function agregarBloqueProducto(containerId, valores = {}) {
  const esRecomendacion = containerId === "lista-productos-informe";
  contadorProductos += 1;
  const div = document.createElement("div");
  div.className = "producto-bloque";
  const filaDosis = esRecomendacion
    ? `<label><span class="p-dosis-label">${etiquetaDosisRecomendacionActual()}</span> <span class="asterisco">*</span> <input type="text" class="p-dosis-reco" placeholder="Ej: 200" value="${valores.dosis || ""}"></label>`
    : `<label>Dosis <input type="text" class="p-dosis" value="${valores.dosis || ""}"></label>`;
  div.innerHTML = `
    <div class="fila">
      <label>Tipo
        <select class="p-tipo">
          <option value="">-</option>
          ${tiposProducto.map((t) => `<option value="${t}" ${texto(valores.tipo) === t ? "selected" : ""}>${t}</option>`).join("")}
        </select>
      </label>
      <label>Producto <input type="text" class="p-nombre" list="datalist-productos" value="${valores.nombre || ""}"></label>
    </div>
    <div class="fila">
      <label>Formulación
        <select class="p-formulacion">
          <option value="">-</option>
          ${formulacionesProducto.map((f) => `<option value="${f}" ${texto(valores.formulacion) === f ? "selected" : ""}>${f}</option>`).join("")}
        </select>
      </label>
      <label>Unidad <input type="text" class="p-unidad" value="${valores.unidad || ""}"></label>
      ${esRecomendacion ? "" : filaDosis}
    </div>
    ${esRecomendacion ? filaDosis : ""}
    <button type="button" class="secundario btn-quitar-producto">Quitar producto</button>
  `;
  el(containerId).appendChild(div);

  div.querySelector(".p-nombre").addEventListener("change", (e) => {
    const encontrado = catalogoProductos.find((p) => texto(p.nombre).toLowerCase() === e.target.value.trim().toLowerCase());
    if (encontrado) {
      div.querySelector(".p-tipo").value = encontrado.tipo || "";
      div.querySelector(".p-formulacion").value = encontrado.formulacion || "";
      div.querySelector(".p-unidad").value = encontrado.unidad || "";
    }
  });
  div.querySelector(".btn-quitar-producto").addEventListener("click", () => { div.remove(); guardarBorrador(); });
}

function leerProductosFormulario(containerId) {
  return [...el(containerId).querySelectorAll(".producto-bloque")]
    .map((div) => {
      const valor = (selector) => { const campo = div.querySelector(selector); return campo ? campo.value.trim() : ""; };
      return {
        tipo: valor(".p-tipo"),
        nombre: valor(".p-nombre"),
        formulacion: valor(".p-formulacion"),
        unidad: valor(".p-unidad"),
        dosis: valor(".p-dosis") || valor(".p-dosis-reco"),
      };
    })
    .filter((p) => p.nombre);
}

// Los textos del Excel pueden traer espacios al final ("CORRECTORES DE AGUA "): se limpian al leer
// para que no aparezcan como si fueran otro tipo/producto distinto.
const texto = (v) => String(v == null ? "" : v).trim();

const el = (id) => document.getElementById(id);
const PANTALLAS = ["pantalla-login", "pantalla-visita", "pantalla-lotes", "pantalla-punto", "pantalla-fin", "pantalla-informes", "pantalla-historial"];

const PANTALLAS_FLUJO = ["pantalla-lotes", "pantalla-punto"];

function mostrarPantalla(id) {
  PANTALLAS.forEach((p) => (el(p).hidden = p !== id));
  if (PANTALLAS_FLUJO.includes(id)) pantallaFlujo = id;
}

// ---------- Visitas en curso: todo lo escrito se guarda en el celular al instante ----------

// Cada visita iniciada y no terminada ("Fin del muestreo") queda guardada en el celular con lo que
// se haya escrito: manejo, productos, el punto a medio llenar y las observaciones del lote. Puede
// haber varias a la vez; se listan en "Visitas en curso". Si se recarga o se cierra la app estando
// dentro de una, al volver se abre justo donde iba.
const CAMPOS_PUNTO = ["potrero-nombre-punto", "adultos", "ninfas", "incid-coll", "sev-coll", "loritos", "lepidopteros",
  "hojas-moluscos", "incid-hongos", "sev-hongos", "observaciones"];

let borradores = {}; // {"cliente|finca|fecha": borrador}
// Lo escrito y todavía no confirmado con un botón, por lote, para no perderlo al salir de la visita
// y volver a entrar por el menú de lotes: {manejo: {lote: {...}}, punto: {lote: {...}}, obs: {lote: "texto"}}.
let sinGuardar = { manejo: {}, punto: {}, obs: {} };

const claveDeVisita = (v) => `${v.cliente}|${v.finca}|${v.fecha}`;

function leerBloquesProductoCrudos(containerId) {
  return [...el(containerId).querySelectorAll(".producto-bloque")].map((div) => {
    const valor = (selector) => { const campo = div.querySelector(selector); return campo ? campo.value : ""; };
    return { tipo: valor(".p-tipo"), nombre: valor(".p-nombre"), formulacion: valor(".p-formulacion"), unidad: valor(".p-unidad"), dosis: valor(".p-dosis") };
  });
}

let colaBorradores = Promise.resolve();
function escribirBorradores() {
  const copia = JSON.parse(JSON.stringify(borradores));
  colaBorradores = colaBorradores.then(() => DB.guardarCache("visitasEnCurso", copia))
    .catch((e) => console.warn("No se pudo guardar la visita en curso:", e.message));
  return colaBorradores;
}

function guardarBorrador() {
  if (!visita) return Promise.resolve();
  const lote = loteActual == null ? null : String(loteActual);
  leerManejoDePantalla();
  if (lote && pantallaFlujo === "pantalla-punto") {
    if (!el("caja-observaciones-lote").hidden) {
      sinGuardar.obs[lote] = el("observaciones-lote").value;
    } else if (!editandoPuntoId && !puntoSincronizado && puntoMostrado === puntoActual) {
      const punto = {};
      CAMPOS_PUNTO.forEach((id) => { punto[id] = el(id).value; });
      sinGuardar.punto[lote] = punto;
    }
  }
  borradores[claveDeVisita(visita)] = {
    visita, pantalla: pantallaFlujo || "pantalla-lotes", loteActual, manejoActual, manejo: { modo: manejoModo, datos: manejoDatos, propios: [...manejoPropios] },
    capturandoLote, puntoMostrado, editandoPuntoId, sinGuardar, actualizado: new Date().toISOString(),
  };
  return escribirBorradores();
}

async function cargarBorradores() {
  borradores = (await DB.leerCache("visitasEnCurso")) || {};
  // La v38/v39 guardaba una sola visita en curso con otro nombre: se pasa al formato nuevo.
  const anterior = await DB.leerCache("visitaEnCurso");
  if (anterior && anterior.visita) {
    const k = claveDeVisita(anterior.visita);
    if (!borradores[k]) borradores[k] = { ...anterior, sinGuardar: { manejo: {}, punto: { [anterior.loteActual]: anterior.punto || {} }, obs: {} } };
    await DB.guardarCache("visitaActiva", k);
    await DB.guardarCache("visitaEnCurso", null);
    await escribirBorradores();
  }
}

async function borrarBorrador() {
  if (visita) delete borradores[claveDeVisita(visita)];
  await escribirBorradores();
  await DB.guardarCache("visitaActiva", null);
}

// exacta = true: vuelve a la misma pantalla (al recargar la app). Si no, entra al menú de lotes.
async function restaurarBorrador(b, exacta) {
  visita = b.visita;
  loteActual = b.loteActual;
  manejoActual = b.manejoActual || {};
  capturandoLote = !!b.capturandoLote;
  editandoPuntoId = exacta ? (b.editandoPuntoId || null) : null;
  sinGuardar = b.sinGuardar || { manejo: {}, punto: {}, obs: {} };
  ["manejo", "punto", "obs"].forEach((k) => { if (!sinGuardar[k]) sinGuardar[k] = {}; });
  await DB.guardarCache("visitaActiva", claveDeVisita(visita));

  el("resumen-visita").textContent = `${visita.cliente} · ${visita.finca} · ${visita.fecha}`;
  cerrarSecciones();
  await precargarProductividad();
  await precargarManejo(b.manejo);
  // Visitas guardadas por versiones anteriores (manejo escrito lote por lote en otra pantalla).
  const manejoAnterior = { ...(b.manejoPorLote || {}), ...((b.sinGuardar && b.sinGuardar.manejo) || {}) };
  if (!b.manejo && Object.keys(manejoAnterior).length) {
    manejoModo = "lotes";
    Object.assign(manejoDatos, manejoAnterior);
    renderManejo();
  }
  renderLotesAMuestrear();

  const pantalla = exacta && loteActual && PANTALLAS_FLUJO.includes(b.pantalla) ? b.pantalla : "pantalla-lotes";
  if (pantalla === "pantalla-punto") {
    el("lote-actual-num").textContent = loteActual;
    await calcularSiguientePunto();
    const obs = sinGuardar.obs[String(loteActual)];
    if (obs != null && b.pantalla === "pantalla-punto" && capturandoLote === false) {
      mostrarCajaObservacionesLote(true);
      el("observaciones-lote").value = obs;
    } else {
      mostrarCajaObservacionesLote(false);
      await mostrarPunto(Math.min(b.puntoMostrado || puntoActual, puntoActual));
    }
    await refrescarResumenCola();
  }
  mostrarPantalla(pantalla);
}

function llenarPuntoSinGuardar() {
  const punto = sinGuardar.punto[String(loteActual)];
  if (!punto || editandoPuntoId) return;
  CAMPOS_PUNTO.forEach((id) => {
    if (punto[id] != null && punto[id] !== "" ) el(id).value = punto[id];
  });
}

// Botón/pestaña "Visitas" estando dentro de una visita: se guarda tal cual y se vuelve al menú de
// elegir cliente. La visita queda en "Visitas en curso" para retomarla cuando se quiera.
async function salirDeVisita() {
  if (visita) await guardarBorrador();
  visita = null;
  loteActual = null;
  pantallaFlujo = null;
  manejoDatos = {};
  manejoPropios = new Set();
  productividadPropios = new Set();
  manejoRenderizado = false;
  sinGuardar = { manejo: {}, punto: {}, obs: {} };
  await DB.guardarCache("visitaActiva", null);
  await mostrarInicioVisitas();
}

// Borra la visita abierta con todo lo suyo: puntos, productos aplicados y recomendados,
// productividad, observaciones de lotes e informe. Lo que solo estaba en el celular se borra de una
// vez; si algo ya estaba en el Excel, queda pendiente borrarlo allá en la próxima sincronización.
async function onBorrarVisita() {
  if (!visita) return;
  const v = visita;
  if (!confirm(`¿Borrar la visita de ${v.cliente} · ${v.finca} del ${Informes.formatoFechaVisible(v.fecha)}?\n\nSe borran todos sus puntos, productos, productividad, observaciones y recomendaciones, también del Excel. No se puede deshacer.`)) return;

  const items = await DB.listarItems();
  const deLaVisita = items.filter((it) => it.tipo !== "eliminar_visita" && it.datos &&
    it.datos.cliente === v.cliente && it.datos.finca === v.finca && it.datos.fecha === v.fecha &&
    it.tipo !== "cliente_finca" && it.tipo !== "actualizar_lotes" && it.tipo !== "producto_nuevo");
  const huboSubidas = deLaVisita.some((it) => it.estado !== "pendiente");
  let enExcel = huboSubidas;
  if (!enExcel) {
    try {
      const remotas = await Informes._tablaRemota(CONFIG.TABLE_NAME, "filasBase");
      enExcel = remotas.some((f) => f[ESQUEMA.BASE.cliente] === v.cliente && f[ESQUEMA.BASE.finca] === v.finca &&
        normalizarFecha(f[ESQUEMA.BASE.fecha]) === v.fecha);
    } catch (e) {
      enExcel = true; // si no se puede confirmar, mejor pedir el borrado en el Excel
    }
  }
  for (const it of deLaVisita) await DB.eliminarItem(it.id);
  if (enExcel) await DB.agregarItem("eliminar_visita", { cliente: v.cliente, finca: v.finca, fecha: v.fecha });
  // Si se vuelve a hacer una visita a esa finca ese mismo día, se debe volver a anotar en la lista.
  const claveVisitaBorrada = `${v.cliente}|${v.finca}|${v.fecha}`;
  await DB.guardarCache("visitasRegistradas", ((await DB.leerCache("visitasRegistradas")) || []).filter((k) => k !== claveVisitaBorrada));

  await borrarBorrador();
  visita = null;
  loteActual = null;
  pantallaFlujo = null;
  manejoDatos = {};
  manejoPropios = new Set();
  productividadPropios = new Set();
  manejoRenderizado = false;
  sinGuardar = { manejo: {}, punto: {}, obs: {} };
  await mostrarInicioVisitas();
  await refrescarResumenCola();
  alert(enExcel
    ? "Visita borrada. Lo que ya estaba en tu Excel se borrará allá la próxima vez que sincronices."
    : "Visita borrada.");
}

function cerrarSecciones() {
  document.querySelectorAll("#pantalla-lotes .seccion-titulo").forEach((btn) => {
    btn.setAttribute("aria-expanded", "false");
    btn.nextElementSibling.hidden = true;
  });
}

// Con un solo lote no tiene sentido preguntar "en general o por lotes": se usa "en general".
function actualizarSelectoresModo() {
  const unico = !visita || visita.numeroLotes <= 1;
  el("productividad-modo-caja").hidden = unico;
  el("manejo-modo-caja").hidden = unico;
  if (!unico) return;
  if (productividadModo !== "general") {
    if (productividadModo === "lotes" && !tieneDatosProductividad(productividadDatos.general) && productividadDatos["1"]) {
      productividadDatos.general = copiar(productividadDatos["1"]);
    }
    productividadModo = "general";
    el("productividad-modo").value = "general";
  }
  if (manejoModo !== "general") {
    if (manejoVacio(manejoDatos.general)) manejoDatos.general = copiar(manejoDeLote(1));
    manejoModo = "general";
  }
}

async function mostrarInicioVisitas() {
  poblarSelectCliente();
  el("fecha").value = fechaLocalHoy();
  await renderVisitasEnCurso();
  mostrarPantalla("pantalla-visita");
  revisarVisitaSeleccionada();
}

function mostrarCajaObservacionesLote(mostrar) {
  el("caja-observaciones-lote").hidden = !mostrar;
  el("form-punto").hidden = mostrar;

  if (mostrar) ajustarAltoTexto(el("observaciones-lote"));
}

// new Date().toISOString() da la fecha en UTC: en Colombia (UTC-5), pasadas las 7pm ya muestra
// la fecha de manana. Esta funcion da la fecha de HOY en la zona horaria local del celular.
function fechaLocalHoy() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

async function iniciar() {
  el("app-version").textContent = "v" + APP_VERSION;
  revisarVersionPublicada();
  refrescarResumenCola(); // el botón de sincronizar arranca apagado si no hay nada pendiente
  registrarServiceWorker();
  await Graph.init();

  const cuenta = Graph.cuentaGuardada();
  if (cuenta) {
    await despuesDeLogin();
  } else {
    mostrarPantalla("pantalla-login");
    el("btn-login").addEventListener("click", async () => {
      el("btn-login").disabled = true;
      el("btn-login").textContent = "Conectando...";
      try {
        await Graph.iniciarSesion();
        await despuesDeLogin();
      } catch (e) {
        alert("No se pudo iniciar sesión: " + e.message);
        el("btn-login").disabled = false;
        el("btn-login").textContent = "Conectar con Microsoft";
      }
    });
  }

  window.addEventListener("online", actualizarEstadoConexion);
  window.addEventListener("offline", actualizarEstadoConexion);
  actualizarEstadoConexion();
}

async function despuesDeLogin() {
  sesionIniciada = true;
  await cargarConfigYClientes();
  el("nav-tabs").hidden = false;
  await cargarBorradores();
  const activa = await DB.leerCache("visitaActiva");
  if (activa && borradores[activa]) {
    await restaurarBorrador(borradores[activa], true);
  } else {
    await mostrarInicioVisitas();
  }
  if (navigator.onLine) verificarFormatoDelExcel(); // en segundo plano: no debe demorar la entrada
  arrancarSincronizacionAutomatica();
  sincronizarEnSegundoPlano(); // lo que quedó de la salida anterior sube solo al entrar
}

// Visitas iniciadas y no terminadas, de la más reciente a la más antigua.
async function renderVisitasEnCurso() {
  const lista = Object.values(borradores).filter((b) => b && b.visita)
    .sort((a, b) => (a.visita.fecha < b.visita.fecha ? 1 : a.visita.fecha > b.visita.fecha ? -1 : 0));
  if (lista.length === 0) {
    el("resumen-hoy").innerHTML = "";
    return;
  }
  const items = await DB.listarItems();
  let html = "<h2>Visitas en curso</h2>";
  lista.forEach((b) => {
    const v = b.visita;
    const puntos = items.filter((it) => it.tipo === "punto" && it.datos.cliente === v.cliente && it.datos.finca === v.finca && it.datos.fecha === v.fecha);
    const lotes = {};
    puntos.forEach((p) => {
      const l = lotes[p.datos.lote] || (lotes[p.datos.lote] = { cantidad: 0, potrero: "" });
      l.cantidad += 1;
      if (!l.potrero && p.datos.fila[ESQUEMA.BASE.potrero]) l.potrero = p.datos.fila[ESQUEMA.BASE.potrero];
    });
    const detalle = Object.keys(lotes).length
      ? Object.entries(lotes).sort((a, b) => a[0] - b[0]).map(([lote, info]) =>
        `${info.potrero ? `Lote ${lote} (Potrero ${esc(info.potrero)})` : `Lote ${lote}`}: ${info.cantidad} punto(s)`).join("<br>")
      : "Sin puntos todavía";
    html += `<p class="visita-hoy" data-clave="${esc(claveDeVisita(v))}"><strong>${esc(v.cliente)} · ${esc(v.finca)}</strong><br>${Informes.formatoFechaVisible(v.fecha)}<br>${detalle}<br><span class="hint">Toca para continuar la visita</span></p>`;
  });
  el("resumen-hoy").innerHTML = html;
  el("resumen-hoy").querySelectorAll(".visita-hoy").forEach((elem) => {
    elem.addEventListener("click", async () => {
      const b = borradores[elem.dataset.clave];
      if (b) await restaurarBorrador(b, false);
    });
  });
}

// La app ubica cada columna por su título, así que mover o agregar columnas en el Excel ya no
// daña nada. Lo único que puede fallar es que se borre o se renombre una columna que la app
// necesita: eso se avisa aquí al entrar (y lo de esa tabla queda pendiente hasta corregirlo).
async function verificarFormatoDelExcel() {
  const tablas = [
    [CONFIG.TABLE_NAME, "BASE"], [CONFIG.TABLA_PRODUCTOS_APLICADOS, "PRODUCTOS_APLICADOS"],
    [CONFIG.TABLA_PRODUCTOS_RECOMENDADOS, "PRODUCTOS_RECOMENDADOS"], [CONFIG.TABLA_PRODUCTIVIDAD, "PRODUCTIVIDAD"],
    [CONFIG.TABLA_OBSERVACIONES_LOTES, "OBSERVACIONES_LOTES"], [CONFIG.TABLA_INFORMES_GENERADOS, "INFORMES_GENERADOS"],
    [CONFIG.TABLA_RECOMENDACIONES_CLIENTE, "RECOMENDACIONES_CLIENTE"], [CONFIG.TABLA_PRODUCTOS, "PRODUCTOS"],
    [CONFIG.TABLA_VISITAS, "VISITAS"],
  ];
  const problemas = [];
  for (const [tabla, clave] of tablas) {
    try {
      const faltan = columnasFaltantes(clave, await Graph.titulos(tabla));
      if (faltan.length > 0) problemas.push(`${tabla}: falta ${faltan.map((t) => `"${t}"`).join(", ")}`);
    } catch (e) {
      console.warn(`No se pudo revisar la tabla ${tabla}:`, e.message);
    }
  }
  const aviso = el("aviso-esquema");
  if (problemas.length > 0) {
    console.warn("Columnas que la app no encuentra en el Excel:", problemas);
    aviso.textContent = "Ojo: en el Excel faltan columnas que la app necesita (o cambió su título). " +
      "Lo de esas tablas queda guardado en el celular hasta que se corrija. " + problemas.join(" · ");
    aviso.hidden = false;
  } else {
    aviso.hidden = true;
  }
}

async function cargarConfigYClientes() {
  if (navigator.onLine) {
    try {
      await conLimiteDeTiempo(leerConfigYClientesDeExcel(), 12000);
      el("aviso-esquema").hidden = true;
      return;
    } catch (e) {
      console.warn("No se pudo leer de Graph, usando caché local:", e.message);
      const aviso = el("aviso-esquema");
      aviso.textContent = "No se pudo conectar con tu Excel (" + e.message + "). Estás trabajando con la última lista de clientes guardada en el celular; todo lo que captures queda guardado.";
      aviso.hidden = false;
    }
  }
  parametros = (await DB.leerCache("parametros")) || parametros;
  clientesFincas = (await DB.leerCache("clientesFincas")) || [];
  catalogoProductos = (await DB.leerCache("catalogoProductos")) || [];
  actualizarOpcionesCatalogo();
}

async function leerConfigYClientesDeExcel() {
  {
    {
      const filas = await Graph.leerRango(CONFIG.HOJA_CONFIG, "B3:B4");
      parametros = { hojasEvaluadas: Number(filas[0][0]), severidadMoluscos: Number(filas[1][0]) };
      await DB.guardarCache("parametros", parametros);

      const filasClientes = await Graph.leerRango(CONFIG.HOJA_CLIENTES, "A4:C200");
      clientesFincas = filasClientes
        .filter((f) => f[0])
        .map((f) => ({ cliente: f[0], finca: f[1], numeroLotes: Number(f[2]) }));
      await DB.guardarCache("clientesFincas", clientesFincas);

      const P = ESQUEMA.PRODUCTOS;
      const filasProductos = await Graph.leerTabla(CONFIG.TABLA_PRODUCTOS);
      catalogoProductos = filasProductos
        .filter((f) => f[P.nombre])
        .map((f) => ({ nombre: texto(f[P.nombre]), tipo: texto(f[P.tipo]), formulacion: texto(f[P.formulacion]), unidad: texto(f[P.unidad]), orden: Number(f[P.orden]) }));
      await DB.guardarCache("catalogoProductos", catalogoProductos);
      actualizarOpcionesCatalogo();
    }
  }
}

