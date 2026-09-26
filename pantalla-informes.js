// Pestaña Informes: elegir qué informe generar (por lotes de una finca o por fincas de un cliente),
// las recomendaciones y el registro del informe. El informe en sí lo arman informes.js e informe-html.js.

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

