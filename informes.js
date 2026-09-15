// Genera el informe HTML de una visita (Cliente/Finca/Fecha) leyendo directo de la hoja de Excel.
// Es la versión en el navegador de generar_informe.py + generar_informe_html.py.

// La posicion de cada columna sale de esquema.js (unica fuente de verdad del formato del Excel).
const COL = ESQUEMA.BASE;
const COL_PA = ESQUEMA.PRODUCTOS_APLICADOS;
const COL_PR = ESQUEMA.PRODUCTOS_RECOMENDADOS;
const COL_PF = ESQUEMA.PRODUCTIVIDAD;
const COL_OL = ESQUEMA.OBSERVACIONES_LOTES;
const COL_IG = ESQUEMA.INFORMES_GENERADOS;

// El valor puede ser el indice de columna, o una funcion(fila) para variables calculadas (ej. Pasto Sano).
const VARIABLES_HISTORIAL = {
  "Individuos Adultos de Collaria": COL.adultos,
  "Ninfas de Collaria": COL.ninfas,
  "Incidencia daño Collaria (%)": COL.incidColl,
  "Severidad daño Collaria (%)": COL.sevColl,
  "Individuos de Lorito": COL.loritos,
  "Número de Lepidópteros": COL.lepidopteros,
  "Hojas atacadas por Moluscos": COL.hojasMoluscos,
  "Incidencia mancha fúngica (%)": COL.incidHongos,
  "Severidad mancha fúngica (%)": COL.sevHongos,
  "Daño Collaria (%)": COL.danoCollTotal,
  "Daño Hongos (%)": COL.danoHongos,
  "Daño Moluscos (%)": COL.danoMoluscos,
  "Pasto Sano (%)": (fila) => 1 - (fila[COL.danoCollTotal] || 0) - (fila[COL.danoMoluscos] || 0) - (fila[COL.danoHongos] || 0),
};

// Nombre del umbral en Configuracion para cada variable del historial (null = no tiene umbral comparable).
// Estos textos deben coincidir letra por letra con la columna A de la hoja Configuracion del Excel.
const UMBRAL_POR_VARIABLE_HISTORIAL = {
  "Individuos Adultos de Collaria": "Umbral de Adultos de Collaria",
  "Ninfas de Collaria": "Umbral de Ninfas de Collaria",
  "Incidencia daño Collaria (%)": "Umbral de Incidencia de ataques de Collaria",
  "Severidad daño Collaria (%)": "Umbral de Severidad promedio del Dano por Collaria",
  "Individuos de Lorito": "Umbral de Individuos de Lorito",
  "Número de Lepidópteros": "Umbral de Numero de Lepidopteros",
  "Hojas atacadas por Moluscos": null,
  "Incidencia mancha fúngica (%)": "Umbral de Incidencia de Manchas del Kikuyo",
  "Severidad mancha fúngica (%)": "Umbral de Severidad Promedio del Ataque de Hongos",
  "Daño Collaria (%)": "Umbral de Dano Total de la Pastura por Collaria",
  "Daño Hongos (%)": "Umbral de Dano a la pastura por Hongos",
  "Daño Moluscos (%)": "Umbral de Dano por Moluscos",
  "Pasto Sano (%)": "Umbral (Min) de Pasto Sano",
};

// Umbral y etiqueta de cada indicador de la tabla de resultados (para el semaforo y las alertas).
const DEFINICIONES_UMBRAL = [
  { campo: "incid_coll", nombre: "Incidencia de daño Collaria", umbral: "Umbral de Incidencia de ataques de Collaria", pct: true },
  { campo: "sev_coll", nombre: "Severidad de daño Collaria", umbral: "Umbral de Severidad promedio del Dano por Collaria", pct: true },
  { campo: "incid_hongos", nombre: "Incidencia de manchas fúngicas", umbral: "Umbral de Incidencia de Manchas del Kikuyo", pct: true },
  { campo: "sev_hongos", nombre: "Severidad de manchas fúngicas", umbral: "Umbral de Severidad Promedio del Ataque de Hongos", pct: true },
  { campo: "adultos", nombre: "Individuos adultos de Collaria", umbral: "Umbral de Adultos de Collaria", pct: false },
  { campo: "ninfas", nombre: "Ninfas de Collaria", umbral: "Umbral de Ninfas de Collaria", pct: false },
  { campo: "loritos", nombre: "Individuos de Lorito", umbral: "Umbral de Individuos de Lorito", pct: false },
  { campo: "lepidopteros", nombre: "Número de Lepidópteros", umbral: "Umbral de Numero de Lepidopteros", pct: false },
  { campo: "dano_mol", nombre: "Daño por Moluscos", umbral: "Umbral de Dano por Moluscos", pct: true },
  { campo: "dano_coll", nombre: "Daño total por Collaria", umbral: "Umbral de Dano Total de la Pastura por Collaria", pct: true },
  { campo: "dano_hongos", nombre: "Daño por Hongos", umbral: "Umbral de Dano a la pastura por Hongos", pct: true },
  { campo: "pasto_sano", nombre: "Pasto sano", umbral: "Umbral (Min) de Pasto Sano", pct: true, esMinimo: true },
];

const COLORES_LOTE = ["#123a63", "#2f8fd1", "#f2c14e", "#e2861f", "#3fa845", "#8e5fb0"];
// Orden: Daño Collaria, Daño Moluscos, Daño Hongos, Pasto Sano
const COLORES_TORTA = ["#e2861f", "#123a63", "#8e5fb0", "#3fa845"];
const LOGO_DATA_URI = "data:image/png;base64,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";

const ETIQUETAS_TORTA = ["Daño Collaria", "Daño Moluscos", "Daño Hongos", "Pasto Sano"];

// Iconos en SVG en vez de emoji: los emoji se dibujan distinto en cada celular/PC (y en algunos
// salen a color chillón), estos se ven igual en todas partes y toman el color del informe.
const ICONO_CALENDARIO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
const ICONO_LOTES = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/></svg>';

function promedio(valores) {
  const usables = valores.filter((v) => v !== null && v !== undefined);
  if (usables.length === 0) return null;
  return usables.reduce((a, b) => a + b, 0) / usables.length;
}

function desviacion(valores) {
  const usables = valores.filter((v) => v !== null && v !== undefined);
  if (usables.length < 2) return 0;
  const m = promedio(usables);
  const varianza = usables.reduce((a, b) => a + (b - m) ** 2, 0) / (usables.length - 1);
  return Math.sqrt(varianza);
}

function fmt(v, pct) {
  return v === null || v === undefined ? "-" : pct ? `${(v * 100).toFixed(1)}%` : v.toFixed(1);
}

// Escapa texto antes de meterlo en el HTML del informe. Nombres de cliente/finca/potrero,
// observaciones y productos los escribe una persona: si alguno lleva < > & o comillas, sin esto
// se rompe el informe (o peor, se interpreta como HTML).
function esc(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmtFechaCorta(fechaISO) {
  const [y, m, d] = fechaISO.split("-");
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${d}-${meses[Number(m) - 1]}`;
}

// Excel a veces guarda la fecha como numero de serie (dias desde 1899-12-30) en vez de texto.
function normalizarFecha(valor) {
  if (typeof valor === "number") {
    const ms = Math.round((valor - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  return String(valor).slice(0, 10);
}

function formatoFechaVisible(fechaISO) {
  const [y, m, d] = fechaISO.split("-");
  return `${d}/${m}/${y}`;
}

// Una red Wi-Fi sin internet real hace que el celular diga "en línea" pero las llamadas a Excel se
// queden colgadas para siempre (bug real: tocar un lote no hacía nada). Toda lectura remota se
// corta a los pocos segundos y la app sigue con la copia guardada en el celular.
function conLimiteDeTiempo(promesa, ms) {
  let temporizador;
  const limite = new Promise((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error("Sin respuesta de internet")), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador));
}

const claveVisita = (d) => `${d.cliente}|${d.finca}|${normalizarFecha(d.fecha)}`;
const claveVisitaLote = (d) => `${claveVisita(d)}|${d.lote === "" || d.lote == null ? "" : String(d.lote)}`;
const claveProducto = (nombre, formulacion, dosis) =>
  [nombre, formulacion, dosis].map((v) => String(v == null ? "" : v).trim().toLowerCase()).join("|");

const Informes = {
  _remoto: {},
  _umbralesCache: null,
  LIMITE_LECTURA_MS: 6000,

  // Lee una tabla de Excel una sola vez por sesión (o hasta invalidarCache) y la guarda en el
  // celular. Si no hay red, Graph falla o tarda demasiado, se usa la última copia guardada.
  async _tablaRemota(nombreTabla, claveCache) {
    if (!this._remoto[claveCache]) {
      let crudas = null;
      if (navigator.onLine) {
        try {
          crudas = await conLimiteDeTiempo(Graph.leerTabla(nombreTabla), this.LIMITE_LECTURA_MS);
          await DB.guardarCache(claveCache, crudas);
        } catch (e) {
          console.warn(`No se pudo leer ${nombreTabla}, usando caché local:`, e.message);
        }
      }
      if (!crudas) crudas = (await DB.leerCache(claveCache)) || [];
      this._remoto[claveCache] = crudas;
    }
    return this._remoto[claveCache];
  },

  // Filas del Excel con la fecha normalizada, sin las de visitas que se borraron en la app y aún
  // no se borran allá (así desaparecen de informes e historial desde el primer momento).
  async _remota(nombreTabla, claveCache, columnas) {
    const crudas = this._normalizarFechas(await this._tablaRemota(nombreTabla, claveCache), columnas.fecha);
    const borradas = new Set((await this._pendientes()).filter((it) => it.tipo === "eliminar_visita").map((it) => claveVisita(it.datos)));
    if (borradas.size === 0) return crudas;
    return crudas.filter((f) => !borradas.has(claveVisita({ cliente: f[columnas.cliente], finca: f[columnas.finca], fecha: f[columnas.fecha] })));
  },

  // Lo pendiente de subir se consulta en cada llamada (no se cachea), para que lo recién
  // capturado o borrado se vea de inmediato al volver a entrar a un lote o a un informe.
  async _pendientes() {
    return (await DB.listarItems()).filter((it) => it.estado === "pendiente");
  },

  _normalizarFechas(filas, colFecha) {
    return filas.map((f) => {
      const copia = [...f];
      copia[colFecha] = normalizarFecha(copia[colFecha]);
      return copia;
    });
  },

  // Tabla "Base de datos" + puntos capturados aún sin sincronizar.
  async filas() {
    const crudas = await this._remota(CONFIG.TABLE_NAME, "filasBase", COL);
    const pendientes = (await this._pendientes()).filter((it) => it.tipo === "punto").map((it) => it.datos.fila);
    return [...crudas, ...this._normalizarFechas(pendientes, COL.fecha)];
  },

  // Productos_Aplicados: lo del Excel, menos lo que se quitó en la app y aún no se borra allá,
  // más lo agregado en la app y aún no se sube.
  async filasProductos() {
    const crudas = await this._remota(CONFIG.TABLA_PRODUCTOS_APLICADOS, "productosAplicadosBase", COL_PA);
    const pendientes = await this._pendientes();
    const quitados = new Set(pendientes.filter((it) => it.tipo === "eliminar_producto_aplicado")
      .map((it) => claveVisitaLote(it.datos) + "|" + claveProducto(it.datos.producto, it.datos.formulacion, it.datos.dosis)));
    const clave = (f) => claveVisitaLote({ cliente: f[COL_PA.cliente], finca: f[COL_PA.finca], fecha: f[COL_PA.fecha], lote: f[COL_PA.lote] }) +
      "|" + claveProducto(f[COL_PA.producto], f[COL_PA.formulacion], f[COL_PA.dosis]);
    const agregados = pendientes.filter((it) => it.tipo === "producto_aplicado").map((it) => [
      it.datos.cliente, it.datos.finca, it.datos.fecha, it.datos.lote,
      it.datos.producto, it.datos.tipo, it.datos.formulacion, it.datos.unidad, it.datos.dosis,
    ]);
    return [...crudas.filter((f) => !quitados.has(clave(f))), ...this._normalizarFechas(agregados, COL_PA.fecha)];
  },

  // Productos_Recomendados (lo que se recomendó en el informe de una visita).
  async filasRecomendados() {
    const crudas = await this._remota(CONFIG.TABLA_PRODUCTOS_RECOMENDADOS, "productosRecomendadosBase", COL_PR);
    const pendientes = (await this._pendientes()).filter((it) => it.tipo === "producto_recomendado").map((it) => [
      it.datos.cliente, it.datos.finca, it.datos.fecha, "",
      it.datos.producto, it.datos.tipo, it.datos.formulacion, it.datos.unidad, it.datos.dosis,
    ]);
    return [...crudas, ...this._normalizarFechas(pendientes, COL_PR.fecha)];
  },

  // Productos recomendados guardados para una visita exacta (mismo cliente+finca+fecha), para
  // poder ver o regenerar el mismo informe. Vacio si nunca se genero una recomendacion ahi.
  async recomendacionesGuardadas(cliente, finca, fecha) {
    const filas = await this.filasRecomendados();
    return filas
      .filter((f) => f[COL_PR.cliente] === cliente && f[COL_PR.finca] === finca && f[COL_PR.fecha] === fecha)
      .map((f) => ({
        nombre: f[COL_PR.producto], tipo: f[COL_PR.tipo], formulacion: f[COL_PR.formulacion],
        unidad: f[COL_PR.unidad], dosis: f[COL_PR.dosis],
      }));
  },

  // Manejo agronomico (tipo de fumigacion, volumen de mezcla, etc) y productos aplicados ya
  // registrados para un lote de una visita exacta (mismo cliente+finca+fecha+lote), para poder
  // precargarlos si se vuelve a entrar a ese lote (en vez de arrastrar datos de otra finca/visita).
  async manejoYProductosDeLote(cliente, finca, fecha, lote) {
    const filas = await this.filas();
    const puntoDelLote = filas.find((f) =>
      f[COL.cliente] === cliente && f[COL.finca] === finca && f[COL.fecha] === fecha && String(f[COL.lote]) === String(lote)
    );
    const manejo = puntoDelLote ? {
      tipoFumigacion: puntoDelLote[COL.tipoFumigacion] || "",
      litrosMezclaHa: puntoDelLote[COL.litrosMezclaHa] || "",
      ordenMezclaCorrecto: puntoDelLote[COL.ordenMezclaCorrecto] || "",
      phFinalMezcla: puntoDelLote[COL.phFinalMezcla] || "",
    } : null;

    const productosFilas = await this.filasProductos();
    const productos = productosFilas
      .filter((f) => f[COL_PA.cliente] === cliente && f[COL_PA.finca] === finca && f[COL_PA.fecha] === fecha && String(f[COL_PA.lote]) === String(lote))
      .map((f) => ({
        nombre: f[COL_PA.producto], tipo: f[COL_PA.tipo], formulacion: f[COL_PA.formulacion],
        unidad: f[COL_PA.unidad], dosis: f[COL_PA.dosis],
      }));

    return { manejo, productos };
  },

  // Productividad_Fincas. Un "productividad_visita" pendiente reemplaza TODAS las filas de esa
  // visita (así un cambio de "en general" a "por lotes" no deja filas viejas). Las columnas
  // calculadas se recalculan aquí para lo no sincronizado, con las mismas fórmulas del Excel.
  async filasProductividad() {
    const crudas = await this._remota(CONFIG.TABLA_PRODUCTIVIDAD, "productividadBase", COL_PF);
    const pendientes = await this._pendientes();
    const reemplazos = pendientes.filter((it) => it.tipo === "productividad_visita");
    const visitasReemplazadas = new Set(reemplazos.map((it) => claveVisita(it.datos)));

    const aFila = (base, d) => {
      const area = Number(d.area) || 0, animales = Number(d.animales) || 0;
      const dias = Number(d.dias) || 0, produccion = Number(d.produccion) || 0;
      return [
        base.cliente, base.finca, base.fecha, d.lote,
        area || null, animales || null, dias || null, produccion || null,
        area > 0 ? animales / area : null,
        (animales > 0 && dias > 0) ? ((area * 10000) / animales) / dias : null,
        area > 0 ? (produccion * animales) / area : null,
      ];
    };
    const nuevas = [
      ...reemplazos.flatMap((it) => (it.datos.filas || []).map((d) => aFila(it.datos, d))),
      // Formato anterior (una fila por item), por si quedó algo en la cola de versiones viejas.
      ...pendientes.filter((it) => it.tipo === "productividad").map((it) => aFila(it.datos, it.datos)),
    ];
    const conservadas = crudas.filter((f) =>
      !visitasReemplazadas.has(claveVisita({ cliente: f[COL_PF.cliente], finca: f[COL_PF.finca], fecha: f[COL_PF.fecha] })));
    return [...conservadas, ...this._normalizarFechas(nuevas, COL_PF.fecha)];
  },

  async productividadDeVisita(cliente, finca, fecha) {
    const filas = await this.filasProductividad();
    return filas
      .filter((f) => f[COL_PF.cliente] === cliente && f[COL_PF.finca] === finca && f[COL_PF.fecha] === fecha)
      .map((f) => ({
        lote: f[COL_PF.lote], area: f[COL_PF.area], animales: f[COL_PF.animales], dias: f[COL_PF.dias],
        produccion: f[COL_PF.produccion], cargaAnimal: f[COL_PF.cargaAnimal],
        areaDiaria: f[COL_PF.areaDiaria], productividadLecheria: f[COL_PF.productividadLecheria],
      }));
  },

  // Observaciones_Lotes: una por lote de cada visita. Una pendiente reemplaza la del Excel.
  async filasObservacionesLotes() {
    const crudas = await this._remota(CONFIG.TABLA_OBSERVACIONES_LOTES, "observacionesLotesBase", COL_OL);
    const pendientes = (await this._pendientes()).filter((it) => it.tipo === "observacion_lote");
    const reemplazadas = new Set(pendientes.map((it) => claveVisitaLote(it.datos)));
    const conservadas = crudas.filter((f) => !reemplazadas.has(claveVisitaLote({
      cliente: f[COL_OL.cliente], finca: f[COL_OL.finca], fecha: f[COL_OL.fecha], lote: f[COL_OL.lote],
    })));
    const nuevas = pendientes.map((it) => [it.datos.cliente, it.datos.finca, it.datos.fecha, it.datos.lote, it.datos.potrero, it.datos.observaciones]);
    return [...conservadas, ...this._normalizarFechas(nuevas, COL_OL.fecha)];
  },

  // Informes_Generados: uno por visita. Uno pendiente reemplaza el del Excel.
  async filasInformesGenerados() {
    const crudas = await this._remota(CONFIG.TABLA_INFORMES_GENERADOS, "informesGeneradosBase", COL_IG);
    const pendientes = (await this._pendientes()).filter((it) => it.tipo === "informe_generado");
    const reemplazadas = new Set(pendientes.map((it) => claveVisita(it.datos)));
    const conservadas = crudas.filter((f) => !reemplazadas.has(claveVisita({ cliente: f[COL_IG.cliente], finca: f[COL_IG.finca], fecha: f[COL_IG.fecha] })));
    const nuevas = pendientes.map((it) => [it.datos.cliente, it.datos.finca, it.datos.fecha, it.datos.fechaInforme,
      it.datos.tipoFumigacion, it.datos.volumenMezcla, it.datos.notas]);
    return [...conservadas, ...this._normalizarFechas(nuevas, COL_IG.fecha)];
  },

  async informeGuardado(cliente, finca, fecha) {
    const f = (await this.filasInformesGenerados()).find((x) => x[COL_IG.cliente] === cliente && x[COL_IG.finca] === finca && x[COL_IG.fecha] === fecha);
    return f ? {
      fechaInforme: f[COL_IG.fechaInforme] == null ? "" : normalizarFecha(f[COL_IG.fechaInforme]),
      tipoFumigacion: f[COL_IG.tipoFumigacion] || "", volumenMezcla: f[COL_IG.volumenMezcla] ?? "", notas: f[COL_IG.notas] || "",
    } : null;
  },

  // Visitas para el Historial: todas las de la hoja "Base de datos" (y las capturadas aún sin subir),
  // de la más reciente a la más antigua, indicando si les falta registrar productos aplicados, la
  // recomendación (productos recomendados o informe generado) o los datos de productividad.
  async visitasHistorial() {
    const filas = await this.filas();
    const visitas = {};
    filas.forEach((f) => {
      const k = claveVisita({ cliente: f[COL.cliente], finca: f[COL.finca], fecha: f[COL.fecha] });
      if (!visitas[k]) visitas[k] = { clave: k, cliente: f[COL.cliente], finca: f[COL.finca], fecha: f[COL.fecha], lotes: new Set() };
      visitas[k].lotes.add(String(f[COL.lote]));
    });
    const claves = (lista, C) => new Set(lista.map((f) => claveVisita({ cliente: f[C.cliente], finca: f[C.finca], fecha: f[C.fecha] })));
    const conAplicados = claves(await this.filasProductos(), COL_PA);
    const conRecomendacion = new Set([...claves(await this.filasRecomendados(), COL_PR), ...claves(await this.filasInformesGenerados(), COL_IG)]);
    const conProductividad = claves(await this.filasProductividad(), COL_PF);
    return Object.values(visitas)
      .map((v) => ({
        clave: v.clave, cliente: v.cliente, finca: v.finca, fecha: v.fecha, numeroLotes: v.lotes.size,
        faltaAplicados: !conAplicados.has(v.clave),
        faltaRecomendacion: !conRecomendacion.has(v.clave),
        faltaProductividad: !conProductividad.has(v.clave),
      }))
      .sort((x, y) => (x.fecha < y.fecha ? 1 : x.fecha > y.fecha ? -1 : String(x.cliente).localeCompare(String(y.cliente), "es")));
  },

  // Todo lo guardado de una visita para mostrarlo en el Historial.
  async detalleVisita(cliente, finca, fecha) {
    const filas = (await this.filas()).filter((f) => f[COL.cliente] === cliente && f[COL.finca] === finca && f[COL.fecha] === fecha);
    const lotesNumeros = [...new Set(filas.map((f) => f[COL.lote]))].sort((a, b) => a - b);
    const lotes = [];
    for (const lote of lotesNumeros) {
      const sub = filas.filter((f) => f[COL.lote] === lote);
      const { manejo, productos } = await this.manejoYProductosDeLote(cliente, finca, fecha, lote);
      lotes.push({
        lote, puntos: sub.length, potrero: [...new Set(sub.map((f) => f[COL.potrero]).filter(Boolean))].join(", "),
        manejo, productos, observacion: await this.observacionDeLote(cliente, finca, fecha, lote),
      });
    }
    return {
      lotes,
      recomendados: await this.recomendacionesGuardadas(cliente, finca, fecha),
      informe: await this.informeGuardado(cliente, finca, fecha),
      productividad: await this.productividadDeVisita(cliente, finca, fecha),
    };
  },

  async observacionDeLote(cliente, finca, fecha, lote) {
    const filas = await this.filasObservacionesLotes();
    const f = filas.find((x) => x[COL_OL.cliente] === cliente && x[COL_OL.finca] === finca &&
      x[COL_OL.fecha] === fecha && String(x[COL_OL.lote]) === String(lote));
    return f ? String(f[COL_OL.observaciones] || "") : "";
  },

  // Catalogo de productos (hoja Productos) solo para saber el orden de mezcla de cada uno, y asi
  // poder ordenar los productos aplicados/recomendados igual que en la app.
  async filasCatalogoProductos() {
    if (!this._catalogoCache) {
      let crudas = null;
      if (navigator.onLine) {
        try {
          crudas = await conLimiteDeTiempo(Graph.leerRango(CONFIG.HOJA_PRODUCTOS, "A4:E500"), this.LIMITE_LECTURA_MS);
          await DB.guardarCache("catalogoOrdenBase", crudas);
        } catch (e) {
          console.warn("No se pudo leer el catalogo de Productos, usando caché local:", e.message);
        }
      }
      if (!crudas) crudas = (await DB.leerCache("catalogoOrdenBase")) || [];
      this._catalogoCache = crudas;
    }
    return this._catalogoCache;
  },

  formatoFechaVisible,

  async umbrales() {
    if (!this._umbralesCache) {
      let valores = null;
      if (navigator.onLine) {
        try {
          const filas = await conLimiteDeTiempo(Graph.leerRango(CONFIG.HOJA_CONFIG, "A8:B19"), this.LIMITE_LECTURA_MS);
          valores = {};
          filas.forEach(([nombre, valor]) => { if (nombre) valores[nombre] = valor; });
          await DB.guardarCache("umbralesBase", valores);
        } catch (e) {
          console.warn("No se pudieron leer los umbrales de Excel, usando caché local:", e.message);
        }
      }
      this._umbralesCache = valores || (await DB.leerCache("umbralesBase")) || {};
    }
    return this._umbralesCache;
  },

  invalidarCache() {
    this._remoto = {};
    this._umbralesCache = null;
    this._catalogoCache = null;
  },

  async fechasDisponibles(cliente, finca) {
    const filas = await this.filas();
    const fechas = new Set(
      filas.filter((f) => f[COL.cliente] === cliente && f[COL.finca] === finca).map((f) => f[COL.fecha])
    );
    return [...fechas].sort().reverse();
  },

  async calcularDatos(cliente, finca, fecha) {
    const filas = await this.filas();
    const umbrales = await this.umbrales();
    const productosAplicados = await this.filasProductos();
    const productividad = await this.productividadDeVisita(cliente, finca, fecha);
    const catalogoProductos = await this.filasCatalogoProductos();
    const observacionesLotes = await this.filasObservacionesLotes();
    const ordenProductos = {};
    catalogoProductos.forEach((f) => { if (f[0]) ordenProductos[String(f[0]).trim().toLowerCase()] = f[4]; });

    const visita = filas.filter((f) => f[COL.cliente] === cliente && f[COL.finca] === finca && f[COL.fecha] === fecha);
    const lotesReales = [...new Set(visita.map((f) => f[COL.lote]))].sort((a, b) => a - b);

    const tablaLotes = lotesReales.map((lote) => {
      const sub = visita.filter((f) => f[COL.lote] === lote);
      const danoColl = promedio(sub.map((s) => s[COL.danoCollTotal]));
      const danoMol = promedio(sub.map((s) => s[COL.danoMoluscos]));
      const danoHongos = promedio(sub.map((s) => s[COL.danoHongos]));
      const potreros = [...new Set(sub.map((s) => s[COL.potrero]).filter(Boolean))];
      const observaciones = sub.map((s) => s[COL.observaciones]).filter((o) => o && String(o).trim()).join(" · ");
      const primero = sub[0] || [];
      const filaObsLote = observacionesLotes.find((o) => o[COL_OL.cliente] === cliente && o[COL_OL.finca] === finca &&
        o[COL_OL.fecha] === fecha && String(o[COL_OL.lote]) === String(lote));
      const observacionLote = filaObsLote ? String(filaObsLote[COL_OL.observaciones] || "").trim() : "";
      const productosLote = productosAplicados
        .filter((p) => p[COL_PA.cliente] === cliente && p[COL_PA.finca] === finca && p[COL_PA.fecha] === fecha && p[COL_PA.lote] === lote)
        .map((p) => ({
          tipo: p[COL_PA.tipo], nombre: p[COL_PA.producto], formulacion: p[COL_PA.formulacion],
          unidad: p[COL_PA.unidad], dosis: p[COL_PA.dosis],
        }));
      return {
        lote, potrero: potreros.join(", "), observaciones, observacion_lote: observacionLote, productos: productosLote,
        n_puntos: sub.length, // cuántos puntos se promediaron (con 1 no hay dispersión posible)
        incid_coll: promedio(sub.map((s) => s[COL.incidColl])),
        sev_coll: promedio(sub.map((s) => s[COL.sevColl])),
        incid_hongos: promedio(sub.map((s) => s[COL.incidHongos])),
        sev_hongos: promedio(sub.map((s) => s[COL.sevHongos])),
        adultos: promedio(sub.map((s) => s[COL.adultos])),
        ninfas: promedio(sub.map((s) => s[COL.ninfas])),
        loritos: promedio(sub.map((s) => s[COL.loritos])),
        lepidopteros: promedio(sub.map((s) => s[COL.lepidopteros])),
        hojas_moluscos: promedio(sub.map((s) => s[COL.hojasMoluscos])),
        adultos_sd: desviacion(sub.map((s) => s[COL.adultos])),
        ninfas_sd: desviacion(sub.map((s) => s[COL.ninfas])),
        loritos_sd: desviacion(sub.map((s) => s[COL.loritos])),
        lepidopteros_sd: desviacion(sub.map((s) => s[COL.lepidopteros])),
        dano_coll: danoColl, dano_mol: danoMol, dano_hongos: danoHongos,
        pasto_sano: 1 - (danoColl || 0) - (danoMol || 0) - (danoHongos || 0),
        manejo: {
          tipoFumigacion: primero[COL.tipoFumigacion] || "",
          litrosMezclaHa: primero[COL.litrosMezclaHa] || "",
          ordenMezclaCorrecto: primero[COL.ordenMezclaCorrecto] || "",
          phFinalMezcla: primero[COL.phFinalMezcla] || "",
        },
      };
    });

    // Solo variables en "numero promedio de individuos" (se excluye Hojas por Moluscos, que es otra unidad).
    // Umbrales leidos en vivo de Configuracion (si falta alguno, se usa 5 como respaldo). Barras de error = +-1 desv. estandar / 2.
    const barrasEstatica = {
      categorias: ["Adultos de Collaria", "Ninfas de Collaria", "Loritos", "Lepidópteros"],
      umbrales: [
        umbrales["Umbral de Adultos de Collaria"] ?? 5,
        umbrales["Umbral de Ninfas de Collaria"] ?? 5,
        umbrales["Umbral de Individuos de Lorito"] ?? 5,
        umbrales["Umbral de Numero de Lepidopteros"] ?? 5,
      ],
      lotes: Object.fromEntries(tablaLotes.map((t) => [
        String(t.lote), [t.adultos, t.ninfas, t.loritos, t.lepidopteros],
      ])),
      errores: Object.fromEntries(tablaLotes.map((t) => [
        String(t.lote), [t.adultos_sd, t.ninfas_sd, t.loritos_sd, t.lepidopteros_sd],
      ])),
    };

    const fechasFinca = [...new Set(
      filas.filter((f) => f[COL.cliente] === cliente && f[COL.finca] === finca).map((f) => f[COL.fecha])
    )].sort();
    const ultimas6 = fechasFinca.slice(-6);
    const lotesFinca = [...new Set(
      filas.filter((f) => f[COL.cliente] === cliente && f[COL.finca] === finca).map((f) => f[COL.lote])
    )].sort((a, b) => a - b);

    const historial = {};
    for (const [nombreVar, colOFn] of Object.entries(VARIABLES_HISTORIAL)) {
      const extraer = typeof colOFn === "function" ? colOFn : (fila) => fila[colOFn];
      const porLote = {}, erroresPorLote = {};
      for (const lote of lotesFinca) {
        const promedios = [], errores = [];
        for (const f of ultimas6) {
          const sub = filas.filter(
            (r) => r[COL.cliente] === cliente && r[COL.finca] === finca && r[COL.lote] === lote && r[COL.fecha] === f
          );
          promedios.push(promedio(sub.map(extraer)));
          errores.push(desviacion(sub.map(extraer)));
        }
        porLote[String(lote)] = promedios;
        erroresPorLote[String(lote)] = errores;
      }
      historial[nombreVar] = { fechas: ultimas6.map(fmtFechaCorta), lotes: porLote, errores: erroresPorLote };
    }

    const umbralesHistorial = {};
    for (const nombreVar of Object.keys(VARIABLES_HISTORIAL)) {
      const nombreUmbral = UMBRAL_POR_VARIABLE_HISTORIAL[nombreVar];
      umbralesHistorial[nombreVar] = nombreUmbral ? (umbrales[nombreUmbral] ?? null) : null;
    }

    const tortas = tablaLotes.map((t) => ({
      lote: t.lote, valores: [t.dano_coll || 0, t.dano_mol || 0, t.dano_hongos || 0, Math.max(t.pasto_sano || 0, 0)],
    }));

    // Fila y graficas extra con el promedio de todos los lotes: el estado general de la finca en esta visita.
    const promedioFinca = {
      incid_coll: promedio(tablaLotes.map((t) => t.incid_coll)),
      sev_coll: promedio(tablaLotes.map((t) => t.sev_coll)),
      incid_hongos: promedio(tablaLotes.map((t) => t.incid_hongos)),
      sev_hongos: promedio(tablaLotes.map((t) => t.sev_hongos)),
      adultos: promedio(tablaLotes.map((t) => t.adultos)),
      ninfas: promedio(tablaLotes.map((t) => t.ninfas)),
      loritos: promedio(tablaLotes.map((t) => t.loritos)),
      lepidopteros: promedio(tablaLotes.map((t) => t.lepidopteros)),
      dano_mol: promedio(tablaLotes.map((t) => t.dano_mol)),
      dano_coll: promedio(tablaLotes.map((t) => t.dano_coll)),
      dano_hongos: promedio(tablaLotes.map((t) => t.dano_hongos)),
      pasto_sano: promedio(tablaLotes.map((t) => t.pasto_sano)),
    };
    const promedioBarras = {
      valores: [promedioFinca.adultos, promedioFinca.ninfas, promedioFinca.loritos, promedioFinca.lepidopteros],
      errores: [
        promedio(tablaLotes.map((t) => t.adultos_sd)), promedio(tablaLotes.map((t) => t.ninfas_sd)),
        promedio(tablaLotes.map((t) => t.loritos_sd)), promedio(tablaLotes.map((t) => t.lepidopteros_sd)),
      ],
    };
    const promedioTorta = [
      promedioFinca.dano_coll || 0, promedioFinca.dano_mol || 0, promedioFinca.dano_hongos || 0,
      Math.max(promedioFinca.pasto_sano || 0, 0),
    ];

    // Alertas de la sección Resultados: se evalúa el estado general de la finca (el promedio de los
    // lotes) o, si solo se muestreó un lote, ese lote. El detalle por lote ya está en la tabla y en
    // las gráficas; aquí se resume una sola vez para no repetir lo mismo lote por lote.
    const referencia = tablaLotes.length === 1 ? tablaLotes[0] : promedioFinca;
    const alertas = [];
    if (tablaLotes.length > 0) {
      for (const def of DEFINICIONES_UMBRAL) {
        const valor = referencia[def.campo];
        const umbral = umbrales[def.umbral];
        if (valor == null || umbral == null) continue;
        const excede = def.esMinimo ? valor < umbral : valor > umbral;
        if (excede) {
          alertas.push(
            `${def.nombre} (${fmt(valor, def.pct)}) ${def.esMinimo ? "por debajo del mínimo" : "supera el umbral"} (${fmt(umbral, def.pct)}).`
          );
        }
      }
    }

    const visitaNumero = fechasFinca.indexOf(fecha) + 1;

    return {
      cliente, finca, fecha, visita_numero: visitaNumero, lotes_reales: lotesReales, lotes_finca: lotesFinca,
      tabla_lotes: tablaLotes, barras_estatica: barrasEstatica, historial, umbrales_historial: umbralesHistorial, tortas, alertas, umbrales,
      promedio_finca: promedioFinca, promedio_barras: promedioBarras, promedio_torta: promedioTorta,
      productividad, orden_productos: ordenProductos,
    };
  },

  generarHtml(D, productosRecomendados, notasAdicionales, manejoFumigacion = {}) {
    const claseAlerta = (valor, umbral, esMinimo) => {
      if (valor == null || umbral == null) return "";
      const excede = esMinimo ? valor < umbral : valor > umbral;
      return excede ? ' class="alerta"' : "";
    };
    const u = D.umbrales;
    const um = (nombreDef) => u[DEFINICIONES_UMBRAL.find((d) => d.campo === nombreDef).umbral];

    const filasTabla = D.tabla_lotes.map((t) => `<tr>
      <td>Lote ${t.lote}</td>
      <td${claseAlerta(t.incid_coll, um("incid_coll"))}>${fmt(t.incid_coll, true)}</td>
      <td${claseAlerta(t.sev_coll, um("sev_coll"))}>${fmt(t.sev_coll, true)}</td>
      <td${claseAlerta(t.incid_hongos, um("incid_hongos"))}>${fmt(t.incid_hongos, true)}</td>
      <td${claseAlerta(t.sev_hongos, um("sev_hongos"))}>${fmt(t.sev_hongos, true)}</td>
      <td${claseAlerta(t.adultos, um("adultos"))}>${fmt(t.adultos)}</td>
      <td${claseAlerta(t.ninfas, um("ninfas"))}>${fmt(t.ninfas)}</td>
      <td${claseAlerta(t.loritos, um("loritos"))}>${fmt(t.loritos)}</td>
      <td${claseAlerta(t.lepidopteros, um("lepidopteros"))}>${fmt(t.lepidopteros)}</td>
      <td${claseAlerta(t.dano_mol, um("dano_mol"))}>${fmt(t.dano_mol, true)}</td>
      <td${claseAlerta(t.dano_coll, um("dano_coll"))}>${fmt(t.dano_coll, true)}</td>
      <td${claseAlerta(t.dano_hongos, um("dano_hongos"))}>${fmt(t.dano_hongos, true)}</td>
      <td${claseAlerta(t.pasto_sano, um("pasto_sano"), true)}>${fmt(t.pasto_sano, true)}</td>
    </tr>`).join("") + (D.tabla_lotes.length > 1 ? `<tr class="fila-promedio">
      <td>Promedio general</td>
      <td${claseAlerta(D.promedio_finca.incid_coll, um("incid_coll"))}>${fmt(D.promedio_finca.incid_coll, true)}</td>
      <td${claseAlerta(D.promedio_finca.sev_coll, um("sev_coll"))}>${fmt(D.promedio_finca.sev_coll, true)}</td>
      <td${claseAlerta(D.promedio_finca.incid_hongos, um("incid_hongos"))}>${fmt(D.promedio_finca.incid_hongos, true)}</td>
      <td${claseAlerta(D.promedio_finca.sev_hongos, um("sev_hongos"))}>${fmt(D.promedio_finca.sev_hongos, true)}</td>
      <td${claseAlerta(D.promedio_finca.adultos, um("adultos"))}>${fmt(D.promedio_finca.adultos)}</td>
      <td${claseAlerta(D.promedio_finca.ninfas, um("ninfas"))}>${fmt(D.promedio_finca.ninfas)}</td>
      <td${claseAlerta(D.promedio_finca.loritos, um("loritos"))}>${fmt(D.promedio_finca.loritos)}</td>
      <td${claseAlerta(D.promedio_finca.lepidopteros, um("lepidopteros"))}>${fmt(D.promedio_finca.lepidopteros)}</td>
      <td${claseAlerta(D.promedio_finca.dano_mol, um("dano_mol"))}>${fmt(D.promedio_finca.dano_mol, true)}</td>
      <td${claseAlerta(D.promedio_finca.dano_coll, um("dano_coll"))}>${fmt(D.promedio_finca.dano_coll, true)}</td>
      <td${claseAlerta(D.promedio_finca.dano_hongos, um("dano_hongos"))}>${fmt(D.promedio_finca.dano_hongos, true)}</td>
      <td${claseAlerta(D.promedio_finca.pasto_sano, um("pasto_sano"), true)}>${fmt(D.promedio_finca.pasto_sano, true)}</td>
    </tr>` : "");

    // Solo las siglas de la formulacion (ej: "SC" de "SC (Suspension Concentrada)"), sin el nombre completo.
    function siglasFormulacion(formulacion) {
      if (!formulacion) return "";
      return String(formulacion).split(" (")[0].trim();
    }

    // Mismo orden de mezcla que en Recomendaciones (columna Orden del catalogo Productos).
    function ordenDeMezclaInforme(nombre) {
      const orden = D.orden_productos[String(nombre || "").trim().toLowerCase()];
      return orden != null && !Number.isNaN(Number(orden)) ? Number(orden) : Infinity;
    }

    // Sufijo que indica con que equipo se aplica una dosis (usado tanto en Manejo como en Recomendaciones).
    const UNIDAD_APLICACION_POR_TIPO = {
      "Aerea (Dron)": "/Hectárea",
      "Terrestre (Estacionaria)": "/Caneca 200L",
      "Terrestre (Bomba de espalda)": "/Bomba 20L",
    };

    function manejoHtml(m, productos) {
      const filasM = [
        ["Tipo de fumigación", m.tipoFumigacion], ["Volumen de Mezcla/ha", m.litrosMezclaHa],
        ["Orden de mezcla correcto", m.ordenMezclaCorrecto], ["pH final de la mezcla", m.phFinalMezcla],
      ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");
      const sufijoDosis = UNIDAD_APLICACION_POR_TIPO[m.tipoFumigacion] || "";
      const productosLi = (productos || [])
        .slice()
        .sort((a, b) => ordenDeMezclaInforme(a.nombre) - ordenDeMezclaInforme(b.nombre))
        .map((p) => {
          const siglas = siglasFormulacion(p.formulacion);
          const dosis = p.dosis ? ` — ${p.dosis}${p.unidad || ""}${sufijoDosis}` : "";
          return `<li><span class="manejo-etiqueta">${esc(p.tipo || "Producto")}</span>${esc(p.nombre)}${siglas ? ` ${esc(siglas)}` : ""}${esc(dosis)}.</li>`;
        })
        .join("");
      if (filasM.length === 0 && !productosLi) return "";
      const columnas = filasM.length
        ? `<div class="manejo-columnas">${filasM.map(([k, v]) => `<div><span class="manejo-etiqueta">${k}</span>${esc(v)}</div>`).join("")}</div>`
        : "";
      const listaProductos = productosLi
        ? `<span class="manejo-subtitulo">Productos aplicados</span><ul class="manejo-lista">${productosLi}</ul>`
        : "";
      return columnas + listaProductos;
    }

    // Si dos o mas lotes tuvieron exactamente el mismo manejo (mismos productos y datos), se
    // reporta una sola vez con un subtitulo indicando a que lotes aplica, en vez de repetirlo.
    // La firma normaliza espacios y el orden de los productos, para que el mismo manejo no se
    // considere "distinto" solo porque los productos quedaron en otro orden.
    function normalizar(v) { return v == null ? "" : String(v).trim(); }
    function firmaManejo(t) {
      const m = t.manejo || {};
      const productosOrdenados = (t.productos || [])
        .map((p) => [normalizar(p.tipo), normalizar(p.nombre), normalizar(p.formulacion), normalizar(p.unidad), normalizar(p.dosis)])
        .map((campos) => campos.join("|"))
        .sort();
      return JSON.stringify({
        tipoFumigacion: normalizar(m.tipoFumigacion), litrosMezclaHa: normalizar(m.litrosMezclaHa),
        ordenMezclaCorrecto: normalizar(m.ordenMezclaCorrecto), phFinalMezcla: normalizar(m.phFinalMezcla),
        productos: productosOrdenados,
      });
    }
    const gruposManejo = [];
    const indicePorFirma = new Map();
    for (const t of D.tabla_lotes) {
      const firma = firmaManejo(t);
      if (!indicePorFirma.has(firma)) {
        indicePorFirma.set(firma, gruposManejo.length);
        gruposManejo.push({ lotes: [t.lote], manejo: t.manejo, productos: t.productos });
      } else {
        gruposManejo[indicePorFirma.get(firma)].lotes.push(t.lote);
      }
    }
    const manejoTodosHtml = gruposManejo.map((g) => {
      const manejo = manejoHtml(g.manejo, g.productos);
      if (!manejo) return "";
      const subtitulo = gruposManejo.length > 1
        ? `<strong>${g.lotes.length > 1 ? "Lotes " : "Lote "}${g.lotes.join(", ")}</strong>`
        : "";
      return `<div class="manejo-box">${subtitulo}${manejo}</div>`;
    }).join("");

    // Indicadores de productividad como tarjetas: los 3 valores calculados son lo que el productor
    // quiere ver (van grandes y resaltados); los datos de entrada van debajo, en pequeño.
    const numero = (v, dec = 1) => (v == null || Number.isNaN(Number(v)) ? "-" : Number(v).toFixed(dec));
    const productividadHtml = (D.productividad || []).length
      ? D.productividad.map((p) => `<div class="kpi-bloque">
          <span class="rotulo">${p.lote ? "Lote " + esc(p.lote) : "Finca en general"}</span>
          <div class="kpi-grid">
            <div class="kpi"><span class="kpi-num">${numero(p.productividadLecheria)}</span><span class="kpi-unidad">L leche/ha·día</span><span class="kpi-nombre">Productividad de la lechería</span></div>
            <div class="kpi"><span class="kpi-num">${numero(p.cargaAnimal, 2)}</span><span class="kpi-unidad">animales/ha</span><span class="kpi-nombre">Carga animal</span></div>
            <div class="kpi"><span class="kpi-num">${numero(p.areaDiaria)}</span><span class="kpi-unidad">m²/vaca·día</span><span class="kpi-nombre">Área diaria por animal</span></div>
          </div>
          <p class="kpi-base">${numero(p.area)} ha · ${numero(p.animales, 0)} animales en ordeño · ${numero(p.dias, 0)} días de rotación · ${numero(p.produccion)} L/vaca·día</p>
        </div>`).join("")
      : `<p class="hint">Sin datos de productividad registrados en esta visita.</p>`;

    // --- Barras horizontales contra umbral ("bullet chart") ---
    // Las cuatro plagas tienen magnitudes muy distintas (200 ninfas frente a 1 lepidóptero): en un
    // eje común la barra chica desaparece. Aquí cada fila tiene su propia escala anclada en SU
    // umbral, así se compara lo que de verdad importa: qué tan lejos está cada plaga de su límite.
    function bulletHtml(valores, errores) {
      const cats = D.barras_estatica.categorias;
      const umbrales = D.barras_estatica.umbrales;
      return `<ul class="bullet-lista">${cats.map((cat, i) => {
        const valor = valores[i] ?? 0;
        const umbral = umbrales[i] ?? 0;
        const sd = (errores || [])[i] || 0;
        // El eje llega a 1.25x del mayor entre el dato y el umbral: ambos siempre caben y se ven.
        const tope = Math.max(valor + sd / 2, umbral, 0.001) * 1.25;
        const pct = (v) => Math.max(0, Math.min(100, (v / tope) * 100));
        const sobre = umbral > 0 && valor > umbral;
        const dispersion = sd > 0
          ? `<span class="bullet-dispersion" style="left:${pct(Math.max(valor - sd / 2, 0))}%;width:${Math.max(pct(valor + sd / 2) - pct(Math.max(valor - sd / 2, 0)), 1)}%"></span>`
          : "";
        return `<li class="bullet-fila">
          <div class="bullet-cab">
            <span class="bullet-nombre">${esc(cat)}</span>
            <span class="bullet-valor${sobre ? " sobre" : ""}">${fmt(valor)}</span>
          </div>
          <div class="bullet-pista">
            <span class="bullet-relleno${sobre ? " sobre" : ""}" style="width:${pct(valor)}%"></span>
            ${dispersion}
            ${umbral > 0 ? `<span class="bullet-umbral" style="left:${pct(umbral)}%"></span>` : ""}
          </div>
          <div class="bullet-pie"><span>umbral ${fmt(umbral)}</span></div>
        </li>`;
      }).join("")}</ul>`;
    }

    // --- Anillo de composición de la pastura (SVG: nítido en cualquier pantalla) ---
    // Es un reparto de 100%: el anillo lo dice de un vistazo y el dato que de verdad importa
    // (cuánto pasto sano queda) va en el centro, grande.
    function anilloHtml(valores) {
      const total = valores.reduce((a, b) => a + (b || 0), 0) || 1;
      const C = 2 * Math.PI * 42;
      let acumulado = 0;
      const segmentos = valores.map((v, i) => {
        const frac = (v || 0) / total;
        const seg = `<circle cx="60" cy="60" r="42" fill="none" stroke="${COLORES_TORTA[i]}" stroke-width="16"
          stroke-dasharray="${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}"
          stroke-dashoffset="${(-acumulado * C).toFixed(2)}" transform="rotate(-90 60 60)"></circle>`;
        acumulado += frac;
        return seg;
      }).join("");
      const sano = valores[3] || 0;
      return `<svg class="anillo" viewBox="0 0 120 120" role="img">
        ${segmentos}
        <text class="anillo-num" x="60" y="58" text-anchor="middle">${fmt(sano / total, true)}</text>
        <text class="anillo-lbl" x="60" y="70" text-anchor="middle">pasto sano</text>
      </svg>`;
    }

    function leyendaHtml(valores) {
      return `<ul class="torta-legend">${valores.map((v, vi) =>
        `<li><span><span class="leg-swatch" style="background:${COLORES_TORTA[vi]}"></span>${ETIQUETAS_TORTA[vi]}</span><span>${fmt(v, true)}</span></li>`
      ).join("")}</ul>`;
    }

    function panelesHtml(valores, errores, torta) {
      return `<div class="lote-fila">
          <div class="panel-barras">
            <span class="rotulo">Plagas frente a su umbral</span>
            ${bulletHtml(valores, errores)}
          </div>
          <div class="panel-anillo">
            <span class="rotulo">Estado de la pastura</span>
            ${anilloHtml(torta)}
            ${leyendaHtml(torta)}
          </div>
        </div>`;
    }

    const porLoteHtml = D.tabla_lotes.map((t, i) => {
      const clave = String(t.lote);
      const valores = D.barras_estatica.lotes[clave] || [];
      const errores = (D.barras_estatica.errores || {})[clave] || [];
      const nota = t.n_puntos === 1
        ? "1 punto de muestreo (sin dispersión)."
        : `Promedio de ${t.n_puntos} puntos de muestreo.`;
      return `<div class="lote-bloque">
        <h3>Lote ${esc(t.lote)}${t.potrero ? ` — Potrero ${esc(t.potrero)}` : ""}</h3>
        ${panelesHtml(valores, errores, D.tortas[i].valores)}
        <p class="nota-puntos">${nota}</p>
      </div>`;
    }).join("") + (D.tabla_lotes.length <= 1 ? "" : `<div class="lote-bloque lote-bloque-promedio">
        <h3>Estado general de la finca</h3>
        ${panelesHtml(D.promedio_barras.valores, D.promedio_barras.errores, D.promedio_torta)}
        <p class="nota-puntos">Promedio de los ${D.tabla_lotes.length} lotes.</p>
      </div>`);

    const opcionesVariable = Object.keys(D.historial).map((v) => `<option value="${v}">${v}</option>`).join("");

    const historialCanvasHtml = `<div class="historial-fila">${D.lotes_finca.map((lote) =>
      `<div class="chart-box historial-item"><h3>Lote ${lote}</h3><canvas id="historialLote${lote}" width="380" height="220"></canvas></div>`
    ).join("")}</div>`;

    const observacionesTexto = esc(D.tabla_lotes.map((t) => {
      const etiqueta = `Lote ${t.lote}` + (t.potrero ? ` (Potrero ${t.potrero})` : "");
      const texto = [t.observacion_lote, t.observaciones].filter(Boolean).join(" · ");
      return `${etiqueta}: ${texto || "Sin observaciones."}`;
    }).join("\n\n"));

    const baseResultados = D.tabla_lotes.length === 1
      ? `Lote ${esc(D.tabla_lotes[0].lote)}`
      : `Promedio de los ${D.tabla_lotes.length} lotes`;
    const resultadosHtml = `<strong>${baseResultados}:</strong><br>` + (D.alertas.length
      ? D.alertas.map((a) => `• ${esc(a)}`).join("<br>")
      : "Ningún indicador superó su umbral en esta visita.");

    const TIPOS_FUMIGACION_TEXTO = {
      "Aerea (Dron)": "Aérea (Dron)",
      "Terrestre (Estacionaria)": "Terrestre (Estacionaria)",
      "Terrestre (Bomba de espalda)": "Terrestre (Bomba de espalda)",
    };
    function formatearDosis(p) {
      if (!p.dosis) return "";
      const sufijo = UNIDAD_APLICACION_POR_TIPO[p.tipoFumigacion] || "";
      return `${p.dosis}${p.unidad || ""}${sufijo}`;
    }

    const tipoFumigacionTexto = TIPOS_FUMIGACION_TEXTO[manejoFumigacion.tipo] || "";
    const tipoFumigacionHtml = (tipoFumigacionTexto || manejoFumigacion.volumenMezcla)
      ? `<div class="manejo-columnas">
          ${tipoFumigacionTexto ? `<div><span class="manejo-etiqueta">Tipo de fumigación</span>${tipoFumigacionTexto}</div>` : ""}
          ${manejoFumigacion.volumenMezcla ? `<div><span class="manejo-etiqueta">Volumen de mezcla/hectárea</span>${esc(manejoFumigacion.volumenMezcla)}L</div>` : ""}
        </div>`
      : "";

    const productosRecomendadosHtml = (productosRecomendados || []).length
      ? tipoFumigacionHtml + `<ol class="reco-lista">${productosRecomendados.map((p) => {
          const dosis = formatearDosis(p);
          return `<li>
            <div class="reco-texto">
              <strong>${esc(p.nombre)}</strong>${p.tipo ? `<span class="reco-detalle"> — ${esc(p.tipo)}</span>` : ""}
              ${dosis ? `<div class="reco-dosis">${esc(dosis)}</div>` : ""}
            </div>
          </li>`;
        }).join("")}</ol>`
      : `<p class="hint">Sin productos recomendados para esta visita.</p>`;

    // Se escapa primero y solo despues se convierten los saltos de linea en <br>, para que el
    // texto del asesor nunca se interprete como HTML pero si conserve sus parrafos.
    const notasHtml = notasAdicionales && notasAdicionales.trim()
      ? esc(notasAdicionales.trim()).replace(/\n/g, "<br>")
      : "Sin observaciones adicionales.";

    const asesor = (typeof CONFIG !== "undefined" && CONFIG.ASESOR) || {};

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Informe de Visita - ${esc(D.cliente)}</title>
<style>
/* ===========================================================================
   SISTEMA DE DISEÑO DEL INFORME
   Cada color tiene un rol: si un color no tiene rol, no entra aquí.
   Los tamaños salen de una escala (no se inventan valores sueltos como 14.5px)
   y todos los espacios son múltiplos de 4. Eso es lo que da el "ritmo" que se
   percibe como profesional. Para cambiar la identidad del informe se tocan
   estas variables y nada más.
   =========================================================================== */
:root{
  /* Marca: tomada del logo de Galagro */
  --marca:#00783c;         /* verde del logo */
  --marca-honda:#004f28;   /* verde profundo: encabezado y títulos */
  --marca-tenue:#eef5f0;   /* tinte de fondo */

  /* Neutros (el negro del logo es cálido, no azulado) */
  --tinta:#1a1614;
  --tinta-media:#5d5751;
  --tinta-suave:#8b847d;
  --linea:#e5e1db;
  --papel:#ffffff;
  --papel-suave:#faf8f5;

  /* Semánticos: solo significan, nunca decoran */
  --alerta:#a52a1f;
  --alerta-fondo:#fbeeec;

  /* Escala tipográfica */
  --t-micro:11px; --t-peq:13px; --t-base:15px; --t-med:18px; --t-gde:24px; --t-xl:30px;

  /* Escala de espaciado (múltiplos de 4) */
  --e1:4px; --e2:8px; --e3:12px; --e4:16px; --e6:24px; --e8:32px; --e12:48px;

  --radio:3px;
  --serif:Georgia,"Times New Roman",serif;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
}
*{box-sizing:border-box;}
html,body{background:var(--papel);}
body{font-family:var(--sans);font-size:var(--t-base);line-height:1.55;max-width:900px;margin:0 auto;padding:var(--e8) var(--e6) var(--e12);color:var(--tinta);}

/* --- Encabezado: banda de marca --- */
/* Dos columnas independientes (la visita a la izquierda, el asesor a la derecha), cada una con
   su propio contenido de arriba hacia abajo. Comparten el mismo fondo, así quedan al mismo nivel
   sin tener que acomodar todo en una sola línea de texto. */
header{background:var(--marca-honda);color:var(--papel);padding:var(--e6);margin-bottom:var(--e6);
  display:grid;grid-template-columns:1fr auto;gap:var(--e6);align-items:start;}
.enc-visita{min-width:0;}
.enc-marca{display:flex;align-items:center;gap:var(--e4);margin-bottom:var(--e4);}
.logo{height:48px;width:auto;background:var(--papel);padding:var(--e2);}
header h1{margin:0;font-family:var(--serif);font-size:var(--t-gde);font-weight:400;letter-spacing:.3px;color:var(--papel);line-height:1.2;}
.enc-datos{margin:0;display:grid;grid-template-columns:auto 1fr;gap:2px var(--e3);font-size:var(--t-base);}
.enc-datos dt{color:#b9d6c5;font-size:var(--t-peq);}
.enc-datos dd{margin:0;color:var(--papel);font-weight:600;}
.enc-asesor{border-left:1px solid rgba(255,255,255,.25);padding-left:var(--e6);min-width:0;}
.enc-rotulo{display:block;font-size:var(--t-micro);text-transform:uppercase;letter-spacing:1.2px;color:#b9d6c5;margin-bottom:var(--e2);}
.asesor-nombre{font-family:var(--serif);font-size:var(--t-med);color:var(--papel);line-height:1.3;}
.asesor-detalle{margin-top:var(--e1);font-size:var(--t-peq);color:#d6e8dd;line-height:1.6;}

/* --- Datos de la visita: celdas separadas al mismo nivel, sobre una misma franja --- */
.datos-grid{display:grid;grid-template-columns:1fr 2fr;margin-bottom:var(--e6);
  background:var(--papel-suave);border-bottom:1px solid var(--linea);}
.datos-grid>div{display:grid;grid-template-columns:auto 1fr;gap:0 var(--e3);align-items:start;padding:var(--e3) var(--e4);}
.datos-grid>div+div{border-left:1px solid var(--linea);}
.datos-grid .icono{grid-row:span 2;width:24px;height:24px;color:var(--marca);padding-top:2px;}
.datos-grid .icono svg{width:20px;height:20px;display:block;}
.datos-grid .etiqueta{color:var(--tinta-suave);font-size:var(--t-micro);text-transform:uppercase;letter-spacing:1px;}
.datos-grid .valor{color:var(--tinta);font-weight:600;}

/* --- Títulos de sección: serif + regla de marca (lenguaje de documento, no de plantilla) --- */
h2{font-family:var(--serif);font-size:var(--t-gde);font-weight:400;color:var(--marca-honda);
  margin:var(--e8) 0 var(--e3);padding-bottom:var(--e1);border-bottom:2px solid var(--marca);}
h2:first-of-type{margin-top:var(--e6);}
h3{font-family:var(--serif);font-size:var(--t-med);font-weight:400;color:var(--tinta);margin:var(--e6) 0 var(--e2);}
.rotulo{display:block;font-size:var(--t-micro);text-transform:uppercase;letter-spacing:1.2px;color:var(--marca);margin-bottom:var(--e2);}

/* --- Tablas: sin cuadrícula pesada, solo líneas horizontales --- */
table{width:100%;border-collapse:collapse;font-size:var(--t-peq);margin-top:var(--e2);}
th,td{text-align:right;padding:var(--e2) var(--e2);border-bottom:1px solid var(--linea);}
th{color:var(--tinta-suave);font-weight:600;font-size:var(--t-micro);text-transform:uppercase;letter-spacing:.6px;
  border-bottom:1px solid var(--tinta);text-align:right;}
td:first-child,th:first-child{text-align:left;padding-left:0;}
td:last-child,th:last-child{padding-right:0;}
tbody tr:nth-child(even) td{background:var(--papel-suave);}
td.alerta{color:var(--alerta);font-weight:700;}
.fila-promedio td{font-weight:700;border-top:2px solid var(--marca);background:var(--marca-tenue) !important;}

/* --- Bloque por lote: barras y anillo lado a lado --- */
/* --- Indicadores de productividad: tarjetas destacadas --- */
.kpi-bloque{margin-bottom:var(--e4);}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--e3);}
.kpi{background:var(--marca-honda);color:var(--papel);padding:var(--e3) var(--e4);display:flex;flex-direction:column;}
.kpi:first-child{background:var(--marca);}
.kpi-num{font-family:var(--serif);font-size:var(--t-xl);line-height:1.1;}
.kpi-unidad{font-size:var(--t-micro);color:#cfe6d8;letter-spacing:.3px;}
.kpi-nombre{font-size:var(--t-peq);font-weight:600;margin-top:var(--e2);}
.kpi-base{font-size:var(--t-peq);color:var(--tinta-media);margin:var(--e2) 0 0;}

/* Dos lotes por fila: cada bloque ocupa media página, así las barras no quedan estiradas. */
.lotes-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--e4);}
.lote-bloque{border:1px solid var(--linea);padding:var(--e3) var(--e4);min-width:0;}
.lote-bloque h3{margin:0 0 var(--e2);font-size:var(--t-base);}
.lote-fila{display:grid;grid-template-columns:1fr 104px;gap:var(--e3);align-items:start;}
.panel-barras,.panel-anillo{min-width:0;}
.panel-anillo{text-align:center;}
.lote-bloque-promedio{background:var(--marca-tenue);border-color:var(--marca);}
.nota-puntos{font-size:var(--t-micro);color:var(--tinta-suave);margin:var(--e2) 0 0;line-height:1.4;}

/* --- Barras horizontales contra umbral (bullet chart) --- */
.bullet-lista{list-style:none;padding:0;margin:0;}
.bullet-fila{margin-bottom:var(--e2);}
.bullet-cab{display:flex;justify-content:space-between;align-items:baseline;gap:var(--e2);margin-bottom:var(--e1);}
.bullet-nombre{font-size:var(--t-micro);color:var(--tinta-media);}
.bullet-valor{font-size:var(--t-peq);font-weight:700;color:var(--tinta);font-variant-numeric:tabular-nums;}
.bullet-valor.sobre{color:var(--alerta);}
.bullet-pista{position:relative;height:8px;background:var(--papel-suave);border:1px solid var(--linea);}
.bullet-relleno{position:absolute;top:0;bottom:0;left:0;background:var(--marca);}
.bullet-relleno.sobre{background:var(--alerta);}
.bullet-dispersion{position:absolute;top:50%;height:1px;background:var(--tinta);opacity:.55;}
.bullet-dispersion::before,.bullet-dispersion::after{content:"";position:absolute;top:-3px;width:1px;height:7px;background:var(--tinta);}
.bullet-dispersion::before{left:0;} .bullet-dispersion::after{right:0;}
.bullet-umbral{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--tinta);}
.bullet-pie{font-size:10px;color:var(--tinta-suave);margin-top:1px;}

/* --- Anillo de composición --- */
.anillo{width:100%;max-width:104px;height:auto;display:block;margin:0 auto;}
.anillo-num{font-family:var(--serif);font-size:19px;fill:var(--marca-honda);}
.anillo-lbl{font-size:6.5px;fill:var(--tinta-suave);text-transform:uppercase;letter-spacing:.6px;}
.torta-legend{list-style:none;padding:0;margin:var(--e1) 0 0;font-size:10px;line-height:1.3;color:var(--tinta-media);text-align:left;}
.torta-legend li{display:flex;align-items:center;gap:var(--e1);margin:3px 0;justify-content:space-between;}
.torta-legend li span:first-child{display:flex;align-items:center;gap:var(--e1);}
.leg-swatch{width:8px;height:8px;display:inline-block;flex:0 0 auto;}

/* --- Historial --- */
.historial-fila{display:flex;gap:var(--e4);flex-wrap:wrap;}
.historial-item{flex:1;min-width:280px;margin-top:var(--e3);}
.chart-box{margin-top:var(--e2);}
.chart-box canvas{max-width:100%;height:auto;}

/* --- Manejo agronómico --- */
.manejo-box{background:var(--papel-suave);border-left:3px solid var(--marca);padding:var(--e3) var(--e4);
  font-size:var(--t-peq);color:var(--tinta-media);margin-bottom:var(--e3);}
.manejo-box strong{color:var(--tinta);display:block;margin-bottom:var(--e2);font-size:var(--t-peq);}
.manejo-subtitulo{display:block;font-size:var(--t-micro);font-weight:700;color:var(--marca);text-transform:uppercase;letter-spacing:1px;margin:var(--e3) 0 var(--e1);}
.manejo-lista{list-style:none;padding:0;margin:0;}
.manejo-lista li{margin:var(--e1) 0;color:var(--tinta);}
.manejo-columnas{display:grid;grid-template-columns:1fr 1fr;gap:var(--e2) var(--e6);margin-bottom:var(--e2);color:var(--tinta);}
.manejo-etiqueta{display:block;font-size:var(--t-micro);color:var(--tinta-suave);text-transform:uppercase;letter-spacing:1px;}

/* --- Recomendaciones --- */
.reco-lista{list-style:none;counter-reset:reco;padding:0;margin:0 0 var(--e6);}
.reco-lista li{counter-increment:reco;position:relative;padding:var(--e3) 0 var(--e3) var(--e8);border-bottom:1px solid var(--linea);}
.reco-lista li:first-child{border-top:1px solid var(--linea);}
.reco-lista li::before{content:counter(reco);position:absolute;left:0;top:var(--e3);
  font-family:var(--serif);color:var(--marca);font-size:var(--t-med);}
.reco-texto strong{font-size:var(--t-base);color:var(--tinta);}
.reco-detalle{color:var(--tinta-suave);font-size:var(--t-peq);}
.reco-dosis{margin-top:var(--e1);font-size:var(--t-peq);color:var(--marca-honda);}

/* --- Bloques de texto --- */
select{padding:var(--e1) var(--e2);border-radius:var(--radio);border:1px solid var(--linea);font-size:var(--t-peq);font-family:var(--sans);}
textarea{width:100%;min-height:72px;border:1px solid var(--linea);border-radius:var(--radio);padding:var(--e3);
  font-family:var(--sans);font-size:var(--t-peq);color:var(--tinta);background:var(--papel-suave);}
.caja-fija{white-space:pre-wrap;border-left:3px solid var(--linea);padding:var(--e2) var(--e4);font-size:var(--t-peq);
  min-height:32px;color:var(--tinta-media);}
.firma{margin-top:var(--e12);font-size:var(--t-peq);color:var(--tinta-media);border-top:1px solid var(--linea);padding-top:var(--e3);}
.hint{font-size:var(--t-peq);color:var(--tinta-suave);}
footer{margin-top:var(--e8);font-size:var(--t-micro);color:var(--tinta-suave);text-align:center;letter-spacing:.3px;}
.tabla-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}

@media (max-width:640px){
  body{padding:var(--e4) var(--e4) var(--e8);}
  header{padding:var(--e4);}
  header h1{font-size:var(--t-med);}
  .logo{height:40px;}
  h2{font-size:var(--t-med);margin-top:var(--e8);}
  .lotes-grid{grid-template-columns:1fr;}
  header{grid-template-columns:1fr;}
  .enc-asesor{border-left:none;border-top:1px solid rgba(255,255,255,.25);padding-left:0;padding-top:var(--e4);}
  .datos-grid{grid-template-columns:1fr;}
  .datos-grid>div+div{border-left:none;border-top:1px solid var(--linea);}
  .kpi-grid{grid-template-columns:1fr;}
  .manejo-columnas{grid-template-columns:1fr;}
}
</style></head>
<body>

<header>
  <div class="enc-visita">
    <div class="enc-marca">
      <img src="${LOGO_DATA_URI}" alt="Galagro" class="logo">
      <h1>Informe de Visita Técnica</h1>
    </div>
    <dl class="enc-datos">
      <dt>Cliente:</dt><dd>${esc(D.cliente)}</dd>
      <dt>Finca:</dt><dd>${esc(D.finca)}</dd>
      <dt>Visita No:</dt><dd>${esc(D.visita_numero)}</dd>
    </dl>
  </div>
  ${asesor.nombre ? `<div class="enc-asesor">
    <span class="enc-rotulo">Asesor técnico</span>
    <div class="asesor-nombre">${esc(asesor.nombre)}</div>
    <div class="asesor-detalle">
      ${asesor.profesion ? `${esc(asesor.profesion)}<br>` : ""}
      ${asesor.cargo ? `${esc(asesor.cargo)}<br>` : ""}
      ${asesor.telefono ? `Tel: ${esc(asesor.telefono)}` : ""}
    </div>
  </div>` : ""}
</header>

<div class="datos-grid">
  <div><span class="icono">${ICONO_CALENDARIO}</span><span class="etiqueta">Fecha de visita</span><span class="valor">${esc(D.fecha)}</span></div>
  <div><span class="icono">${ICONO_LOTES}</span><span class="etiqueta">Lotes revisados</span><span class="valor">${D.lotes_reales.map((l) => {
    const t = D.tabla_lotes.find((x) => x.lote === l);
    return t && t.potrero ? `Lote ${esc(l)} (Potrero ${esc(t.potrero)})` : `Lote ${esc(l)}`;
  }).join(", ")}</span></div>
</div>

<h2 class="banner-naranja">Indicadores de productividad</h2>
${productividadHtml}

<h2 class="banner-azul">Manejo agronómico aplicado</h2>
${manejoTodosHtml || '<p class="hint">Sin manejo agronómico registrado en esta visita.</p>'}

<h2>Tabla de resultados por lote</h2>
<div class="tabla-scroll">
<table><thead><tr>
<th>Lote</th><th>Incid. Collaria</th><th>Sev. Collaria</th><th>Incid. hongos</th><th>Sev. hongos</th>
<th>Adultos</th><th>Ninfas</th><th>Loritos</th><th>Lepidópteros</th>
<th>Daño moluscos</th><th>Daño collaria</th><th>Daño hongos</th><th>Pasto sano</th>
</tr></thead><tbody>${filasTabla}</tbody></table>
</div>

<h2 class="banner-amarillo">Plagas y estado por lote (vs. umbral)</h2>
<p class="hint">La marca negra en cada barra es el umbral; en rojo, lo que lo supera. La línea fina muestra la dispersión entre puntos de muestreo.</p>
<div class="lotes-grid">${porLoteHtml}</div>

<h2 class="banner-naranja">Historial de la variable (evolucion por visita)</h2>
<div style="margin:10px 0;"><label style="font-size:13px;color:var(--gris);">Variable: </label>
<select id="varSelect">${opcionesVariable}</select></div>
${historialCanvasHtml}

<h2 class="banner-azul">Observaciones</h2>
<textarea>${observacionesTexto}</textarea>

<h2>Resultados</h2>
<div class="caja-fija">${resultadosHtml}</div>

<h2 class="banner-azul">Recomendaciones</h2>
${productosRecomendadosHtml}

<h3>Observaciones adicionales</h3>
<div class="caja-fija">${notasHtml}</div>

<div class="firma">
  ${asesor.nombre || ""}${asesor.profesion ? " — " + asesor.profesion : ""}${asesor.cargo ? " — " + asesor.cargo : ""}
</div>

<footer>Informe generado automáticamente a partir del registro de visitas técnicas.</footer>

<script>
// Único dibujo en canvas que queda: el historial, que sí es una serie de tiempo.
// Las barras por lote y el anillo ahora son HTML y SVG: nítidos en cualquier pantalla,
// sin depender de la resolución del dispositivo.
const COLORES = ${JSON.stringify(COLORES_LOTE)};
const historial = ${JSON.stringify(D.historial)};
const umbralesHistorial = ${JSON.stringify(D.umbrales_historial)};
const lotesFinca = ${JSON.stringify(D.lotes_finca.map(String))};

const FUENTE_GRAFICA = 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif';
const TINTA = { ejes:"#d8d3cc", grilla:"#f1ede7", texto:"#8b847d", titulo:"#004f28", umbral:"#a52a1f" };

// Ajusta el canvas a la densidad real de la pantalla (un celular suele ser 2x o 3x): sin esto el
// navegador estira un dibujo de baja resolución y se ve borroso al lado del texto.
function prepararCanvas(canvas) {
  if (!canvas.dataset.anchoLogico) {
    canvas.dataset.anchoLogico = canvas.width;
    canvas.dataset.altoLogico = canvas.height;
  }
  const w = Number(canvas.dataset.anchoLogico);
  const h = Number(canvas.dataset.altoLogico);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

// Eje Y con números redondos, ajustado al tamaño real de los datos (no fijo hasta 100%).
function calcularEscalaEjeY(maxCrudo, esPorcentaje) {
  if (!(maxCrudo > 0)) maxCrudo = esPorcentaje ? 0.05 : 1;
  const acolchado = maxCrudo * 1.3;
  if (esPorcentaje) {
    const listaPct = [5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100];
    const objetivoPct = Math.min(acolchado * 100, 100);
    const maxPct = listaPct.find((v) => v >= objetivoPct) || 100;
    return { max: maxPct / 100, paso: maxPct / 5 / 100, numTicks: 5 };
  }
  const escalado = acolchado / 5;
  const exp = Math.floor(Math.log10(escalado));
  const base = Math.pow(10, exp);
  const frac = escalado / base;
  const pasoFrac = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  const paso = pasoFrac * base;
  const max = Math.ceil(acolchado / paso) * paso;
  return { max, paso, numTicks: Math.round(max / paso) };
}

// Línea de evolución por visita. Una serie de tiempo se lee como línea: muestra la tendencia
// (subiendo o bajando), que es justo lo que se quiere saber entre una visita y la siguiente.
function drawLineChart(canvasId, etiquetas, valores, umbral, opciones) {
  opciones = opciones || {};
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const { ctx, w, h } = prepararCanvas(canvas);
  const padL = 44, padR = 14, padT = 16, padB = 40;

  let maxVal = 0;
  valores.forEach((v) => { if (v != null && v > maxVal) maxVal = v; });
  if (umbral != null && umbral > maxVal) maxVal = umbral;
  const escala = calcularEscalaEjeY(maxVal, !!opciones.pct);
  maxVal = escala.max;

  const x = (i) => padL + (valores.length <= 1 ? (w - padL - padR) / 2 : (i * (w - padL - padR)) / (valores.length - 1));
  const y = (v) => h - padB - (v / maxVal) * (h - padT - padB);
  const fmtTick = (val) => opciones.pct ? Math.round(val * 100) + "%"
    : (Number.isInteger(Math.round(val * 10) / 10) ? String(Math.round(val * 10) / 10) : (Math.round(val * 10) / 10).toFixed(1));

  ctx.font = "11px " + FUENTE_GRAFICA;
  ctx.textAlign = "right";
  for (let i = 0; i <= escala.numTicks; i++) {
    const val = escala.paso * i;
    ctx.strokeStyle = TINTA.grilla; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y(val)); ctx.lineTo(w - padR, y(val)); ctx.stroke();
    ctx.fillStyle = TINTA.texto; ctx.fillText(fmtTick(val), padL - 7, y(val) + 4);
  }

  ctx.strokeStyle = TINTA.ejes; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, h - padB); ctx.lineTo(w - padR, h - padB); ctx.stroke();

  if (umbral != null) {
    ctx.strokeStyle = TINTA.umbral; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(padL, y(umbral)); ctx.lineTo(w - padR, y(umbral)); ctx.stroke();
    ctx.setLineDash([]);
  }

  const color = opciones.color || COLORES[0];
  const puntos = valores.map((v, i) => (v == null ? null : { x: x(i), y: y(v) })).filter(Boolean);
  if (puntos.length > 1) {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = "round";
    ctx.beginPath(); puntos.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
  }
  puntos.forEach((p) => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff"; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  });

  ctx.fillStyle = TINTA.texto; ctx.font = "10.5px " + FUENTE_GRAFICA; ctx.textAlign = "center";
  etiquetas.forEach((et, i) => { ctx.fillText(et, x(i), h - padB + 15); });
  if (opciones.titulo) {
    ctx.fillStyle = TINTA.titulo; ctx.font = "600 10.5px " + FUENTE_GRAFICA;
    ctx.fillText(opciones.titulo, padL + (w - padL - padR) / 2, h - 6);
  }
}

const varSelect = document.getElementById("varSelect");
function redrawHistorial() {
  const v = varSelect.value;
  const h = historial[v];
  const umbralVal = umbralesHistorial[v];
  const esPorcentaje = v.indexOf("(%)") !== -1;
  lotesFinca.forEach((lote, i) => {
    drawLineChart("historialLote" + lote, h.fechas, h.lotes[lote], umbralVal, {
      pct: esPorcentaje, color: COLORES[i % COLORES.length], titulo: "Fecha de la visita",
    });
  });
}
varSelect.addEventListener("change", redrawHistorial);
redrawHistorial();
</script>
</body></html>`;
  },

  async generar(cliente, finca, fecha, productosRecomendados, notasAdicionales, manejoFumigacion = {}) {
    const D = await this.calcularDatos(cliente, finca, fecha);
    return this.generarHtml(D, productosRecomendados, notasAdicionales, manejoFumigacion);
  },
};
