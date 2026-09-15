// ÚNICO lugar donde se define cómo está organizado el Excel.
//
// Antes, la posición de cada columna estaba repartida entre app.js e informes.js como números
// sueltos (fila[18], fila[9], [9,13,14,17]...). Si alguien reordenaba una columna en el Excel,
// la app escribía en la celda equivocada sin avisar. Ahora todo sale de aquí, y además se puede
// verificar contra los encabezados reales de la hoja (verificarEncabezados).

const ESQUEMA = {
  // Hoja "Base de datos" (tabla TablaBaseDatos): una fila por punto de muestreo.
  BASE: {
    cliente: 0, finca: 1, fecha: 2, lote: 3, punto: 4,
    adultos: 5, ninfas: 6, incidColl: 7, sevColl: 8, danoCollTotal: 9,
    loritos: 10, lepidopteros: 11, hojasMoluscos: 12, incidMoluscos: 13, danoMoluscos: 14,
    incidHongos: 15, sevHongos: 16, danoHongos: 17, potrero: 18, observaciones: 19,
    tipoFumigacion: 20, litrosMezclaHa: 21, ordenMezclaCorrecto: 22, phFinalMezcla: 23,
  },

  // Columnas de "Base de datos" que en el Excel son fórmulas: se suben vacías para que las
  // calcule la propia hoja (nosotros las calculamos igual en local, solo para los informes).
  BASE_CALCULADAS: ["danoCollTotal", "incidMoluscos", "danoMoluscos", "danoHongos"],

  // Tablas Productos_Aplicados y Productos_Recomendados (mismos encabezados).
  PRODUCTOS_APLICADOS: { cliente: 0, finca: 1, fecha: 2, lote: 3, producto: 4, tipo: 5, formulacion: 6, unidad: 7, dosis: 8 },
  PRODUCTOS_RECOMENDADOS: { cliente: 0, finca: 1, fecha: 2, lote: 3, producto: 4, tipo: 5, formulacion: 6, unidad: 7, dosis: 8 },

  // Tabla Productividad_Fincas.
  PRODUCTIVIDAD: {
    cliente: 0, finca: 1, fecha: 2, lote: 3, area: 4, animales: 5, dias: 6, produccion: 7,
    cargaAnimal: 8, areaDiaria: 9, productividadLecheria: 10,
  },
  PRODUCTIVIDAD_CALCULADAS: ["cargaAnimal", "areaDiaria", "productividadLecheria"],

  // Tabla Observaciones_Lotes: una fila por lote de cada visita (lo que se escribe al terminar el lote).
  OBSERVACIONES_LOTES: { cliente: 0, finca: 1, fecha: 2, lote: 3, potrero: 4, observaciones: 5 },

  // Encabezados reales de la fila 1 de "Base de datos", tal como están hoy en el Excel.
  // Sirven para detectar si algún día se reordenan o renombran columnas.
  ENCABEZADOS_BASE: [
    "Cliente", "Finca", "Fecha visita", "Lote", "Punto de muestreo",
    "Collaria Adultos", "Collaria Ninfas",
    "Incidencia Dano Collaria (% de hojas)", "Severidad del Dano Collaria (% de la hoja)",
    "Dano Collaria Total en el punto (% de dano total)",
    "Numero de Loritos", "Numero de larvas de Lepidopteros",
    "Hojas Atacadas por Moluscos (#)", "Hojas Defoliadas por Moluscos (%)", "Dano por Moluscos (%)",
    "Incidencia de Mancha Fungicas (% de la hoja)", "Severidad Manchas Fungicas (% de la hoja)",
    "Dano total por hongos (indice)", "Potrero", "Observaciones",
    "Tipo de Fumigacion", "Litros de Mezcla/ha", "Orden de Mezcla Correcto?", "pH Final de la Mezcla",
  ],
};

// Índices (no nombres) de las columnas calculadas, que es lo que se necesita al armar una fila.
ESQUEMA.INDICES_BASE_CALCULADAS = ESQUEMA.BASE_CALCULADAS.map((k) => ESQUEMA.BASE[k]);
ESQUEMA.INDICES_PRODUCTIVIDAD_CALCULADAS = ESQUEMA.PRODUCTIVIDAD_CALCULADAS.map((k) => ESQUEMA.PRODUCTIVIDAD[k]);

// Compara los encabezados reales del Excel con los que espera el código. Devuelve una lista de
// diferencias (vacía si todo coincide). No lanza error: solo sirve para avisar a tiempo.
function verificarEncabezados(encabezadosReales) {
  const esperados = ESQUEMA.ENCABEZADOS_BASE;
  const normalizar = (v) => String(v == null ? "" : v).trim().toLowerCase();
  const diferencias = [];
  esperados.forEach((esperado, i) => {
    const real = (encabezadosReales || [])[i];
    if (normalizar(real) !== normalizar(esperado)) {
      diferencias.push(`Columna ${i + 1}: el código espera "${esperado}" y en el Excel dice "${real ?? "(vacía)"}"`);
    }
  });
  return diferencias;
}

if (typeof module !== "undefined") module.exports = { ESQUEMA, verificarEncabezados };
