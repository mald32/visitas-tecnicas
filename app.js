// Orquestación de la app: login, flujo de visita (datos -> lote -> puntos -> fin), cola y sincronización.
let clientesFincas = []; // [{cliente, finca, numeroLotes}]
let parametros = { hojasEvaluadas: 10, severidadMoluscos: 0.1 };

let visita = null; // {cliente, finca, fecha, numeroLotes}
let loteActual = null;
let puntoActual = 1;
let capturandoLote = false; // mientras es true, no se sincroniza (para poder fijar el Potrero antes de subir los puntos)
let manejoActual = {}; // manejo agronomico del lote que se esta capturando ahora mismo
let catalogoProductos = []; // [{nombre, tipo, formulacion, unidad}] cargado de la hoja Productos
let contadorProductos = 0;

const CAMPOS_MANEJO = [
  { id: "m-tipo-fumigacion", key: "tipoFumigacion" },
  { id: "m-litros-mezcla", key: "litrosMezclaHa" },
  { id: "m-orden-mezcla", key: "ordenMezclaCorrecto" },
  { id: "m-ph-final", key: "phFinalMezcla" },
];

// Tipo y formulacion de producto salen del catalogo real (hoja Productos de Excel), no de una lista fija.
let tiposProducto = [];
let formulacionesProducto = [];

function actualizarOpcionesCatalogo() {
  tiposProducto = [...new Set(catalogoProductos.map((p) => p.tipo).filter(Boolean))].sort();
  formulacionesProducto = [...new Set(catalogoProductos.map((p) => p.formulacion).filter(Boolean))].sort();
  el("datalist-productos").innerHTML = catalogoProductos.map((p) => `<option value="${p.nombre}">`).join("");
}

// Agrega un bloque de "producto" (Manejo agronomico o Recomendaciones). valores permite prellenar (cache/edicion).
function agregarBloqueProducto(containerId, valores = {}) {
  contadorProductos += 1;
  const div = document.createElement("div");
  div.className = "producto-bloque";
  div.innerHTML = `
    <div class="fila">
      <label>Tipo
        <select class="p-tipo">
          <option value="">-</option>
          ${tiposProducto.map((t) => `<option value="${t}" ${valores.tipo === t ? "selected" : ""}>${t}</option>`).join("")}
        </select>
      </label>
      <label>Producto <input type="text" class="p-nombre" list="datalist-productos" value="${valores.nombre || ""}"></label>
    </div>
    <div class="fila">
      <label>Formulación
        <select class="p-formulacion">
          <option value="">-</option>
          ${formulacionesProducto.map((f) => `<option value="${f}" ${valores.formulacion === f ? "selected" : ""}>${f}</option>`).join("")}
        </select>
      </label>
      <label>Unidad <input type="text" class="p-unidad" value="${valores.unidad || ""}"></label>
      <label>Dosis <input type="text" class="p-dosis" value="${valores.dosis || ""}"></label>
    </div>
    <button type="button" class="secundario btn-quitar-producto">Quitar producto</button>
  `;
  el(containerId).appendChild(div);

  div.querySelector(".p-nombre").addEventListener("change", (e) => {
    const encontrado = catalogoProductos.find((p) => p.nombre.toLowerCase() === e.target.value.trim().toLowerCase());
    if (encontrado) {
      div.querySelector(".p-tipo").value = encontrado.tipo || "";
      div.querySelector(".p-formulacion").value = encontrado.formulacion || "";
      div.querySelector(".p-unidad").value = encontrado.unidad || "";
    }
  });
  div.querySelector(".btn-quitar-producto").addEventListener("click", () => div.remove());
}

function leerProductosFormulario(containerId) {
  return [...el(containerId).querySelectorAll(".producto-bloque")]
    .map((div) => ({
      tipo: div.querySelector(".p-tipo").value,
      nombre: div.querySelector(".p-nombre").value.trim(),
      formulacion: div.querySelector(".p-formulacion").value,
      unidad: div.querySelector(".p-unidad").value,
      dosis: div.querySelector(".p-dosis").value.trim(),
    }))
    .filter((p) => p.nombre);
}

const el = (id) => document.getElementById(id);
const PANTALLAS = ["pantalla-login", "pantalla-visita", "pantalla-lotes", "pantalla-manejo", "pantalla-punto", "pantalla-fin", "pantalla-informes"];

function mostrarPantalla(id) {
  PANTALLAS.forEach((p) => (el(p).hidden = p !== id));
}

async function iniciar() {
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
  poblarSelectCliente();
  el("fecha").value = new Date().toISOString().slice(0, 10);
  await renderResumenHoy();
  el("nav-tabs").hidden = false;
  mostrarPantalla("pantalla-visita");
}

// Solo muestra lo que aún NO se ha subido a Excel; al sincronizar, desaparece de aquí.
async function renderResumenHoy() {
  const hoy = new Date().toISOString().slice(0, 10);
  const items = await DB.listarItems();
  const puntosHoy = items.filter((it) => it.tipo === "punto" && it.datos.fecha === hoy && it.estado === "pendiente");

  if (puntosHoy.length === 0) {
    el("resumen-hoy").innerHTML = "";
    return;
  }

  const visitas = {};
  for (const p of puntosHoy) {
    const clave = `${p.datos.cliente}|||${p.datos.finca}`;
    if (!visitas[clave]) visitas[clave] = { cliente: p.datos.cliente, finca: p.datos.finca, lotes: {} };
    const v = visitas[clave];
    if (!v.lotes[p.datos.lote]) v.lotes[p.datos.lote] = { cantidad: 0, potrero: null };
    v.lotes[p.datos.lote].cantidad += 1;
    if (p.datos.fila[18] && !v.lotes[p.datos.lote].potrero) v.lotes[p.datos.lote].potrero = p.datos.fila[18];
  }

  let html = "<h2>Visitas de hoy sin sincronizar</h2>";
  let i = 1;
  for (const v of Object.values(visitas)) {
    html += `<p class="visita-hoy" data-cliente="${v.cliente}" data-finca="${v.finca}" data-fecha="${hoy}"><strong>Visita ${i}</strong><br>${v.cliente} · ${v.finca}<br>`;
    html += Object.entries(v.lotes)
      .map(([lote, info]) => {
        const etiqueta = info.potrero ? `Lote ${lote} (Potrero ${info.potrero})` : `Lote ${lote}`;
        return `${etiqueta}: ${info.cantidad} punto(s)`;
      })
      .join("<br>");
    html += "<br><span class=\"hint\">Toca para continuar muestreando</span></p>";
    i++;
  }
  el("resumen-hoy").innerHTML = html;
  el("resumen-hoy").querySelectorAll(".visita-hoy").forEach((elem) => {
    elem.addEventListener("click", () =>
      onRetomarVisita(elem.dataset.cliente, elem.dataset.finca, elem.dataset.fecha)
    );
  });
}

// Reabre una visita de hoy que ya tiene puntos guardados localmente, para seguir muestreando o agregar lotes.
async function onRetomarVisita(cliente, finca, fecha) {
  const f = clientesFincas.find((c) => c.cliente === cliente && c.finca === finca);
  let numeroLotes = f ? f.numeroLotes : 1;

  const items = await DB.listarItems();
  const lotesUsados = items
    .filter((it) => it.tipo === "punto" && it.datos.cliente === cliente && it.datos.finca === finca && it.datos.fecha === fecha)
    .map((it) => it.datos.lote);
  if (lotesUsados.length > 0) numeroLotes = Math.max(numeroLotes, ...lotesUsados);

  visita = { cliente, finca, fecha, numeroLotes };
  el("resumen-visita").textContent = `${visita.cliente} · ${visita.finca} · ${visita.fecha}`;
  mostrarPantalla("pantalla-lotes");
  renderBotonesLotes();
}

async function cargarConfigYClientes() {
  if (navigator.onLine) {
    try {
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
        .map((f) => ({ nombre: f[0], tipo: f[1], formulacion: f[2], unidad: f[5], orden: Number(f[4]) }));
      await DB.guardarCache("catalogoProductos", catalogoProductos);
      actualizarOpcionesCatalogo();
      return;
    } catch (e) {
      console.warn("No se pudo leer de Graph, usando caché local:", e.message);
      alert("No se pudieron cargar los clientes/fincas desde tu Excel.\n\nDetalle: " + e.message);
    }
  }
  parametros = (await DB.leerCache("parametros")) || parametros;
  clientesFincas = (await DB.leerCache("clientesFincas")) || [];
  catalogoProductos = (await DB.leerCache("catalogoProductos")) || [];
  actualizarOpcionesCatalogo();
}

// ---------- Paso 1: Cliente / Finca ----------

const OPCION_NUEVO_CLIENTE = "__nuevo_cliente__";
const OPCION_NUEVA_FINCA = "__nueva_finca__";

function poblarSelectCliente() {
  const clientes = [...new Set(clientesFincas.map((c) => c.cliente))];
  el("cliente").innerHTML =
    clientes.map((c) => `<option value="${c}">${c}</option>`).join("") +
    `<option value="${OPCION_NUEVO_CLIENTE}">+ Cliente nuevo</option>`;
  poblarSelectFinca();
}

function poblarSelectFinca() {
  const cliente = el("cliente").value;
  el("nuevo-cliente-caja").hidden = cliente !== OPCION_NUEVO_CLIENTE;

  const fincas = clientesFincas.filter((c) => c.cliente === cliente);
  el("finca").innerHTML =
    fincas.map((f) => `<option value="${f.finca}">${f.finca}</option>`).join("") +
    `<option value="${OPCION_NUEVA_FINCA}">+ Finca nueva</option>`;
  onCambioFinca();
}

function onCambioFinca() {
  el("nueva-finca-caja").hidden = el("finca").value !== OPCION_NUEVA_FINCA;
}

async function onIniciarMonitoreo() {
  let cliente = el("cliente").value;
  let finca = el("finca").value;
  let numeroLotes;

  if (cliente === OPCION_NUEVO_CLIENTE) {
    cliente = el("nuevo-cliente").value.trim();
    if (!cliente) { alert("Escribe el nombre del cliente nuevo."); return; }
  }

  if (finca === OPCION_NUEVA_FINCA) {
    finca = el("nueva-finca").value.trim();
    numeroLotes = Number(el("nueva-finca-lotes").value);
    if (!finca) { alert("Escribe el nombre de la finca nueva."); return; }
    if (!numeroLotes || numeroLotes < 1) { alert("Indica cuántos lotes tiene la finca."); return; }

    clientesFincas.push({ cliente, finca, numeroLotes });
    await DB.guardarCache("clientesFincas", clientesFincas);
    await DB.agregarItem("cliente_finca", { cliente, finca, numeroLotes });
  } else {
    const f = clientesFincas.find((c) => c.cliente === cliente && c.finca === finca);
    numeroLotes = f.numeroLotes;
  }

  visita = { cliente, finca, fecha: el("fecha").value, numeroLotes };
  mostrarPantalla("pantalla-lotes");
  el("resumen-visita").textContent = `${visita.cliente} · ${visita.finca} · ${visita.fecha}`;
  renderBotonesLotes();
}

function renderBotonesLotes() {
  let html = "";
  for (let i = 1; i <= visita.numeroLotes; i++) {
    html += `<button type="button" class="boton-lote" data-lote="${i}">Lote ${i}</button>`;
  }
  el("botones-lotes").innerHTML = html;
  el("botones-lotes").querySelectorAll(".boton-lote").forEach((btn) => {
    btn.addEventListener("click", () => onElegirLote(Number(btn.dataset.lote)));
  });
}

async function onAgregarLoteNuevo() {
  visita.numeroLotes += 1;
  const f = clientesFincas.find((c) => c.cliente === visita.cliente && c.finca === visita.finca);
  if (f) f.numeroLotes = visita.numeroLotes;
  await DB.guardarCache("clientesFincas", clientesFincas);
  await DB.agregarItem("actualizar_lotes", {
    cliente: visita.cliente, finca: visita.finca, numeroLotes: visita.numeroLotes,
  });
  renderBotonesLotes();
}

// ---------- Paso 2: elegir lote ----------

function onElegirLote(lote) {
  loteActual = lote;
  el("manejo-lote-num").textContent = lote;

  const cache = JSON.parse(localStorage.getItem("manejoAgronomicoUltimo") || "{}");
  CAMPOS_MANEJO.forEach((c) => { el(c.id).value = cache[c.key] || ""; });

  el("lista-productos").innerHTML = "";
  const productosCache = JSON.parse(localStorage.getItem("productosUltimos") || "[]");
  if (productosCache.length > 0) {
    productosCache.forEach((p) => agregarBloqueProducto("lista-productos", p));
  } else {
    agregarBloqueProducto("lista-productos");
  }

  mostrarPantalla("pantalla-manejo");
}

async function onIniciarMonitoreoLote() {
  manejoActual = {};
  CAMPOS_MANEJO.forEach((c) => { manejoActual[c.key] = el(c.id).value.trim(); });
  localStorage.setItem("manejoAgronomicoUltimo", JSON.stringify(manejoActual));

  const productos = leerProductosFormulario("lista-productos");
  localStorage.setItem("productosUltimos", JSON.stringify(productos));

  for (const p of productos) {
    await DB.agregarItem("producto_aplicado", {
      cliente: visita.cliente, finca: visita.finca, fecha: visita.fecha, lote: loteActual,
      producto: p.nombre, tipo: p.tipo, formulacion: p.formulacion, unidad: p.unidad, dosis: p.dosis,
    });
    const yaExiste = catalogoProductos.some((c) => c.nombre.toLowerCase() === p.nombre.toLowerCase());
    if (!yaExiste) {
      catalogoProductos.push({ nombre: p.nombre, tipo: p.tipo, formulacion: p.formulacion, unidad: p.unidad });
      await DB.guardarCache("catalogoProductos", catalogoProductos);
      await DB.agregarItem("producto_nuevo", { nombre: p.nombre, tipo: p.tipo, formulacion: p.formulacion, unidad: p.unidad });
      actualizarOpcionesCatalogo();
    }
  }

  capturandoLote = true;
  await calcularSiguientePunto();
  el("lote-actual-num").textContent = loteActual;
  el("form-punto").reset();
  mostrarPantalla("pantalla-punto");
  await refrescarResumenCola();
}

async function calcularSiguientePunto() {
  const items = await DB.listarItems();
  const delMismoLote = items.filter(
    (it) =>
      it.tipo === "punto" &&
      it.datos.cliente === visita.cliente &&
      it.datos.finca === visita.finca &&
      it.datos.fecha === visita.fecha &&
      it.datos.lote === loteActual
  );
  puntoActual = delMismoLote.length + 1;
  el("punto-actual-num").textContent = puntoActual;
}

// ---------- Paso 3: capturar punto ----------

function pct(idCampo) {
  return Number(el(idCampo).value || 0) / 100;
}

async function guardarPuntoActual() {
  const incidColl = pct("incid-coll");
  const sevColl = pct("sev-coll");
  const incidHongos = pct("incid-hongos");
  const sevHongos = pct("sev-hongos");
  const hojasMoluscos = Number(el("hojas-moluscos").value || 0);

  const danoCollTotal = incidColl * sevColl;
  const incidMoluscos = hojasMoluscos / parametros.hojasEvaluadas;
  const danoMoluscos = incidMoluscos * parametros.severidadMoluscos;
  const danoHongos = incidHongos * sevHongos;

  const fila = [
    visita.cliente, visita.finca, visita.fecha, loteActual, puntoActual,
    Number(el("adultos").value || 0), Number(el("ninfas").value || 0),
    incidColl, sevColl, danoCollTotal,
    Number(el("loritos").value || 0), Number(el("lepidopteros").value || 0),
    hojasMoluscos, incidMoluscos, danoMoluscos,
    incidHongos, sevHongos, danoHongos,
    "", el("observaciones").value || "", // Potrero se completa al terminar el lote
    manejoActual.tipoFumigacion || "", manejoActual.litrosMezclaHa || "",
    manejoActual.ordenMezclaCorrecto || "", manejoActual.phFinalMezcla || "",
  ];

  await DB.agregarItem("punto", {
    cliente: visita.cliente, finca: visita.finca, fecha: visita.fecha, lote: loteActual, fila,
  });
}

async function onGuardarPunto(ev) {
  ev.preventDefault();
  await guardarPuntoActual();
  el("form-punto").reset();
  puntoActual += 1;
  el("punto-actual-num").textContent = puntoActual;
  await refrescarResumenCola();
}

async function aplicarPotreroLote(potrero) {
  if (potrero) {
    const items = await DB.listarItems();
    const delLote = items.filter(
      (it) =>
        it.tipo === "punto" &&
        it.datos.cliente === visita.cliente &&
        it.datos.finca === visita.finca &&
        it.datos.fecha === visita.fecha &&
        it.datos.lote === loteActual
    );
    for (const it of delLote) {
      const fila = [...it.datos.fila];
      fila[18] = potrero;
      await DB.actualizarDatosItem(it.id, { fila });
    }
  }
  capturandoLote = false;
}

async function onTerminarLote() {
  if (capturandoLote && el("form-punto").checkValidity()) {
    await guardarPuntoActual();
    el("form-punto").reset();
  }
  el("potrero-nombre").value = "";
  el("potrero-caja").hidden = false;
}

async function onFinalizarLote() {
  await aplicarPotreroLote(el("potrero-nombre").value.trim());
  el("potrero-caja").hidden = true;
  mostrarPantalla("pantalla-lotes");
  await refrescarResumenCola();
}

async function onFinMuestreo() {
  if (!confirm("¿Seguro que quieres terminar la visita?")) return;
  const items = await DB.listarItems();
  const puntosVisita = items.filter(
    (it) => it.tipo === "punto" && it.datos.cliente === visita.cliente && it.datos.finca === visita.finca && it.datos.fecha === visita.fecha
  );

  const lotesVisitados = [...new Set(puntosVisita.map((p) => p.datos.lote))].sort((a, b) => a - b);
  const lineas = lotesVisitados.map((lote) => {
    const delLote = puntosVisita.filter((p) => p.datos.lote === lote);
    const potrero = delLote.map((p) => p.datos.fila[18]).find((v) => v);
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
  visita = null;
  loteActual = null;
  mostrarPantalla("pantalla-fin");
}

async function refrescarResumenCola() {
  const items = await DB.listarItems();
  const pendientes = items.filter((it) => it.estado === "pendiente").length;
  el("resumen-cola").textContent = pendientes > 0
    ? `${pendientes} punto(s)/dato(s) pendiente(s) de subir a tu Excel.`
    : "Todo sincronizado con tu Excel.";
}

// ---------- Pestaña Informes ----------

function poblarSelectInformeCliente() {
  const clientes = [...new Set(clientesFincas.map((c) => c.cliente))];
  el("informe-cliente").innerHTML = clientes.map((c) => `<option value="${c}">${c}</option>`).join("");
  poblarSelectInformeFinca();
}

function poblarSelectInformeFinca() {
  const cliente = el("informe-cliente").value;
  const fincas = clientesFincas.filter((c) => c.cliente === cliente);
  el("informe-finca").innerHTML = fincas.map((f) => `<option value="${f.finca}">${f.finca}</option>`).join("");
  poblarSelectInformeFecha();
}

async function poblarSelectInformeFecha() {
  const cliente = el("informe-cliente").value;
  const finca = el("informe-finca").value;
  el("informe-fecha").innerHTML = `<option>Cargando fechas...</option>`;
  ocultarDatosInforme();
  try {
    const fechas = await Informes.fechasDisponibles(cliente, finca);
    el("informe-fecha").innerHTML = fechas.length
      ? fechas.map((f) => `<option value="${f}">${Informes.formatoFechaVisible(f)}</option>`).join("")
      : `<option value="">Sin visitas registradas</option>`;
  } catch (e) {
    el("informe-fecha").innerHTML = `<option value="">Error al cargar fechas</option>`;
    el("datos-estado").textContent = "No se pudieron leer las fechas: " + e.message;
  }
}

function ocultarDatosInforme() {
  el("informe-datos").hidden = true;
  el("informe-resultado").hidden = true;
}

async function onVerDatos() {
  const cliente = el("informe-cliente").value;
  const finca = el("informe-finca").value;
  const fecha = el("informe-fecha").value;
  if (!cliente || !finca || !fecha) { alert("Elige cliente, finca y fecha."); return; }

  el("btn-ver-datos").disabled = true;
  el("datos-estado").textContent = "Cargando datos...";
  ocultarDatosInforme();
  try {
    const datos = await Informes.calcularDatos(cliente, finca, fecha);
    const html = Informes.generarHtml(datos, "");
    el("informe-preview").srcdoc = html;
    el("datos-estado").textContent = "";
    el("informe-datos").hidden = false;
  } catch (e) {
    el("datos-estado").textContent = "No se pudieron cargar los datos: " + e.message;
  } finally {
    el("btn-ver-datos").disabled = false;
  }
}

// Orden de mezcla de un producto, segun la columna "Orden" del catalogo (hoja Productos). Los
// productos que no estan en el catalogo (o sin orden definido) quedan al final.
function ordenDeMezcla(nombreProducto) {
  const encontrado = catalogoProductos.find((c) => c.nombre.toLowerCase() === nombreProducto.toLowerCase());
  const orden = encontrado && encontrado.orden;
  return orden != null && !Number.isNaN(orden) ? orden : Infinity;
}

function construirTextoRecomendaciones() {
  const productos = leerProductosFormulario("lista-productos-informe")
    .slice()
    .sort((a, b) => ordenDeMezcla(a.nombre) - ordenDeMezcla(b.nombre));
  const lineasProductos = productos.map((p) => {
    const detalle = [p.tipo, p.formulacion].filter(Boolean).join(" - ");
    const dosis = p.dosis ? `${p.dosis}${p.unidad ? " " + p.unidad : ""}` : "";
    return `- ${p.nombre}${detalle ? " (" + detalle + ")" : ""}${dosis ? ": " + dosis : ""}`;
  });

  const notas = el("informe-recomendaciones").value.trim();
  const partes = [];
  if (lineasProductos.length > 0) partes.push("Productos recomendados:\n" + lineasProductos.join("\n"));
  if (notas) partes.push(notas);
  return partes.join("\n\n");
}

async function onGenerarInforme() {
  const cliente = el("informe-cliente").value;
  const finca = el("informe-finca").value;
  const fecha = el("informe-fecha").value;
  if (!cliente || !finca || !fecha) { alert("Elige cliente, finca y fecha."); return; }
  if (!navigator.onLine) {
    el("informe-estado").textContent = "Sin conexión: el informe se generará con la última copia guardada localmente (puede no incluir cambios recientes de otros dispositivos).";
  }

  el("btn-generar-informe").disabled = true;
  el("informe-estado").textContent = "Generando informe...";
  el("informe-resultado").hidden = true;
  try {
    const recomendaciones = construirTextoRecomendaciones();
    const html = await Informes.generar(cliente, finca, fecha, recomendaciones);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    el("btn-ver-informe").onclick = () => window.open(url, "_blank");
    const link = el("link-descargar-informe");
    link.href = url;
    link.download = `informe_${cliente}_${finca}_${fecha}.html`.replace(/\s+/g, "_");

    el("informe-estado").textContent = "";
    el("informe-resultado").hidden = false;
  } catch (e) {
    el("informe-estado").textContent = "No se pudo generar el informe: " + e.message;
  } finally {
    el("btn-generar-informe").disabled = false;
  }
}

// ---------- Sincronización ----------

let sincronizando = false;
async function sincronizar() {
  if (sincronizando || !navigator.onLine) return;
  sincronizando = true;
  const errores = [];
  let subidos = 0;
  try {
    const items = await DB.listarItems();
    for (const it of items.filter((i) => i.estado === "pendiente")) {
      try {
        if (it.tipo === "punto") {
          await Graph.agregarFila(it.datos.fila);
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
        }
        await DB.marcarSincronizado(it.id);
        subidos += 1;
      } catch (e) {
        await DB.marcarError(it.id, e.message);
        errores.push(e.message);
      }
    }
  } finally {
    sincronizando = false;
    refrescarResumenCola();
    if (errores.length > 0) {
      alert(
        (subidos > 0 ? `${subidos} dato(s) subido(s) correctamente.\n\n` : "") +
        "No se pudieron subir " + errores.length + " dato(s) a Excel.\n\nDetalle: " + errores[0]
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

function registrarServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW no registrado:", e));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  el("cliente").addEventListener("change", poblarSelectFinca);
  el("finca").addEventListener("change", onCambioFinca);
  el("btn-iniciar-monitoreo").addEventListener("click", onIniciarMonitoreo);

  el("btn-nuevo-lote").addEventListener("click", onAgregarLoteNuevo);
  el("btn-agregar-producto").addEventListener("click", () => agregarBloqueProducto("lista-productos"));
  el("btn-iniciar-monitoreo-lote").addEventListener("click", onIniciarMonitoreoLote);
  el("btn-fin-muestreo-lotes").addEventListener("click", onFinMuestreo);
  el("btn-terminar-lote").addEventListener("click", onTerminarLote);
  el("btn-finalizar-lote").addEventListener("click", onFinalizarLote);

  el("btn-agregar-producto-informe").addEventListener("click", () => agregarBloqueProducto("lista-productos-informe"));

  el("form-punto").addEventListener("submit", onGuardarPunto);

  el("btn-sincronizar").addEventListener("click", async () => {
    if (!navigator.onLine) { alert("No tienes conexión ahora mismo. Los datos quedan guardados y podrás sincronizar cuando recuperes señal."); return; }
    el("btn-sincronizar").disabled = true;
    el("btn-sincronizar").textContent = "Sincronizando...";
    await sincronizar();
    await renderResumenHoy();
    await refrescarResumenCola();
    el("btn-sincronizar").disabled = false;
    el("btn-sincronizar").textContent = "Sincronizar";
  });

  el("btn-nueva-visita").addEventListener("click", async () => {
    await cargarConfigYClientes();
    poblarSelectCliente();
    el("fecha").value = new Date().toISOString().slice(0, 10);
    await renderResumenHoy();
    mostrarPantalla("pantalla-visita");
  });

  el("informe-cliente").addEventListener("change", poblarSelectInformeFinca);
  el("informe-finca").addEventListener("change", poblarSelectInformeFecha);
  el("informe-fecha").addEventListener("change", ocultarDatosInforme);
  el("btn-ver-datos").addEventListener("click", onVerDatos);
  el("btn-generar-informe").addEventListener("click", onGenerarInforme);

  document.querySelectorAll(".tab-boton").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        document.querySelectorAll(".tab-boton").forEach((b) => b.classList.remove("activa"));
        btn.classList.add("activa");
        if (btn.dataset.tab === "informes") {
          Informes.invalidarCache();
          poblarSelectInformeCliente();
          if (el("lista-productos-informe").children.length === 0) {
            agregarBloqueProducto("lista-productos-informe");
          }
          mostrarPantalla("pantalla-informes");
        } else {
          mostrarPantalla("pantalla-visita");
        }
      } catch (e) {
        alert("Error al cambiar de pestaña: " + e.message);
      }
    });
  });

  iniciar();
});
