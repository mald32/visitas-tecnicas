// Manejo agronómico de la visita (en general o por lotes) y su paso al Excel.

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

