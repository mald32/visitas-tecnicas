// ÚNICO lugar donde se define cómo está organizado el Excel.
//
// La app ya no depende del ORDEN de las columnas sino de su TÍTULO. Antes, la posición de cada
// columna estaba escrita como número (fila[18] era el Potrero) y, cuando se agregaron las columnas
// de zona y los ponderados, todo se corrió: la app habría escrito el manejo encima de las columnas
// de hongos. Ahora, al leer o escribir una tabla, se consultan los títulos reales de su primera
// fila y cada dato va a la columna que se llama como corresponde, esté donde esté.
//
// Por dentro, la app sigue trabajando con su propio orden fijo (los números de abajo). Ese orden
// es el mismo de siempre para los datos viejos, para que los puntos que ya estaban pendientes en
// el celular sigan sirviendo después de la actualización. La traducción entre ese orden y las
// columnas reales del Excel se hace solo en graph.js, al entrar y al salir.

const ESQUEMA = {
  // Hoja "Base de datos" (tabla TablaBaseDatos): una fila por punto de muestreo.
  // Del 0 al 23 es el orden viejo (no cambiarlo: hay puntos guardados así en los celulares);
  // lo nuevo del muestreo por zonas va del 24 en adelante.
  BASE: {
    cliente: 0, finca: 1, fecha: 2, lote: 3, punto: 4,
    adultos: 5, ninfas: 6, incidColl: 7, sevColl: 8, danoCollTotal: 9,
    loritos: 10, lepidopteros: 11, hojasMoluscos: 12, incidMoluscos: 13, danoMoluscos: 14,
    incidHongos: 15, sevHongos: 16, danoHongos: 17, potrero: 18, observaciones: 19,
    tipoFumigacion: 20, litrosMezclaHa: 21, ordenMezclaCorrecto: 22, phFinalMezcla: 23,
    areaPotrero: 24, zona: 25, areaZona: 26, pctZona: 27, pctPunto: 28,
  },

  // Tablas Productos_Aplicados y Productos_Recomendados (mismos encabezados).
  PRODUCTOS_APLICADOS: { cliente: 0, finca: 1, fecha: 2, lote: 3, producto: 4, tipo: 5, formulacion: 6, unidad: 7, dosis: 8 },
  PRODUCTOS_RECOMENDADOS: { cliente: 0, finca: 1, fecha: 2, lote: 3, producto: 4, tipo: 5, formulacion: 6, unidad: 7, dosis: 8 },

  // Tabla Productividad_Fincas.
  PRODUCTIVIDAD: {
    cliente: 0, finca: 1, fecha: 2, lote: 3, area: 4, animales: 5, dias: 6, produccion: 7,
    cargaAnimal: 8, areaDiaria: 9, productividadLecheria: 10,
  },

  // Tabla Observaciones_Lotes: una fila por lote de cada visita (lo que se escribe al terminar el lote).
  OBSERVACIONES_LOTES: { cliente: 0, finca: 1, fecha: 2, lote: 3, potrero: 4, observaciones: 5 },

  // Tabla Informes_Generados: una fila por visita a la que se le generó informe (con lo que se
  // escribió en Recomendaciones además de los productos). Es lo que alimenta el Historial.
  INFORMES_GENERADOS: { cliente: 0, finca: 1, fecha: 2, fechaInforme: 3, tipoFumigacion: 4, volumenMezcla: 5, notas: 6 },

  // Tabla Recomendaciones_Cliente: la recomendación del informe por fincas (una fila por producto;
  // el tipo de fumigación, el volumen y la nota general se repiten en cada fila del mismo informe).
  RECOMENDACIONES_CLIENTE: {
    cliente: 0, fechaInforme: 1, producto: 2, tipo: 3, formulacion: 4, unidad: 5, dosis: 6,
    tipoFumigacion: 7, volumenMezcla: 8, nota: 9,
  },

  // Hoja Visitas (tabla Visitas): una fila por visita. La leerá el agente del asesor para decir a
  // quién hace rato no visita. Lotes, puntos y días desde la visita son fórmulas del Excel.
  VISITAS: { cliente: 0, finca: 1, fecha: 2 },

  // Catálogo de la hoja Productos (tabla Tabla2).
  PRODUCTOS: { nombre: 0, tipo: 1, formulacion: 2, siglas: 3, orden: 4, unidad: 5 },

  // Título de la columna del Excel donde vive cada dato (o una lista de nombres aceptados; el
  // primero es el actual). Al comparar no importan mayúsculas, tildes, la ñ ni los espacios de más
  // ("Daño" y "Dano" son la misma columna), para que corregir un título en el Excel no rompa la app.
  // Un dato que no aparece aquí no tiene columna propia en el Excel (se calcula al leer).
  TITULOS: {
    BASE: {
      cliente: "Cliente", finca: "Finca", fecha: "Fecha visita", lote: "Lote", potrero: "Potrero",
      areaPotrero: "Area del Potrero", zona: "Zona", areaZona: "Area de la zona",
      // El 24/09/2026 se renombraron "Porcentaje de la zona/del punto" a "Peso de cada zona/punto".
      // Se aceptan los dos nombres para que un cambio de nombre no vuelva a trabar la subida.
      pctZona: ["Peso de cada zona", "Porcentaje de la zona"], pctPunto: ["Peso de cada punto", "Porcentaje del punto"],
      punto: "Punto de muestreo",
      adultos: "Collaria Adultos", ninfas: "Collaria Ninfas",
      incidColl: "Incidencia Daño Collaria (% de hojas)", sevColl: "Severidad del Daño Collaria (% de la hoja)",
      loritos: "Numero de Loritos", lepidopteros: "Numero de larvas de Lepidopteros",
      hojasMoluscos: "Hojas Atacadas por Moluscos (#)", incidMoluscos: "Incidencia Daño Moluscos (% de hojas)",
      incidHongos: "Incidencia de Mancha Fungicas (% de hojas)", sevHongos: "Severidad Manchas Fungicas (% de la hoja)",
      observaciones: "Observaciones", tipoFumigacion: "Tipo de Fumigacion", litrosMezclaHa: "Litros de Mezcla/ha",
      ordenMezclaCorrecto: "Orden de Mezcla Correcto?", phFinalMezcla: "pH Final de la Mezcla",
    },
    PRODUCTOS_APLICADOS: {
      cliente: "Cliente", finca: "Finca", fecha: "Fecha", lote: "Lote", producto: "Producto",
      tipo: "Tipo", formulacion: "Formulacion", unidad: "Unidad", dosis: "Dosis",
    },
    PRODUCTOS_RECOMENDADOS: {
      cliente: "Cliente", finca: "Finca", fecha: "Fecha", lote: "Lote", producto: "Producto",
      tipo: "Tipo", formulacion: "Formulacion", unidad: "Unidad", dosis: "Dosis",
    },
    PRODUCTIVIDAD: {
      cliente: "Cliente", finca: "Finca", fecha: "Fecha de Muestreo", lote: "Lote",
      area: "Area del Lote (Hectareas)", animales: "Animales en Ordeño", dias: "Dias de Rotación",
      produccion: "Producción Diaria de Leche (L/vaca*dia)", cargaAnimal: "Carga Animal (Animales/hectarea)",
      areaDiaria: "Area Diaria por Animal (m2/vaca*dia)", productividadLecheria: "Productividad de la Lecheria (Leche/ha*dia)",
    },
    OBSERVACIONES_LOTES: {
      cliente: "Cliente", finca: "Finca", fecha: "Fecha visita", lote: "Lote", potrero: "Potrero", observaciones: "Observaciones",
    },
    INFORMES_GENERADOS: {
      cliente: "Cliente", finca: "Finca", fecha: "Fecha visita", fechaInforme: "Fecha informe",
      tipoFumigacion: "Tipo de fumigacion", volumenMezcla: "Volumen de mezcla", notas: "Observaciones adicionales",
    },
    RECOMENDACIONES_CLIENTE: {
      cliente: "Cliente", fechaInforme: "Fecha informe", producto: "Producto", tipo: "Tipo", formulacion: "Formulacion",
      unidad: "Unidad", dosis: "Dosis", tipoFumigacion: "Tipo de fumigacion", volumenMezcla: "Volumen de mezcla", nota: "Nota general",
    },
    PRODUCTOS: { nombre: "Nombre", tipo: "Tipo", formulacion: "Formulacion", siglas: "Siglas", orden: "Orden", unidad: "Unidad" },
    VISITAS: { cliente: "Cliente", finca: "Finca", fecha: "Fecha visita" },
  },

  // Columnas que en el Excel son fórmulas: se leen, pero nunca se escriben (se mandan vacías para
  // que la propia tabla las calcule). En "Base de datos" también son fórmula el porcentaje del
  // punto, todos los "(Pond)", los "Daño Pasturas" y la suma de pesos: esas la app ni las lee ni
  // las escribe, porque el informe los calcula con los datos crudos (ver completarFilaBase).
  CALCULADAS: {
    BASE: ["incidMoluscos", "pctPunto"],
    PRODUCTIVIDAD: ["cargaAnimal", "areaDiaria", "productividadLecheria"],
    PRODUCTOS: ["orden"],
  },

  // Lo que se escribe cuando un dato no viene. Los puntos capturados antes del muestreo por zonas
  // (o con la app vieja) son una sola zona que ocupa todo el potrero: sin esto, el porcentaje del
  // punto en el Excel daría 0 y el punto no pesaría nada.
  POR_DEFECTO: {
    BASE: { zona: 1, pctZona: 1 },
  },
};

function normalizarTitulo(texto) {
  return String(texto == null ? "" : texto)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

// Nombre con que se muestra la columna de un dato en los avisos (el actual, si tiene varios).
function tituloDe(clave, dato) {
  return [].concat((ESQUEMA.TITULOS[clave] || {})[dato])[0];
}

// Para cada dato de la app, en qué posición está su columna en el Excel real (según los títulos).
function posicionesEnExcel(clave, titulosExcel) {
  const indice = new Map((titulosExcel || []).map((t, i) => [normalizarTitulo(t), i]));
  const posiciones = {};
  for (const [dato, titulos] of Object.entries(ESQUEMA.TITULOS[clave] || {})) {
    for (const titulo of [].concat(titulos)) {
      const i = indice.get(normalizarTitulo(titulo));
      if (i !== undefined) { posiciones[dato] = i; break; }
    }
  }
  return posiciones;
}

// Títulos que la app necesita para escribir en esa tabla y que no están en el Excel. Si falta uno,
// no se sube nada a esa tabla (queda pendiente en el celular): antes de escribir un dato en la
// columna equivocada o perderlo, mejor esperar a que se corrija el Excel.
function columnasFaltantes(clave, titulosExcel) {
  const posiciones = posicionesEnExcel(clave, titulosExcel);
  const calculadas = new Set(ESQUEMA.CALCULADAS[clave] || []);
  return Object.entries(ESQUEMA.TITULOS[clave] || {})
    .filter(([dato]) => !calculadas.has(dato) && posiciones[dato] === undefined)
    .map(([dato]) => tituloDe(clave, dato));
}

// Fila tal como viene del Excel → fila en el orden interno de la app.
function filaDesdeExcel(clave, titulosExcel, filaExcel, posiciones = posicionesEnExcel(clave, titulosExcel)) {
  const orden = ESQUEMA[clave];
  const fila = new Array(Math.max(...Object.values(orden)) + 1).fill(null);
  for (const [dato, i] of Object.entries(posiciones)) fila[orden[dato]] = filaExcel[i];
  return fila;
}

// Fila en el orden interno de la app → fila con las columnas del Excel real. Las columnas que la
// app no conoce (fórmulas, ponderados, abonos...) van vacías para que el Excel las calcule o
// queden para llenar a mano.
function filaHaciaExcel(clave, titulosExcel, fila, nombreTabla = clave) {
  const faltan = columnasFaltantes(clave, titulosExcel);
  if (faltan.length > 0) {
    throw new Error(`En la tabla ${nombreTabla} del Excel no encuentro la(s) columna(s): ${faltan.map((t) => `"${t}"`).join(", ")}. Revisa los títulos.`);
  }
  const orden = ESQUEMA[clave];
  const calculadas = new Set(ESQUEMA.CALCULADAS[clave] || []);
  const porDefecto = ESQUEMA.POR_DEFECTO[clave] || {};
  const salida = new Array(titulosExcel.length).fill(null);
  for (const [dato, i] of Object.entries(posicionesEnExcel(clave, titulosExcel))) {
    if (calculadas.has(dato)) continue;
    let valor = fila[orden[dato]];
    if ((valor === undefined || valor === null || valor === "") && dato in porDefecto) valor = porDefecto[dato];
    salida[i] = valor === undefined ? null : valor;
  }
  return salida;
}

// Los daños por punto (Collaria, moluscos, hongos) ya no tienen columna propia en el Excel: allá
// solo están ponderados ("Daño Pasturas ..."), que no sirven para ver un punto solo. Se calculan
// aquí con los datos crudos, con las mismas fórmulas de siempre.
function completarFilaBase(fila, parametros = {}) {
  const B = ESQUEMA.BASE;
  const vacio = (v) => v === null || v === undefined || v === "";
  const n = (v) => Number(v) || 0;
  const hojas = n(parametros.hojasEvaluadas) || 10;
  const severidadMoluscos = parametros.severidadMoluscos == null ? 0.1 : n(parametros.severidadMoluscos);
  const f = [...fila];
  if (vacio(f[B.danoCollTotal])) f[B.danoCollTotal] = n(f[B.incidColl]) * n(f[B.sevColl]);
  if (vacio(f[B.incidMoluscos])) f[B.incidMoluscos] = n(f[B.hojasMoluscos]) / hojas;
  if (vacio(f[B.danoMoluscos])) f[B.danoMoluscos] = n(f[B.incidMoluscos]) * severidadMoluscos;
  if (vacio(f[B.danoHongos])) f[B.danoHongos] = n(f[B.incidHongos]) * n(f[B.sevHongos]);
  return f;
}

if (typeof module !== "undefined") {
  module.exports = { ESQUEMA, normalizarTitulo, tituloDe, posicionesEnExcel, columnasFaltantes, filaDesdeExcel, filaHaciaExcel, completarFilaBase };
}
