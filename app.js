// Orquestación de la app: login, flujo de visita (datos -> lote -> puntos -> fin), cola y sincronización.

// Version visible en el encabezado. Se sube junto con CACHE_NAME en sw.js en cada cambio, para
// poder verificar de un vistazo que el celular ya esta viendo la version mas reciente.
const APP_VERSION = "36";

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

const CAMPOS_MANEJO = [
  { id: "m-tipo-fumigacion", key: "tipoFumigacion" },
  { id: "m-litros-mezcla", key: "litrosMezclaHa" },
  { id: "m-orden-mezcla", key: "ordenMezclaCorrecto" },
  { id: "m-ph-final", key: "phFinalMezcla" },
];

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
      ${esRecomendacion ? "" : filaDosis}
    </div>
    ${esRecomendacion ? filaDosis : ""}
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

const el = (id) => document.getElementById(id);
const PANTALLAS = ["pantalla-login", "pantalla-visita", "pantalla-lotes", "pantalla-manejo", "pantalla-punto", "pantalla-fin", "pantalla-informes"];

function mostrarPantalla(id) {
  PANTALLAS.forEach((p) => (el(p).hidden = p !== id));
}

// new Date().toISOString() da la fecha en UTC: en Colombia (UTC-5), pasadas las 7pm ya muestra
// la fecha de manana. Esta funcion da la fecha de HOY en la zona horaria local del celular.
function fechaLocalHoy() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

async function iniciar() {
  el("app-version").textContent = "v" + APP_VERSION;
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
  el("fecha").value = fechaLocalHoy();
  await renderResumenHoy();
  el("nav-tabs").hidden = false;
  mostrarPantalla("pantalla-visita");
  if (navigator.onLine) verificarFormatoDelExcel(); // en segundo plano: no debe demorar la entrada
}

// Solo muestra lo que aún NO se ha subido a Excel; al sincronizar, desaparece de aquí.
async function renderResumenHoy() {
  const hoy = fechaLocalHoy();
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
    if (p.datos.fila[ESQUEMA.BASE.potrero] && !v.lotes[p.datos.lote].potrero) v.lotes[p.datos.lote].potrero = p.datos.fila[ESQUEMA.BASE.potrero];
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
  await precargarProductividad();
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
  {
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

  visita = { cliente, finca, fecha: el("fecha").value, numeroLotes };
  mostrarPantalla("pantalla-lotes");
  el("resumen-visita").textContent = `${visita.cliente} · ${visita.finca} · ${visita.fecha}`;
  renderBotonesLotes();
  await precargarProductividad();
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
  if (productividadModo === "lotes") renderProductividadLotes();
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

// "Por lotes": cada lote es un bloque que se despliega/oculta al tocarlo (no un desplegable).
function renderProductividadLotes() {
  let html = "";
  for (let i = 1; i <= visita.numeroLotes; i++) {
    html += `<div class="productividad-lote-bloque">
      <button type="button" class="secundario btn-desplegar-productividad" data-lote="${i}">Lote ${i}</button>
      <div class="productividad-lote-campos" data-lote="${i}" hidden>
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

  const campo = (clase, lote) => el("productividad-lotes-lista").querySelector(`.${clase}[data-lote="${lote}"]`);

  for (let i = 1; i <= visita.numeroLotes; i++) {
    const d = productividadDatos[String(i)];
    if (d) {
      campo("pv-area", i).value = d.area || "";
      campo("pv-animales", i).value = d.animales || "";
      campo("pv-dias", i).value = d.dias || "";
      campo("pv-produccion", i).value = d.produccion || "";
    }
    recalcularProductividadLote(i);
  }

  el("productividad-lotes-lista").querySelectorAll(".btn-desplegar-productividad").forEach((btn) => {
    btn.addEventListener("click", () => {
      const campos = campo("productividad-lote-campos", btn.dataset.lote);
      campos.hidden = !campos.hidden;
    });
  });
  el("productividad-lotes-lista").querySelectorAll(".pv-area, .pv-animales, .pv-dias, .pv-produccion").forEach((input) => {
    input.addEventListener("input", () => {
      recalcularProductividadLote(input.dataset.lote);
      guardarCampoProductividadLote(input.dataset.lote);
    });
  });
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
  productividadModo = el("productividad-modo").value;
  actualizarVistaProductividad();
}

// Si esta misma visita (cliente+finca+fecha exactos) ya tenia productividad guardada, se precarga
// (en vez de empezar en blanco), igual que ya se hace con Recomendaciones.
async function precargarProductividad() {
  const guardadas = await Informes.productividadDeVisita(visita.cliente, visita.finca, visita.fecha);
  productividadDatos = {};
  if (guardadas.length === 0) {
    productividadModo = "";
  } else if (guardadas.some((g) => !g.lote)) {
    productividadModo = "general";
    const g = guardadas.find((x) => !x.lote);
    productividadDatos.general = { area: g.area ?? "", animales: g.animales ?? "", dias: g.dias ?? "", produccion: g.produccion ?? "" };
  } else {
    productividadModo = "lotes";
    guardadas.forEach((g) => {
      productividadDatos[String(g.lote)] = { area: g.area ?? "", animales: g.animales ?? "", dias: g.dias ?? "", produccion: g.produccion ?? "" };
    });
  }
  el("productividad-modo").value = productividadModo;
  actualizarVistaProductividad();
}

// Guarda en la cola (para subir a Productividad_Fincas) lo que se haya consignado en esta visita.
async function guardarProductividad() {
  if (productividadModo === "general") {
    const d = productividadDatos.general;
    if (d && (d.area || d.animales || d.dias || d.produccion)) {
      await DB.agregarItem("productividad", { cliente: visita.cliente, finca: visita.finca, fecha: visita.fecha, lote: "", ...d });
    }
  } else if (productividadModo === "lotes") {
    for (let i = 1; i <= visita.numeroLotes; i++) {
      const d = productividadDatos[String(i)];
      if (d && (d.area || d.animales || d.dias || d.produccion)) {
        await DB.agregarItem("productividad", { cliente: visita.cliente, finca: visita.finca, fecha: visita.fecha, lote: i, ...d });
      }
    }
  }
}

// ---------- Paso 2: elegir lote ----------

// Si este lote de esta misma visita (mismo cliente+finca+fecha) ya tenia manejo/productos
// registrados (por ejemplo si se vuelve a entrar despues de sincronizar, o retomando la visita),
// se precargan esos datos exactos, en vez de arrastrar lo ultimo usado en otra finca u otra visita.
async function onElegirLote(lote) {
  loteActual = lote;
  el("manejo-lote-num").textContent = lote;

  const { manejo, productos } = await Informes.manejoYProductosDeLote(visita.cliente, visita.finca, visita.fecha, lote);

  CAMPOS_MANEJO.forEach((c) => { el(c.id).value = (manejo && manejo[c.key]) || ""; });

  el("lista-productos").innerHTML = "";
  if (productos.length > 0) {
    productos.forEach((p) => agregarBloqueProducto("lista-productos", p));
  } else {
    agregarBloqueProducto("lista-productos");
  }

  mostrarPantalla("pantalla-manejo");
}

async function onIniciarMonitoreoLote() {
  manejoActual = {};
  CAMPOS_MANEJO.forEach((c) => { manejoActual[c.key] = el(c.id).value.trim(); });

  const productos = leerProductosFormulario("lista-productos");

  const itemsPendientes = await DB.listarItems();
  // Si ya se registro este mismo producto para este mismo lote/visita (p.ej. porque se volvio a
  // entrar a la pantalla de manejo y se le dio "Iniciar monitoreo" otra vez), no se vuelve a encolar.
  const yaRegistradoEnLote = (p) => itemsPendientes.some((it) =>
    it.tipo === "producto_aplicado" &&
    it.datos.cliente === visita.cliente && it.datos.finca === visita.finca &&
    it.datos.fecha === visita.fecha && it.datos.lote === loteActual &&
    it.datos.producto.toLowerCase() === p.nombre.toLowerCase() &&
    (it.datos.formulacion || "").toLowerCase() === (p.formulacion || "").toLowerCase() &&
    String(it.datos.dosis) === String(p.dosis)
  );
  for (const p of productos) {
    if (!yaRegistradoEnLote(p)) {
      await DB.agregarItem("producto_aplicado", {
        cliente: visita.cliente, finca: visita.finca, fecha: visita.fecha, lote: loteActual,
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

  capturandoLote = true;
  editandoPuntoId = null;
  await calcularSiguientePunto();
  await precargarPotreroLote();
  el("lote-actual-num").textContent = loteActual;
  el("form-punto").reset();
  el("btn-punto-anterior").disabled = puntoMostrado <= 1;
  mostrarPantalla("pantalla-punto");
  await refrescarResumenCola();
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

async function calcularSiguientePunto() {
  const delMismoLote = await puntosDelLoteActual();
  puntoActual = delMismoLote.length + 1;
  puntoMostrado = puntoActual;
  el("punto-actual-num").textContent = puntoActual;
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

async function guardarPuntoActual() {
  const c = leerCamposComunes();
  const fila = [
    visita.cliente, visita.finca, visita.fecha, loteActual, puntoActual,
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

async function onGuardarPunto(ev) {
  ev.preventDefault();
  if (editandoPuntoId) {
    await actualizarPuntoEditado();
    editandoPuntoId = null;
    puntoMostrado = puntoActual;
  } else {
    await guardarPuntoActual();
    puntoActual += 1;
    puntoMostrado = puntoActual;
  }
  el("form-punto").reset();
  el("punto-actual-num").textContent = puntoMostrado;
  el("btn-punto-anterior").disabled = puntoMostrado <= 1;
  await refrescarResumenCola();
}

// Retrocede un punto a la vez dentro del mismo lote para poder corregirlo. Solo se puede
// editar un punto que aun no se haya sincronizado (uno ya subido no se puede corregir desde aqui).
async function onPuntoAnterior() {
  const objetivo = puntoMostrado - 1;
  if (objetivo < 1) { alert("No hay un punto anterior en este lote."); return; }
  const delLote = await puntosDelLoteActual();
  const item = delLote.find((it) => it.datos.fila[ESQUEMA.BASE.punto] === objetivo);
  if (!item) { alert("No se encontró ese punto."); return; }
  if (item.estado !== "pendiente") {
    alert("Ese punto ya se sincronizó con tu Excel y no se puede corregir desde aquí.");
    return;
  }
  editandoPuntoId = item.id;
  puntoMostrado = objetivo;
  cargarPuntoEnFormulario(item.datos.fila);
  el("punto-actual-num").textContent = puntoMostrado;
  el("btn-punto-anterior").disabled = puntoMostrado <= 1;
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
  if (editandoPuntoId) {
    await actualizarPuntoEditado();
    editandoPuntoId = null;
  } else if (capturandoLote && el("form-punto").checkValidity()) {
    await guardarPuntoActual();
  }
  await aplicarPotreroATodosLosPuntos(potrero);
  capturandoLote = false;
  mostrarPantalla("pantalla-lotes");
  await refrescarResumenCola();
}

async function onFinMuestreo() {
  if (!productividadModo) { marcarCampoInvalido(el("productividad-modo")); return; }
  if (productividadModo === "general") guardarCampoProductividadGeneral(); // guarda lo visible ahora mismo (los de "por lotes" ya se guardan solos al escribir)
  if (!confirm("¿Seguro que quieres terminar la visita?")) return;
  await guardarProductividad();
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
  if (!cliente) { marcarCampoInvalido(el("informe-cliente")); return; }
  if (!finca) { marcarCampoInvalido(el("informe-finca")); return; }
  if (!fecha) { marcarCampoInvalido(el("informe-fecha")); return; }

  el("btn-ver-datos").disabled = true;
  el("datos-estado").textContent = "Cargando datos...";
  ocultarDatosInforme();
  try {
    const datos = await Informes.calcularDatos(cliente, finca, fecha);
    const html = Informes.generarHtml(datos, [], "");
    const preview = el("informe-preview");
    preview.srcdoc = html;
    // Ajusta la altura del iframe al contenido real, para que solo haya un scroll (el de la pagina)
    // en vez de un scroll interno del recuadro que se ve mal en el celular.
    preview.onload = () => {
      try {
        preview.style.height = preview.contentDocument.documentElement.scrollHeight + "px";
      } catch (e) { /* si por algo no se puede leer, se queda con la altura por defecto */ }
    };
    await precargarRecomendacionesGuardadas(cliente, finca, fecha);

    el("datos-estado").textContent = "";
    el("informe-datos").hidden = false;
  } catch (e) {
    el("datos-estado").textContent = "No se pudieron cargar los datos: " + e.message;
  } finally {
    el("btn-ver-datos").disabled = false;
  }
}

// Si esta finca ya tiene una recomendacion guardada para esta misma fecha exacta de visita, se
// precarga en el formulario (para verla o volver a generar el informe). Si no hay nada guardado,
// se deja un bloque en blanco como de costumbre.
async function precargarRecomendacionesGuardadas(cliente, finca, fecha) {
  const guardadas = await Informes.recomendacionesGuardadas(cliente, finca, fecha);
  el("lista-productos-informe").innerHTML = "";
  if (guardadas.length > 0) {
    guardadas.forEach((p) => agregarBloqueProducto("lista-productos-informe", p));
  } else {
    agregarBloqueProducto("lista-productos-informe");
  }
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

// Guarda en la cola (para subir a Productos_Recomendados) los productos recomendados en esta
// visita, sin duplicar si ya estaba exactamente esa misma fila guardada de antes.
async function guardarProductosRecomendados(cliente, finca, fecha, productos) {
  const itemsPendientes = await DB.listarItems();
  const yaGuardado = (p) => itemsPendientes.some((it) =>
    it.tipo === "producto_recomendado" &&
    it.datos.cliente === cliente && it.datos.finca === finca && it.datos.fecha === fecha &&
    it.datos.producto.toLowerCase() === p.nombre.toLowerCase() &&
    (it.datos.formulacion || "").toLowerCase() === (p.formulacion || "").toLowerCase() &&
    String(it.datos.dosis) === String(p.dosis)
  );
  for (const p of productos) {
    if (!yaGuardado(p)) {
      await DB.agregarItem("producto_recomendado", {
        cliente, finca, fecha, producto: p.nombre, tipo: p.tipo, formulacion: p.formulacion, unidad: p.unidad, dosis: p.dosis,
      });
    }
  }
}

async function onGenerarInforme() {
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
    await guardarProductosRecomendados(cliente, finca, fecha, productos);
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

// Sube a Productos_Recomendados lo que este pendiente (se llama justo despues de generar un
// informe, para que quede sincronizado de una vez si hay conexion, sin esperar a "Sincronizar").
async function sincronizarProductosRecomendadosPendientes() {
  const items = await DB.listarItems();
  const pendientes = items.filter((it) => it.tipo === "producto_recomendado" && it.estado === "pendiente");
  for (const it of pendientes) {
    try {
      await Graph.agregarProductoRecomendado([
        it.datos.cliente, it.datos.finca, it.datos.fecha, "",
        it.datos.producto, it.datos.tipo, it.datos.formulacion, it.datos.unidad, it.datos.dosis,
      ]);
      await DB.marcarSincronizado(it.id);
    } catch (e) {
      await DB.marcarError(it.id, e.message);
    }
  }
}

// ---------- Sincronización ----------

// Columnas de "Base de datos" que en el Excel real son formulas calculadas por la propia hoja
// (Dano Collaria Total, Incidencia Moluscos, Dano Moluscos, Dano Hongos). Las calculamos tambien
// aqui en JS para poder generar los informes antes de sincronizar, pero al subir a Excel se dejan
// en blanco para que sea la formula de la hoja la que las calcule (y no un valor fijo nuestro).
const COLUMNAS_CALCULADAS_EXCEL = ESQUEMA.INDICES_BASE_CALCULADAS;

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

// Registra el service worker y hace que, apenas haya una version nueva instalada, la pagina se
// recargue sola una vez para aplicarla (sin tener que borrar datos del sitio a mano).
function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.register("sw.js").then((registro) => {
    registro.update(); // no confiar solo en el cache del navegador para sw.js: revisar ya mismo
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

  el("productividad-modo").addEventListener("change", onCambioModoProductividad);
  ["pv-g-area", "pv-g-animales", "pv-g-dias", "pv-g-produccion"].forEach((id) => {
    el(id).addEventListener("input", () => { recalcularProductividadGeneral(); guardarCampoProductividadGeneral(); });
  });

  el("btn-nuevo-lote").addEventListener("click", onAgregarLoteNuevo);
  el("btn-agregar-producto").addEventListener("click", () => agregarBloqueProducto("lista-productos"));
  el("btn-iniciar-monitoreo-lote").addEventListener("click", onIniciarMonitoreoLote);
  el("btn-fin-muestreo-lotes").addEventListener("click", onFinMuestreo);
  el("btn-terminar-lote").addEventListener("click", onTerminarLote);
  el("btn-punto-anterior").addEventListener("click", onPuntoAnterior);

  el("btn-agregar-producto-informe").addEventListener("click", () => agregarBloqueProducto("lista-productos-informe"));
  el("informe-tipo-fumigacion").addEventListener("change", actualizarEtiquetasDosisRecomendacion);

  el("form-punto").addEventListener("submit", onGuardarPunto);

  el("btn-sincronizar").addEventListener("click", async () => {
    if (!navigator.onLine) { alert("No tienes conexión ahora mismo. Los datos quedan guardados y podrás sincronizar cuando recuperes señal."); return; }
    el("btn-sincronizar").disabled = true;
    el("btn-sincronizar").textContent = "Sincronizando...";
    try {
      await sincronizar();
      await cargarConfigYClientes();
      poblarSelectCliente();
      await renderResumenHoy();
      await refrescarResumenCola();
    } catch (e) {
      alert("Ocurrió un error al sincronizar: " + e.message);
    } finally {
      el("btn-sincronizar").disabled = false;
      el("btn-sincronizar").textContent = "Sincronizar";
    }
  });

  el("btn-nueva-visita").addEventListener("click", async () => {
    await cargarConfigYClientes();
    poblarSelectCliente();
    el("fecha").value = fechaLocalHoy();
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
