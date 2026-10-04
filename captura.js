// Pasos 2 y 3: elegir el lote, capturar sus puntos de muestreo y terminar la visita.

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

  el("form-punto").reset(); // el potrero y la zona están fuera del formulario: no se borran
  if (item) {
    cargarPuntoEnFormulario(item.datos.fila);
    mostrarUbicacion(item.datos.fila); // un punto guardado se ve con SU potrero y SU zona
  } else if (numero === puntoActual) {
    await restaurarUbicacion();
    llenarPuntoSinGuardar(); // lo que se estaba escribiendo del punto nuevo
  }
  await actualizarResumenZonas();

  el("punto-actual-num").textContent = numero;
  el("btn-punto-anterior").disabled = numero <= 1;
  el("btn-punto-siguiente").textContent = numero < puntoActual ? "Punto siguiente" : "Siguiente punto";
  el("aviso-punto").hidden = !puntoSincronizado;
  el("aviso-punto").textContent = puntoSincronizado
    ? "Este punto ya se subió a tu Excel: se puede ver, pero no cambiar desde aquí."
    : "";
  await guardarBorrador();
}

// ---------- Dónde se toma el punto: potrero y zona ----------
// Desde el 24/09/2026 el muestreo es: lote de ganado → uno o más potreros → zonas del potrero →
// puntos. Cada punto guarda su potrero (con su área) y su zona (con su área o su % del potrero). Con
// eso el informe y el Excel reparten el peso de cada punto. Un potrero sin zonas es una sola zona
// que ocupa todo el potrero (100 %).

const nombreDePotrero = (texto) => String(texto == null ? "" : texto).trim().toLowerCase();
const redondear = (x, decimales = 1) => Number(Number(x).toFixed(decimales));
const numeroOVacio = (texto) => {
  const n = Number(texto);
  return String(texto).trim() !== "" && Number.isFinite(n) ? n : "";
};

function leerUbicacion() {
  const pct = numeroOVacio(el("pct-zona").value);
  return {
    potrero: el("potrero-nombre-punto").value.trim(),
    areaPotrero: numeroOVacio(el("area-potrero").value),
    zona: Number(el("zona-punto").value) || 1,
    areaZona: numeroOVacio(el("area-zona").value),
    pctZona: pct === "" ? "" : pct / 100,
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

// % de la zona (como fracción) de un punto guardado: el escrito, o área de la zona ÷ área del potrero.
function pctDeZonaDeFila(fila) {
  const B = ESQUEMA.BASE;
  const pct = numeroOVacio(fila[B.pctZona] == null ? "" : fila[B.pctZona]);
  if (pct !== "") return pct;
  const az = Number(fila[B.areaZona]), ap = Number(fila[B.areaPotrero]);
  return az > 0 && ap > 0 ? az / ap : "";
}

function mostrarUbicacion(fila) {
  const B = ESQUEMA.BASE;
  const v = (x) => (x == null ? "" : x);
  el("potrero-nombre-punto").value = v(fila[B.potrero]);
  el("area-potrero").value = v(fila[B.areaPotrero]);
  el("zona-punto").value = fila[B.zona] || 1;
  el("area-zona").value = v(fila[B.areaZona]);
  const pct = numeroOVacio(fila[B.pctZona] == null ? "" : fila[B.pctZona]);
  el("pct-zona").value = pct === "" ? "" : redondear(pct * 100, 2);
}

// Al volver al punto nuevo (o al abrir el lote): lo último escrito en este lote; si no hay, el
// potrero y la zona del último punto guardado; si el lote es nuevo, todo en blanco y zona 1.
async function restaurarUbicacion() {
  const escrita = (sinGuardar.ubicacion || {})[String(loteActual)];
  if (escrita) {
    CAMPOS_UBICACION.forEach((id) => { el(id).value = escrita[id] == null ? "" : escrita[id]; });
    if (!el("zona-punto").value) el("zona-punto").value = 1;
    return;
  }
  const delLote = (await puntosDelLoteActual()).sort((a, b) => Number(b.datos.fila[ESQUEMA.BASE.punto]) - Number(a.datos.fila[ESQUEMA.BASE.punto]));
  if (delLote.length) { mostrarUbicacion(delLote[0].datos.fila); return; }
  CAMPOS_UBICACION.forEach((id) => { el(id).value = ""; });
  el("zona-punto").value = 1;
}

// Área de la zona ↔ % del potrero: se escribe uno y la app calcula el otro (si hay área del potrero).
function convertirZona(origen) {
  const areaPotrero = Number(el("area-potrero").value);
  if (!(areaPotrero > 0)) return;
  const area = el("area-zona").value, pct = el("pct-zona").value;
  if (origen === "pct" || (origen === "potrero" && area === "" && pct !== "")) {
    if (pct !== "") el("area-zona").value = redondear(Number(pct) / 100 * areaPotrero, 3);
  } else if (area !== "") {
    el("pct-zona").value = redondear(Number(area) / areaPotrero * 100, 2);
  }
}

// Al escribir el nombre de un potrero que ya tiene puntos en este lote, se trae su área y su zona 1.
async function alCambiarPotrero() {
  const nombre = nombreDePotrero(el("potrero-nombre-punto").value);
  const previo = (await puntosDelLoteActual()).map((it) => it.datos.fila)
    .find((f) => nombreDePotrero(f[ESQUEMA.BASE.potrero]) === nombre);
  if (!previo) return;
  el("area-potrero").value = previo[ESQUEMA.BASE.areaPotrero] == null ? "" : previo[ESQUEMA.BASE.areaPotrero];
  el("zona-punto").value = 1;
  await alCambiarZona();
}

// Al cambiar de zona se traen su área y su % si ya tiene puntos; si es nueva, quedan en blanco.
async function alCambiarZona() {
  const nombre = nombreDePotrero(el("potrero-nombre-punto").value);
  const zona = Number(el("zona-punto").value) || 1;
  const previo = (await puntosDelLoteActual()).map((it) => it.datos.fila)
    .find((f) => nombreDePotrero(f[ESQUEMA.BASE.potrero]) === nombre && Number(f[ESQUEMA.BASE.zona] || 1) === zona);
  el("area-zona").value = previo && previo[ESQUEMA.BASE.areaZona] != null ? previo[ESQUEMA.BASE.areaZona] : "";
  const pct = previo ? pctDeZonaDeFila(previo) : "";
  el("pct-zona").value = pct === "" ? "" : redondear(pct * 100, 2);
  convertirZona("potrero");
  await actualizarResumenZonas();
  await guardarBorrador();
}

async function onNuevaZona() {
  const nombre = nombreDePotrero(el("potrero-nombre-punto").value);
  const zonas = (await puntosDelLoteActual()).map((it) => it.datos.fila)
    .filter((f) => nombreDePotrero(f[ESQUEMA.BASE.potrero]) === nombre).map((f) => Number(f[ESQUEMA.BASE.zona]) || 1);
  el("zona-punto").value = Math.max(Number(el("zona-punto").value) || 1, ...zonas) + 1;
  el("area-zona").value = "";
  el("pct-zona").value = "";
  el("pct-zona").focus();
  await actualizarResumenZonas();
  await guardarBorrador();
}

async function onOtroPotrero() {
  CAMPOS_UBICACION.forEach((id) => { el(id).value = ""; });
  el("zona-punto").value = 1;
  el("potrero-nombre-punto").focus();
  await actualizarResumenZonas();
  await guardarBorrador();
}

// Si se corrige el área del potrero o el área/% de una zona, se corrige también en los puntos de
// ese potrero (y de esa zona) que ya se guardaron y no han subido: todos deben decir lo mismo.
async function aplicarUbicacionALosPuntos() {
  if (!capturandoLote || puntoSincronizado || !loteActual) return;
  const u = leerUbicacion();
  if (!u.potrero) return;
  const B = ESQUEMA.BASE;
  for (const it of await puntosDelLoteActual()) {
    if (it.estado !== "pendiente" || nombreDePotrero(it.datos.fila[B.potrero]) !== nombreDePotrero(u.potrero)) continue;
    const fila = [...it.datos.fila];
    fila[B.areaPotrero] = u.areaPotrero;
    if (Number(fila[B.zona] || 1) === u.zona) { fila[B.areaZona] = u.areaZona; fila[B.pctZona] = u.pctZona; }
    if (JSON.stringify(fila) !== JSON.stringify(it.datos.fila)) await DB.actualizarDatosItem(it.id, { fila });
  }
  await actualizarResumenZonas();
}

// Potreros y zonas de un grupo de puntos: [{potrero, area, zonas: [{zona, pct, puntos}]}].
function potrerosYZonas(filas) {
  const B = ESQUEMA.BASE;
  const potreros = new Map();
  for (const f of filas) {
    const k = nombreDePotrero(f[B.potrero]);
    if (!potreros.has(k)) potreros.set(k, { potrero: String(f[B.potrero] || "").trim(), area: f[B.areaPotrero], zonas: new Map() });
    const p = potreros.get(k);
    const z = Number(f[B.zona]) || 1;
    if (!p.zonas.has(z)) p.zonas.set(z, { zona: z, pct: pctDeZonaDeFila(f), puntos: 0 });
    p.zonas.get(z).puntos += 1;
  }
  return [...potreros.values()].map((p) => ({ ...p, zonas: [...p.zonas.values()].sort((a, b) => a.zona - b.zona) }));
}

// Texto corto de lo capturado en el lote, para ver de un vistazo si las zonas suman 100 %.
function resumenDeZonas(filas) {
  return potrerosYZonas(filas).map((p) => {
    const nombre = p.potrero || "(sin nombre)";
    const area = Number(p.area) > 0 ? ` (${p.area} ha)` : "";
    if (p.zonas.length === 1 && p.zonas[0].pct === "") return `${nombre}${area}: ${p.zonas[0].puntos} punto(s)`;
    const zonas = p.zonas.map((z) => `zona ${z.zona} · ${z.pct === "" ? "% sin definir" : redondear(z.pct * 100) + " %"} · ${z.puntos} punto(s)`).join("; ");
    const suma = p.zonas.every((z) => z.pct !== "") ? ` (suma ${redondear(p.zonas.reduce((t, z) => t + z.pct, 0) * 100)} %)` : "";
    return `${nombre}${area}: ${zonas}${suma}`;
  }).join("\n");
}

// Lo que impide cerrar el lote: un potrero con varias zonas necesita el % (o el área) de cada una,
// y que sumen 100 %. Un potrero de una sola zona no necesita nada (es el 100 %).
function problemasDeZonas(filas) {
  const problemas = [];
  for (const p of potrerosYZonas(filas)) {
    if (p.zonas.length < 2) continue;
    const nombre = p.potrero || "(sin nombre)";
    const sinPct = p.zonas.filter((z) => z.pct === "").map((z) => z.zona);
    if (sinPct.length) { problemas.push(`Potrero ${nombre}: falta el % o el área de la zona ${sinPct.join(", ")}.`); continue; }
    const suma = p.zonas.reduce((t, z) => t + z.pct, 0);
    if (Math.abs(suma - 1) > 0.01) problemas.push(`Potrero ${nombre}: las zonas suman ${redondear(suma * 100)} % y deben sumar 100 %.`);
  }
  return problemas;
}

async function actualizarResumenZonas() {
  const filas = (await puntosDelLoteActual()).map((it) => it.datos.fila);
  el("resumen-zonas").textContent = filas.length ? "En este lote: " + resumenDeZonas(filas) : "";
}

// Potreros del lote actual, para las observaciones del lote y el resumen final.
async function potrerosDelLote() {
  return potrerosYZonas((await puntosDelLoteActual()).map((it) => it.datos.fila)).map((p) => p.potrero).filter(Boolean);
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
    observaciones: el("observaciones").value || "",
  };
}

// El potrero y la zona no cuentan: vienen puestos de antes, no son datos de este punto.
const CAMPOS_PROPIOS_DEL_PUNTO = CAMPOS_PUNTO.filter((id) => !CAMPOS_UBICACION.includes(id));

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
  // Se limpia el formulario para no volver a guardar el mismo punto si se toca el botón otra vez
  // (el potrero y la zona están fuera del formulario y siguen puestos).
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
  ponerUbicacionEnFila(fila, leerUbicacion());

  await DB.agregarItem("punto", {
    cliente: visita.cliente, finca: visita.finca, fecha: visita.fecha, lote: loteActual, fila, idPunto: nuevoIdPunto(),
  });
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
  fila[B.observaciones] = c.observaciones;
  ponerUbicacionEnFila(fila, leerUbicacion()); // en pantalla está el potrero y la zona de ESTE punto
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

// Los puntos que se guardaron antes de escribir el nombre del potrero reciben el que está escrito
// al terminar el lote. Antes se le ponía a TODOS los puntos del lote, pero ahora un lote puede
// tener varios potreros y eso los habría juntado en uno solo.
async function aplicarPotreroATodosLosPuntos(potrero) {
  const delLote = await puntosDelLoteActual();
  for (const it of delLote) {
    if (it.estado === "pendiente" && !String(it.datos.fila[ESQUEMA.BASE.potrero] || "").trim()) {
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
  // Las zonas de cada potrero deben sumar 100 % antes de cerrar el lote. Los puntos ya quedaron
  // guardados: solo hay que corregir el % o el área de la zona que se indica.
  const problemas = problemasDeZonas((await puntosDelLoteActual()).filter((it) => it.estado === "pendiente").map((it) => it.datos.fila));
  if (problemas.length) {
    await mostrarPunto(puntoActual);
    alert("Antes de terminar el lote, revisa las zonas:\n\n" + problemas.join("\n") +
      "\n\nElige el potrero y la zona arriba y corrige su % o su área. Los puntos ya están guardados.");
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
  const potrero = (await potrerosDelLote()).join(", ") || el("potrero-nombre-punto").value.trim();
  const datos = { cliente: visita.cliente, finca: visita.finca, fecha: visita.fecha, lote: loteActual, potrero, observaciones: texto };
  const pendiente = (await DB.listarItems()).find((it) => it.tipo === "observacion_lote" && it.estado === "pendiente" &&
    it.datos.cliente === visita.cliente && it.datos.finca === visita.finca && it.datos.fecha === visita.fecha &&
    String(it.datos.lote) === String(loteActual));
  if (pendiente) {
    await DB.actualizarDatosItem(pendiente.id, datos);
  } else if (texto !== (el("observaciones-lote").dataset.inicial || "").trim()) {
    await DB.agregarItem("observacion_lote", datos);
  }
  const potreroEscrito = el("potrero-nombre-punto").value.trim();
  if (potreroEscrito) await aplicarPotreroATodosLosPuntos(potreroEscrito);

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
    const potreros = potrerosYZonas(delLote.map((p) => p.datos.fila)).map((p) => p.potrero).filter(Boolean);
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

