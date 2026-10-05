// Pasos 2 y 3: elegir el lote, organizarlo en potreros y zonas, capturar los puntos de cada zona y
// terminar la visita.

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
    // Al entrar al lote no hay zona elegida: primero se elige (o se añade) el potrero y la zona.
    seleccionDelLote().potrero = null;
    seleccionDelLote().zona = null;
    await prepararCapturaLote();
    el("lote-actual-num").textContent = loteActual;
    mostrarCajaObservacionesLote(false);
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
  if (sinGuardar.estructura) delete sinGuardar.estructura[String(lote)];
  if (sinGuardar.seleccion) delete sinGuardar.seleccion[String(lote)];
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

// ---------- El lote por dentro: potreros → zonas → puntos ----------
// Desde la 2.6 (pedido del asesor, 04/10/2026): al entrar al lote no aparece ningún punto. Primero
// se añade el potrero (nombre y área), luego la zona (nombre, % del potrero y área) y recién ahí se
// toman los puntos, que se numeran por zona (cada zona tiene su punto 1, 2, 3...). Un lote puede
// tener varios potreros y cada potrero varias zonas, cada uno con su botón.
//
// La organización del lote se guarda en el celular aunque todavía no tenga puntos
// (sinGuardar.estructura), porque el Excel solo guarda filas de puntos. Si falta (por ejemplo, un
// lote viejo), se arma con lo que digan los puntos guardados.
//
// En el Excel la columna "Zona" lleva el nombre de la zona, o su número si no se le puso nombre.

const nombreDePotrero = (texto) => String(texto == null ? "" : texto).trim().toLowerCase();
const claveDeZona = (valor) => String(valor == null ? "" : valor).trim().toLowerCase() || "1";
const valorDeZona = (z) => String(z.nombre || "").trim() || z.numero;
const etiquetaDeZona = (z) => String(z.nombre || "").trim() || `Zona ${z.numero}`;
const etiquetaDePotrero = (p) => String(p.nombre || "").trim() || "(sin nombre)";
const redondear = (x, decimales = 1) => Number(Number(x).toFixed(decimales));
const numeroOVacio = (texto) => {
  const n = Number(texto);
  return texto != null && String(texto).trim() !== "" && Number.isFinite(n) ? n : "";
};

function estructuraDelLote() {
  if (!sinGuardar.estructura) sinGuardar.estructura = {};
  const k = String(loteActual);
  if (!sinGuardar.estructura[k]) sinGuardar.estructura[k] = { potreros: [], siguienteId: 1 };
  return sinGuardar.estructura[k];
}

function seleccionDelLote() {
  if (!sinGuardar.seleccion) sinGuardar.seleccion = {};
  const k = String(loteActual);
  if (!sinGuardar.seleccion[k]) sinGuardar.seleccion[k] = { potrero: null, zona: null };
  return sinGuardar.seleccion[k];
}

const nuevoIdEstructura = (e) => `e${e.siguienteId++}`;
const potreroElegido = () => estructuraDelLote().potreros.find((p) => p.id === seleccionDelLote().potrero) || null;
const zonaElegida = () => { const p = potreroElegido(); return p ? p.zonas.find((z) => z.id === seleccionDelLote().zona) || null : null; };

// % de la zona (como fracción) de un punto guardado: el escrito, o área de la zona ÷ área del potrero.
function pctDeZonaDeFila(fila) {
  const B = ESQUEMA.BASE;
  const pct = numeroOVacio(fila[B.pctZona]);
  if (pct !== "") return pct;
  const az = Number(fila[B.areaZona]), ap = Number(fila[B.areaPotrero]);
  return az > 0 && ap > 0 ? az / ap : "";
}

// % de la zona (como fracción) según lo escrito en la zona: el %, o su área ÷ área del potrero.
function pctDeZona(p, z) {
  const pct = numeroOVacio(z.pct);
  if (pct !== "") return pct / 100;
  const az = Number(z.area), ap = Number(p.area);
  return az > 0 && ap > 0 ? az / ap : "";
}

// Completa la organización del lote con los potreros y zonas que aparezcan en los puntos guardados
// (por ejemplo, un lote capturado con la versión anterior o retomado después de terminar la visita).
function completarEstructuraConPuntos(e, filas) {
  const B = ESQUEMA.BASE;
  for (const f of filas) {
    const claveP = nombreDePotrero(f[B.potrero]);
    let p = e.potreros.find((x) => x.enPuntos === claveP);
    if (!p) {
      p = { id: nuevoIdEstructura(e), nombre: String(f[B.potrero] || "").trim(), area: numeroOVacio(f[B.areaPotrero]), zonas: [], enPuntos: claveP };
      e.potreros.push(p);
    }
    const claveZ = claveDeZona(f[B.zona]);
    if (!p.zonas.find((z) => z.enPuntos === claveZ)) {
      const valor = String(f[B.zona] == null || f[B.zona] === "" ? 1 : f[B.zona]).trim();
      const esNumero = /^\d+$/.test(valor);
      const numero = esNumero ? Number(valor) : Math.max(0, ...p.zonas.map((z) => z.numero)) + 1;
      const pct = pctDeZonaDeFila(f);
      p.zonas.push({
        id: nuevoIdEstructura(e), numero, nombre: esNumero ? "" : valor,
        pct: pct === "" ? "" : redondear(pct * 100, 2), area: numeroOVacio(f[B.areaZona]), enPuntos: claveZ,
      });
      p.zonas.sort((a, b) => a.numero - b.numero);
    }
  }
  return e;
}

const filasDeZona = (filas, p, z) => filas.filter((f) =>
  nombreDePotrero(f[ESQUEMA.BASE.potrero]) === p.enPuntos && claveDeZona(f[ESQUEMA.BASE.zona]) === z.enPuntos);
const filasDePotrero = (filas, p) => filas.filter((f) => nombreDePotrero(f[ESQUEMA.BASE.potrero]) === p.enPuntos);

async function prepararCapturaLote() {
  const items = await puntosDelLoteActual();
  completarEstructuraConPuntos(estructuraDelLote(), items.map((it) => it.datos.fila));
  await renderCaptura();
  if (zonaElegida()) { llenarCajaPotrero(); llenarCajaZona(); await calcularSiguientePunto(); }
}

// Dibuja los botones de potreros y zonas y muestra solo lo que corresponde a lo elegido.
async function renderCaptura() {
  const e = estructuraDelLote();
  const p = potreroElegido();
  const z = zonaElegida();
  const items = await puntosDelLoteActual();
  const filas = items.map((it) => it.datos.fila);
  const subidas = items.filter((it) => it.estado !== "pendiente").map((it) => it.datos.fila);

  el("titulo-ubicacion").textContent = z ? ` · ${etiquetaDePotrero(p)} · ${etiquetaDeZona(z)}` : "";
  el("potreros-lote").innerHTML = e.potreros.map((x) =>
    `<button type="button" class="chip${x === p ? " activo" : ""}" aria-pressed="${x === p}" data-potrero="${x.id}">${esc(etiquetaDePotrero(x))}</button>`
  ).join("") + `<button type="button" class="chip chip-anadir" id="btn-anadir-potrero">+ Añadir potrero</button>`;

  el("caja-potrero").hidden = !p;
  if (p) {
    const potreroSubido = filasDePotrero(subidas, p).length > 0;
    el("nombre-potrero").disabled = potreroSubido;
    el("area-potrero").disabled = potreroSubido;
    el("btn-borrar-potrero").hidden = filasDePotrero(filas, p).length > 0;
    renderBotonesZonas();
  }
  el("caja-zona").hidden = !z;
  if (z) {
    const zonaSubida = filasDeZona(subidas, p, z).length > 0;
    ["nombre-zona", "pct-zona", "area-zona"].forEach((id) => { el(id).disabled = zonaSubida; });
    el("btn-borrar-zona").hidden = filasDeZona(filas, p, z).length > 0;
  }
  el("resumen-zonas").textContent = e.potreros.length ? resumenDelLote(e, filas) : "";

  el("potreros-lote").querySelectorAll("[data-potrero]").forEach((b) => b.addEventListener("click", () => seleccionarPotrero(b.dataset.potrero)));
  el("btn-anadir-potrero").addEventListener("click", onAnadirPotrero);
}

// ---------- Reparto del potrero entre sus zonas ----------
// Pedido del asesor (04/10/2026): mientras arma las zonas, ver cuánto % lleva cada una y cuánto le
// falta para el 100 % del potrero. Cada botón de zona dice su %, y debajo va una barra con un tramo
// de color por zona (el mismo color del puntico de su botón), lo que falta en gris rayado, y una
// leyenda: "Falta 20 %", "Potrero completo" o "Te pasaste".
const COLORES_ZONA = ["#2e7d4f", "#4f8fc0", "#d08a2c", "#8a5fb0", "#c0504d", "#3a9e9e", "#9a8a3a", "#6d6d6d"];
const colorDeZona = (p, z) => COLORES_ZONA[p.zonas.indexOf(z) % COLORES_ZONA.length];

// Cuánto lleva cada zona y cuánto falta (en %). estado: "completo", "falta" o "sobra".
function repartoDeZonas(p) {
  const tramos = p.zonas.map((z) => { const pct = pctDeZona(p, z); return { z, pct: pct === "" ? "" : pct * 100 }; });
  const suma = redondear(tramos.reduce((t, x) => t + (x.pct === "" ? 0 : x.pct), 0), 1);
  const sinPct = tramos.filter((x) => x.pct === "").map((x) => x.z);
  const estado = Math.abs(suma - 100) <= 1 ? "completo" : suma < 100 ? "falta" : "sobra";
  return { tramos, suma, falta: redondear(Math.max(0, 100 - suma), 1), sobra: redondear(Math.max(0, suma - 100), 1), sinPct, estado };
}

function renderBotonesZonas() {
  const p = potreroElegido();
  if (!p) return;
  const z = zonaElegida();
  const r = repartoDeZonas(p);
  el("zonas-potrero").innerHTML = r.tramos.map(({ z: x, pct }) =>
    `<button type="button" class="chip${x === z ? " activo" : ""}" aria-pressed="${x === z}" data-zona="${x.id}">` +
    `<span class="punto-color" style="background:${colorDeZona(p, x)}"></span>${esc(etiquetaDeZona(x))} · ${pct === "" ? "sin %" : redondear(pct, 1) + " %"}</button>`
  ).join("") + `<button type="button" class="chip chip-anadir" id="btn-anadir-zona">+ Añadir zona</button>`;

  if (!p.zonas.length) {
    el("reparto-zonas").innerHTML = "";
  } else {
    // Si se pasan del 100 %, la barra se dibuja sobre el total para que se vea cuánto sobra.
    const base = Math.max(100, r.suma);
    const tramos = r.tramos.filter((x) => x.pct !== "" && x.pct > 0).map(({ z: x, pct }) =>
      `<span class="tramo${x === z ? " tramo-activo" : ""}" style="width:${(pct / base) * 100}%;background:${colorDeZona(p, x)}" title="${esc(etiquetaDeZona(x))}: ${redondear(pct, 1)} %"></span>`).join("");
    const hueco = r.falta > 0 ? `<span class="tramo tramo-falta" style="width:${(r.falta / base) * 100}%"></span>` : "";
    const textos = {
      completo: `Potrero completo: 100 %`,
      falta: `Falta ${r.falta} % para completar el potrero (llevas ${r.suma} %)`,
      sobra: `Te pasaste: las zonas suman ${r.suma} % (sobra ${r.sobra} %)`,
    };
    const sinPct = r.sinPct.length ? ` · Sin %: ${r.sinPct.map(etiquetaDeZona).join(", ")}` : "";
    el("reparto-zonas").innerHTML = `<div class="reparto-barra${r.estado === "sobra" ? " reparto-sobra" : ""}">${tramos}${hueco}</div>` +
      `<p class="reparto-leyenda reparto-${r.estado}">${textos[r.estado]}${esc(sinPct)}</p>`;
  }
  el("zonas-potrero").querySelectorAll("[data-zona]").forEach((b) => b.addEventListener("click", () => seleccionarZona(b.dataset.zona)));
  el("btn-anadir-zona").addEventListener("click", onAnadirZona);
}

function llenarCajaPotrero() {
  const p = potreroElegido();
  if (!p) return;
  el("nombre-potrero").value = p.nombre || "";
  el("area-potrero").value = p.area === "" || p.area == null ? "" : p.area;
}

function llenarCajaZona() {
  const z = zonaElegida();
  if (!z) return;
  el("nombre-zona").value = z.nombre || "";
  el("nombre-zona").placeholder = `Zona ${z.numero}`;
  el("pct-zona").value = z.pct === "" || z.pct == null ? "" : z.pct;
  el("area-zona").value = z.area === "" || z.area == null ? "" : z.area;
}

// Antes de cambiar de potrero o de zona se guarda el punto que se estaba escribiendo (si tiene
// algo): así nunca se pierde ni queda anotado en la zona equivocada.
async function cerrarPuntoAbierto() {
  await guardarPuntoEnPantallaSiHayDatos();
  delete sinGuardar.punto[String(loteActual)];
  editandoPuntoId = null;
  el("form-punto").reset();
}

async function seleccionarPotrero(id) {
  await cerrarPuntoAbierto();
  const s = seleccionDelLote();
  s.potrero = s.potrero === id ? null : id; // tocar el potrero abierto lo cierra
  s.zona = null;
  llenarCajaPotrero();
  await renderCaptura();
  await guardarBorrador();
}

async function seleccionarZona(id) {
  await cerrarPuntoAbierto();
  seleccionDelLote().zona = id;
  llenarCajaZona();
  await renderCaptura();
  await calcularSiguientePunto();
  await mostrarPunto(puntoActual);
  el("caja-zona").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function onAnadirPotrero() {
  await cerrarPuntoAbierto();
  const e = estructuraDelLote();
  const p = { id: nuevoIdEstructura(e), nombre: "", area: "", zonas: [], enPuntos: "" };
  e.potreros.push(p);
  seleccionDelLote().potrero = p.id;
  seleccionDelLote().zona = null;
  llenarCajaPotrero();
  await renderCaptura();
  el("nombre-potrero").focus();
  await guardarBorrador();
}

async function onAnadirZona() {
  const p = potreroElegido();
  if (!p) return;
  if (!String(p.nombre || "").trim()) {
    marcarCampoInvalido(el("nombre-potrero"));
    return;
  }
  await cerrarPuntoAbierto();
  const e = estructuraDelLote();
  const numero = Math.max(0, ...p.zonas.map((z) => z.numero)) + 1;
  // La primera zona es todo el potrero mientras no se añadan otras.
  const primera = p.zonas.length === 0;
  const falta = primera ? 100 : repartoDeZonas(p).falta;
  const areaPotrero = Number(p.area);
  const z = {
    id: nuevoIdEstructura(e), numero, nombre: "", pct: falta > 0 ? falta : "",
    area: falta > 0 && areaPotrero > 0 ? redondear(falta / 100 * areaPotrero, 3) : "", enPuntos: String(numero),
  };
  p.zonas.push(z);
  await seleccionarZona(z.id);
  el("nombre-zona").focus();
}

async function onBorrarPotrero() {
  const p = potreroElegido();
  if (!p) return;
  if (filasDePotrero((await puntosDelLoteActual()).map((it) => it.datos.fila), p).length) return;
  if (!confirm(`¿Borrar el potrero ${etiquetaDePotrero(p)}? No tiene puntos.`)) return;
  const e = estructuraDelLote();
  e.potreros = e.potreros.filter((x) => x !== p);
  seleccionDelLote().potrero = null;
  seleccionDelLote().zona = null;
  await renderCaptura();
  await guardarBorrador();
}

async function onBorrarZona() {
  const p = potreroElegido();
  const z = zonaElegida();
  if (!p || !z) return;
  if (filasDeZona((await puntosDelLoteActual()).map((it) => it.datos.fila), p, z).length) return;
  if (!confirm(`¿Borrar la ${etiquetaDeZona(z)} del potrero ${etiquetaDePotrero(p)}? No tiene puntos.`)) return;
  p.zonas = p.zonas.filter((x) => x !== z);
  seleccionDelLote().zona = null;
  await renderCaptura();
  await guardarBorrador();
}

// Mientras se escribe se actualiza la organización del lote (y se guarda en el celular). Si el
// potrero o la zona todavía no tienen puntos, su nombre nuevo pasa a ser el que se usará en ellos.
async function onEscribirPotrero() {
  const p = potreroElegido();
  if (!p) return;
  p.nombre = el("nombre-potrero").value;
  p.area = numeroOVacio(el("area-potrero").value);
  if (!filasDePotrero((await puntosDelLoteActual()).map((it) => it.datos.fila), p).length) p.enPuntos = nombreDePotrero(p.nombre);
  convertirZona("potrero");
  el("titulo-ubicacion").textContent = zonaElegida() ? ` · ${etiquetaDePotrero(p)} · ${etiquetaDeZona(zonaElegida())}` : "";
  renderBotonesZonas(); // el área del potrero cambia el % de las zonas que se dieron por área
}

async function onEscribirZona(origen) {
  const p = potreroElegido();
  const z = zonaElegida();
  if (!p || !z) return;
  convertirZona(origen);
  z.nombre = el("nombre-zona").value;
  z.pct = numeroOVacio(el("pct-zona").value);
  z.area = numeroOVacio(el("area-zona").value);
  if (!filasDeZona((await puntosDelLoteActual()).map((it) => it.datos.fila), p, z).length) z.enPuntos = claveDeZona(valorDeZona(z));
  el("titulo-ubicacion").textContent = ` · ${etiquetaDePotrero(p)} · ${etiquetaDeZona(z)}`;
  renderBotonesZonas();
}

// Área de la zona ↔ % del potrero: se escribe uno y la app calcula el otro (si hay área del potrero).
function convertirZona(origen) {
  const areaPotrero = Number(el("area-potrero").value);
  if (!(areaPotrero > 0) || !zonaElegida()) return;
  const area = el("area-zona").value, pct = el("pct-zona").value;
  if (origen === "pct" || (origen === "potrero" && area === "" && pct !== "")) {
    if (pct !== "") el("area-zona").value = redondear(Number(pct) / 100 * areaPotrero, 3);
  } else if (area !== "") {
    el("pct-zona").value = redondear(Number(area) / areaPotrero * 100, 2);
  }
  const z = zonaElegida();
  z.pct = numeroOVacio(el("pct-zona").value);
  z.area = numeroOVacio(el("area-zona").value);
}

// Al terminar de corregir un nombre, un área o un %, se corrige también en los puntos ya
// guardados (y no subidos) de ese potrero o zona: todos deben decir lo mismo.
async function aplicarEstructuraALosPuntos() {
  if (!capturandoLote || !loteActual) return;
  const B = ESQUEMA.BASE;
  const e = estructuraDelLote();
  const nombreRepetido = e.potreros.some((p, i) => p.nombre.trim() && e.potreros.findIndex((q) => nombreDePotrero(q.nombre) === nombreDePotrero(p.nombre)) !== i);
  const zonaRepetida = e.potreros.some((p) => p.zonas.some((z, i) => p.zonas.findIndex((w) => claveDeZona(valorDeZona(w)) === claveDeZona(valorDeZona(z))) !== i));
  if (nombreRepetido || zonaRepetida) {
    alert(nombreRepetido ? "Ya hay otro potrero con ese nombre en este lote: usa un nombre distinto." : "Ya hay otra zona con ese nombre en este potrero: usa un nombre distinto.");
    return;
  }
  for (const it of await puntosDelLoteActual()) {
    if (it.estado !== "pendiente") continue;
    const p = e.potreros.find((x) => x.enPuntos === nombreDePotrero(it.datos.fila[B.potrero]));
    if (!p) continue;
    const z = p.zonas.find((x) => x.enPuntos === claveDeZona(it.datos.fila[B.zona]));
    const fila = [...it.datos.fila];
    fila[B.potrero] = String(p.nombre || "").trim();
    fila[B.areaPotrero] = numeroOVacio(p.area);
    if (z) {
      fila[B.zona] = valorDeZona(z);
      fila[B.areaZona] = numeroOVacio(z.area);
      const pct = numeroOVacio(z.pct);
      fila[B.pctZona] = pct === "" ? "" : pct / 100;
    }
    if (JSON.stringify(fila) !== JSON.stringify(it.datos.fila)) await DB.actualizarDatosItem(it.id, { fila });
  }
  e.potreros.forEach((p) => { p.enPuntos = nombreDePotrero(p.nombre); p.zonas.forEach((z) => { z.enPuntos = claveDeZona(valorDeZona(z)); }); });
  await renderCaptura();
  await guardarBorrador();
}

// Lo que se guarda en cada punto: el potrero y la zona elegidos arriba.
function ubicacionElegida() {
  const p = potreroElegido();
  const z = zonaElegida();
  const pct = numeroOVacio(z.pct);
  return {
    potrero: String(p.nombre || "").trim(), areaPotrero: numeroOVacio(p.area),
    zona: valorDeZona(z), areaZona: numeroOVacio(z.area), pctZona: pct === "" ? "" : pct / 100,
  };
}

function ponerUbicacionEnFila(fila, u) {
  const B = ESQUEMA.BASE;
  fila[B.potrero] = u.potrero;
  fila[B.areaPotrero] = u.areaPotrero;
  fila[B.zona] = u.zona;
  fila[B.areaZona] = u.areaZona;
  fila[B.pctZona] = u.pctZona;
}

// Texto corto de cómo va el lote, para ver de un vistazo si las zonas suman 100 %.
function resumenDelLote(e, filas) {
  return "En este lote: " + e.potreros.map((p) => {
    const area = Number(p.area) > 0 ? ` (${p.area} ha)` : "";
    if (!p.zonas.length) return `${etiquetaDePotrero(p)}${area}: sin zonas`;
    const zonas = p.zonas.map((z) => {
      const pct = pctDeZona(p, z);
      return `${etiquetaDeZona(z)} · ${pct === "" ? "% sin definir" : redondear(pct * 100) + " %"} · ${filasDeZona(filas, p, z).length} punto(s)`;
    }).join("; ");
    const pcts = p.zonas.map((z) => pctDeZona(p, z));
    const suma = p.zonas.length > 1 && pcts.every((x) => x !== "") ? ` (suma ${redondear(pcts.reduce((t, x) => t + x, 0) * 100)} %)` : "";
    return `${etiquetaDePotrero(p)}${area}: ${zonas}${suma}`;
  }).join("\n");
}

// Lo que hay que corregir antes de cerrar el lote: potreros sin nombre o sin zonas, zonas sin
// puntos, y potreros con varias zonas que no suman 100 % (una zona sola es el 100 %).
function problemasDelLote(e, filas) {
  const problemas = [];
  for (const p of e.potreros) {
    const nombre = etiquetaDePotrero(p);
    if (!String(p.nombre || "").trim()) problemas.push("Hay un potrero sin nombre.");
    if (!p.zonas.length) { problemas.push(`Potrero ${nombre}: no tiene zonas (añade una o bórralo).`); continue; }
    for (const z of p.zonas) {
      if (!filasDeZona(filas, p, z).length) problemas.push(`Potrero ${nombre}: la ${etiquetaDeZona(z)} no tiene puntos (toma puntos o bórrala).`);
    }
    if (p.zonas.length < 2) continue;
    const sinPct = p.zonas.filter((z) => pctDeZona(p, z) === "");
    if (sinPct.length) { problemas.push(`Potrero ${nombre}: falta el % o el área de ${sinPct.map(etiquetaDeZona).join(", ")}.`); continue; }
    const suma = p.zonas.reduce((t, z) => t + pctDeZona(p, z), 0);
    if (Math.abs(suma - 1) > 0.01) problemas.push(`Potrero ${nombre}: las zonas suman ${redondear(suma * 100)} % y deben sumar 100 %.`);
  }
  return problemas;
}

// Potreros del lote actual, para las observaciones del lote y el resumen final.
async function potrerosDelLote() {
  return potrerosDeFilas((await puntosDelLoteActual()).map((it) => it.datos.fila));
}

function potrerosDeFilas(filas) {
  const vistos = new Map();
  for (const f of filas) {
    const nombre = String(f[ESQUEMA.BASE.potrero] || "").trim();
    if (nombre && !vistos.has(nombre.toLowerCase())) vistos.set(nombre.toLowerCase(), nombre);
  }
  return [...vistos.values()];
}

// ---------- Paso 3: capturar los puntos de la zona elegida ----------

async function puntosDeLaZonaActual() {
  const p = potreroElegido();
  const z = zonaElegida();
  if (!p || !z) return [];
  return (await puntosDelLoteActual()).filter((it) =>
    nombreDePotrero(it.datos.fila[ESQUEMA.BASE.potrero]) === p.enPuntos && claveDeZona(it.datos.fila[ESQUEMA.BASE.zona]) === z.enPuntos);
}

// El punto nuevo es el siguiente al más alto ya guardado EN ESTA ZONA (si faltara alguno en el
// medio, no se pisa: se puede navegar hasta él y llenarlo).
async function calcularSiguientePunto() {
  const numeros = (await puntosDeLaZonaActual()).map((it) => Number(it.datos.fila[ESQUEMA.BASE.punto]) || 0);
  puntoActual = numeros.length ? Math.max(...numeros) + 1 : 1;
  puntoMostrado = puntoActual;
  el("punto-actual-num").textContent = puntoActual;
}

// Muestra el punto pedido de la zona: si está guardado, lo carga; si no, deja el formulario en blanco.
let puntoSincronizado = false;
async function mostrarPunto(numero) {
  const deLaZona = await puntosDeLaZonaActual();
  const item = deLaZona.find((it) => Number(it.datos.fila[ESQUEMA.BASE.punto]) === numero);
  puntoMostrado = numero;
  if (numero >= puntoActual) puntoActual = numero;
  editandoPuntoId = item && item.estado === "pendiente" ? item.id : null;
  puntoSincronizado = !!(item && item.estado !== "pendiente");

  el("form-punto").reset();
  if (item) cargarPuntoEnFormulario(item.datos.fila);
  else if (numero === puntoActual) llenarPuntoSinGuardar(); // lo que se estaba escribiendo del punto nuevo

  el("punto-actual-num").textContent = numero;
  el("btn-punto-anterior").disabled = numero <= 1;
  el("btn-punto-siguiente").textContent = numero < puntoActual ? "Punto siguiente" : "Siguiente punto";
  el("aviso-punto").hidden = !puntoSincronizado;
  el("aviso-punto").textContent = puntoSincronizado
    ? "Este punto ya se subió a tu Excel: se puede ver, pero no cambiar desde aquí."
    : "";
  await renderCaptura();
  await guardarBorrador();
}

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
    observaciones: el("observaciones").value || "",
  };
}

const CAMPOS_PROPIOS_DEL_PUNTO = CAMPOS_PUNTO;

// ¿El asesor alcanzó a escribir algo en el punto que está en pantalla? Se usa para no perder el
// último punto al terminar el lote: antes se exigía el formulario completo (checkValidity) y, si
// faltaba un solo campo, el punto se descartaba en silencio. Ahora se guarda lo que haya (los
// campos vacíos valen 0, igual que siempre) y solo se ignora el formulario totalmente en blanco.
function hayDatosEnPunto() {
  return CAMPOS_PROPIOS_DEL_PUNTO.some((id) => String(el(id).value).trim() !== "");
}

// Guarda el punto que está en pantalla si tiene algo escrito y todavía no está en el Excel.
async function guardarPuntoEnPantallaSiHayDatos() {
  if (!capturandoLote || puntoSincronizado || !loteActual || !zonaElegida()) return false;
  if (editandoPuntoId) { await actualizarPuntoEditado(); editandoPuntoId = null; return true; }
  if (!hayDatosEnPunto()) return false;
  await guardarPuntoActual(puntoMostrado);
  if (puntoMostrado >= puntoActual) puntoActual = puntoMostrado + 1;
  // Se limpia el formulario para no volver a guardar el mismo punto si se toca el botón otra vez.
  el("form-punto").reset();
  puntoMostrado = puntoActual;
  delete sinGuardar.punto[String(loteActual)];
  return true;
}

// Código único de cada punto. Con señal débil pasaba que el Excel guardaba el punto pero la
// respuesta no alcanzaba a llegar: la app lo daba por fallido, lo volvía a subir y quedaba repetido
// (inflando los promedios sin que nadie lo notara). Con el código se sabe si ya está allá.
function nuevoIdPunto() {
  const aleatorio = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return "P-" + aleatorio;
}

async function guardarPuntoActual(numero) {
  const c = leerCamposComunes();
  const fila = [
    visita.cliente, visita.finca, visita.fecha, loteActual, numero,
    c.adultos, c.ninfas, c.incidColl, c.sevColl, c.danoCollTotal,
    c.loritos, c.lepidopteros,
    c.hojasMoluscos, c.incidMoluscos, c.danoMoluscos,
    c.incidHongos, c.sevHongos, c.danoHongos,
    "", c.observaciones,
    manejoActual.tipoFumigacion || "", manejoActual.litrosMezclaHa || "",
    manejoActual.ordenMezclaCorrecto || "", manejoActual.phFinalMezcla || "",
  ];
  ponerUbicacionEnFila(fila, ubicacionElegida());

  await DB.agregarItem("punto", {
    cliente: visita.cliente, finca: visita.finca, fecha: visita.fecha, lote: loteActual, fila, idPunto: nuevoIdPunto(),
  });
  // Desde el primer punto, el potrero y la zona quedan "amarrados" al nombre con que se guardaron.
  potreroElegido().enPuntos = nombreDePotrero(fila[ESQUEMA.BASE.potrero]);
  zonaElegida().enPuntos = claveDeZona(fila[ESQUEMA.BASE.zona]);
  await registrarVisitaEnLaLista(visita);
}

// La hoja Visitas del Excel lleva una fila por visita (cliente, finca, fecha) para que el agente
// del asesor pueda decirle a quién hace rato no visita. Se anota con el primer punto (una visita
// sin puntos no fue una visita de campo) y una sola vez: al subir se reemplaza la fila de esa
// visita, así que aunque se repitiera no quedaría duplicada.
async function registrarVisitaEnLaLista(v) {
  const clave = `${v.cliente}|${v.finca}|${v.fecha}`;
  const registradas = (await DB.leerCache("visitasRegistradas")) || [];
  if (registradas.includes(clave)) return;
  await DB.agregarItem("visita", { cliente: v.cliente, finca: v.finca, fecha: v.fecha });
  await DB.guardarCache("visitasRegistradas", [...registradas, clave]);
}

// Puntos que quedaron pendientes de una versión anterior (sin la hoja Visitas): su visita también
// se anota, para que no falte en la lista del agente.
async function registrarVisitasDePuntosPendientes() {
  const pendientes = (await DB.listarItems()).filter((it) => it.tipo === "punto" && it.estado === "pendiente");
  for (const it of pendientes) await registrarVisitaEnLaLista(it.datos);
}

// Actualiza (en vez de crear) el punto que se esta corrigiendo con "Punto anterior". Su potrero y
// su zona no se tocan aquí: se corrigen arriba, para todos los puntos de la zona a la vez.
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
  fila[B.observaciones] = c.observaciones;
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
// al punto siguiente de la zona: del 1 al 2, del 2 al 3... no salta al final de la lista.
async function onGuardarPunto(ev) {
  ev.preventDefault();
  if (!zonaElegida()) return;
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

// Retrocede un punto a la vez dentro de la misma zona para poder corregirlo. Solo se puede
// editar un punto que aun no se haya sincronizado (uno ya subido no se puede corregir desde aqui).
async function onPuntoAnterior() {
  if (puntoMostrado <= 1) return;
  await mostrarPunto(puntoMostrado - 1);
}

async function onTerminarLote() {
  await guardarPuntoEnPantallaSiHayDatos();
  const items = await puntosDelLoteActual();
  if (!items.length) {
    alert("Este lote todavía no tiene puntos. Añade un potrero y una zona y toma los puntos.");
    return;
  }
  // Antes de cerrar el lote se revisa que cada potrero y cada zona estén completos. Los puntos ya
  // quedaron guardados: solo hay que corregir lo que se indica (o terminar igual si es a propósito).
  const problemas = problemasDelLote(estructuraDelLote(), items.map((it) => it.datos.fila));
  if (problemas.length && !confirm("Antes de terminar el lote, revisa:\n\n" + problemas.join("\n") +
    "\n\nLos puntos ya están guardados. ¿Terminar el lote de todas formas?")) {
    if (zonaElegida()) await mostrarPunto(puntoActual); else await renderCaptura();
    return;
  }
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
  const potrero = (await potrerosDelLote()).join(", ");
  const datos = { cliente: visita.cliente, finca: visita.finca, fecha: visita.fecha, lote: loteActual, potrero, observaciones: texto };
  const pendiente = (await DB.listarItems()).find((it) => it.tipo === "observacion_lote" && it.estado === "pendiente" &&
    it.datos.cliente === visita.cliente && it.datos.finca === visita.finca && it.datos.fecha === visita.fecha &&
    String(it.datos.lote) === String(loteActual));
  if (pendiente) {
    await DB.actualizarDatosItem(pendiente.id, datos);
  } else if (texto !== (el("observaciones-lote").dataset.inicial || "").trim()) {
    await DB.agregarItem("observacion_lote", datos);
  }

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
    const potreros = potrerosDeFilas(delLote.map((p) => p.datos.fila));
    const etiqueta = potreros.length ? `Lote ${lote} (${potreros.length > 1 ? "Potreros" : "Potrero"} ${potreros.join(", ")})` : `Lote ${lote}`;
    return `${etiqueta}: ${delLote.length} punto(s) de muestreo`;
  });

  const pendientes = puntosVisita.filter((p) => p.estado === "pendiente");
  let resumen = `${visita.cliente} · ${visita.finca} · ${visita.fecha}\n` + lineas.join("\n");
  if (pendientes.length > 0) {
    resumen += `\n\n${pendientes.length} punto(s) guardado(s) en el celular. Se suben solos apenas haya internet.`;
    const error = pendientes.find((p) => p.ultimoError)?.ultimoError;
    if (error) resumen += `\nÚltimo error al intentar subir: ${error}`;
  } else {
    resumen += "\n\nTodos los puntos ya están sincronizados con tu Excel.";
  }
  el("resumen-final").textContent = resumen;
  await borrarBorrador(); // la visita terminada sale de "Visitas en curso"
  sincronizarEnSegundoPlano(); // si hay señal, la visita terminada se sube sola
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
