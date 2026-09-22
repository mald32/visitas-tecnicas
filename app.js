// Orquestación de la app: login, flujo de visita (datos -> lote -> puntos -> fin), cola y sincronización.

// Version visible en el encabezado. Se sube junto con CACHE_NAME en sw.js en cada cambio, para
// poder verificar de un vistazo que el celular ya esta viendo la version mas reciente.
const APP_VERSION = "65";

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
  el("btn-actualizar-version").addEventListener("click", actualizarAhora);
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

// Compara los encabezados reales de "Base de datos" contra los que espera el código. Si alguien
// reordena o renombra una columna en el Excel, la app escribiría en la celda equivocada sin
// avisar: esto lo detecta y lo muestra, en vez de dañar datos en silencio.
async function verificarFormatoDelExcel() {
  try {
    const filas = await Graph.leerRango("Base de datos", "A1:X1");
    const diferencias = verificarEncabezados(filas[0] || []);
    const aviso = el("aviso-esquema");
    if (diferencias.length > 0) {
      console.warn("El formato del Excel cambió:", diferencias);
      aviso.textContent = "Ojo: las columnas de la hoja 'Base de datos' no están como la app las espera (" +
        diferencias.length + " diferencia(s)). Revisa el Excel antes de seguir capturando. Detalle: " + diferencias[0];
      aviso.hidden = false;
    } else {
      aviso.hidden = true;
    }
  } catch (e) {
    console.warn("No se pudo verificar el formato del Excel:", e.message);
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

      const filasProductos = await Graph.leerRango(CONFIG.HOJA_PRODUCTOS, "A4:F500");
      catalogoProductos = filasProductos
        .filter((f) => f[0])
        .map((f) => ({ nombre: texto(f[0]), tipo: texto(f[1]), formulacion: texto(f[2]), unidad: texto(f[5]), orden: Number(f[4]) }));
      await DB.guardarCache("catalogoProductos", catalogoProductos);
      actualizarOpcionesCatalogo();
    }
  }
}

// ---------- Paso 1: Cliente / Finca ----------

const OPCION_NUEVO_CLIENTE = "__nuevo_cliente__";
const OPCION_NUEVA_FINCA = "__nueva_finca__";

const porNombre = (a, b) => String(a).localeCompare(String(b), "es", { sensitivity: "base" });

function clientesOrdenados() {
  return [...new Set(clientesFincas.map((c) => c.cliente))].sort(porNombre);
}

// Al abrir no queda ningún cliente elegido: hay que escogerlo a propósito (antes quedaba el primero
// de la lista y era fácil capturar una visita en el cliente equivocado).
function poblarSelectCliente(conservarSeleccion = false) {
  const anterior = el("cliente").value;
  const clientes = clientesOrdenados();
  el("cliente").innerHTML =
    `<option value="">Elija cliente</option>` +
    clientes.map((c) => `<option value="${c}">${c}</option>`).join("") +
    `<option value="${OPCION_NUEVO_CLIENTE}">+ Cliente nuevo</option>`;
  el("cliente").value = conservarSeleccion && (clientes.includes(anterior) || anterior === OPCION_NUEVO_CLIENTE) ? anterior : "";
  poblarSelectFinca();
}

function poblarSelectFinca() {
  const cliente = el("cliente").value;
  el("nuevo-cliente-caja").hidden = cliente !== OPCION_NUEVO_CLIENTE;

  if (!cliente) {
    el("finca").innerHTML = `<option value="">Elija primero el cliente</option>`;
  } else {
    const fincas = clientesFincas.filter((c) => c.cliente === cliente).map((f) => f.finca).sort(porNombre);
    el("finca").innerHTML =
      (fincas.length === 1 ? "" : `<option value="">Elija finca</option>`) +
      fincas.map((f) => `<option value="${f}">${f}</option>`).join("") +
      `<option value="${OPCION_NUEVA_FINCA}">+ Finca nueva</option>`;
  }
  onCambioFinca();
}

function onCambioFinca() {
  el("nueva-finca-caja").hidden = el("finca").value !== OPCION_NUEVA_FINCA;
  revisarVisitaSeleccionada();
}

// ¿Ya se muestreó este cliente + finca + fecha? Se mira en la base de datos (incluido lo capturado
// y aún sin subir) y en las visitas en curso guardadas en el celular.
function visitaYaExiste(filas, cliente, finca, fecha) {
  const B = ESQUEMA.BASE;
  return filas.some((f) => f[B.cliente] === cliente && f[B.finca] === finca && f[B.fecha] === fecha);
}

// No se crean dos visitas del mismo cliente, finca y fecha: si ya existe una, "Iniciar monitoreo" se
// bloquea y se habilita "Modificar datos de visita", que abre la que ya está con todo lo capturado.
let revisionVisita = 0;
let visitaSeleccionadaExiste = false;
async function revisarVisitaSeleccionada() {
  const turno = ++revisionVisita;
  const cliente = el("cliente").value;
  const finca = el("finca").value;
  const fecha = el("fecha").value;
  const esNueva = !cliente || !finca || !fecha || cliente === OPCION_NUEVO_CLIENTE || finca === OPCION_NUEVA_FINCA;

  let existe = false;
  if (!esNueva) {
    if (borradores[`${cliente}|${finca}|${fecha}`]) {
      existe = true;
    } else {
      try {
        existe = visitaYaExiste(await Informes.filas(), cliente, finca, fecha);
      } catch (e) {
        console.warn("No se pudo revisar si la visita ya existe:", e.message);
      }
    }
  }
  if (turno !== revisionVisita) return; // llegó una revisión más nueva

  visitaSeleccionadaExiste = existe;
  el("btn-iniciar-monitoreo").textContent = existe ? "Modificar datos de visita" : "Iniciar monitoreo";
  el("aviso-visita-existente").hidden = !existe;
  el("aviso-visita-existente").textContent = existe
    ? "Ya hay una visita de este cliente y finca en esta fecha: se abre la que está, con todo lo capturado."
    : "";
}

// Abre una visita que ya existe (del historial, de la base de datos o en curso), con todos sus lotes.
async function abrirVisitaExistente(cliente, finca, fecha) {
  const f = clientesFincas.find((c) => c.cliente === cliente && c.finca === finca);
  let numeroLotes = f ? f.numeroLotes : 1;
  const borrador = borradores[`${cliente}|${finca}|${fecha}`];
  if (borrador && borrador.visita) numeroLotes = Math.max(numeroLotes, borrador.visita.numeroLotes || 1);
  try {
    const B = ESQUEMA.BASE;
    const lotes = (await Informes.filas())
      .filter((x) => x[B.cliente] === cliente && x[B.finca] === finca && x[B.fecha] === fecha)
      .map((x) => Number(x[B.lote]))
      .filter((n) => Number.isFinite(n));
    if (lotes.length) numeroLotes = Math.max(numeroLotes, ...lotes);
  } catch (e) {
    console.warn("No se pudieron leer los lotes de la visita:", e.message);
  }
  await abrirVisita({ cliente, finca, fecha, numeroLotes });
}

async function onIniciarMonitoreo() {
  let cliente = el("cliente").value;
  let finca = el("finca").value;
  let numeroLotes;

  if (!cliente) { marcarCampoInvalido(el("cliente")); return; }
  if (!finca) { marcarCampoInvalido(el("finca")); return; }
  if (cliente === OPCION_NUEVO_CLIENTE) {
    cliente = el("nuevo-cliente").value.trim();
    if (!cliente) { marcarCampoInvalido(el("nuevo-cliente")); return; }
  }

  if (finca === OPCION_NUEVA_FINCA) {
    finca = el("nueva-finca").value.trim();
    numeroLotes = Number(el("nueva-finca-lotes").value);
    if (!finca) { marcarCampoInvalido(el("nueva-finca")); return; }
    if (!numeroLotes || numeroLotes < 1) { marcarCampoInvalido(el("nueva-finca-lotes")); return; }

    clientesFincas.push({ cliente, finca, numeroLotes });
    await DB.guardarCache("clientesFincas", clientesFincas);
    await DB.agregarItem("cliente_finca", { cliente, finca, numeroLotes });
  } else {
    const f = clientesFincas.find((c) => c.cliente === cliente && c.finca === finca);
    numeroLotes = f.numeroLotes;
  }
  if (!el("fecha").value) { marcarCampoInvalido(el("fecha")); return; }

  // Por si acaso: si ya existe una visita con estos datos, se abre esa en vez de crear otra.
  let existe = !!borradores[`${cliente}|${finca}|${el("fecha").value}`];
  if (!existe) {
    try {
      existe = visitaYaExiste(await Informes.filas(), cliente, finca, el("fecha").value);
    } catch (e) {
      console.warn("No se pudo revisar si la visita ya existe:", e.message);
    }
  }
  if (existe) {
    await abrirVisitaExistente(cliente, finca, el("fecha").value);
    return;
  }

  await abrirVisita({ cliente, finca, fecha: el("fecha").value, numeroLotes });
}

// Deja la visita guardada en el celular desde el primer momento, antes de capturar nada.
async function abrirVisita(datos) {
  const enCurso = borradores[claveDeVisita(datos)];
  if (enCurso) {
    enCurso.visita.numeroLotes = Math.max(enCurso.visita.numeroLotes || 1, datos.numeroLotes || 1);
    await restaurarBorrador(enCurso, false);
    return;
  }
  visita = datos;
  loteActual = null;
  manejoDatos = {};
  manejoPropios = new Set();
  productividadPropios = new Set();
  manejoRenderizado = false;
  sinGuardar = { manejo: {}, punto: {}, obs: {} };
  await DB.guardarCache("visitaActiva", claveDeVisita(visita));
  mostrarPantalla("pantalla-lotes");
  el("resumen-visita").textContent = `${visita.cliente} · ${visita.finca} · ${visita.fecha}`;
  cerrarSecciones();
  await precargarProductividad();
  await precargarManejo(null);
  renderLotesAMuestrear();
  await guardarBorrador();
}

// Botón de un bloque desplegable (Productividad, Manejo y Lotes por lote), con flecha que indica si
// está abierto o cerrado.
function botonAcordeon(texto, detalle = "") {
  return `<button type="button" class="secundario acordeon-titulo" aria-expanded="false"><span>${texto}${detalle ? ` <small>· ${detalle}</small>` : ""}</span><span class="flecha" aria-hidden="true">▸</span></button>`;
}

function activarAcordeones(contenedor) {
  contenedor.querySelectorAll(".acordeon-titulo").forEach((btn) => {
    btn.addEventListener("click", () => {
      const bloque = btn.closest(".acordeon-lote, .productividad-lote-bloque");
      const cuerpo = bloque.querySelector(".acordeon-cuerpo, .productividad-lote-campos");
      cuerpo.hidden = !cuerpo.hidden;
      btn.setAttribute("aria-expanded", String(!cuerpo.hidden));
    });
  });
}

async function renderLotesAMuestrear() {
  if (!visita) return;
  const v = visita;
  let filas = [];
  try {
    filas = await Informes.filas();
  } catch (e) {
    console.warn("No se pudieron leer los puntos de la visita:", e.message);
  }
  if (visita !== v) return;
  const B = ESQUEMA.BASE;
  const deVisita = filas.filter((f) => f[B.cliente] === v.cliente && f[B.finca] === v.finca && f[B.fecha] === v.fecha);
  let html = "";
  for (let i = 1; i <= v.numeroLotes; i++) {
    const sub = deVisita.filter((f) => String(f[B.lote]) === String(i));
    const potrero = sub.map((f) => f[B.potrero]).find(Boolean);
    const detalle = sub.length ? `${sub.length} punto(s)${potrero ? ` · Potrero ${esc(potrero)}` : ""}` : "sin puntos";
    html += `<div class="acordeon-lote">
      <div class="acordeon-cabeza">
        <button type="button" class="btn-papelera btn-borrar-lote" data-lote="${i}" title="Borrar el Lote ${i}" aria-label="Borrar el Lote ${i}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9zm4 2v8h2v-8h-2zm4 0v8h2v-8h-2z"/></svg></button>
        ${botonAcordeon(`Lote ${i}`, detalle)}
      </div>
      <div class="acordeon-cuerpo" hidden>
        <button type="button" class="boton-lote" data-lote="${i}">${sub.length ? "Continuar muestreo" : "Iniciar muestreo"}</button>
      </div>
    </div>`;
  }
  const contenedor = el("botones-lotes");
  contenedor.innerHTML = html;
  activarAcordeones(contenedor);
  contenedor.querySelectorAll(".boton-lote").forEach((btn) => {
    btn.addEventListener("click", () => onElegirLote(Number(btn.dataset.lote)));
  });
  contenedor.querySelectorAll(".btn-borrar-lote").forEach((btn) => {
    btn.addEventListener("click", () => onBorrarLote(Number(btn.dataset.lote)));
  });
}

async function onAgregarLoteNuevo() {
  leerManejoDePantalla();
  visita.numeroLotes += 1;
  const f = clientesFincas.find((c) => c.cliente === visita.cliente && c.finca === visita.finca);
  if (f) f.numeroLotes = visita.numeroLotes;
  await DB.guardarCache("clientesFincas", clientesFincas);
  await DB.agregarItem("actualizar_lotes", {
    cliente: visita.cliente, finca: visita.finca, numeroLotes: visita.numeroLotes,
  });
  renderLotesAMuestrear();
  actualizarSelectoresModo();
  actualizarVistaProductividad();
  renderManejo();
  await guardarBorrador();
}

// ---------- Productividad (por visita, "en general" o "por lotes") ----------

// Mismas formulas que la hoja Productividad_Fincas, solo para mostrar una vista previa en la app.
function calcularProductividad(area, animales, dias, produccion) {
  const carga = area > 0 ? animales / area : null;
  const areaDiaria = (animales > 0 && dias > 0) ? ((area * 10000) / animales) / dias : null;
  const productividad = area > 0 ? (produccion * animales) / area : null;
  return { carga, areaDiaria, productividad };
}

function recalcularProductividadGeneral() {
  const area = Number(el("pv-g-area").value) || 0;
  const animales = Number(el("pv-g-animales").value) || 0;
  const dias = Number(el("pv-g-dias").value) || 0;
  const produccion = Number(el("pv-g-produccion").value) || 0;
  const { carga, areaDiaria, productividad } = calcularProductividad(area, animales, dias, produccion);
  el("pv-g-carga").value = carga != null ? carga.toFixed(2) : "";
  el("pv-g-area-diaria").value = areaDiaria != null ? areaDiaria.toFixed(2) : "";
  el("pv-g-productividad").value = productividad != null ? productividad.toFixed(2) : "";
}

function guardarCampoProductividadGeneral() {
  productividadDatos.general = {
    area: el("pv-g-area").value, animales: el("pv-g-animales").value,
    dias: el("pv-g-dias").value, produccion: el("pv-g-produccion").value,
  };
}

function cargarCamposProductividadGeneral() {
  const d = productividadDatos.general || {};
  el("pv-g-area").value = d.area || "";
  el("pv-g-animales").value = d.animales || "";
  el("pv-g-dias").value = d.dias || "";
  el("pv-g-produccion").value = d.produccion || "";
  recalcularProductividadGeneral();
}

// Datos que valen para un lote en "por lotes": los suyos si los escribió, o si no los del Lote 1.
function productividadDeLote(lote) {
  const clave = String(lote);
  return clave === "1" || productividadPropios.has(clave) ? productividadDatos[clave] : productividadDatos["1"];
}

const AVISO_COPIA_LOTE_1 = "Igual al Lote 1 mientras no lo cambies.";

// "Por lotes": cada lote es un bloque que se despliega/oculta al tocarlo (no un desplegable).
function renderProductividadLotes() {
  let html = "";
  for (let i = 1; i <= visita.numeroLotes; i++) {
    html += `<div class="productividad-lote-bloque">
      ${botonAcordeon(`Lote ${i}`)}
      <div class="productividad-lote-campos" data-lote="${i}" hidden>
        <p class="aviso-suave pv-heredado" data-lote="${i}" hidden>${AVISO_COPIA_LOTE_1}</p>
        <div class="fila">
          <label>Área del lote (hectáreas) <input type="number" step="any" class="pv-area" data-lote="${i}"></label>
          <label>Animales en ordeño <input type="number" step="any" class="pv-animales" data-lote="${i}"></label>
        </div>
        <div class="fila">
          <label>Días de rotación <input type="number" step="any" class="pv-dias" data-lote="${i}"></label>
          <label>Producción diaria de leche (L/vaca·día) <input type="number" step="any" class="pv-produccion" data-lote="${i}"></label>
        </div>
        <p class="hint">Los siguientes 3 valores los calcula solo el Excel, aquí es solo una vista previa:</p>
        <div class="fila">
          <label>Carga animal (animales/ha) <input type="text" class="pv-carga" data-lote="${i}" disabled></label>
          <label>Área diaria por animal (m²/vaca·día) <input type="text" class="pv-area-diaria" data-lote="${i}" disabled></label>
        </div>
        <label>Productividad de la lechería (L leche/ha·día) <input type="text" class="pv-productividad" data-lote="${i}" disabled></label>
      </div>
    </div>`;
  }
  el("productividad-lotes-lista").innerHTML = html;
  for (let i = 1; i <= visita.numeroLotes; i++) llenarProductividadLote(i);

  activarAcordeones(el("productividad-lotes-lista"));
  el("productividad-lotes-lista").querySelectorAll(".pv-area, .pv-animales, .pv-dias, .pv-produccion").forEach((input) => {
    input.addEventListener("input", () => {
      const lote = input.dataset.lote;
      if (lote !== "1") productividadPropios.add(lote);
      guardarCampoProductividadLote(lote);
      recalcularProductividadLote(lote);
      // Lo escrito en el Lote 1 se copia de una vez en los lotes que no tienen datos propios.
      if (lote === "1") {
        for (let i = 2; i <= visita.numeroLotes; i++) if (!productividadPropios.has(String(i))) llenarProductividadLote(i);
      } else {
        llenarProductividadLote(lote, true);
      }
      guardarProductividadVisita();
    });
  });
}

function llenarProductividadLote(lote, soloAviso = false) {
  const lista = el("productividad-lotes-lista");
  const campo = (clase) => lista.querySelector(`.${clase}[data-lote="${lote}"]`);
  const heredado = String(lote) !== "1" && !productividadPropios.has(String(lote));
  campo("pv-heredado").hidden = !(heredado && tieneDatosProductividad(productividadDatos["1"]));
  if (soloAviso) return;
  const d = productividadDeLote(lote) || {};
  campo("pv-area").value = d.area ?? "";
  campo("pv-animales").value = d.animales ?? "";
  campo("pv-dias").value = d.dias ?? "";
  campo("pv-produccion").value = d.produccion ?? "";
  recalcularProductividadLote(lote);
}

function recalcularProductividadLote(lote) {
  const campo = (clase) => el("productividad-lotes-lista").querySelector(`.${clase}[data-lote="${lote}"]`);
  const area = Number(campo("pv-area").value) || 0;
  const animales = Number(campo("pv-animales").value) || 0;
  const dias = Number(campo("pv-dias").value) || 0;
  const produccion = Number(campo("pv-produccion").value) || 0;
  const { carga, areaDiaria, productividad } = calcularProductividad(area, animales, dias, produccion);
  campo("pv-carga").value = carga != null ? carga.toFixed(2) : "";
  campo("pv-area-diaria").value = areaDiaria != null ? areaDiaria.toFixed(2) : "";
  campo("pv-productividad").value = productividad != null ? productividad.toFixed(2) : "";
}

function guardarCampoProductividadLote(lote) {
  const campo = (clase) => el("productividad-lotes-lista").querySelector(`.${clase}[data-lote="${lote}"]`);
  productividadDatos[String(lote)] = {
    area: campo("pv-area").value, animales: campo("pv-animales").value,
    dias: campo("pv-dias").value, produccion: campo("pv-produccion").value,
  };
}

// Muestra el bloque que corresponde al modo actual (general/lotes/sin_datos/nada elegido aun).
function actualizarVistaProductividad() {
  el("productividad-general").hidden = productividadModo !== "general";
  el("productividad-lotes-lista").hidden = productividadModo !== "lotes";
  if (productividadModo === "general") {
    cargarCamposProductividadGeneral();
  } else if (productividadModo === "lotes") {
    renderProductividadLotes();
  }
}

function onCambioModoProductividad() {
  const nuevo = el("productividad-modo").value;
  if (nuevo === "lotes" && !tieneDatosProductividad(productividadDatos["1"]) && tieneDatosProductividad(productividadDatos.general)) {
    productividadDatos["1"] = copiar(productividadDatos.general);
  }
  if (nuevo === "general" && !tieneDatosProductividad(productividadDatos.general) && tieneDatosProductividad(productividadDatos["1"])) {
    productividadDatos.general = copiar(productividadDatos["1"]);
  }
  productividadModo = nuevo;
  actualizarVistaProductividad();
  guardarProductividadVisita();
}

// Si esta misma visita (cliente+finca+fecha exactos) ya tenía productividad guardada (en el Excel o
// todavía en el celular), se precarga en vez de empezar en blanco.
async function precargarProductividad() {
  let guardadas = [];
  try {
    guardadas = await Informes.productividadDeVisita(visita.cliente, visita.finca, visita.fecha);
  } catch (e) {
    console.warn("No se pudo leer la productividad guardada:", e.message);
  }
  const ultimoGuardado = (await DB.listarItems())
    .filter((it) => it.tipo === "productividad_visita" && it.datos.cliente === visita.cliente &&
      it.datos.finca === visita.finca && it.datos.fecha === visita.fecha)
    .pop();

  productividadDatos = {};
  guardadas.forEach((g) => {
    const clave = g.lote === "" || g.lote == null ? "general" : String(g.lote);
    productividadDatos[clave] = { area: g.area ?? "", animales: g.animales ?? "", dias: g.dias ?? "", produccion: g.produccion ?? "" };
  });
  // Un lote cuenta como "con datos propios" solo si lo guardado es distinto a lo del Lote 1; si es
  // igual, sigue copiando lo que se escriba en el Lote 1.
  const firma = (d) => (d ? JSON.stringify(["area", "animales", "dias", "produccion"].map((k) => (d[k] == null ? "" : String(d[k])))) : "");
  productividadPropios = new Set(Object.keys(productividadDatos)
    .filter((k) => k !== "general" && k !== "1" && firma(productividadDatos[k]) !== firma(productividadDatos["1"])));

  if (ultimoGuardado) {
    productividadModo = ultimoGuardado.datos.modo || "";
  } else if (guardadas.length === 0) {
    productividadModo = "";
  } else {
    productividadModo = guardadas.some((g) => g.lote === "" || g.lote == null) ? "general" : "lotes";
  }
  el("productividad-modo").value = productividadModo;
  actualizarSelectoresModo();
  actualizarVistaProductividad();
  productividadCargada = firmaProductividad();
}

const tieneDatosProductividad = (d) => d && [d.area, d.animales, d.dias, d.produccion].some((v) => v !== "" && v != null);
const camposProductividad = (d) => ({ area: d.area, animales: d.animales, dias: d.dias, produccion: d.produccion });

function filasProductividadActuales() {
  if (productividadModo === "general") {
    return tieneDatosProductividad(productividadDatos.general) ? [{ lote: "", ...camposProductividad(productividadDatos.general) }] : [];
  }
  if (productividadModo === "lotes") {
    const filas = [];
    for (let i = 1; i <= visita.numeroLotes; i++) {
      const d = productividadDeLote(i);
      if (tieneDatosProductividad(d)) filas.push({ lote: i, ...camposProductividad(d) });
    }
    return filas;
  }
  return [];
}

function firmaProductividad() {
  return JSON.stringify({ modo: productividadModo, filas: filasProductividadActuales() });
}

// Cada cambio en Productividad se guarda de una vez en el celular (antes vivía solo en memoria y
// se perdía al recargar). Hay un solo pendiente por visita, que se va actualizando; al sincronizar
// reemplaza en el Excel todas las filas de esa visita.
let colaGuardadoProductividad = Promise.resolve();
function guardarProductividadVisita() {
  colaGuardadoProductividad = colaGuardadoProductividad.then(async () => {
    if (!visita || !productividadModo) return;
    const datos = { cliente: visita.cliente, finca: visita.finca, fecha: visita.fecha, modo: productividadModo, filas: filasProductividadActuales() };
    const pendiente = (await DB.listarItems()).find((it) => it.tipo === "productividad_visita" && it.estado === "pendiente" &&
      it.datos.cliente === visita.cliente && it.datos.finca === visita.finca && it.datos.fecha === visita.fecha);
    if (pendiente) {
      await DB.actualizarDatosItem(pendiente.id, datos);
    } else if (firmaProductividad() !== productividadCargada) {
      await DB.agregarItem("productividad_visita", datos);
    }
  }).catch((e) => console.warn("No se pudo guardar la productividad:", e.message));
  return colaGuardadoProductividad;
}

// ---------- Manejo agronómico (por visita, "en general" o "por lotes") ----------

const CLAVES_MANEJO = ["tipoFumigacion", "litrosMezclaHa", "ordenMezclaCorrecto", "phFinalMezcla"];
const manejoEnBlanco = () => ({ campos: {}, productos: [] });
const copiar = (x) => JSON.parse(JSON.stringify(x));
const productosConNombre = (productos) => (productos || []).map((p) => ({
  tipo: String(p.tipo || "").trim(), nombre: String(p.nombre || "").trim(), formulacion: String(p.formulacion || "").trim(),
  unidad: String(p.unidad || "").trim(), dosis: String(p.dosis == null ? "" : p.dosis).trim(),
})).filter((p) => p.nombre);
const manejoVacio = (m) => !m || (!productosConNombre(m.productos).length && CLAVES_MANEJO.every((k) => !(m.campos && m.campos[k])));
const firmaManejo = (m) => JSON.stringify({
  campos: CLAVES_MANEJO.map((k) => String((m.campos && m.campos[k]) == null ? "" : m.campos[k]).trim()),
  productos: productosConNombre(m.productos).map((p) => claveProducto(p.nombre, p.formulacion, p.dosis)).sort(),
});

function manejoDeLote(lote) {
  if (manejoModo === "general") return manejoDatos.general || manejoEnBlanco();
  const clave = String(lote);
  const propio = clave === "1" || manejoPropios.has(clave);
  return (propio ? manejoDatos[clave] : manejoDatos["1"]) || manejoEnBlanco();
}

const TIPO_ESTACIONARIA = "Terrestre (Estacionaria)";
const redondear2 = (x) => String(Number(x.toFixed(2)));

// Con fumigación estacionaria, cuántas canecas de 200, 500 y 1000 L se necesitan por hectárea.
function textoCanecas(tipo, volumen) {
  const v = Number(String(volumen == null ? "" : volumen).trim().replace(",", "."));
  if (tipo !== TIPO_ESTACIONARIA || !(v > 0)) return "";
  return `Canecas de 200L/ha: ${redondear2(v / 200)} · Canecas de 500L/ha: ${redondear2(v / 500)} · Canecas de 1000L/ha: ${redondear2(v / 1000)}`;
}

function mostrarCanecas(elemento, tipo, volumen) {
  const texto = textoCanecas(tipo, volumen);
  elemento.textContent = texto;
  elemento.hidden = !texto;
}

function htmlFormularioManejo(clave) {
  const opciones = (lista) => lista.map(([valor, texto]) => `<option value="${valor}">${texto}</option>`).join("");
  return `<div class="manejo-form" data-clave="${clave}">
    <p class="aviso-suave manejo-copiado" hidden></p>
    <label>Tipo de fumigación
      <select class="m-campo" data-key="tipoFumigacion">${opciones([["", "-"], ["Aerea (Dron)", "Aérea (Dron)"], [TIPO_ESTACIONARIA, "Terrestre (Estacionaria)"], ["Terrestre (Bomba de espalda)", "Terrestre (Bomba de espalda)"]])}</select>
    </label>
    <label>Volumen de Mezcla/ha <input type="number" step="any" class="m-campo" data-key="litrosMezclaHa"></label>
    <p class="canecas" hidden></p>
    <h3>Productos aplicados</h3>
    <p class="hint">Agrega uno por uno los productos usados (acondicionador, insecticida, fungicida, fertilizante foliar, coadyuvante, etc.).</p>
    <div id="lista-productos-${clave}"></div>
    <button type="button" class="secundario btn-agregar-producto-manejo">+ Agregar producto</button>
    <label>Orden de mezcla correcto
      <select class="m-campo" data-key="ordenMezclaCorrecto">${opciones([["", "-"], ["Si", "Sí"], ["No", "No"]])}</select>
    </label>
    <label>pH final de la mezcla <input type="number" step="any" class="m-campo" data-key="phFinalMezcla"></label>
  </div>`;
}

function formularioManejo(clave) {
  return document.querySelector(`#pantalla-lotes .manejo-form[data-clave="${clave}"]`);
}

function actualizarCanecasManejo(form) {
  const valor = (k) => form.querySelector(`.m-campo[data-key="${k}"]`).value;
  mostrarCanecas(form.querySelector(".canecas"), valor("tipoFumigacion"), valor("litrosMezclaHa"));
}

function llenarFormularioManejo(clave, m, aviso) {
  const form = formularioManejo(clave);
  form.querySelectorAll(".m-campo").forEach((c) => {
    const valor = m.campos && m.campos[c.dataset.key];
    c.value = valor == null ? "" : valor;
  });
  const idLista = `lista-productos-${clave}`;
  el(idLista).innerHTML = "";
  (m.productos && m.productos.length ? m.productos : [{}]).forEach((p) => agregarBloqueProducto(idLista, p));
  form.querySelector(".manejo-copiado").textContent = aviso || "";
  form.querySelector(".manejo-copiado").hidden = !aviso;
  actualizarCanecasManejo(form);
}

// Pasa lo escrito en los formularios de manejo a manejoDatos (se llama antes de guardar o cambiar
// de modo). Los lotes que solo copian el Lote 1 no guardan datos propios.
function leerManejoDePantalla() {
  if (!manejoRenderizado) return;
  document.querySelectorAll("#pantalla-lotes .manejo-form").forEach((form) => {
    const clave = form.dataset.clave;
    if (clave !== "general" && clave !== "1" && !manejoPropios.has(clave)) return;
    const campos = {};
    form.querySelectorAll(".m-campo").forEach((c) => { campos[c.dataset.key] = c.value; });
    manejoDatos[clave] = { campos, productos: leerBloquesProductoCrudos(`lista-productos-${clave}`) };
  });
}

// Algo cambió en el formulario de manejo "clave": un lote editado deja de copiar el Lote 1, y lo que
// se escriba en el Lote 1 se copia de inmediato en los lotes que siguen copiándolo.
function onEditarManejo(clave, evento) {
  const form = formularioManejo(clave);
  if (form) actualizarCanecasManejo(form);
  if (manejoModo !== "lotes" || clave === "general") return;
  if (clave !== "1") {
    if (!manejoPropios.has(clave)) {
      manejoPropios.add(clave);
      form.querySelector(".manejo-copiado").hidden = true;
    }
    return;
  }
  leerManejoDePantalla();
  for (let i = 2; i <= visita.numeroLotes; i++) {
    if (!manejoPropios.has(String(i))) llenarFormularioManejo(String(i), manejoDatos["1"] || manejoEnBlanco(), avisoCopiaManejo());
  }
}

const avisoCopiaManejo = () => (manejoVacio(manejoDatos["1"]) ? "" : AVISO_COPIA_LOTE_1);

function renderManejo() {
  actualizarSelectoresModo();
  el("manejo-modo").value = manejoModo;
  const general = el("manejo-general");
  const lista = el("manejo-lotes-lista");
  general.hidden = manejoModo !== "general";
  lista.hidden = manejoModo !== "lotes";
  general.innerHTML = "";
  lista.innerHTML = "";

  const claves = [];
  if (manejoModo === "general") {
    general.innerHTML = htmlFormularioManejo("general");
    claves.push("general");
  } else {
    let html = "";
    for (let i = 1; i <= visita.numeroLotes; i++) {
      html += `<div class="acordeon-lote">${botonAcordeon(`Lote ${i}`)}<div class="acordeon-cuerpo" hidden>${htmlFormularioManejo(String(i))}</div></div>`;
      claves.push(String(i));
    }
    lista.innerHTML = html;
    activarAcordeones(lista);
  }

  claves.forEach((clave) => {
    const form = formularioManejo(clave);
    const heredado = clave !== "general" && clave !== "1" && !manejoPropios.has(clave);
    llenarFormularioManejo(clave, manejoDeLote(clave === "general" ? 1 : Number(clave)), heredado ? avisoCopiaManejo() : "");
    form.querySelector(".btn-agregar-producto-manejo").addEventListener("click", () => {
      agregarBloqueProducto(`lista-productos-${clave}`);
      onEditarManejo(clave);
      guardarBorrador();
    });
    ["input", "change"].forEach((tipo) => form.addEventListener(tipo, () => onEditarManejo(clave)));
    form.addEventListener("click", (e) => { if (e.target.closest(".btn-quitar-producto")) onEditarManejo(clave); });
  });
  manejoRenderizado = true;
}

function onCambioModoManejo() {
  leerManejoDePantalla();
  const nuevo = el("manejo-modo").value;
  if (nuevo === "general" && manejoVacio(manejoDatos.general) && !manejoVacio(manejoDatos["1"])) {
    manejoDatos.general = copiar(manejoDatos["1"]);
  }
  if (nuevo === "lotes" && manejoVacio(manejoDatos["1"]) && !manejoVacio(manejoDatos.general)) {
    manejoDatos["1"] = copiar(manejoDatos.general);
  }
  manejoModo = nuevo;
  renderManejo();
  guardarBorrador();
}

// Carga el manejo de la visita: lo escrito en el celular si la visita estaba en curso; si no, lo
// registrado en el Excel. Si todos los lotes con datos tienen el mismo manejo, se muestra "En general".
async function precargarManejo(guardado) {
  manejoRenderizado = false;
  if (guardado && guardado.modo) {
    manejoModo = guardado.modo;
    manejoDatos = guardado.datos || {};
    manejoPropios = new Set(guardado.propios || Object.keys(manejoDatos).filter((k) => k !== "general" && k !== "1"));
  } else {
    manejoDatos = {};
    const conDatos = [];
    for (let i = 1; i <= visita.numeroLotes; i++) {
      let registrado = { manejo: null, productos: [] };
      try {
        registrado = await Informes.manejoYProductosDeLote(visita.cliente, visita.finca, visita.fecha, i);
      } catch (e) {
        console.warn("No se pudo leer el manejo guardado del lote:", e.message);
      }
      const m = { campos: registrado.manejo || {}, productos: registrado.productos };
      if (!manejoVacio(m)) {
        manejoDatos[String(i)] = m;
        conDatos.push(m);
      }
    }
    const todosIguales = conDatos.every((m) => firmaManejo(m) === firmaManejo(conDatos[0]));
    if (conDatos.length === 0 || todosIguales) {
      manejoModo = "general";
      manejoDatos.general = conDatos.length ? copiar(conDatos[0]) : manejoEnBlanco();
    } else {
      manejoModo = "lotes";
    }
    // Solo tiene manejo propio el lote cuyo manejo registrado es distinto al del Lote 1.
    const firmaLote1 = manejoDatos["1"] ? firmaManejo(manejoDatos["1"]) : null;
    manejoPropios = new Set(Object.keys(manejoDatos)
      .filter((k) => k !== "general" && k !== "1" && firmaManejo(manejoDatos[k]) !== firmaLote1));
  }
  renderManejo();
}

// Deja registrado en la cola el manejo de los lotes indicados: productos aplicados (agrega lo nuevo,
// borra lo que se quitó, también del Excel) y el manejo en los puntos aún no subidos.
async function confirmarManejoDeLotes(lotes) {
  leerManejoDePantalla();
  for (const lote of lotes) {
    const m = manejoDeLote(lote);
    await registrarProductosAplicadosDeLote(lote, productosConNombre(m.productos));
    await aplicarManejoAPuntosPendientes(lote, m.campos || {});
    await encolarManejoEnExcel(lote, m.campos || {});
  }
}

// Los puntos que YA están en el Excel no se pueden corregir cambiando la cola: el tipo de
// fumigación, el volumen de mezcla, el orden de mezcla y el pH viven en esas mismas filas. Por eso
// se encola un cambio para el Excel. Si los cuatro campos están vacíos no se encola nada: sería
// borrar en el Excel un manejo que quizá solo no se alcanzó a leer.
async function encolarManejoEnExcel(lote, campos) {
  if (!visita) return;
  const valores = {};
  CLAVES_MANEJO.forEach((k) => { valores[k] = String(campos[k] == null ? "" : campos[k]).trim(); });
  if (CLAVES_MANEJO.every((k) => !valores[k])) return;
  const datos = { cliente: visita.cliente, finca: visita.finca, fecha: visita.fecha, lote, campos: valores };
  const pendiente = (await DB.listarItems()).find((it) => it.tipo === "manejo_puntos" && it.estado === "pendiente" &&
    it.datos.cliente === visita.cliente && it.datos.finca === visita.finca && it.datos.fecha === visita.fecha &&
    String(it.datos.lote) === String(lote));
  if (pendiente) await DB.eliminarItem(pendiente.id);
  await DB.agregarItem("manejo_puntos", datos);
}

async function registrarProductosAplicadosDeLote(lote, productos) {
  // Lo que ya estaba registrado para ESTE lote (en el Excel o pendiente en el celular). Se compara
  // contra lo que quedó en el formulario: lo que ya no está se borra, y lo nuevo se agrega.
  let existentes = [];
  try {
    existentes = (await Informes.manejoYProductosDeLote(visita.cliente, visita.finca, visita.fecha, lote)).productos;
  } catch (e) {
    console.warn("No se pudieron leer los productos ya registrados:", e.message);
  }
  const clave = (p) => claveProducto(p.nombre, p.formulacion, p.dosis);
  const enFormulario = new Set(productos.map(clave));
  const yaRegistrados = new Set(existentes.map(clave));
  const items = await DB.listarItems();
  const delLote = (it) => it.datos.cliente === visita.cliente && it.datos.finca === visita.finca &&
    it.datos.fecha === visita.fecha && String(it.datos.lote) === String(lote);

  for (const p of existentes.filter((x) => !enFormulario.has(clave(x)))) {
    const enCola = items.filter((it) => it.tipo === "producto_aplicado" && delLote(it) &&
      claveProducto(it.datos.producto, it.datos.formulacion, it.datos.dosis) === clave(p));
    for (const it of enCola) await DB.eliminarItem(it.id);
    // Si solo existía en el celular (nunca se subió), basta con borrarlo de la cola. Si ya estaba en
    // el Excel, queda pendiente borrarlo allá en la próxima sincronización.
    const soloEnCelular = enCola.length > 0 && enCola.every((it) => it.estado === "pendiente");
    if (!soloEnCelular) {
      await DB.agregarItem("eliminar_producto_aplicado", {
        cliente: visita.cliente, finca: visita.finca, fecha: visita.fecha, lote,
        producto: p.nombre, formulacion: p.formulacion, dosis: p.dosis,
      });
    }
  }

  const itemsPendientes = await DB.listarItems();
  for (const p of productos) {
    if (!yaRegistrados.has(clave(p))) {
      await DB.agregarItem("producto_aplicado", {
        cliente: visita.cliente, finca: visita.finca, fecha: visita.fecha, lote,
        producto: p.nombre, tipo: p.tipo, formulacion: p.formulacion, unidad: p.unidad, dosis: p.dosis,
      });
    }
    // Ademas del catalogo ya sincronizado, hay que revisar si ya se encolo "producto_nuevo" para este
    // mismo producto en otro lote de esta misma visita (aun sin subir a Excel), para no duplicarlo.
    const yaExiste = catalogoProductos.some((c) => c.nombre.toLowerCase() === p.nombre.toLowerCase())
      || itemsPendientes.some((it) => it.tipo === "producto_nuevo" && it.datos.nombre.toLowerCase() === p.nombre.toLowerCase());
    if (!yaExiste) {
      catalogoProductos.push({ nombre: p.nombre, tipo: p.tipo, formulacion: p.formulacion, unidad: p.unidad });
      await DB.guardarCache("catalogoProductos", catalogoProductos);
      await DB.agregarItem("producto_nuevo", { nombre: p.nombre, tipo: p.tipo, formulacion: p.formulacion, unidad: p.unidad });
      actualizarOpcionesCatalogo();
    }
  }
}

// Si se corrigió el manejo, los puntos del lote que aún no se suben quedan con el manejo nuevo.
async function aplicarManejoAPuntosPendientes(lote, campos) {
  const B = ESQUEMA.BASE;
  const valor = (k) => String(campos[k] == null ? "" : campos[k]).trim();
  const items = await DB.listarItems();
  for (const it of items) {
    if (it.tipo !== "punto" || it.estado !== "pendiente" || it.datos.cliente !== visita.cliente ||
      it.datos.finca !== visita.finca || it.datos.fecha !== visita.fecha || String(it.datos.lote) !== String(lote)) continue;
    const fila = [...it.datos.fila];
    fila[B.tipoFumigacion] = valor("tipoFumigacion");
    fila[B.litrosMezclaHa] = valor("litrosMezclaHa");
    fila[B.ordenMezclaCorrecto] = valor("ordenMezclaCorrecto");
    fila[B.phFinalMezcla] = valor("phFinalMezcla");
    if (JSON.stringify(fila) !== JSON.stringify(it.datos.fila)) await DB.actualizarDatosItem(it.id, { fila });
  }
}

// ---------- Paso 2: elegir lote y muestrearlo ----------

async function onElegirLote(lote) {
  const boton = el("botones-lotes").querySelector(`.boton-lote[data-lote="${lote}"]`);
  if (boton) { boton.disabled = true; boton.textContent = "Abriendo..."; }
  try {
    loteActual = lote;
    await confirmarManejoDeLotes([lote]);
    const campos = manejoDeLote(lote).campos || {};
    manejoActual = {};
    CLAVES_MANEJO.forEach((k) => { manejoActual[k] = String(campos[k] == null ? "" : campos[k]).trim(); });

    capturandoLote = true;
    editandoPuntoId = null;
    await calcularSiguientePunto();
    await precargarPotreroLote();
    el("lote-actual-num").textContent = loteActual;
    mostrarCajaObservacionesLote(false);
    await mostrarPunto(puntoActual);
    mostrarPantalla("pantalla-punto");
    window.scrollTo(0, 0);
    await guardarBorrador();
    await refrescarResumenCola();
  } catch (e) {
    alert("No se pudo abrir el lote: " + e.message);
    renderLotesAMuestrear();
  }
}

// Borra un lote (papelera a la izquierda de su nombre en "Lotes a muestrear") con todo lo suyo (puntos, productos aplicados, observaciones
// y productividad del lote). Lo que ya estaba en el Excel se borra allá en la próxima sincronización.
async function onBorrarLote(lote) {
  if (!visita || !lote) return;
  const v = visita;
  if (!confirm(`¿Borrar el Lote ${lote} de esta visita?\n\nSe borran sus puntos, productos aplicados, observaciones y productividad del lote, también del Excel. No se puede deshacer.`)) return;

  const TIPOS_DEL_LOTE = ["punto", "producto_aplicado", "eliminar_producto_aplicado", "observacion_lote"];
  const items = await DB.listarItems();
  const delLote = items.filter((it) => TIPOS_DEL_LOTE.includes(it.tipo) && it.datos.cliente === v.cliente &&
    it.datos.finca === v.finca && it.datos.fecha === v.fecha && String(it.datos.lote) === String(lote));
  let enExcel = delLote.some((it) => it.estado !== "pendiente");
  if (!enExcel) {
    try {
      const B = ESQUEMA.BASE;
      const remotas = await Informes._tablaRemota(CONFIG.TABLE_NAME, "filasBase");
      enExcel = remotas.some((f) => f[B.cliente] === v.cliente && f[B.finca] === v.finca &&
        normalizarFecha(f[B.fecha]) === v.fecha && String(f[B.lote]) === String(lote));
    } catch (e) {
      enExcel = true; // si no se puede confirmar, mejor pedir el borrado en el Excel
    }
  }
  for (const it of delLote) await DB.eliminarItem(it.id);
  if (enExcel) await DB.agregarItem("eliminar_lote", { cliente: v.cliente, finca: v.finca, fecha: v.fecha, lote });

  leerManejoDePantalla();
  delete manejoDatos[String(lote)];
  manejoPropios.delete(String(lote));
  productividadPropios.delete(String(lote));
  delete sinGuardar.punto[String(lote)];
  delete sinGuardar.obs[String(lote)];
  if (lote === v.numeroLotes && v.numeroLotes > 1) v.numeroLotes -= 1;
  if (String(loteActual) === String(lote)) {
    capturandoLote = false;
    editandoPuntoId = null;
    loteActual = null;
    el("form-punto").reset();
    mostrarCajaObservacionesLote(false);
  }

  delete productividadDatos[String(lote)];
  actualizarSelectoresModo();
  actualizarVistaProductividad();
  await guardarProductividadVisita();
  renderManejo();

  await renderLotesAMuestrear();
  mostrarPantalla("pantalla-lotes");
  await guardarBorrador();
  await refrescarResumenCola();
  alert(enExcel
    ? `Lote ${lote} borrado. Lo que ya estaba en tu Excel se borrará allá la próxima vez que sincronices.`
    : `Lote ${lote} borrado.`);
}

async function puntosDelLoteActual() {
  const items = await DB.listarItems();
  return items.filter(
    (it) =>
      it.tipo === "punto" &&
      it.datos.cliente === visita.cliente &&
      it.datos.finca === visita.finca &&
      it.datos.fecha === visita.fecha &&
      it.datos.lote === loteActual
  );
}

// El punto nuevo es el siguiente al más alto ya guardado (si faltara alguno en el medio, no se
// pisa: se puede navegar hasta él y llenarlo).
async function calcularSiguientePunto() {
  const numeros = (await puntosDelLoteActual()).map((it) => Number(it.datos.fila[ESQUEMA.BASE.punto]) || 0);
  puntoActual = numeros.length ? Math.max(...numeros) + 1 : 1;
  puntoMostrado = puntoActual;
  el("punto-actual-num").textContent = puntoActual;
}

// Muestra el punto pedido del lote: si está guardado, lo carga; si no, deja el formulario en blanco.
let puntoSincronizado = false;
async function mostrarPunto(numero) {
  const delLote = await puntosDelLoteActual();
  const item = delLote.find((it) => Number(it.datos.fila[ESQUEMA.BASE.punto]) === numero);
  puntoMostrado = numero;
  if (numero >= puntoActual) puntoActual = numero;
  editandoPuntoId = item && item.estado === "pendiente" ? item.id : null;
  puntoSincronizado = !!(item && item.estado !== "pendiente");

  const potrero = el("potrero-nombre-punto").value;
  el("form-punto").reset();
  el("potrero-nombre-punto").value = potrero;
  if (item) cargarPuntoEnFormulario(item.datos.fila);
  else if (numero === puntoActual) llenarPuntoSinGuardar(); // lo que se estaba escribiendo del punto nuevo

  el("punto-actual-num").textContent = numero;
  el("btn-punto-anterior").disabled = numero <= 1;
  el("btn-punto-siguiente").textContent = numero < puntoActual ? "Punto siguiente" : "Siguiente punto";
  el("aviso-punto").hidden = !puntoSincronizado;
  el("aviso-punto").textContent = puntoSincronizado
    ? "Este punto ya se subió a tu Excel: se puede ver, pero no cambiar desde aquí."
    : "";
  await guardarBorrador();
}

// Si se retoma un lote que ya tenia puntos guardados, se recupera el nombre de potrero ya usado.
async function precargarPotreroLote() {
  const delLote = await puntosDelLoteActual();
  const existente = delLote.map((it) => it.datos.fila[ESQUEMA.BASE.potrero]).find((v) => v);
  el("potrero-nombre-punto").value = existente || "";
}

// ---------- Paso 3: capturar punto ----------

function pct(idCampo) {
  return Number(el(idCampo).value || 0) / 100;
}

function leerCamposComunes() {
  const incidColl = pct("incid-coll");
  const sevColl = pct("sev-coll");
  const incidHongos = pct("incid-hongos");
  const sevHongos = pct("sev-hongos");
  const hojasMoluscos = Number(el("hojas-moluscos").value || 0);
  return {
    adultos: Number(el("adultos").value || 0), ninfas: Number(el("ninfas").value || 0),
    incidColl, sevColl, danoCollTotal: incidColl * sevColl,
    loritos: Number(el("loritos").value || 0), lepidopteros: Number(el("lepidopteros").value || 0),
    hojasMoluscos,
    incidMoluscos: hojasMoluscos / parametros.hojasEvaluadas,
    danoMoluscos: (hojasMoluscos / parametros.hojasEvaluadas) * parametros.severidadMoluscos,
    incidHongos, sevHongos, danoHongos: incidHongos * sevHongos,
    potrero: el("potrero-nombre-punto").value.trim(),
    observaciones: el("observaciones").value || "",
  };
}

// El potrero no cuenta: es del lote entero y viene puesto de antes, no es un dato de este punto.
const CAMPOS_PROPIOS_DEL_PUNTO = CAMPOS_PUNTO.filter((id) => id !== "potrero-nombre-punto");

// ¿El asesor alcanzó a escribir algo en el punto que está en pantalla? Se usa para no perder el
// último punto al terminar el lote: antes se exigía el formulario completo (checkValidity) y, si
// faltaba un solo campo, el punto se descartaba en silencio. Ahora se guarda lo que haya (los
// campos vacíos valen 0, igual que siempre) y solo se ignora el formulario totalmente en blanco.
function hayDatosEnPunto() {
  return CAMPOS_PROPIOS_DEL_PUNTO.some((id) => String(el(id).value).trim() !== "");
}

// Guarda el punto que está en pantalla si tiene algo escrito y todavía no está en el Excel.
async function guardarPuntoEnPantallaSiHayDatos() {
  if (!capturandoLote || puntoSincronizado || !loteActual) return false;
  if (editandoPuntoId) { await actualizarPuntoEditado(); editandoPuntoId = null; return true; }
  if (!hayDatosEnPunto()) return false;
  await guardarPuntoActual(puntoMostrado);
  if (puntoMostrado >= puntoActual) puntoActual = puntoMostrado + 1;
  // Se limpia el formulario para no volver a guardar el mismo punto si se toca el botón otra vez.
  const potrero = el("potrero-nombre-punto").value;
  el("form-punto").reset();
  el("potrero-nombre-punto").value = potrero;
  puntoMostrado = puntoActual;
  delete sinGuardar.punto[String(loteActual)];
  return true;
}

async function guardarPuntoActual(numero) {
  const c = leerCamposComunes();
  const fila = [
    visita.cliente, visita.finca, visita.fecha, loteActual, numero,
    c.adultos, c.ninfas, c.incidColl, c.sevColl, c.danoCollTotal,
    c.loritos, c.lepidopteros,
    c.hojasMoluscos, c.incidMoluscos, c.danoMoluscos,
    c.incidHongos, c.sevHongos, c.danoHongos,
    c.potrero, c.observaciones,
    manejoActual.tipoFumigacion || "", manejoActual.litrosMezclaHa || "",
    manejoActual.ordenMezclaCorrecto || "", manejoActual.phFinalMezcla || "",
  ];

  await DB.agregarItem("punto", {
    cliente: visita.cliente, finca: visita.finca, fecha: visita.fecha, lote: loteActual, fila,
  });
}

// Actualiza (en vez de crear) el punto que se esta corrigiendo con "Punto anterior".
async function actualizarPuntoEditado() {
  const items = await DB.listarItems();
  const item = items.find((it) => it.id === editandoPuntoId);
  if (!item) return;
  const c = leerCamposComunes();
  const B = ESQUEMA.BASE;
  const fila = [...item.datos.fila];
  fila[B.adultos] = c.adultos; fila[B.ninfas] = c.ninfas;
  fila[B.incidColl] = c.incidColl; fila[B.sevColl] = c.sevColl; fila[B.danoCollTotal] = c.danoCollTotal;
  fila[B.loritos] = c.loritos; fila[B.lepidopteros] = c.lepidopteros;
  fila[B.hojasMoluscos] = c.hojasMoluscos; fila[B.incidMoluscos] = c.incidMoluscos; fila[B.danoMoluscos] = c.danoMoluscos;
  fila[B.incidHongos] = c.incidHongos; fila[B.sevHongos] = c.sevHongos; fila[B.danoHongos] = c.danoHongos;
  fila[B.potrero] = c.potrero; fila[B.observaciones] = c.observaciones;
  await DB.actualizarDatosItem(editandoPuntoId, { fila });
}

function cargarPuntoEnFormulario(fila) {
  const B = ESQUEMA.BASE;
  el("adultos").value = fila[B.adultos];
  el("ninfas").value = fila[B.ninfas];
  el("incid-coll").value = Math.round(fila[B.incidColl] * 10000) / 100;
  el("sev-coll").value = Math.round(fila[B.sevColl] * 10000) / 100;
  el("loritos").value = fila[B.loritos];
  el("lepidopteros").value = fila[B.lepidopteros];
  el("hojas-moluscos").value = fila[B.hojasMoluscos];
  el("incid-hongos").value = Math.round(fila[B.incidHongos] * 10000) / 100;
  el("sev-hongos").value = Math.round(fila[B.sevHongos] * 10000) / 100;
  el("observaciones").value = fila[B.observaciones] || "";
}

// "Siguiente punto": guarda lo que esté en pantalla (o corrige el punto que se está viendo) y pasa
// al punto siguiente por número: del 1 al 2, del 2 al 3... no salta al final de la lista.
async function onGuardarPunto(ev) {
  ev.preventDefault();
  if (puntoSincronizado) {
    // Ya está en el Excel: no se toca, solo se avanza.
  } else if (editandoPuntoId) {
    await actualizarPuntoEditado();
  } else {
    await guardarPuntoActual(puntoMostrado);
    if (puntoMostrado >= puntoActual) puntoActual = puntoMostrado + 1;
    delete sinGuardar.punto[String(loteActual)];
  }
  await mostrarPunto(puntoMostrado + 1);
  await refrescarResumenCola();
}

// Retrocede un punto a la vez dentro del mismo lote para poder corregirlo. Solo se puede
// editar un punto que aun no se haya sincronizado (uno ya subido no se puede corregir desde aqui).
async function onPuntoAnterior() {
  if (puntoMostrado <= 1) return;
  await mostrarPunto(puntoMostrado - 1);
}

// Sin importar en que punto se haya escrito el nombre del potrero, al terminar el lote se le
// pone ese mismo nombre a TODOS los puntos ya guardados de este lote (solo si aun no se sincronizaron).
async function aplicarPotreroATodosLosPuntos(potrero) {
  const delLote = await puntosDelLoteActual();
  for (const it of delLote) {
    if (it.estado === "pendiente" && it.datos.fila[ESQUEMA.BASE.potrero] !== potrero) {
      const fila = [...it.datos.fila];
      fila[ESQUEMA.BASE.potrero] = potrero;
      await DB.actualizarDatosItem(it.id, { fila });
    }
  }
}

async function onTerminarLote() {
  const potrero = el("potrero-nombre-punto").value.trim();
  if (!potrero) {
    marcarCampoInvalido(el("potrero-nombre-punto"));
    return;
  }
  await guardarPuntoEnPantallaSiHayDatos();
  await aplicarPotreroATodosLosPuntos(potrero);
  capturandoLote = false;

  // Antes de volver a la lista de lotes se piden las observaciones generales del lote.
  let existente = "";
  try {
    existente = await Informes.observacionDeLote(visita.cliente, visita.finca, visita.fecha, loteActual);
  } catch (e) {
    console.warn("No se pudo leer la observación del lote:", e.message);
  }
  const escrita = sinGuardar.obs[String(loteActual)];
  el("observaciones-lote").value = escrita != null ? escrita : existente;
  ajustarAltoTexto(el("observaciones-lote"));
  el("observaciones-lote").dataset.inicial = existente;
  delete sinGuardar.punto[String(loteActual)];
  mostrarCajaObservacionesLote(true);
  el("caja-observaciones-lote").scrollIntoView({ behavior: "smooth", block: "start" });
  await guardarBorrador();
  await refrescarResumenCola();
}

async function onFinalizarLote() {
  const texto = el("observaciones-lote").value.trim();
  const potrero = el("potrero-nombre-punto").value.trim();
  const datos = { cliente: visita.cliente, finca: visita.finca, fecha: visita.fecha, lote: loteActual, potrero, observaciones: texto };
  const pendiente = (await DB.listarItems()).find((it) => it.tipo === "observacion_lote" && it.estado === "pendiente" &&
    it.datos.cliente === visita.cliente && it.datos.finca === visita.finca && it.datos.fecha === visita.fecha &&
    String(it.datos.lote) === String(loteActual));
  if (pendiente) {
    await DB.actualizarDatosItem(pendiente.id, datos);
  } else if (texto !== (el("observaciones-lote").dataset.inicial || "").trim()) {
    await DB.agregarItem("observacion_lote", datos);
  }
  if (potrero) await aplicarPotreroATodosLosPuntos(potrero);

  delete sinGuardar.obs[String(loteActual)];
  mostrarCajaObservacionesLote(false);
  el("observaciones-lote").value = "";
  renderLotesAMuestrear();
  mostrarPantalla("pantalla-lotes");
  await guardarBorrador();
  await refrescarResumenCola();
}

async function onFinMuestreo() {
  // Si quedó un punto escrito sin cerrar el lote (se salió a la lista sin darle "Terminar lote"),
  // se guarda antes de cerrar la visita: si no, ese punto se perdía.
  await guardarPuntoEnPantallaSiHayDatos();
  if (!productividadModo) {
    const caja = el("productividad-modo").closest(".seccion");
    caja.querySelector(".seccion-titulo").setAttribute("aria-expanded", "true");
    caja.querySelector(".seccion-cuerpo").hidden = false;
    marcarCampoInvalido(el("productividad-modo"));
    return;
  }
  if (productividadModo === "general") guardarCampoProductividadGeneral(); // guarda lo visible ahora mismo (los de "por lotes" ya se guardan solos al escribir)
  if (!confirm("¿Seguro que quieres terminar la visita?")) return;
  await guardarProductividadVisita();
  let filasVisita = [];
  try {
    filasVisita = (await Informes.filas()).filter((f) => f[ESQUEMA.BASE.cliente] === visita.cliente &&
      f[ESQUEMA.BASE.finca] === visita.finca && f[ESQUEMA.BASE.fecha] === visita.fecha);
  } catch (e) {
    console.warn("No se pudieron leer los puntos de la visita:", e.message);
  }
  await confirmarManejoDeLotes([...new Set(filasVisita.map((f) => f[ESQUEMA.BASE.lote]))]);
  const items = await DB.listarItems();
  const puntosVisita = items.filter(
    (it) => it.tipo === "punto" && it.datos.cliente === visita.cliente && it.datos.finca === visita.finca && it.datos.fecha === visita.fecha
  );

  const lotesVisitados = [...new Set(puntosVisita.map((p) => p.datos.lote))].sort((a, b) => a - b);
  const lineas = lotesVisitados.map((lote) => {
    const delLote = puntosVisita.filter((p) => p.datos.lote === lote);
    const potrero = delLote.map((p) => p.datos.fila[ESQUEMA.BASE.potrero]).find((v) => v);
    const etiqueta = potrero ? `Lote ${lote} (Potrero ${potrero})` : `Lote ${lote}`;
    return `${etiqueta}: ${delLote.length} punto(s) de muestreo`;
  });

  const pendientes = puntosVisita.filter((p) => p.estado === "pendiente");
  let resumen = `${visita.cliente} · ${visita.finca} · ${visita.fecha}\n` + lineas.join("\n");
  if (pendientes.length > 0) {
    resumen += `\n\n${pendientes.length} punto(s) guardado(s) localmente. Dale a "Sincronizar" arriba cuando quieras subirlos a Excel.`;
    const error = pendientes.find((p) => p.ultimoError)?.ultimoError;
    if (error) resumen += `\nÚltimo error al intentar subir: ${error}`;
  } else {
    resumen += "\n\nTodos los puntos ya están sincronizados con tu Excel.";
  }
  el("resumen-final").textContent = resumen;
  await borrarBorrador(); // la visita terminada sale de "Visitas en curso"
  visita = null;
  loteActual = null;
  pantallaFlujo = null;
  manejoDatos = {};
  manejoPropios = new Set();
  productividadPropios = new Set();
  manejoRenderizado = false;
  sinGuardar = { manejo: {}, punto: {}, obs: {} };
  mostrarPantalla("pantalla-fin");
}

async function refrescarResumenCola() {
  const items = await DB.listarItems();
  const pendientes = items.filter((it) => it.estado === "pendiente").length;
  el("btn-sincronizar").disabled = pendientes === 0;
  el("resumen-cola").textContent = pendientes > 0
    ? `${pendientes} punto(s)/dato(s) pendiente(s) de subir a tu Excel.`
    : "Todo sincronizado con tu Excel.";
}

// ---------- Pestaña Informes ----------

// Al entrar a Informes no queda nada elegido: hay que escoger cliente, finca y fecha a propósito.
function poblarSelectInformeCliente() {
  const clientes = clientesOrdenados();
  el("informe-cliente").innerHTML = `<option value="">Elija cliente</option>` +
    clientes.map((c) => `<option value="${c}">${c}</option>`).join("");
  poblarSelectInformeFinca();
}

function poblarSelectInformeFinca() {
  const cliente = el("informe-cliente").value;
  const fincas = clientesFincas.filter((c) => c.cliente === cliente).map((f) => f.finca).sort(porNombre);
  el("informe-finca").innerHTML = cliente
    ? `<option value="">Elija finca</option>` + fincas.map((f) => `<option value="${f}">${f}</option>`).join("")
    : `<option value="">Elija primero el cliente</option>`;
  poblarSelectInformeFecha();
}

async function poblarSelectInformeFecha() {
  const cliente = el("informe-cliente").value;
  const finca = el("informe-finca").value;
  ocultarDatosInforme();
  if (!cliente || !finca) {
    el("informe-fecha").innerHTML = `<option value="">Elija primero la finca</option>`;
    return;
  }
  el("informe-fecha").innerHTML = `<option value="">Cargando fechas...</option>`;
  try {
    const fechas = await Informes.fechasDisponibles(cliente, finca);
    el("informe-fecha").innerHTML = fechas.length
      ? `<option value="">Elija fecha</option>` + fechas.map((f) => `<option value="${f}">${Informes.formatoFechaVisible(f)}</option>`).join("")
      : `<option value="">Sin visitas registradas</option>`;
  } catch (e) {
    el("informe-fecha").innerHTML = `<option value="">Error al cargar fechas</option>`;
    el("datos-estado").textContent = "No se pudieron leer las fechas: " + e.message;
  }
}

// ---------- Informe por fincas de un cliente ----------

const informePorCliente = () => el("informe-tipo").value === "cliente";

async function onCambioTipoInforme() {
  const porCliente = informePorCliente();
  el("informe-campos-visita").hidden = porCliente;
  el("informe-campos-cliente").hidden = !porCliente;
  el("informe-notas-caja").firstChild.textContent = porCliente
    ? "Nota general para el cliente (opcional, va al final del informe) "
    : "Observaciones adicionales para el cliente (quedan fijas en el informe, no editables) ";
  ocultarDatosInforme();
  if (porCliente) {
    await precargarRecomendacionCliente();
    await renderFincasDelCliente();
  } else {
    poblarSelectInformeFinca();
  }
}

// Una línea por finca del cliente: se marca si entra en el informe y de qué visita se toman sus datos.
async function renderFincasDelCliente() {
  const cliente = el("informe-cliente").value;
  const lista = el("informe-fincas-lista");
  if (!cliente) {
    lista.innerHTML = `<p class="hint">Elige primero el cliente.</p>`;
    return;
  }
  lista.innerHTML = `<p class="hint">Cargando fincas...</p>`;
  const fincas = clientesFincas.filter((c) => c.cliente === cliente).map((f) => f.finca).sort(porNombre);
  const bloques = [];
  for (const finca of fincas) {
    let fechas = [];
    try {
      fechas = await Informes.fechasDisponibles(cliente, finca);
    } catch (e) {
      console.warn("No se pudieron leer las fechas de la finca:", e.message);
    }
    if (fechas.length === 0) continue;
    bloques.push(`<div class="finca-informe">
      <input type="checkbox" class="finca-incluir" data-finca="${esc(finca)}" checked>
      <span class="finca-nombre">${esc(finca)}</span>
      <select class="finca-fecha" data-finca="${esc(finca)}">
        ${fechas.map((f) => `<option value="${f}">${Informes.formatoFechaVisible(f)}</option>`).join("")}
      </select>
    </div>`);
  }
  lista.innerHTML = bloques.length ? bloques.join("") : `<p class="hint">Este cliente todavía no tiene visitas registradas.</p>`;
  lista.querySelectorAll("input, select").forEach((campo) => campo.addEventListener("change", cargarDatosInforme));
  await cargarDatosInforme();
}

// Recomendación guardada para este cliente (la del informe por fincas más reciente).
async function precargarRecomendacionCliente() {
  const cliente = el("informe-cliente").value;
  let guardada = null;
  if (cliente) {
    try {
      guardada = await Informes.recomendacionCliente(cliente);
    } catch (e) {
      console.warn("No se pudo leer la recomendación del cliente:", e.message);
    }
  }
  el("informe-tipo-fumigacion").value = (guardada && guardada.tipoFumigacion) || "";
  el("informe-volumen-mezcla").value = (guardada && guardada.volumenMezcla) || "";
  el("informe-recomendaciones").value = (guardada && guardada.nota) || "";
  ajustarAltoTexto(el("informe-recomendaciones"));
  mostrarCanecas(el("informe-canecas"), el("informe-tipo-fumigacion").value, el("informe-volumen-mezcla").value);
  el("lista-productos-informe").innerHTML = "";
  const productos = (guardada && guardada.productos) || [];
  if (productos.length) productos.forEach((p) => agregarBloqueProducto("lista-productos-informe", p));
  else agregarBloqueProducto("lista-productos-informe");
}

// Guarda en la cola la recomendación del informe por fincas: al sincronizar reemplaza las filas de
// ese cliente y esa fecha de informe en Recomendaciones_Cliente.
async function guardarRecomendacionCliente(datos) {
  const items = await DB.listarItems();
  const pendiente = items.find((it) => it.tipo === "recomendaciones_cliente" && it.estado === "pendiente" &&
    it.datos.cliente === datos.cliente && it.datos.fechaInforme === datos.fechaInforme);
  if (pendiente) await DB.actualizarDatosItem(pendiente.id, datos);
  else await DB.agregarItem("recomendaciones_cliente", datos);
}

function seleccionDeFincas() {
  return [...el("informe-fincas-lista").querySelectorAll(".finca-incluir")]
    .filter((c) => c.checked)
    .map((c) => ({
      finca: c.dataset.finca,
      fecha: el("informe-fincas-lista").querySelector(`.finca-fecha[data-finca="${CSS.escape(c.dataset.finca)}"]`).value,
    }))
    .filter((x) => x.fecha);
}

function ocultarDatosInforme() {
  el("informe-datos").hidden = true;
  el("informe-resultado").hidden = true;
}

// Ajusta la altura del recuadro a la del informe, para que solo haya un scroll (el de la página) y
// no quede un espacio vacío debajo. Se mide varias veces porque la letra y las gráficas terminan de
// acomodarse después de cargar, y solo mientras el recuadro está visible: midiéndolo escondido da
// una altura enorme (el bug del espacio larguísimo en el celular).
function ajustarAlturaPreview() {
  const preview = el("informe-preview");
  const medir = () => {
    if (el("informe-datos").hidden || !preview.offsetWidth) return;
    try {
      const doc = preview.contentDocument;
      const alto = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
      if (alto > 0) preview.style.height = alto + "px";
    } catch (e) { /* si por algo no se puede leer, se queda con la altura por defecto */ }
  };
  [0, 300, 1200].forEach((ms) => setTimeout(medir, ms));
}

let cargaInforme = 0;
async function cargarDatosInforme() {
  const turno = ++cargaInforme;
  const cliente = el("informe-cliente").value;
  const finca = el("informe-finca").value;
  const fecha = el("informe-fecha").value;
  const porCliente = informePorCliente();
  const seleccion = porCliente ? seleccionDeFincas() : [];
  ocultarDatosInforme();
  if (!cliente || (porCliente ? seleccion.length === 0 : !finca || !fecha)) {
    el("datos-estado").textContent = porCliente && cliente ? "Marca al menos una finca." : "";
    return;
  }

  el("datos-estado").textContent = "Cargando datos...";
  try {
    const datos = porCliente
      ? await Informes.calcularDatosCliente(cliente, seleccion)
      : await Informes.calcularDatos(cliente, finca, fecha);
    if (!porCliente) await precargarRecomendacionesGuardadas(cliente, finca, fecha);
    if (turno !== cargaInforme) return; // se cambió de visita mientras cargaba

    const preview = el("informe-preview");
    preview.onload = ajustarAlturaPreview;
    el("informe-datos").hidden = false; // visible ANTES de cargar el informe, para medirlo bien
    ajustarAltoTexto(el("informe-recomendaciones"));
    preview.srcdoc = Informes.generarHtml(datos, [], "");
    el("datos-estado").textContent = "";
  } catch (e) {
    if (turno === cargaInforme) el("datos-estado").textContent = "No se pudieron cargar los datos: " + e.message;
  }
}

// Si esta finca ya tiene una recomendacion guardada para esta misma fecha exacta de visita, se
// precarga en el formulario (para verla o volver a generar el informe). Si no hay nada guardado,
// se deja un bloque en blanco como de costumbre.
async function precargarRecomendacionesGuardadas(cliente, finca, fecha) {
  const guardadas = await Informes.recomendacionesGuardadas(cliente, finca, fecha);
  const informe = await Informes.informeGuardado(cliente, finca, fecha);
  el("informe-tipo-fumigacion").value = (informe && informe.tipoFumigacion) || "";
  el("informe-volumen-mezcla").value = (informe && informe.volumenMezcla) || "";
  el("informe-recomendaciones").value = (informe && informe.notas) || "";
  ajustarAltoTexto(el("informe-recomendaciones"));
  mostrarCanecas(el("informe-canecas"), el("informe-tipo-fumigacion").value, el("informe-volumen-mezcla").value);
  el("lista-productos-informe").innerHTML = "";
  if (guardadas.length > 0) {
    guardadas.forEach((p) => agregarBloqueProducto("lista-productos-informe", p));
  } else {
    agregarBloqueProducto("lista-productos-informe");
  }
}

// Un producto que no esté en la hoja Productos se agrega al catálogo (igual que los aplicados):
// de esa hoja sale el orden de mezcla con el que se ordenan los productos en la recomendación.
async function agregarProductosNuevosAlCatalogo(productos) {
  const items = await DB.listarItems();
  for (const p of productos) {
    const nombre = (p.nombre || "").trim();
    if (!nombre) continue;
    const yaExiste = catalogoProductos.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())
      || items.some((it) => it.tipo === "producto_nuevo" && it.datos.nombre.toLowerCase() === nombre.toLowerCase());
    if (yaExiste) continue;
    catalogoProductos.push({ nombre, tipo: p.tipo, formulacion: p.formulacion, unidad: p.unidad });
    await DB.guardarCache("catalogoProductos", catalogoProductos);
    await DB.agregarItem("producto_nuevo", { nombre, tipo: p.tipo, formulacion: p.formulacion, unidad: p.unidad });
    actualizarOpcionesCatalogo();
  }
}

// Ajusta la altura de un cuadro de texto a lo que tenga escrito, para no tener que scrollear dentro
// de él (una recomendación de 50 líneas se ve completa).
function ajustarAltoTexto(campo) {
  // Medirlo escondido da la altura de una sola línea (se veía aplastado y no dejaba escribir).
  if (!campo || !campo.offsetParent) return;
  campo.style.height = "auto";
  campo.style.height = Math.max(campo.scrollHeight, 90) + "px";
}

// Orden de mezcla de un producto, segun la columna "Orden" del catalogo (hoja Productos). Los
// productos que no estan en el catalogo (o sin orden definido) quedan al final.
function ordenDeMezcla(nombreProducto) {
  const encontrado = catalogoProductos.find((c) => c.nombre.toLowerCase() === nombreProducto.toLowerCase());
  const orden = encontrado && encontrado.orden;
  return orden != null && !Number.isNaN(orden) ? orden : Infinity;
}

function productosRecomendadosOrdenados() {
  return leerProductosFormulario("lista-productos-informe")
    .slice()
    .sort((a, b) => ordenDeMezcla(a.nombre) - ordenDeMezcla(b.nombre));
}

// Deja los productos recomendados de esta visita (en la cola y, al sincronizar, en el Excel)
// exactamente como quedaron en pantalla. Se guarda la lista completa, no producto por producto:
// al sincronizar se borran todas las filas de esa visita y se escriben estas. Así se corrigen
// también los duplicados, que comparando producto por producto no se detectaban (dos filas iguales
// tienen la misma "clave" que la única que quedó en pantalla).
async function guardarProductosRecomendados(cliente, finca, fecha, productos) {
  const datos = {
    cliente, finca, fecha,
    productos: productos.map((p) => ({
      producto: p.nombre, tipo: p.tipo, formulacion: p.formulacion, unidad: p.unidad, dosis: p.dosis,
    })),
  };
  const items = await DB.listarItems();
  const deLaVisita = (it) => it.datos.cliente === cliente && it.datos.finca === finca && it.datos.fecha === fecha;
  // Los pendientes del formato anterior ya están incluidos en la lista completa.
  for (const it of items) {
    if (it.estado === "pendiente" && deLaVisita(it) &&
      (it.tipo === "producto_recomendado" || it.tipo === "eliminar_producto_recomendado")) {
      await DB.eliminarItem(it.id);
    }
  }
  const pendiente = items.find((it) => it.tipo === "recomendaciones_visita" && it.estado === "pendiente" && deLaVisita(it));
  if (pendiente) await DB.actualizarDatosItem(pendiente.id, datos);
  else await DB.agregarItem("recomendaciones_visita", datos);
}

async function onGenerarInformeCliente() {
  const cliente = el("informe-cliente").value;
  const seleccion = seleccionDeFincas();
  if (!cliente) { marcarCampoInvalido(el("informe-cliente")); return; }
  if (seleccion.length === 0) { el("informe-estado").textContent = "Marca al menos una finca."; return; }

  const hayProductos = [...el("lista-productos-informe").querySelectorAll(".producto-bloque")]
    .some((div) => div.querySelector(".p-nombre").value.trim());
  if (hayProductos) {
    if (!el("informe-tipo-fumigacion").value) { marcarCampoInvalido(el("informe-tipo-fumigacion")); return; }
    if (!el("informe-volumen-mezcla").value.trim()) { marcarCampoInvalido(el("informe-volumen-mezcla")); return; }
  }
  const bloqueSinDosis = [...el("lista-productos-informe").querySelectorAll(".producto-bloque")]
    .find((div) => div.querySelector(".p-nombre").value.trim() && !div.querySelector(".p-dosis-reco").value.trim());
  if (bloqueSinDosis) { marcarCampoInvalido(bloqueSinDosis.querySelector(".p-dosis-reco")); return; }

  el("btn-generar-informe").disabled = true;
  el("informe-estado").textContent = "Generando informe...";
  el("informe-resultado").hidden = true;
  try {
    const tipoFumigacion = el("informe-tipo-fumigacion").value;
    const volumenMezcla = el("informe-volumen-mezcla").value.trim();
    const nota = el("informe-recomendaciones").value.trim();
    const productos = productosRecomendadosOrdenados().map((p) => ({ ...p, tipoFumigacion }));
    await agregarProductosNuevosAlCatalogo(productos);
    await guardarRecomendacionCliente({
      cliente, fechaInforme: fechaLocalHoy(), tipoFumigacion, volumenMezcla, nota,
      productos: productos.map((p) => ({ producto: p.nombre, tipo: p.tipo, formulacion: p.formulacion, unidad: p.unidad, dosis: p.dosis })),
    });

    const datos = await Informes.calcularDatosCliente(cliente, seleccion);
    const html = Informes.generarHtml(datos, productos, nota, { tipo: tipoFumigacion, volumenMezcla });
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    el("btn-ver-informe").onclick = () => window.open(url, "_blank");
    const link = el("link-descargar-informe");
    link.href = url;
    link.download = `informe_${cliente}_${fechaLocalHoy()}.html`.replace(/\s+/g, "_");
    el("informe-estado").textContent = "";
    el("informe-resultado").hidden = false;

    if (navigator.onLine) {
      el("informe-estado").textContent = "Sincronizando la recomendación con tu Excel...";
      await sincronizarProductosRecomendadosPendientes();
      await refrescarResumenCola();
      el("informe-estado").textContent = "";
    }
  } catch (e) {
    el("informe-estado").textContent = "No se pudo generar el informe: " + e.message;
  } finally {
    el("btn-generar-informe").disabled = false;
  }
}

async function onGenerarInforme() {
  if (informePorCliente()) return onGenerarInformeCliente();
  const cliente = el("informe-cliente").value;
  const finca = el("informe-finca").value;
  const fecha = el("informe-fecha").value;
  if (!cliente) { marcarCampoInvalido(el("informe-cliente")); return; }
  if (!finca) { marcarCampoInvalido(el("informe-finca")); return; }
  if (!fecha) { marcarCampoInvalido(el("informe-fecha")); return; }

  const hayProductosRecomendados = [...el("lista-productos-informe").querySelectorAll(".producto-bloque")]
    .some((div) => div.querySelector(".p-nombre").value.trim());
  if (hayProductosRecomendados) {
    if (!el("informe-tipo-fumigacion").value) { marcarCampoInvalido(el("informe-tipo-fumigacion")); return; }
    if (!el("informe-volumen-mezcla").value.trim()) { marcarCampoInvalido(el("informe-volumen-mezcla")); return; }
  }

  const bloqueSinDosis = [...el("lista-productos-informe").querySelectorAll(".producto-bloque")]
    .find((div) => div.querySelector(".p-nombre").value.trim() && !div.querySelector(".p-dosis-reco").value.trim());
  if (bloqueSinDosis) {
    marcarCampoInvalido(bloqueSinDosis.querySelector(".p-dosis-reco"));
    return;
  }

  if (!navigator.onLine) {
    el("informe-estado").textContent = "Sin conexión: el informe se generará con la última copia guardada localmente (puede no incluir cambios recientes de otros dispositivos).";
  }

  el("btn-generar-informe").disabled = true;
  el("informe-estado").textContent = "Generando informe...";
  el("informe-resultado").hidden = true;
  try {
    const tipoFumigacion = el("informe-tipo-fumigacion").value;
    const volumenMezcla = el("informe-volumen-mezcla").value.trim();
    const productos = productosRecomendadosOrdenados().map((p) => ({ ...p, tipoFumigacion }));
    const notas = el("informe-recomendaciones").value.trim();
    await agregarProductosNuevosAlCatalogo(productos);
    await guardarProductosRecomendados(cliente, finca, fecha, productos);
    await registrarInformeGenerado({ cliente, finca, fecha, fechaInforme: fechaLocalHoy(), tipoFumigacion, volumenMezcla, notas });
    const html = await Informes.generar(cliente, finca, fecha, productos, notas, { tipo: tipoFumigacion, volumenMezcla });
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    el("btn-ver-informe").onclick = () => window.open(url, "_blank");
    const link = el("link-descargar-informe");
    link.href = url;
    link.download = `informe_${cliente}_${finca}_${fecha}.html`.replace(/\s+/g, "_");

    el("informe-estado").textContent = "";
    el("informe-resultado").hidden = false;

    if (navigator.onLine) {
      el("informe-estado").textContent = "Sincronizando recomendaciones con tu Excel...";
      await sincronizarProductosRecomendadosPendientes();
      await refrescarResumenCola();
      el("informe-estado").textContent = "";
    }
  } catch (e) {
    el("informe-estado").textContent = "No se pudo generar el informe: " + e.message;
  } finally {
    el("btn-generar-informe").disabled = false;
  }
}

// Deja constancia de que la visita ya tiene informe (es lo que la hace aparecer en el Historial),
// con el tipo de fumigación, volumen y notas escritos. Uno solo por visita: se actualiza si se regenera.
async function registrarInformeGenerado(datos) {
  const pendiente = (await DB.listarItems()).find((it) => it.tipo === "informe_generado" && it.estado === "pendiente" &&
    it.datos.cliente === datos.cliente && it.datos.finca === datos.finca && it.datos.fecha === datos.fecha);
  if (pendiente) await DB.actualizarDatosItem(pendiente.id, datos);
  else await DB.agregarItem("informe_generado", datos);
}

// Sube lo del informe que esté pendiente (se llama justo después de generarlo, para que quede en el
// Excel de una vez si hay conexión, sin esperar a "Sincronizar").
async function sincronizarProductosRecomendadosPendientes() {
  const items = await DB.listarItems();
  const pendientes = items.filter((it) => ["producto_nuevo", "producto_recomendado", "eliminar_producto_recomendado", "recomendaciones_visita", "recomendaciones_cliente", "informe_generado"].includes(it.tipo) &&
    it.estado === "pendiente");
  let subidos = 0;
  for (const it of pendientes) {
    try {
      if (it.tipo === "producto_nuevo") {
        await Graph.agregarProductoCatalogo(it.datos.nombre, it.datos.tipo, it.datos.formulacion, it.datos.unidad);
      } else if (it.tipo !== "producto_recomendado") {
        await subirItem(it);
      } else {
        await Graph.agregarProductoRecomendado([
          it.datos.cliente, it.datos.finca, it.datos.fecha, "",
          it.datos.producto, it.datos.tipo, it.datos.formulacion, it.datos.unidad, it.datos.dosis,
        ]);
      }
      await DB.marcarSincronizado(it.id);
      subidos += 1;
    } catch (e) {
      await DB.marcarError(it.id, e.message);
    }
  }
  // Lo recién subido ya no es "pendiente": hay que releer el Excel para que se siga viendo.
  if (subidos > 0) Informes.invalidarCache();
}

// ---------- Historial de visitas ----------

const TEXTO_TIPO_FUMIGACION = {
  "Aerea (Dron)": "Aérea (Dron)", "Terrestre (Estacionaria)": "Terrestre (Estacionaria)", "Terrestre (Bomba de espalda)": "Terrestre (Bomba de espalda)",
};
const SUFIJO_DOSIS = { "Aerea (Dron)": "/Hectárea", "Terrestre (Estacionaria)": "/Caneca 200L", "Terrestre (Bomba de espalda)": "/Bomba 20L" };

let visitasHistorial = [];

async function abrirHistorial() {
  el("historial-detalle").hidden = true;
  el("historial-filtros").hidden = false;
  const anterior = el("historial-cliente").value;
  el("historial-cliente").innerHTML = `<option value="">Todos los clientes</option>` +
    clientesOrdenados().map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  el("historial-cliente").value = anterior || "";
  mostrarPantalla("pantalla-historial");
  el("historial-estado").textContent = "Cargando visitas...";
  el("historial-lista").innerHTML = "";
  try {
    visitasHistorial = await Informes.visitasHistorial();
    renderListaHistorial();
  } catch (e) {
    el("historial-estado").textContent = "No se pudo cargar el historial: " + e.message;
  }
}

function renderListaHistorial() {
  const desde = el("historial-desde").value;
  const hasta = el("historial-hasta").value;
  const cliente = el("historial-cliente").value;
  const filtradas = visitasHistorial.filter((v) =>
    (!desde || v.fecha >= desde) && (!hasta || v.fecha <= hasta) && (!cliente || v.cliente === cliente));
  el("historial-estado").textContent = filtradas.length
    ? `${filtradas.length} visita(s)`
    : "No hay visitas para ese filtro.";
  el("historial-lista").innerHTML = filtradas.map((v, i) => `<p class="visita-hoy historial-visita" data-i="${visitasHistorial.indexOf(v)}">
    <strong>${Informes.formatoFechaVisible(v.fecha)}</strong> · ${esc(v.cliente)} · ${esc(v.finca)}<br>
    <span class="hint">${v.numeroLotes} lote(s)${borradores[v.clave] ? " · en curso" : ""} · Toca para ver el detalle</span>
    ${faltantesHistorial(v)}</p>`).join("");
  el("historial-lista").querySelectorAll(".historial-visita").forEach((p) => {
    p.addEventListener("click", () => verDetalleHistorial(visitasHistorial[Number(p.dataset.i)]));
  });
}

function faltantesHistorial(v) {
  const faltan = [
    v.faltaAplicados ? "productos aplicados" : "",
    v.faltaRecomendacion ? "recomendación" : "",
    v.faltaProductividad ? "datos de productividad" : "",
  ].filter(Boolean);
  return faltan.length
    ? `<span class="historial-faltantes">Falta: ${faltan.join(", ")}</span>`
    : `<span class="historial-completa">Información completa</span>`;
}

async function verDetalleHistorial(v) {
  el("historial-filtros").hidden = true;
  el("historial-detalle").hidden = false;
  const contenido = el("historial-detalle-contenido");
  contenido.innerHTML = `<p class="hint">Cargando...</p>`;
  window.scrollTo(0, 0);
  try {
    const d = await Informes.detalleVisita(v.cliente, v.finca, v.fecha);
    const num = (x, dec = 1) => (x == null || x === "" || Number.isNaN(Number(x)) ? "-" : Number(x).toFixed(dec));
    const dosis = (p, tipo) => (p.dosis ? ` — ${esc(p.dosis)}${esc(p.unidad || "")}${SUFIJO_DOSIS[tipo] || ""}` : "");
    const listaProductos = (productos, tipo) => productos.length
      ? `<ul>${productos.map((p) => `<li><strong>${esc(p.nombre)}</strong>${p.tipo ? ` (${esc(p.tipo)})` : ""}${dosis(p, tipo)}</li>`).join("")}</ul>`
      : `<p class="historial-dato">Sin productos registrados.</p>`;

    let html = `<h2>${esc(v.cliente)} · ${esc(v.finca)}</h2>
      <p class="historial-dato">Visita del ${Informes.formatoFechaVisible(v.fecha)}${d.informe && d.informe.fechaInforme ? ` · informe generado el ${Informes.formatoFechaVisible(d.informe.fechaInforme)}` : ""}</p>`;

    html += `<h3>Productos aplicados antes de la visita</h3>`;
    html += d.lotes.map((l) => {
      const m = l.manejo || {};
      const datosManejo = [
        m.tipoFumigacion ? `Fumigación: ${TEXTO_TIPO_FUMIGACION[m.tipoFumigacion] || esc(m.tipoFumigacion)}` : "",
        m.litrosMezclaHa ? `Volumen de mezcla: ${esc(m.litrosMezclaHa)} L/ha` : "",
        m.ordenMezclaCorrecto ? `Orden de mezcla correcto: ${esc(m.ordenMezclaCorrecto)}` : "",
        m.phFinalMezcla ? `pH final: ${esc(m.phFinalMezcla)}` : "",
      ].filter(Boolean).join(" · ");
      return `<div class="historial-bloque"><h4>Lote ${esc(l.lote)}${l.potrero ? ` · Potrero ${esc(l.potrero)}` : ""}</h4>
        ${datosManejo ? `<p class="historial-dato">${datosManejo}</p>` : ""}
        ${listaProductos(l.productos, m.tipoFumigacion)}
        ${l.observacion ? `<p class="historial-dato"><em>Observaciones: ${esc(l.observacion)}</em></p>` : ""}</div>`;
    }).join("");

    const tipoReco = d.informe ? d.informe.tipoFumigacion : "";
    html += `<h3>Productos recomendados</h3><div class="historial-bloque">
      ${tipoReco || (d.informe && d.informe.volumenMezcla) ? `<p class="historial-dato">${[
        tipoReco ? `Fumigación: ${TEXTO_TIPO_FUMIGACION[tipoReco] || esc(tipoReco)}` : "",
        d.informe.volumenMezcla ? `Volumen de mezcla: ${esc(d.informe.volumenMezcla)} L/ha` : "",
      ].filter(Boolean).join(" · ")}</p>` : ""}
      ${listaProductos(d.recomendados, tipoReco)}
      ${d.informe && d.informe.notas ? `<p class="historial-dato"><em>${esc(d.informe.notas).replace(/\n/g, "<br>")}</em></p>` : ""}</div>`;

    html += `<h3>Productividad de la finca</h3>`;
    html += d.productividad.length ? d.productividad.map((p) => `<div class="historial-bloque">
        <h4>${p.lote === "" || p.lote == null ? "Finca en general" : `Lote ${esc(p.lote)}`}</h4>
        <p class="historial-dato">Área ${num(p.area, 2)} ha · ${num(p.animales, 0)} animales en ordeño · rotación ${num(p.dias, 0)} días · ${num(p.produccion, 1)} L/vaca·día</p>
        <div class="historial-kpis">
          <div><strong>${num(p.productividadLecheria)}</strong>L leche/ha·día</div>
          <div><strong>${num(p.cargaAnimal, 2)}</strong>animales/ha</div>
          <div><strong>${num(p.areaDiaria)}</strong>m²/vaca·día</div>
        </div></div>`).join("")
      : `<p class="historial-dato">Sin datos de productividad en esta visita.</p>`;

    contenido.innerHTML = html;
  } catch (e) {
    contenido.innerHTML = `<p class="hint">No se pudo cargar el detalle: ${esc(e.message)}</p>`;
  }
}

// ---------- Sincronización ----------

// Columnas de "Base de datos" que en el Excel real son formulas calculadas por la propia hoja
// (Dano Collaria Total, Incidencia Moluscos, Dano Moluscos, Dano Hongos). Las calculamos tambien
// aqui en JS para poder generar los informes antes de sincronizar, pero al subir a Excel se dejan
// en blanco para que sea la formula de la hoja la que las calcule (y no un valor fijo nuestro).
const COLUMNAS_CALCULADAS_EXCEL = ESQUEMA.INDICES_BASE_CALCULADAS;

// Cómo se le dice al usuario qué dato falló al subir (antes solo salía el error de Microsoft).
const NOMBRE_TIPO_ITEM = {
  punto: "punto de muestreo", cliente_finca: "cliente/finca nueva", actualizar_lotes: "número de lotes de la finca",
  producto_nuevo: "producto nuevo del catálogo", producto_aplicado: "producto aplicado",
  eliminar_producto_aplicado: "borrado de un producto aplicado", producto_recomendado: "producto recomendado",
  recomendaciones_visita: "recomendación del informe", eliminar_producto_recomendado: "borrado de un producto recomendado",
  productividad: "productividad", productividad_visita: "productividad", observacion_lote: "observaciones del lote",
  informe_generado: "registro del informe", recomendaciones_cliente: "recomendación del informe por fincas", eliminar_visita: "borrado de la visita", eliminar_lote: "borrado de un lote",
  manejo_puntos: "manejo agronómico (tipo de fumigación, volumen, orden y pH)",
};

// Tablas que la app espera encontrar en el Excel para ciertos datos (si no están, Graph responde
// "ItemNotFound" y conviene decir cuál falta en vez de mostrar el error crudo).
const TABLA_DE_TIPO = {
  observacion_lote: "Observaciones_Lotes", informe_generado: "Informes_Generados",
  recomendaciones_cliente: "Recomendaciones_Cliente",
};

function descripcionItem(it) {
  const d = it.datos || {};
  const nombre = NOMBRE_TIPO_ITEM[it.tipo] || it.tipo;
  const donde = [d.cliente, d.finca, d.fecha].filter(Boolean).join(" · ");
  const lote = d.lote === "" || d.lote == null ? "" : ` (Lote ${d.lote})`;
  return `${nombre}${lote}${donde ? " — " + donde : ""}`;
}

// Qué filas del Excel pertenecen a la misma visita (y lote) que un dato de la cola.
function coincideVisitaExcel(fila, columnas, d, conLote) {
  return fila[columnas.cliente] === d.cliente && fila[columnas.finca] === d.finca &&
    normalizarFecha(fila[columnas.fecha]) === normalizarFecha(d.fecha) &&
    (!conLote || String(fila[columnas.lote]) === String(d.lote));
}

// Datos que deben subirse en orden (ej. borrar un producto y volverlo a agregar). Si uno falla,
// los siguientes del mismo grupo esperan a la próxima sincronización, para no desordenarlos.
function grupoDeOrden(it) {
  const d = it.datos || {};
  if (it.tipo === "producto_aplicado" || it.tipo === "eliminar_producto_aplicado") return `pa|${d.cliente}|${d.finca}|${d.fecha}|${d.lote}`;
  if (it.tipo === "manejo_puntos") return `mp|${d.cliente}|${d.finca}|${d.fecha}|${d.lote}`;
  if (it.tipo === "productividad_visita") return `pf|${d.cliente}|${d.finca}|${d.fecha}`;
  if (it.tipo === "observacion_lote") return `ol|${d.cliente}|${d.finca}|${d.fecha}|${d.lote}`;
  if (it.tipo === "informe_generado") return `ig|${d.cliente}|${d.finca}|${d.fecha}`;
  if (it.tipo === "recomendaciones_cliente") return `rc|${d.cliente}|${d.fechaInforme}`;
  if (["producto_recomendado", "eliminar_producto_recomendado", "recomendaciones_visita"].includes(it.tipo)) return `pr|${d.cliente}|${d.finca}|${d.fecha}`;
  return null;
}

// Tablas donde vive información de una visita, con sus columnas (para borrarla completa).
function tablasDeVisita() {
  return [
    [CONFIG.TABLE_NAME, ESQUEMA.BASE], [CONFIG.TABLA_PRODUCTOS_APLICADOS, ESQUEMA.PRODUCTOS_APLICADOS],
    [CONFIG.TABLA_PRODUCTOS_RECOMENDADOS, ESQUEMA.PRODUCTOS_RECOMENDADOS], [CONFIG.TABLA_PRODUCTIVIDAD, ESQUEMA.PRODUCTIVIDAD],
    [CONFIG.TABLA_OBSERVACIONES_LOTES, ESQUEMA.OBSERVACIONES_LOTES], [CONFIG.TABLA_INFORMES_GENERADOS, ESQUEMA.INFORMES_GENERADOS],
  ];
}

async function subirItem(it) {
  const d = it.datos;
  if (it.tipo === "eliminar_visita") {
    for (const [tabla, columnas] of tablasDeVisita()) {
      try {
        await Graph.eliminarFilasDonde(tabla, (f) => coincideVisitaExcel(f, columnas, d, false));
      } catch (e) {
        // Si una tabla opcional todavía no existe en el Excel, no hay nada que borrar ahí.
        if (!/itemnotfound/i.test(e.message)) throw e;
      }
    }
  } else if (it.tipo === "eliminar_lote") {
    const tablas = [[CONFIG.TABLE_NAME, ESQUEMA.BASE], [CONFIG.TABLA_PRODUCTOS_APLICADOS, ESQUEMA.PRODUCTOS_APLICADOS],
      [CONFIG.TABLA_OBSERVACIONES_LOTES, ESQUEMA.OBSERVACIONES_LOTES]];
    for (const [tabla, columnas] of tablas) {
      try {
        await Graph.eliminarFilasDonde(tabla, (f) => coincideVisitaExcel(f, columnas, d, true));
      } catch (e) {
        if (!/itemnotfound/i.test(e.message)) throw e;
      }
    }
  } else if (it.tipo === "recomendaciones_visita") {
    await Graph.eliminarFilasDonde(CONFIG.TABLA_PRODUCTOS_RECOMENDADOS, (f) => coincideVisitaExcel(f, ESQUEMA.PRODUCTOS_RECOMENDADOS, d, false));
    for (const p of d.productos || []) {
      await Graph.agregarProductoRecomendado([d.cliente, d.finca, d.fecha, "", p.producto, p.tipo, p.formulacion, p.unidad, p.dosis]);
    }
  } else if (it.tipo === "eliminar_producto_recomendado") {
    const C = ESQUEMA.PRODUCTOS_RECOMENDADOS;
    await Graph.eliminarFilasDonde(CONFIG.TABLA_PRODUCTOS_RECOMENDADOS, (f) => coincideVisitaExcel(f, C, d, false) &&
      claveProducto(f[C.producto], f[C.formulacion], f[C.dosis]) === claveProducto(d.producto, d.formulacion, d.dosis));
  } else if (it.tipo === "eliminar_producto_aplicado") {
    const C = ESQUEMA.PRODUCTOS_APLICADOS;
    await Graph.eliminarFilasDonde(CONFIG.TABLA_PRODUCTOS_APLICADOS, (f) => coincideVisitaExcel(f, C, d, true) &&
      claveProducto(f[C.producto], f[C.formulacion], f[C.dosis]) === claveProducto(d.producto, d.formulacion, d.dosis));
  } else if (it.tipo === "productividad_visita") {
    await Graph.eliminarFilasDonde(CONFIG.TABLA_PRODUCTIVIDAD, (f) => coincideVisitaExcel(f, ESQUEMA.PRODUCTIVIDAD, d, false));
    for (const p of d.filas || []) {
      await Graph.agregarProductividad([
        d.cliente, d.finca, d.fecha, p.lote,
        Number(p.area) || null, Number(p.animales) || null, Number(p.dias) || null, Number(p.produccion) || null,
        null, null, null,
      ]);
    }
  } else if (it.tipo === "observacion_lote") {
    await Graph.eliminarFilasDonde(CONFIG.TABLA_OBSERVACIONES_LOTES, (f) => coincideVisitaExcel(f, ESQUEMA.OBSERVACIONES_LOTES, d, true));
    if (d.observaciones) {
      await Graph.agregarFilaEnTabla(CONFIG.TABLA_OBSERVACIONES_LOTES, [d.cliente, d.finca, d.fecha, d.lote, d.potrero || "", d.observaciones]);
    }
  } else if (it.tipo === "recomendaciones_cliente") {
    const C = ESQUEMA.RECOMENDACIONES_CLIENTE;
    await Graph.eliminarFilasDonde(CONFIG.TABLA_RECOMENDACIONES_CLIENTE, (f) => f[C.cliente] === d.cliente &&
      normalizarFecha(f[C.fechaInforme]) === normalizarFecha(d.fechaInforme));
    const productos = (d.productos || []).length ? d.productos : [{}];
    for (const p of productos) {
      await Graph.agregarFilaEnTabla(CONFIG.TABLA_RECOMENDACIONES_CLIENTE, [
        d.cliente, d.fechaInforme, p.producto || "", p.tipo || "", p.formulacion || "", p.unidad || "",
        p.dosis == null ? "" : p.dosis, d.tipoFumigacion || "", d.volumenMezcla || "", d.nota || "",
      ]);
    }
  } else if (it.tipo === "manejo_puntos") {
    const B = ESQUEMA.BASE;
    const c = d.campos || {};
    await Graph.actualizarColumnasDonde(CONFIG.TABLE_NAME,
      (f) => coincideVisitaExcel(f, B, d, true), B.tipoFumigacion,
      [c.tipoFumigacion || "", c.litrosMezclaHa || "", c.ordenMezclaCorrecto || "", c.phFinalMezcla || ""]);
  } else if (it.tipo === "informe_generado") {
    await Graph.eliminarFilasDonde(CONFIG.TABLA_INFORMES_GENERADOS, (f) => coincideVisitaExcel(f, ESQUEMA.INFORMES_GENERADOS, d, false));
    await Graph.agregarFilaEnTabla(CONFIG.TABLA_INFORMES_GENERADOS, [
      d.cliente, d.finca, d.fecha, d.fechaInforme, d.tipoFumigacion || "", d.volumenMezcla || "", d.notas || "",
    ]);
  } else {
    return false;
  }
  return true;
}

let sincronizando = false;
async function sincronizar() {
  if (sincronizando || !navigator.onLine) return;
  sincronizando = true;
  const errores = [];
  let subidos = 0;
  try {
    const items = await DB.listarItems();
    const gruposDetenidos = new Set();
    for (const it of items.filter((i) => i.estado === "pendiente")) {
      const grupo = grupoDeOrden(it);
      const visitaDelItem = it.datos && it.datos.fecha ? `v|${it.datos.cliente}|${it.datos.finca}|${it.datos.fecha}` : null;
      const loteDelItem = visitaDelItem && it.datos.lote != null && it.datos.lote !== "" ? `${visitaDelItem}|${it.datos.lote}` : null;
      if ((grupo && gruposDetenidos.has(grupo)) || (visitaDelItem && gruposDetenidos.has(visitaDelItem)) ||
        (loteDelItem && gruposDetenidos.has(loteDelItem))) continue;
      try {
        if (await subirItem(it)) {
          // ya subido arriba
        } else if (it.tipo === "punto") {
          const filaParaExcel = [...it.datos.fila];
          for (const idx of COLUMNAS_CALCULADAS_EXCEL) filaParaExcel[idx] = null;
          await Graph.agregarFila(filaParaExcel);
        } else if (it.tipo === "cliente_finca") {
          await Graph.agregarClienteFinca(it.datos.cliente, it.datos.finca, it.datos.numeroLotes);
        } else if (it.tipo === "actualizar_lotes") {
          await Graph.actualizarNumeroLotes(it.datos.cliente, it.datos.finca, it.datos.numeroLotes);
        } else if (it.tipo === "producto_nuevo") {
          await Graph.agregarProductoCatalogo(it.datos.nombre, it.datos.tipo, it.datos.formulacion, it.datos.unidad);
        } else if (it.tipo === "producto_aplicado") {
          await Graph.agregarProductoAplicado([
            it.datos.cliente, it.datos.finca, it.datos.fecha, it.datos.lote,
            it.datos.producto, it.datos.tipo, it.datos.formulacion, it.datos.unidad, it.datos.dosis,
          ]);
        } else if (it.tipo === "producto_recomendado") {
          await Graph.agregarProductoRecomendado([
            it.datos.cliente, it.datos.finca, it.datos.fecha, "",
            it.datos.producto, it.datos.tipo, it.datos.formulacion, it.datos.unidad, it.datos.dosis,
          ]);
        } else if (it.tipo === "productividad") {
          await Graph.agregarProductividad([
            it.datos.cliente, it.datos.finca, it.datos.fecha, it.datos.lote,
            Number(it.datos.area) || null, Number(it.datos.animales) || null,
            Number(it.datos.dias) || null, Number(it.datos.produccion) || null,
            null, null, null,
          ]);
        }
        await DB.marcarSincronizado(it.id);
        subidos += 1;
      } catch (e) {
        await DB.marcarError(it.id, e.message);
        const falta = /itemnotfound/i.test(e.message) && TABLA_DE_TIPO[it.tipo];
        errores.push(`${descripcionItem(it)}: ${falta
          ? `falta crear la tabla "${falta}" en tu Excel.`
          : e.message}`);
        if (grupo) gruposDetenidos.add(grupo);
        if (it.tipo === "eliminar_visita") gruposDetenidos.add(visitaDelItem);
        if (it.tipo === "eliminar_lote") gruposDetenidos.add(loteDelItem);
      }
    }
  } finally {
    sincronizando = false;
    Informes.invalidarCache(); // lo recién subido se vuelve a leer del Excel
    refrescarResumenCola();
    if (errores.length > 0) {
      alert(
        (subidos > 0 ? `${subidos} dato(s) subido(s) correctamente.\n\n` : "") +
        "No se pudieron subir " + errores.length + " dato(s) a Excel.\n\n" + errores.slice(0, 3).join("\n\n")
      );
    } else if (subidos > 0) {
      alert(`${subidos} dato(s) subido(s) correctamente a tu Excel.`);
    }
  }
}

function actualizarEstadoConexion() {
  el("estado-conexion").textContent = navigator.onLine ? "En línea" : "Sin conexión (guardando localmente)";
  el("estado-conexion").className = navigator.onLine ? "en-linea" : "sin-conexion";
}

// Registra el service worker y hace que, apenas haya una version nueva instalada, la pagina se
// recargue sola una vez para aplicarla (sin tener que borrar datos del sitio a mano).
// La app pregunta a internet qué versión está publicada (version.json, sin caché) y se compara con
// la suya. Si el celular se quedó con una copia vieja, se actualiza sola una vez y, si aun así no
// cambia, deja el aviso con el botón "Actualizar", que borra las copias guardadas y recarga.
let revisandoVersion = false;
async function revisarVersionPublicada() {
  if (!navigator.onLine || revisandoVersion) return;
  revisandoVersion = true;
  try {
    const resp = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
    const datos = await resp.json();
    const publicada = String(datos.version || "");
    if (!publicada || publicada === APP_VERSION) {
      el("aviso-version").hidden = true;
      return;
    }
    el("aviso-version-texto").textContent = `Hay una versión nueva (v${publicada}). Tienes la v${APP_VERSION}.`;
    el("aviso-version").hidden = false;
    // Un intento automático por sesión; si no funciona, queda el botón.
    if (!sessionStorage.getItem("intentoActualizar")) {
      sessionStorage.setItem("intentoActualizar", "1");
      await actualizarAhora();
    }
  } catch (e) {
    console.warn("No se pudo revisar la versión publicada:", e.message);
  } finally {
    revisandoVersion = false;
  }
}

// Borra las copias guardadas de los archivos y recarga: es lo único que siempre funciona cuando el
// celular se queda pegado en una versión vieja. No toca los datos capturados (esos van en otro lado).
async function actualizarAhora() {
  try {
    if ("serviceWorker" in navigator) {
      const registros = await navigator.serviceWorker.getRegistrations();
      for (const registro of registros) {
        if (registro.waiting) registro.waiting.postMessage("activar-ya");
        await registro.update().catch(() => {});
      }
    }
    if (window.caches) {
      const nombres = await caches.keys();
      await Promise.all(nombres.map((n) => caches.delete(n)));
    }
  } catch (e) {
    console.warn("No se pudieron borrar las copias guardadas:", e.message);
  }
  window.location.reload();
}

function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  let ultimaRevision = 0;
  navigator.serviceWorker.register("sw.js").then((registro) => {
    const revisar = () => {
      if (Date.now() - ultimaRevision < 30000) return; // no más de una revisión cada 30 s
      ultimaRevision = Date.now();
      registro.update().catch(() => {});
      // Si ya hay una versión nueva instalada esperando, que entre de una vez.
      if (registro.waiting) registro.waiting.postMessage("activar-ya");
    };
    revisar();
    // Al volver a la app (cambiar de pestaña, desbloquear el celular) se revisa otra vez: antes solo
    // se miraba al abrirla y la versión nueva podía tardar en entrar.
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { revisar(); revisarVersionPublicada(); } });
    window.addEventListener("online", () => { revisar(); revisarVersionPublicada(); });
    registro.addEventListener("updatefound", () => {
      const nuevo = registro.installing;
      if (nuevo) nuevo.addEventListener("statechange", () => { if (nuevo.state === "installed" && registro.waiting) registro.waiting.postMessage("activar-ya"); });
    });
  }).catch((e) => console.warn("SW no registrado:", e));

  let yaRecargando = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (yaRecargando) return;
    yaRecargando = true;
    window.location.reload();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  el("cliente").addEventListener("change", poblarSelectFinca);
  el("finca").addEventListener("change", onCambioFinca);
  el("btn-iniciar-monitoreo").addEventListener("click", onIniciarMonitoreo);
  el("fecha").addEventListener("change", revisarVisitaSeleccionada);
  el("nuevo-cliente").addEventListener("input", revisarVisitaSeleccionada);
  el("nueva-finca").addEventListener("input", revisarVisitaSeleccionada);

  el("productividad-modo").addEventListener("change", onCambioModoProductividad);
  ["pv-g-area", "pv-g-animales", "pv-g-dias", "pv-g-produccion"].forEach((id) => {
    el(id).addEventListener("input", () => { recalcularProductividadGeneral(); guardarCampoProductividadGeneral(); guardarProductividadVisita(); });
  });

  el("btn-nuevo-lote").addEventListener("click", onAgregarLoteNuevo);
  el("btn-fin-muestreo-lotes").addEventListener("click", onFinMuestreo);
  el("btn-terminar-lote").addEventListener("click", onTerminarLote);
  el("btn-punto-anterior").addEventListener("click", onPuntoAnterior);
  el("btn-finalizar-lote").addEventListener("click", onFinalizarLote);
  el("btn-borrar-visita").addEventListener("click", onBorrarVisita);

  // Cualquier cosa que se escriba durante la visita se guarda al instante en el celular.
  PANTALLAS_FLUJO.forEach((id) => {
    el(id).addEventListener("input", () => guardarBorrador());
    el(id).addEventListener("change", () => guardarBorrador());
  });
  el("manejo-modo").addEventListener("change", onCambioModoManejo);
  document.querySelectorAll(".seccion-titulo").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cuerpo = btn.nextElementSibling;
      cuerpo.hidden = !cuerpo.hidden;
      btn.setAttribute("aria-expanded", String(!cuerpo.hidden));
    });
  });

  el("btn-agregar-producto-informe").addEventListener("click", () => agregarBloqueProducto("lista-productos-informe"));
  el("informe-tipo-fumigacion").addEventListener("change", actualizarEtiquetasDosisRecomendacion);
  const canecasInforme = () => mostrarCanecas(el("informe-canecas"), el("informe-tipo-fumigacion").value, el("informe-volumen-mezcla").value);
  el("informe-tipo-fumigacion").addEventListener("change", canecasInforme);
  el("informe-volumen-mezcla").addEventListener("input", canecasInforme);

  el("form-punto").addEventListener("submit", onGuardarPunto);

  el("btn-sincronizar").addEventListener("click", async () => {
    if (!navigator.onLine) { alert("No tienes conexión ahora mismo. Los datos quedan guardados y podrás sincronizar cuando recuperes señal."); return; }
    el("btn-sincronizar").disabled = true;
    el("btn-sincronizar").textContent = "Sincronizando...";
    try {
      await sincronizar();
      await cargarConfigYClientes();
      poblarSelectCliente(true);
      await renderVisitasEnCurso();
      await refrescarResumenCola();
    } catch (e) {
      alert("Ocurrió un error al sincronizar: " + e.message);
    } finally {
      el("btn-sincronizar").textContent = "Sincronizar";
      await refrescarResumenCola(); // queda apagado si ya no hay nada pendiente
    }
  });

  el("btn-nueva-visita").addEventListener("click", async () => {
    await cargarConfigYClientes();
    await mostrarInicioVisitas();
  });

  el("informe-tipo").addEventListener("change", onCambioTipoInforme);
  el("informe-cliente").addEventListener("change", async () => {
    if (informePorCliente()) {
      await precargarRecomendacionCliente();
      await renderFincasDelCliente();
    } else {
      poblarSelectInformeFinca();
    }
  });
  el("informe-finca").addEventListener("change", poblarSelectInformeFecha);
  el("informe-fecha").addEventListener("change", cargarDatosInforme);
  window.addEventListener("resize", ajustarAlturaPreview);

  // Los cuadros de texto crecen con lo que se escriba, en vez de quedar con scroll adentro.
  document.querySelectorAll("textarea").forEach((campo) => {
    campo.addEventListener("input", () => ajustarAltoTexto(campo));
  });

  ["historial-desde", "historial-hasta", "historial-cliente"].forEach((id) => el(id).addEventListener("change", renderListaHistorial));
  el("btn-historial-volver").addEventListener("click", () => {
    el("historial-detalle").hidden = true;
    el("historial-filtros").hidden = false;
  });
  el("btn-generar-informe").addEventListener("click", onGenerarInforme);

  document.querySelectorAll(".tab-boton").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        document.querySelectorAll(".tab-boton").forEach((b) => b.classList.remove("activa"));
        btn.classList.add("activa");
        if (visita) await salirDeVisita(); // queda guardada en "Visitas en curso"
        if (btn.dataset.tab === "informes") {
          Informes.invalidarCache();
          poblarSelectInformeCliente();
          await onCambioTipoInforme();
          mostrarPantalla("pantalla-informes");
        } else if (btn.dataset.tab === "historial") {
          Informes.invalidarCache();
          await abrirHistorial();
        } else {
          await mostrarInicioVisitas();
        }
      } catch (e) {
        alert("Error al cambiar de pestaña: " + e.message);
      }
    });
  });

  iniciar();
});
