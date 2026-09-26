// Subida al Excel: la cola del celular, cómo se sube cada tipo de dato y la subida automática.

// ---------- Sincronización ----------

// Cómo se le dice al usuario qué dato falló al subir (antes solo salía el error de Microsoft).
const NOMBRE_TIPO_ITEM = {
  punto: "punto de muestreo", cliente_finca: "cliente/finca nueva", actualizar_lotes: "número de lotes de la finca",
  producto_nuevo: "producto nuevo del catálogo", producto_aplicado: "producto aplicado",
  eliminar_producto_aplicado: "borrado de un producto aplicado", producto_recomendado: "producto recomendado",
  recomendaciones_visita: "recomendación del informe", eliminar_producto_recomendado: "borrado de un producto recomendado",
  productividad: "productividad", productividad_visita: "productividad", observacion_lote: "observaciones del lote",
  informe_generado: "registro del informe", visita: "anotación en la lista de visitas", recomendaciones_cliente: "recomendación del informe por fincas", eliminar_visita: "borrado de la visita", eliminar_lote: "borrado de un lote",
  manejo_puntos: "manejo agronómico (tipo de fumigación, volumen, orden y pH)",
};

// Tablas que la app espera encontrar en el Excel para ciertos datos (si no están, Graph responde
// "ItemNotFound" y conviene decir cuál falta en vez de mostrar el error crudo).
const TABLA_DE_TIPO = {
  observacion_lote: "Observaciones_Lotes", informe_generado: "Informes_Generados",
  recomendaciones_cliente: "Recomendaciones_Cliente", visita: "Visitas",
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
  if (it.tipo === "visita") return `vi|${d.cliente}|${d.finca}|${d.fecha}`;
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
    [CONFIG.TABLA_VISITAS, ESQUEMA.VISITAS],
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
    await Graph.actualizarColumnasDonde(CONFIG.TABLE_NAME, (f) => coincideVisitaExcel(f, B, d, true), {
      tipoFumigacion: c.tipoFumigacion || "", litrosMezclaHa: c.litrosMezclaHa || "",
      ordenMezclaCorrecto: c.ordenMezclaCorrecto || "", phFinalMezcla: c.phFinalMezcla || "",
    });
  } else if (it.tipo === "visita") {
    await Graph.eliminarFilasDonde(CONFIG.TABLA_VISITAS, (f) => coincideVisitaExcel(f, ESQUEMA.VISITAS, d, false));
    await Graph.agregarFilaEnTabla(CONFIG.TABLA_VISITAS, [d.cliente, d.finca, d.fecha]);
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

let sesionIniciada = false;
let sincronizando = false;
async function sincronizar(opciones = {}) {
  const silencioso = opciones.silencioso === true;
  if (sincronizando || !navigator.onLine) return;
  sincronizando = true;
  Graph.olvidarTitulos(); // se escribe según cómo esté la tabla ahora, no como estaba al abrir la app
  try { await registrarVisitasDePuntosPendientes(); } catch (e) { console.warn("No se pudo anotar la visita:", e.message); }
  const errores = [];
  let subidos = 0;
  try {
    const items = await DB.listarItems();
    const gruposDetenidos = new Set();
    for (const { id } of items.filter((i) => i.estado === "pendiente")) {
      // Si mientras tanto se empezó a muestrear un lote, se para: el potrero de sus puntos todavía
      // no está puesto (mismo motivo por el que la subida automática no arranca en ese momento).
      if (silencioso && capturandoLote) break;
      // Se vuelve a leer justo antes de subir: la lista es una foto de cuando empezó la subida, y
      // con la subida automática el asesor pudo haber borrado o corregido ese dato mientras tanto.
      // Antes se subían lotes ya borrados y versiones viejas de lo corregido.
      const it = await DB.leerItem(id);
      if (!it || it.estado !== "pendiente") continue;
      const revision = it.revision || 0;
      const grupo = grupoDeOrden(it);
      const visitaDelItem = it.datos && it.datos.fecha ? `v|${it.datos.cliente}|${it.datos.finca}|${it.datos.fecha}` : null;
      const loteDelItem = visitaDelItem && it.datos.lote != null && it.datos.lote !== "" ? `${visitaDelItem}|${it.datos.lote}` : null;
      if ((grupo && gruposDetenidos.has(grupo)) || (visitaDelItem && gruposDetenidos.has(visitaDelItem)) ||
        (loteDelItem && gruposDetenidos.has(loteDelItem))) continue;
      try {
        if (await subirItem(it)) {
          // ya subido arriba
        } else if (it.tipo === "punto") {
          // Los puntos capturados antes del código único reciben uno fijo, sacado de su lugar en la
          // cola, para que todos sus reintentos usen el mismo.
          const idPunto = it.datos.idPunto || `P-cola-${it.id}-${it.creado}`;
          const fila = [...it.datos.fila];
          fila[ESQUEMA.BASE.idPunto] = idPunto;
          // Si ya se intentó subir antes (se cortó o dio error), puede que sí haya llegado: se
          // revisa antes de agregarlo otra vez. El primer intento no necesita revisar nada.
          const intentosPrevios = await DB.anotarIntento(it.id);
          const yaEsta = intentosPrevios > 0 && await Graph.existeValorEnColumna(CONFIG.TABLE_NAME, "idPunto", idPunto);
          // Las columnas con fórmula las deja vacías graph.js al acomodar la fila por títulos.
          if (!yaEsta) await Graph.agregarFila(fila);
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
        await DB.marcarSincronizado(it.id, revision);
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
    if (silencioso) {
      // Subida automática: si algo falla queda pendiente y se reintenta luego, sin interrumpir.
      if (errores.length > 0) console.warn("Quedaron datos pendientes:", errores.join(" | "));
    } else if (errores.length > 0) {
      alert(
        (subidos > 0 ? `${subidos} dato(s) subido(s) correctamente.\n\n` : "") +
        "No se pudieron subir " + errores.length + " dato(s) a Excel.\n\n" + errores.slice(0, 3).join("\n\n")
      );
    } else if (subidos > 0) {
      alert(`${subidos} dato(s) subido(s) correctamente a tu Excel.`);
    }
  }
}


async function refrescarResumenCola() {
  const items = await DB.listarItems();
  const pendientes = items.filter((it) => it.estado === "pendiente").length;
  const boton = el("btn-sincronizar");
  boton.disabled = pendientes === 0;
  boton.classList.toggle("pendiente", pendientes > 0); // naranja si hay algo esperando, gris si no
  el("resumen-cola").textContent = pendientes > 0
    ? `${pendientes} punto(s)/dato(s) pendiente(s) de subir a tu Excel.`
    : "Todo sincronizado con tu Excel.";
  return pendientes;
}

// Sube solo lo que haya pendiente, sin avisos: se usa al recuperar señal, al volver a la app y de
// rato en rato. Así una visita terminada en el potrero llega al Excel apenas haya internet, sin
// tener que acordarse de darle a "Sincronizar".
async function sincronizarEnSegundoPlano() {
  if (!navigator.onLine || sincronizando || !sesionIniciada || capturandoLote) return;
  const pendientes = await refrescarResumenCola();
  if (pendientes === 0) return;
  await sincronizar({ silencioso: true });
  await refrescarResumenCola();
  try { await renderVisitasEnCurso(); } catch (e) { /* la pantalla puede no estar visible */ }
}

// Cada 2 minutos se revisa si quedó algo por subir (por si la señal volvió sin que el celular
// avisara, que en el campo pasa todo el tiempo).
let automaticaArrancada = false;
function arrancarSincronizacionAutomatica() {
  if (automaticaArrancada) return;
  automaticaArrancada = true;
  window.addEventListener("online", sincronizarEnSegundoPlano);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) sincronizarEnSegundoPlano(); });
  setInterval(sincronizarEnSegundoPlano, 120000);
}

