// Productividad de la visita (en general o por lotes): área, animales, días y producción.

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

