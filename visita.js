// Paso 1 de la visita: elegir cliente, finca y fecha; abrir la visita y armar la lista de lotes.

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

