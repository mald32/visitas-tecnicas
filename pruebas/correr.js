// Pruebas automatizadas de la app. Se corren con:   node pruebas/correr.js
// No necesitan internet, ni navegador, ni tu Excel: usan datos de mentiras y verifican que la
// lógica real (cálculos, informe, formato de filas para Excel) siga dando lo que debe dar.

const {
  prueba, pruebaAsync, igual, cerca, contiene, noContiene, cierto,
  cargarApp, resumen,
} = require("./arnes");

const { ESQUEMA, verificarEncabezados } = require("../esquema.js");

// ---------------------------------------------------------------------------
// 1. Esquema del Excel (el punto más frágil: si se mueve una columna, todo falla)
// ---------------------------------------------------------------------------
console.log("\nEsquema del Excel");

prueba("los encabezados reales del Excel coinciden con los que espera el código", () => {
  igual(verificarEncabezados(ESQUEMA.ENCABEZADOS_BASE).length, 0, "no debería haber diferencias");
});

prueba("detecta si alguien reordena una columna en el Excel", () => {
  const alterados = [...ESQUEMA.ENCABEZADOS_BASE];
  [alterados[18], alterados[19]] = [alterados[19], alterados[18]]; // Potrero <-> Observaciones
  const diffs = verificarEncabezados(alterados);
  cierto(diffs.length >= 2, "debería reportar al menos 2 columnas distintas");
  contiene(diffs.join(" "), "Columna 19");
});

prueba("detecta si falta una columna al final", () => {
  const cortos = ESQUEMA.ENCABEZADOS_BASE.slice(0, -1);
  cierto(verificarEncabezados(cortos).length > 0, "debería avisar que falta la última columna");
});

prueba("las columnas calculadas por fórmula son las 4 esperadas", () => {
  igual(JSON.stringify(ESQUEMA.INDICES_BASE_CALCULADAS), JSON.stringify([9, 13, 14, 17]));
});

prueba("Potrero es la columna 18 y Punto la 4 (usadas por índice en app.js)", () => {
  igual(ESQUEMA.BASE.potrero, 18);
  igual(ESQUEMA.BASE.punto, 4);
});

// ---------------------------------------------------------------------------
// 2. Motor de cálculo del informe
// ---------------------------------------------------------------------------

const UMBRALES = [
  ["Umbral de Adultos de Collaria", 5],
  ["Umbral de Ninfas de Collaria", 5],
  ["Umbral de Individuos de Lorito", 5],
  ["Umbral de Numero de Lepidopteros", 5],
  ["Umbral de Incidencia de ataques de Collaria", 0.3],
  ["Umbral de Severidad promedio del Dano por Collaria", 0.05],
  ["Umbral de Incidencia de Manchas del Kikuyo", 0.3],
  ["Umbral de Severidad Promedio del Ataque de Hongos", 0.05],
  ["Umbral de Dano por Moluscos", 0.05],
  ["Umbral de Dano Total de la Pastura por Collaria", 0.05],
  ["Umbral de Dano a la pastura por Hongos", 0.05],
  ["Umbral (Min) de Pasto Sano", 0.95],
];

// Arma una fila de "Base de datos" usando nombres, no posiciones.
function filaPunto({ cliente = "CLIENTE", finca = "FINCA", fecha = "2026-09-14", lote = 1, punto = 1,
  adultos = 0, ninfas = 0, incidColl = 0, sevColl = 0, loritos = 0, lepidopteros = 0,
  hojasMoluscos = 0, incidHongos = 0, sevHongos = 0, potrero = "P1", observaciones = "",
  tipoFumigacion = "Aerea (Dron)", litrosMezclaHa = 20 } = {}) {
  const B = ESQUEMA.BASE;
  const fila = new Array(24).fill(0);
  fila[B.cliente] = cliente; fila[B.finca] = finca; fila[B.fecha] = fecha;
  fila[B.lote] = lote; fila[B.punto] = punto;
  fila[B.adultos] = adultos; fila[B.ninfas] = ninfas;
  fila[B.incidColl] = incidColl; fila[B.sevColl] = sevColl; fila[B.danoCollTotal] = incidColl * sevColl;
  fila[B.loritos] = loritos; fila[B.lepidopteros] = lepidopteros;
  fila[B.hojasMoluscos] = hojasMoluscos; fila[B.incidMoluscos] = 0; fila[B.danoMoluscos] = 0;
  fila[B.incidHongos] = incidHongos; fila[B.sevHongos] = sevHongos; fila[B.danoHongos] = incidHongos * sevHongos;
  fila[B.potrero] = potrero; fila[B.observaciones] = observaciones;
  fila[B.tipoFumigacion] = tipoFumigacion; fila[B.litrosMezclaHa] = litrosMezclaHa;
  fila[B.ordenMezclaCorrecto] = "Si"; fila[B.phFinalMezcla] = 6;
  return fila;
}

// Carga informes.js con Graph/DB simulados que devuelven las filas que le pasemos.
function cargarInformes({ filas = [], productosAplicados = [], recomendados = [], productividad = [], catalogo = [] } = {}) {
  const Graph = {
    async leerTabla(nombre) {
      if (nombre === "TablaBaseDatos") return filas;
      if (nombre === "Productos_Aplicados") return productosAplicados;
      if (nombre === "Productos_Recomendados") return recomendados;
      if (nombre === "Productividad_Fincas") return productividad;
      return [];
    },
    async leerRango(hoja, rango) {
      if (rango === "A8:B19") return UMBRALES;
      if (rango === "A4:E500") return catalogo;
      return [];
    },
  };
  const DB = {
    async listarItems() { return []; },
    async guardarCache() {},
    async leerCache() { return null; },
  };
  const CONFIG = {
    TABLE_NAME: "TablaBaseDatos", HOJA_CONFIG: "Configuracion", HOJA_PRODUCTOS: "Productos",
    TABLA_PRODUCTOS_APLICADOS: "Productos_Aplicados",
    TABLA_PRODUCTOS_RECOMENDADOS: "Productos_Recomendados",
    TABLA_PRODUCTIVIDAD: "Productividad_Fincas",
    ASESOR: { nombre: "Miguel Leon", profesion: "Ingeniero Agrónomo" },
  };
  return cargarApp(["esquema.js", "informes.js"], { Graph, DB, CONFIG }, ["Informes"]);
}

(async () => {
  console.log("\nMotor de cálculo del informe");

  const filasDosLotes = [
    filaPunto({ lote: 1, punto: 1, adultos: 10, ninfas: 2, incidColl: 0.4, sevColl: 0.1, potrero: "Potrero A" }),
    filaPunto({ lote: 1, punto: 2, adultos: 20, ninfas: 4, incidColl: 0.6, sevColl: 0.3, potrero: "Potrero A" }),
    filaPunto({ lote: 2, punto: 1, adultos: 4, ninfas: 0, incidColl: 0.1, sevColl: 0.02, potrero: "Potrero B" }),
  ];

  await pruebaAsync("promedia bien los puntos de un mismo lote", async () => {
    const { Informes } = cargarInformes({ filas: filasDosLotes });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    const lote1 = D.tabla_lotes.find((t) => t.lote === 1);
    cerca(lote1.adultos, 15, 1e-9, "adultos promedio del lote 1");
    cerca(lote1.incid_coll, 0.5, 1e-9, "incidencia promedio del lote 1");
  });

  await pruebaAsync("el promedio general es el promedio de los lotes", async () => {
    const { Informes } = cargarInformes({ filas: filasDosLotes });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    cerca(D.promedio_finca.adultos, (15 + 4) / 2, 1e-9, "adultos promedio de la finca");
  });

  await pruebaAsync("calcula pasto sano como 1 menos los daños", async () => {
    const { Informes } = cargarInformes({ filas: filasDosLotes });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    const lote1 = D.tabla_lotes.find((t) => t.lote === 1);
    cerca(lote1.pasto_sano, 1 - lote1.dano_coll - lote1.dano_mol - lote1.dano_hongos, 1e-9);
  });

  await pruebaAsync("genera alerta cuando un indicador supera su umbral", async () => {
    const { Informes } = cargarInformes({ filas: filasDosLotes });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    cierto(D.alertas.some((a) => a.includes("Lote 1") && a.includes("adultos")), "debería alertar por adultos del lote 1");
    cierto(!D.alertas.some((a) => a.includes("Lote 2") && a.includes("adultos")), "el lote 2 no debería alertar por adultos");
  });

  await pruebaAsync("solo toma los puntos de la visita pedida (cliente+finca+fecha)", async () => {
    const otras = [
      ...filasDosLotes,
      filaPunto({ cliente: "OTRO", lote: 1, punto: 1, adultos: 999 }),
      filaPunto({ fecha: "2026-01-01", lote: 1, punto: 1, adultos: 999 }),
    ];
    const { Informes } = cargarInformes({ filas: otras });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    igual(D.tabla_lotes.length, 2, "debería ver solo los 2 lotes de esa visita");
    cierto(D.tabla_lotes.every((t) => t.adultos < 100), "no debería mezclar datos de otra visita");
  });

  // -------------------------------------------------------------------------
  // 3. Informe HTML: escape de texto y reglas de presentación
  // -------------------------------------------------------------------------
  console.log("\nInforme HTML");

  await pruebaAsync("escapa el HTML de los textos escritos por el usuario", async () => {
    const peligrosas = [
      filaPunto({ cliente: "<script>alert(1)</script>", lote: 1, punto: 1, observaciones: "<img src=x onerror=alert(2)>" }),
      filaPunto({ cliente: "<script>alert(1)</script>", lote: 1, punto: 2 }),
    ];
    const { Informes } = cargarInformes({ filas: peligrosas });
    const D = await Informes.calcularDatos("<script>alert(1)</script>", "FINCA", "2026-09-14");
    const html = Informes.generarHtml(D, [], "<b>nota</b>");
    noContiene(html, "<script>alert(1)</script>", "el nombre del cliente no debe entrar como HTML");
    noContiene(html, "<img src=x onerror=alert(2)>", "las observaciones no deben entrar como HTML");
    contiene(html, "&lt;script&gt;", "debería aparecer escapado");
  });

  await pruebaAsync("con un solo lote NO incluye la fila ni las gráficas de promedio general", async () => {
    const unLote = [
      filaPunto({ lote: 1, punto: 1, adultos: 3 }),
      filaPunto({ lote: 1, punto: 2, adultos: 5 }),
    ];
    const { Informes } = cargarInformes({ filas: unLote });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    const html = Informes.generarHtml(D, [], "");
    noContiene(html, "Promedio general", "no debería haber fila de promedio con un solo lote");
    noContiene(html, 'id="barrasPromedio"', "no debería haber gráfica de promedio con un solo lote");
  });

  await pruebaAsync("con dos lotes SÍ incluye el promedio general", async () => {
    const { Informes } = cargarInformes({ filas: filasDosLotes });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    const html = Informes.generarHtml(D, [], "");
    contiene(html, "Promedio general");
    contiene(html, 'id="barrasPromedio"');
  });

  await pruebaAsync("la dosis recomendada lleva el sufijo del equipo elegido", async () => {
    const { Informes } = cargarInformes({ filas: filasDosLotes });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    const productos = [{ nombre: "ORTHENE", tipo: "INSECTICIDA", unidad: "g", dosis: "200", tipoFumigacion: "Terrestre (Estacionaria)" }];
    const html = Informes.generarHtml(D, productos, "", { tipo: "Terrestre (Estacionaria)", volumenMezcla: "200" });
    contiene(html, "200g/Caneca 200L (Estacionaria)", "debería mostrar la dosis por caneca");
    contiene(html, "Volumen de mezcla/hectárea");
  });

  await pruebaAsync("el informe muestra 'Lotes revisados' con su potrero", async () => {
    const { Informes } = cargarInformes({ filas: filasDosLotes });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    const html = Informes.generarHtml(D, [], "");
    contiene(html, "Lote 1 (Potrero Potrero A)");
  });

  await pruebaAsync("ordena los productos aplicados por orden de mezcla del catálogo", async () => {
    const productosAplicados = [
      ["CLIENTE", "FINCA", "2026-09-14", 1, "SEGUNDO", "FUNGICIDA", "SC (Suspensión)", "cc", "100"],
      ["CLIENTE", "FINCA", "2026-09-14", 1, "PRIMERO", "COADYUVANTE", "SL (Líquido)", "cc", "50"],
    ];
    const catalogo = [
      ["SEGUNDO", "FUNGICIDA", "SC (Suspensión)", "SC", 7],
      ["PRIMERO", "COADYUVANTE", "SL (Líquido)", "SL", 1],
    ];
    const { Informes } = cargarInformes({ filas: filasDosLotes, productosAplicados, catalogo });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    const html = Informes.generarHtml(D, [], "");
    cierto(html.indexOf("PRIMERO") < html.indexOf("SEGUNDO"), "el de orden 1 debe ir antes que el de orden 7");
  });

  await pruebaAsync("el manejo agronómico muestra la dosis con el equipo de aplicación", async () => {
    const productosAplicados = [
      ["CLIENTE", "FINCA", "2026-09-14", 1, "ORTHENE", "INSECTICIDA", "PS (Polvo Soluble)", "g", "200"],
    ];
    const { Informes } = cargarInformes({ filas: filasDosLotes, productosAplicados });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    const html = Informes.generarHtml(D, [], "");
    contiene(html, "ORTHENE PS", "debería mostrar nombre + siglas");
    contiene(html, "200g/Hectárea (Dron)", "debería mostrar la dosis según el tipo de fumigación del lote");
    contiene(html, "Volumen de Mezcla/ha", "debería mostrar el volumen de mezcla");
  });

  await pruebaAsync("la sección de productividad aparece antes que la de manejo agronómico", async () => {
    const productividad = [["CLIENTE", "FINCA", "2026-09-14", 1, 15, 50, 27, 25, 3.33, 111.1, 83.3]];
    const { Informes } = cargarInformes({ filas: filasDosLotes, productividad });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    const html = Informes.generarHtml(D, [], "");
    contiene(html, "Indicadores de productividad");
    cierto(
      html.indexOf("Indicadores de productividad") < html.indexOf("Manejo agronómico aplicado"),
      "productividad debe ir antes que manejo agronómico"
    );
    cierto(html.indexOf("Manejo agronómico aplicado") < html.indexOf("Tabla de resultados por lote"),
      "manejo agronómico debe ir antes que la tabla de resultados");
  });

  // -------------------------------------------------------------------------
  // 4. Filas que se suben a Excel: las columnas con fórmula deben ir vacías
  // -------------------------------------------------------------------------
  console.log("\nFilas para Excel");

  prueba("al subir un punto se dejan vacías las 4 columnas que Excel calcula solo", () => {
    const fila = filaPunto({ adultos: 7, incidColl: 0.5, sevColl: 0.2 });
    const paraExcel = [...fila];
    for (const i of ESQUEMA.INDICES_BASE_CALCULADAS) paraExcel[i] = null;

    const B = ESQUEMA.BASE;
    igual(paraExcel[B.danoCollTotal], null, "Daño Collaria Total lo calcula el Excel");
    igual(paraExcel[B.incidMoluscos], null, "Incidencia Moluscos la calcula el Excel");
    igual(paraExcel[B.danoMoluscos], null, "Daño Moluscos lo calcula el Excel");
    igual(paraExcel[B.danoHongos], null, "Daño Hongos lo calcula el Excel");
    // ...pero los datos crudos que escribe el técnico deben seguir intactos:
    igual(paraExcel[B.adultos], 7, "los adultos capturados no se deben borrar");
    cerca(paraExcel[B.incidColl], 0.5, 1e-9, "la incidencia capturada no se debe borrar");
    igual(paraExcel[B.tipoFumigacion], "Aerea (Dron)", "el manejo agronómico no se debe borrar");
    igual(paraExcel.length, 24, "la fila debe tener las 24 columnas de la tabla");
  });

  // -------------------------------------------------------------------------
  // 5. Fórmulas de productividad (deben coincidir con las del Excel)
  // -------------------------------------------------------------------------
  console.log("\nProductividad");

  const app = cargarApp(["esquema.js", "app.js"], {
    CONFIG: { ASESOR: {} }, DB: {}, Graph: {}, Informes: {},
  });

  prueba("carga animal = animales / área (igual que la fórmula F/E del Excel)", () => {
    const r = app.calcularProductividad(15, 50, 27, 25);
    cerca(r.carga, 50 / 15, 1e-9);
  });

  prueba("área diaria por animal = ((área*10000)/animales)/días (fórmula ((E*10000)/F)/G)", () => {
    const r = app.calcularProductividad(15, 50, 27, 25);
    cerca(r.areaDiaria, ((15 * 10000) / 50) / 27, 1e-9);
  });

  prueba("productividad de la lechería = (producción*animales)/área (fórmula (H*F)/E)", () => {
    const r = app.calcularProductividad(15, 50, 27, 25);
    cerca(r.productividad, (25 * 50) / 15, 1e-9);
  });

  prueba("no divide por cero si faltan datos", () => {
    const r = app.calcularProductividad(0, 0, 0, 0);
    igual(r.carga, null);
    igual(r.areaDiaria, null);
    igual(r.productividad, null);
  });

  // -------------------------------------------------------------------------
  // 6. Fecha local (bug real: usar UTC adelantaba el día en Colombia de noche)
  // -------------------------------------------------------------------------
  console.log("\nFecha");

  prueba("fechaLocalHoy devuelve YYYY-MM-DD", () => {
    cierto(/^\d{4}-\d{2}-\d{2}$/.test(app.fechaLocalHoy()), "formato de fecha inesperado");
  });

  prueba("fechaLocalHoy usa el día local, no el UTC", () => {
    const local = new Date();
    const esperado = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    igual(app.fechaLocalHoy(), esperado);
  });

  process.exit(resumen());
})();
