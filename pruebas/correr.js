// Pruebas automatizadas de la app. Se corren con:   node pruebas/correr.js
// No necesitan internet, ni navegador, ni tu Excel: usan datos de mentiras y verifican que la
// lógica real (cálculos, informe, formato de filas para Excel) siga dando lo que debe dar.

const {
  prueba, pruebaAsync, igual, cerca, contiene, noContiene, cierto,
  cargarApp, elementoFalso, resumen,
} = require("./arnes");

const {
  ESQUEMA, columnasFaltantes, filaDesdeExcel, filaHaciaExcel, completarFilaBase,
} = require("../esquema.js");

// ---------------------------------------------------------------------------
// 1. Esquema del Excel: cada dato se ubica por el TÍTULO de su columna, no por su posición
// ---------------------------------------------------------------------------
console.log("\nEsquema del Excel (por títulos)");

// Títulos reales de la tabla "Base de datos" tal como quedaron el 24/09/2026 (muestreo por zonas).
const TITULOS_BASE_REALES = [
  "Cliente", "Finca", "Fecha visita", "Lote", "Potrero", "Area del Potrero", "Zona", "Area de la zona",
  "Porcentaje de la zona", "Porcentaje del punto", "Punto de muestreo", "Collaria Adultos", "Collaria Ninfas",
  "Incidencia Daño Collaria (% de hojas)", "Severidad del Daño Collaria (% de la hoja)", "Numero de Loritos",
  "Numero de larvas de Lepidopteros", "Hojas Atacadas por Moluscos (#)", "Incidencia Daño Moluscos (% de hojas)",
  "Incidencia de Mancha Fungicas (% de hojas)", "Severidad Manchas Fungicas (% de la hoja)",
  "Collaria Adultos (Pond)", "Collaria Ninfas (Pond)", "Incidencia Daño Collaria (% de hojas) (Pond)",
  "Severidad del Daño Collaria (% de la hoja) (Pond)", "Numero de Loritos (Pond)",
  "Numero de larvas de Lepidopteros (Pond)", "Hojas Atacadas por Moluscos (#) (Pond)",
  "Incidencia Daño Moluscos (% de hojas) (Pond)", "Incidencia de Mancha Fungicas (% de hojas) (Pond)",
  "Severidad Manchas Fungicas (% de la hoja) (Pond)", "Daño Pasturas Moluscos (%)", "Daño Pasturas Collaria (%)",
  "Daño Pasturas Hongo (%)", "Observaciones", "Tipo de Fumigacion", "Litros de Mezcla/ha",
  "Orden de Mezcla Correcto?", "pH Final de la Mezcla", "Suma pesos del potrero",
];
const TITULOS_PRODUCTIVIDAD_REALES = [
  "Cliente", "Finca", "Fecha de Muestreo", "Lote", "Area del Lote (Hectareas)", "Animales en Ordeño",
  "Dias de Rotación", "Producción Diaria de Leche (L/vaca*dia)", "Carga Animal (Animales/hectarea)",
  "Area Diaria por Animal (m2/vaca*dia)", "Productividad de la Lecheria (Leche/ha*dia)", "Abono Usado",
  "Kg Abono/ha", "Kg N/ha", "Kg P/ha", "Kg K/ha", "Kg Ca/ha", "Kg Mg/ha", "Kg S/ha", "g B/ha", "g Zn/ha",
  "g Fe /ha", "g Mn/ha", "g Cu/ha", "g Mo/ha",
];

function puntoInterno() {
  const B = ESQUEMA.BASE;
  const f = new Array(24).fill(0); // un punto guardado con el orden viejo (24 datos), como en el celular
  f[B.cliente] = "CLIENTE"; f[B.finca] = "FINCA"; f[B.fecha] = "2026-09-24"; f[B.lote] = 2; f[B.punto] = 3;
  f[B.adultos] = 7; f[B.incidColl] = 0.5; f[B.sevColl] = 0.2; f[B.danoCollTotal] = 0.1;
  f[B.potrero] = "Entran 25"; f[B.observaciones] = "bajo encharcado";
  f[B.tipoFumigacion] = "Aerea (Dron)"; f[B.litrosMezclaHa] = 20; f[B.ordenMezclaCorrecto] = "Si"; f[B.phFinalMezcla] = 5.5;
  return f;
}
const columna = (titulos, t) => titulos.indexOf(t);

// Títulos como quedaron después de la reorganización de la madrugada del 24/09/2026.
const TITULOS_BASE_REORGANIZADA = ["Cliente", "Finca", "Fecha visita", "Lote", "% del Lote", "Potrero", "Area del Potrero",
  "Peso de cada Potrero", "Zona", "Area de la zona", "Peso de cada zona", "Peso de cada punto", "Peso de cada punto (x Lotes)",
  "Peso de cada punto (x Finca)", "Peso de cada punto (x Fincas de un cliente)", ...TITULOS_BASE_REALES.slice(10)];

prueba("reconoce los nombres nuevos de peso (Peso de cada zona / punto) y deja vacías las columnas de fórmula", () => {
  const T = TITULOS_BASE_REORGANIZADA;
  igual(columnasFaltantes("BASE", T).length, 0);
  const fila = filaHaciaExcel("BASE", T, puntoInterno());
  igual(fila[columna(T, "Peso de cada zona")], 1, "zona completa por defecto");
  igual(fila[columna(T, "Collaria Adultos")], 7);
  for (const t of ["% del Lote", "Peso de cada Potrero", "Peso de cada punto", "Peso de cada punto (x Lotes)", "Peso de cada punto (x Finca)"]) {
    igual(fila[columna(T, t)], null, `"${t}" la calcula el Excel`);
  }
});

prueba("con los títulos reales del Excel no falta ninguna columna", () => {
  igual(columnasFaltantes("BASE", TITULOS_BASE_REALES).length, 0, "Base de datos");
  igual(columnasFaltantes("PRODUCTIVIDAD", TITULOS_PRODUCTIVIDAD_REALES).length, 0, "Productividad_Fincas");
});

prueba("cada dato del punto cae en la columna con su título", () => {
  const T = TITULOS_BASE_REALES;
  const fila = filaHaciaExcel("BASE", T, puntoInterno());
  igual(fila.length, 40, "la fila debe tener las 40 columnas de la tabla");
  igual(fila[columna(T, "Potrero")], "Entran 25");
  igual(fila[columna(T, "Lote")], 2);
  igual(fila[columna(T, "Punto de muestreo")], 3);
  igual(fila[columna(T, "Collaria Adultos")], 7);
  igual(fila[columna(T, "Observaciones")], "bajo encharcado");
  igual(fila[columna(T, "Tipo de Fumigacion")], "Aerea (Dron)", "el manejo va a su columna, no encima de los hongos");
  igual(fila[columna(T, "pH Final de la Mezcla")], 5.5);
});

prueba("un punto sin zona se sube como zona 1 que ocupa todo el potrero", () => {
  const T = TITULOS_BASE_REALES;
  const fila = filaHaciaExcel("BASE", T, puntoInterno());
  igual(fila[columna(T, "Zona")], 1);
  igual(fila[columna(T, "Porcentaje de la zona")], 1, "si fuera vacío, el punto pesaría 0 en el Excel");
});

prueba("las columnas con fórmula (porcentaje del punto, ponderados, daños, suma) van vacías", () => {
  const T = TITULOS_BASE_REALES;
  const fila = filaHaciaExcel("BASE", T, puntoInterno());
  for (const t of T.filter((x) => /\(Pond\)|^Daño Pasturas|^Porcentaje del punto$|^Suma pesos|^Incidencia Daño Moluscos \(% de hojas\)$/.test(x))) {
    igual(fila[columna(T, t)], null, `"${t}" la calcula el Excel`);
  }
});

prueba("si se reordenan las columnas en el Excel, los datos siguen yendo a su título", () => {
  const T = [...TITULOS_BASE_REALES].reverse();
  const fila = filaHaciaExcel("BASE", T, puntoInterno());
  igual(fila[columna(T, "Potrero")], "Entran 25");
  igual(fila[columna(T, "Collaria Adultos")], 7);
});

prueba("no importan tildes, ñ, mayúsculas ni espacios de más en los títulos", () => {
  const T = TITULOS_BASE_REALES.map((t) => t.replace(/ñ/g, "n").toUpperCase().replace("POTRERO", "  Potrero "));
  igual(columnasFaltantes("BASE", T).length, 0);
});

prueba("si falta una columna que la app necesita, no sube nada y dice cuál", () => {
  const T = TITULOS_BASE_REALES.filter((t) => t !== "Collaria Ninfas");
  let error = null;
  try { filaHaciaExcel("BASE", T, puntoInterno(), "TablaBaseDatos"); } catch (e) { error = e.message; }
  cierto(error, "debía fallar para que el punto quede pendiente");
  contiene(error, "Collaria Ninfas");
});

prueba("al leer del Excel, cada dato sale de su título y los daños se calculan con los datos crudos", () => {
  const T = TITULOS_BASE_REALES;
  const B = ESQUEMA.BASE;
  const excel = new Array(40).fill("");
  excel[columna(T, "Cliente")] = "CLIENTE"; excel[columna(T, "Potrero")] = "P1";
  excel[columna(T, "Incidencia Daño Collaria (% de hojas)")] = 0.8; excel[columna(T, "Severidad del Daño Collaria (% de la hoja)")] = 0.25;
  excel[columna(T, "Hojas Atacadas por Moluscos (#)")] = 4; excel[columna(T, "Incidencia Daño Moluscos (% de hojas)")] = 0.4;
  excel[columna(T, "Incidencia de Mancha Fungicas (% de hojas)")] = 0.5; excel[columna(T, "Severidad Manchas Fungicas (% de la hoja)")] = 0.1;
  excel[columna(T, "Daño Pasturas Collaria (%)")] = 0.05; // ponderado: no debe usarse como daño del punto
  const f = completarFilaBase(filaDesdeExcel("BASE", T, excel), { hojasEvaluadas: 10, severidadMoluscos: 0.1 });
  igual(f[B.potrero], "P1");
  cerca(f[B.danoCollTotal], 0.2, 1e-9, "daño Collaria del punto = incidencia × severidad");
  cerca(f[B.danoMoluscos], 0.04, 1e-9, "daño moluscos = incidencia × severidad asumida");
  cerca(f[B.danoHongos], 0.05, 1e-9, "daño hongos = incidencia × severidad");
});

prueba("productividad: los datos van a su título y las columnas de abono quedan vacías", () => {
  const T = TITULOS_PRODUCTIVIDAD_REALES;
  const fila = filaHaciaExcel("PRODUCTIVIDAD", T, ["C", "F", "2026-09-24", 1, 12, 40, 30, 18, null, null, null]);
  igual(fila.length, 25);
  igual(fila[columna(T, "Animales en Ordeño")], 40);
  igual(fila[columna(T, "Producción Diaria de Leche (L/vaca*dia)")], 18);
  igual(fila[columna(T, "Carga Animal (Animales/hectarea)")], null, "fórmula del Excel");
  igual(fila[columna(T, "Kg N/ha")], null);
});

// ---------------------------------------------------------------------------
// 2. Motor de cálculo del informe
// ---------------------------------------------------------------------------

const UMBRALES = [
  ["Umbral de Adultos de Collaria", 5, 10],
  ["Umbral de Ninfas de Collaria", 5, 10],
  ["Umbral de Individuos de Lorito", 5, 10],
  ["Umbral de Numero de Lepidopteros", 5, 10],
  ["Umbral de Incidencia de ataques de Collaria", 0.3, 0.5],
  ["Umbral de Severidad promedio del Dano por Collaria", 0.05, 0.1],
  ["Umbral de Incidencia de Manchas del Kikuyo", 0.3, 0.5],
  ["Umbral de Severidad Promedio del Ataque de Hongos", 0.05, 0.1],
  ["Umbral de Dano por Moluscos", 0.05, 0.1],
  ["Umbral de Dano Total de la Pastura por Collaria", 0.05, 0.1],
  ["Umbral de Dano a la pastura por Hongos", 0.05, 0.1],
  ["Umbral (Min) de Pasto Sano", 0.95, 0.9],
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
function cargarInformes({ filas = [], productosAplicados = [], recomendados = [], productividad = [], catalogo = [],
  observacionesLotes = [], informesGenerados = [], cola = [], cache = {}, leerTablaColgada = false } = {}) {
  const Graph = {
    async leerTabla(nombre) {
      if (leerTablaColgada) return new Promise(() => {}); // red "en línea" pero sin internet real
      if (nombre === "Observaciones_Lotes") return observacionesLotes;
      if (nombre === "Informes_Generados") return informesGenerados;
      if (nombre === "TablaBaseDatos") return filas;
      if (nombre === "Productos_Aplicados") return productosAplicados;
      if (nombre === "Productos_Recomendados") return recomendados;
      if (nombre === "Productividad_Fincas") return productividad;
      if (nombre === "Tabla2") return catalogo;
      return [];
    },
    async leerRango(hoja, rango) {
      if (rango === "A8:C19") return UMBRALES;
      return [];
    },
  };
  const DB = {
    async listarItems() { return cola.map((it, i) => ({ id: i + 1, estado: "pendiente", ...it })); },
    async guardarCache() {},
    async leerCache(clave) { return cache[clave] ?? null; },
  };
  const CONFIG = {
    TABLE_NAME: "TablaBaseDatos", HOJA_CONFIG: "Configuracion", HOJA_PRODUCTOS: "Productos",
    TABLA_PRODUCTOS_APLICADOS: "Productos_Aplicados",
    TABLA_PRODUCTOS_RECOMENDADOS: "Productos_Recomendados",
    TABLA_PRODUCTIVIDAD: "Productividad_Fincas",
    TABLA_OBSERVACIONES_LOTES: "Observaciones_Lotes",
    TABLA_INFORMES_GENERADOS: "Informes_Generados",
    TABLA_PRODUCTOS: "Tabla2",
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
    cierto(D.alertas.some((a) => a.includes("adultos")), "el promedio (9.5 adultos) supera el umbral de 5");
    cierto(!D.alertas.some((a) => a.includes("Lote ")), "Resultados reporta el promedio, no lote por lote");
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
    noContiene(html, "Ponderado general", "no debería haber fila de promedio con un solo lote");
    noContiene(html, "Estado general de la finca", "no debería haber bloque de promedio con un solo lote");
  });

  await pruebaAsync("con dos lotes SÍ incluye el promedio general", async () => {
    const { Informes } = cargarInformes({ filas: filasDosLotes });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    const html = Informes.generarHtml(D, [], "");
    contiene(html, "Ponderado general");
    contiene(html, 'Estado general de la finca');
  });

  await pruebaAsync("la dosis recomendada lleva el sufijo del equipo elegido", async () => {
    const { Informes } = cargarInformes({ filas: filasDosLotes });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    const productos = [{ nombre: "ORTHENE", tipo: "INSECTICIDA", unidad: "g", dosis: "200", tipoFumigacion: "Terrestre (Estacionaria)" }];
    const html = Informes.generarHtml(D, productos, "", { tipo: "Terrestre (Estacionaria)", volumenMezcla: "200" });
    contiene(html, "200g/Caneca 200L (500g/Caneca 500L - 1000g/Caneca 1000L)", "con estacionaria se agregan canecas de 500 y 1000 L");
    contiene(html, "200g/Caneca 200L", "debería mostrar la dosis por caneca");
    noContiene(html, "200L (Estacionaria)", "el método ya está arriba: no se repite en cada producto");
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
    contiene(html, "200g/Hectárea", "debería mostrar la dosis según el tipo de fumigación del lote");
    noContiene(html, "Hectárea (Dron)", "el método ya está arriba: no se repite en cada producto");
    contiene(html, "Volumen de Mezcla/ha", "debería mostrar el volumen de mezcla");
  });

  await pruebaAsync("la sección de productividad aparece antes que la de manejo agronómico", async () => {
    const productividad = [["CLIENTE", "FINCA", "2026-09-14", 1, 15, 50, 27, 25, 3.33, 111.1, 83.3]];
    const { Informes } = cargarInformes({ filas: filasDosLotes, productividad });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    const html = Informes.generarHtml(D, [], "");
    contiene(html, "Indicadores de productividad");
    cierto(
      html.indexOf("Indicadores de productividad") < html.indexOf("Manejo agronómico"),
      "productividad debe ir antes que manejo agronómico"
    );
    cierto(html.indexOf("Manejo agronómico") < html.indexOf("Tabla de resultados por lote"),
      "manejo agronómico debe ir antes que la tabla de resultados");
  });

  // -------------------------------------------------------------------------
  // 3b. Cambios hechos en el celular que aún no se suben (borrados, reemplazos)
  // -------------------------------------------------------------------------
  console.log("\nCambios pendientes en el celular");

  const productoExcel = (nombre, dosis) => ["CLIENTE", "FINCA", "2026-09-14", 1, nombre, "INSECTICIDA", "SC", "cc", dosis];

  await pruebaAsync("un producto quitado en la app deja de aparecer aunque siga en el Excel", async () => {
    const { Informes } = cargarInformes({
      filas: filasDosLotes,
      productosAplicados: [productoExcel("ORTHENE", 200), productoExcel("SILICROP", 40)],
      cola: [{ tipo: "eliminar_producto_aplicado", datos: { cliente: "CLIENTE", finca: "FINCA", fecha: "2026-09-14", lote: 1, producto: "orthene", formulacion: "SC", dosis: "200" } }],
    });
    const { productos } = await Informes.manejoYProductosDeLote("CLIENTE", "FINCA", "2026-09-14", 1);
    igual(productos.map((p) => p.nombre).join(","), "SILICROP");
  });

  await pruebaAsync("un producto quitado y vuelto a agregar aparece una sola vez", async () => {
    const { Informes } = cargarInformes({
      filas: filasDosLotes,
      productosAplicados: [productoExcel("ORTHENE", 200)],
      cola: [
        { tipo: "eliminar_producto_aplicado", datos: { cliente: "CLIENTE", finca: "FINCA", fecha: "2026-09-14", lote: 1, producto: "ORTHENE", formulacion: "SC", dosis: 200 } },
        { tipo: "producto_aplicado", datos: { cliente: "CLIENTE", finca: "FINCA", fecha: "2026-09-14", lote: 1, producto: "ORTHENE", tipo: "INSECTICIDA", formulacion: "SC", unidad: "cc", dosis: "200" } },
      ],
    });
    const { productos } = await Informes.manejoYProductosDeLote("CLIENTE", "FINCA", "2026-09-14", 1);
    igual(productos.length, 1);
  });

  await pruebaAsync("la recomendación guardada reemplaza la de esa visita, duplicados incluidos", async () => {
    const { Informes } = cargarInformes({
      filas: filasDosLotes,
      recomendados: [
        ["CLIENTE", "FINCA", "2026-09-14", "", "ORTHENE", "INSECTICIDA", "SC", "g", 200],
        ["CLIENTE", "FINCA", "2026-09-14", "", "ORTHENE", "INSECTICIDA", "SC", "g", 200],
        ["CLIENTE", "FINCA", "2026-09-14", "", "SILICROP", "ADYUVANTE", "SL", "cc", 40],
        ["CLIENTE", "FINCA", "2026-09-10", "", "ORTHENE", "INSECTICIDA", "SC", "g", 200],
      ],
      cola: [{ tipo: "recomendaciones_visita", datos: { cliente: "CLIENTE", finca: "FINCA", fecha: "2026-09-14",
        productos: [{ producto: "SILICROP", tipo: "ADYUVANTE", formulacion: "SL", unidad: "cc", dosis: "40" }] } }],
    });
    const r = await Informes.recomendacionesGuardadas("CLIENTE", "FINCA", "2026-09-14");
    igual(r.map((p) => p.nombre).join(","), "SILICROP", "las dos filas repetidas de ORTHENE deben desaparecer");
    const otra = await Informes.recomendacionesGuardadas("CLIENTE", "FINCA", "2026-09-10");
    igual(otra.length, 1, "la recomendación de otra visita no se toca");
  });

  await pruebaAsync("la productividad guardada en el celular reemplaza la de esa visita en el Excel", async () => {
    const { Informes } = cargarInformes({
      filas: filasDosLotes,
      productividad: [["CLIENTE", "FINCA", "2026-09-14", "", 10, 20, 30, 15, 2, 1, 30]],
      cola: [{ tipo: "productividad_visita", datos: { cliente: "CLIENTE", finca: "FINCA", fecha: "2026-09-14", modo: "lotes",
        filas: [{ lote: 1, area: "15", animales: "50", dias: "27", produccion: "25" }, { lote: 2, area: "5", animales: "10", dias: "", produccion: "" }] } }],
    });
    const p = await Informes.productividadDeVisita("CLIENTE", "FINCA", "2026-09-14");
    igual(p.length, 2, "solo deben quedar las 2 filas nuevas (la general vieja se reemplaza)");
    cerca(p[0].productividadLecheria, (25 * 50) / 15, 1e-9);
  });

  await pruebaAsync("la observación del lote sale en el informe, antes que las de los puntos", async () => {
    const filas = [filaPunto({ lote: 1, observaciones: "Punto con charcos" })];
    const { Informes } = cargarInformes({
      filas,
      observacionesLotes: [["CLIENTE", "FINCA", "2026-09-14", 1, "P1", "Vieja"]],
      cola: [{ tipo: "observacion_lote", datos: { cliente: "CLIENTE", finca: "FINCA", fecha: "2026-09-14", lote: 1, potrero: "P1", observaciones: "Rebrote parejo" } }],
    });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    const html = Informes.generarHtml(D, [], "");
    contiene(html, "Rebrote parejo · Punto con charcos");
    noContiene(html, "Vieja", "la observación pendiente reemplaza la del Excel");
  });

  await pruebaAsync("si la red dice 'en línea' pero no hay internet, usa la copia guardada en vez de colgarse", async () => {
    const { Informes } = cargarInformes({ leerTablaColgada: true, cache: { "titulos:filasBase": filasDosLotes } });
    Informes.LIMITE_LECTURA_MS = 30;
    const { manejo } = await Informes.manejoYProductosDeLote("CLIENTE", "FINCA", "2026-09-14", 1);
    igual(manejo.tipoFumigacion, "Aerea (Dron)");
  });

  console.log("\nHistorial de visitas");

  const filasTresVisitas = [
    filaPunto({ fecha: "2026-08-01" }), filaPunto({ fecha: "2026-09-14" }), filaPunto({ fecha: "2026-09-10" }),
  ];

  await pruebaAsync("muestra todas las visitas de la base de datos, de la más reciente a la más antigua", async () => {
    const { Informes } = cargarInformes({ filas: filasTresVisitas });
    const v = await Informes.visitasHistorial();
    igual(v.map((x) => x.fecha).join(","), "2026-09-14,2026-09-10,2026-08-01");
  });

  await pruebaAsync("indica qué información le falta a cada visita", async () => {
    const { Informes } = cargarInformes({
      filas: filasTresVisitas,
      productosAplicados: [["CLIENTE", "FINCA", "2026-09-14", 1, "ORTHENE", "INSECTICIDA", "SC", "cc", 200]],
      informesGenerados: [["CLIENTE", "FINCA", "2026-09-14", "2026-09-15", "", "", "Nota"]],
      productividad: [["CLIENTE", "FINCA", "2026-08-01", "", 10, 20, 30, 15, 2, 1, 30]],
    });
    const v = await Informes.visitasHistorial();
    const del14 = v.find((x) => x.fecha === "2026-09-14"), del01 = v.find((x) => x.fecha === "2026-08-01");
    igual([del14.faltaAplicados, del14.faltaRecomendacion, del14.faltaProductividad].join(), "false,false,true");
    igual([del01.faltaAplicados, del01.faltaRecomendacion, del01.faltaProductividad].join(), "true,true,false");
  });

  await pruebaAsync("una visita borrada en la app desaparece aunque siga en el Excel", async () => {
    const { Informes } = cargarInformes({
      filas: filasTresVisitas,
      productosAplicados: [["CLIENTE", "FINCA", "2026-09-14", 1, "ORTHENE", "INSECTICIDA", "SC", "cc", 200]],
      cola: [{ tipo: "eliminar_visita", datos: { cliente: "CLIENTE", finca: "FINCA", fecha: "2026-09-14" } }],
    });
    const v = await Informes.visitasHistorial();
    igual(v.map((x) => x.fecha).join(","), "2026-09-10,2026-08-01");
    igual((await Informes.filasProductos()).length, 0, "sus productos aplicados tampoco deben verse");
  });

  await pruebaAsync("un lote borrado en la app desaparece aunque siga en el Excel, sin tocar los otros lotes", async () => {
    const { Informes } = cargarInformes({
      filas: filasDosLotes,
      productosAplicados: [productoExcel("ORTHENE", 200), ["CLIENTE", "FINCA", "2026-09-14", 2, "SILICROP", "ADYUVANTE", "SL", "cc", 40]],
      cola: [{ tipo: "eliminar_lote", datos: { cliente: "CLIENTE", finca: "FINCA", fecha: "2026-09-14", lote: 1 } }],
    });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    igual(D.tabla_lotes.map((t) => t.lote).join(","), "2");
    igual((await Informes.filasProductos()).map((f) => f[4]).join(","), "SILICROP");
  });

  // -------------------------------------------------------------------------
  await pruebaAsync("el historial trae las 13 gráficas en 3 grupos más la opción Todas", async () => {
    const { Informes } = cargarInformes({ filas: filasDosLotes });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    const html = Informes.generarHtml(D, [], "");
    igual(html.split("<canvas id=\"hist").length - 1, 13, "una gráfica por variable");
    ["conteos", "epidemiologia", "pasturas", "todas"].forEach((g) => contiene(html, `<option value="${g}"`));
    contiene(html, "Hojas atacadas por Moluscos", "va en el grupo Conteos");
  });

  await pruebaAsync("el PDF sale igual que la pantalla: sin cortes forzados ni encabezados repetidos", async () => {
    const { Informes } = cargarInformes({ filas: filasDosLotes });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    const html = Informes.generarHtml(D, [], "");
    noContiene(html, "salto-pagina", "no se fuerzan cortes de página");
    noContiene(html, "solo-impresion", "el encabezado no se repite");
    noContiene(html, "class=\"firma\"", "el pie con el nombre del asesor ya no va");
    contiene(html, "@media print", "pero sí hay estilos de impresión");
    contiene(html, "Manejo Fitosanitario Actual", "la sección cambió de nombre");
  });

  await pruebaAsync("cada lote tiene su ventana con la tabla de puntos", async () => {
    const { Informes } = cargarInformes({ filas: filasDosLotes });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    igual(D.tabla_lotes[0].puntos.length, 2, "el lote 1 tiene 2 puntos");
    const html = Informes.generarHtml(D, [], "");
    igual(html.split("<dialog id=\"detalle").length - 1, 2, "una ventana por lote");
    contiene(html, "<th>Collaria Adultos</th>");
    noContiene(html, "<th>Lote</th><th>Potrero</th>", "en el informe de una finca no hace falta la columna Lote");
    contiene(html, "<th>Potrero</th><th>Zona</th><th>Punto</th>", "pero sí el potrero y la zona de cada punto");
  });



  // ---------------------------------------------------------------------------
  console.log("\nInforme por fincas de un cliente");

  const filasDosFincas = [
    filaPunto({ finca: "AMAZONAS", lote: 1, punto: 1, fecha: "2026-09-14", adultos: 10 }),
    filaPunto({ finca: "AMAZONAS", lote: 1, punto: 2, fecha: "2026-09-14", adultos: 20 }),
    filaPunto({ finca: "AMAZONAS", lote: 2, punto: 1, fecha: "2026-09-14", adultos: 6 }),
    filaPunto({ finca: "SOLEDAD", lote: 1, punto: 1, fecha: "2026-09-10", adultos: 4 }),
    filaPunto({ finca: "SOLEDAD", lote: 1, punto: 2, fecha: "2026-09-10", adultos: 2 }),
  ];
  const seleccionDosFincas = [{ finca: "AMAZONAS", fecha: "2026-09-14" }, { finca: "SOLEDAD", fecha: "2026-09-10" }];

  await pruebaAsync("sin áreas, cada lote de la finca pesa igual (no cada punto)", async () => {
    const { Informes } = cargarInformes({ filas: filasDosFincas });
    const D = await Informes.calcularDatosCliente("CLIENTE", seleccionDosFincas);
    igual(D.tabla_lotes.map((t) => t.lote).join(","), "AMAZONAS,SOLEDAD");
    cerca(D.tabla_lotes[0].adultos, 10.5, 1e-9, "AMAZONAS: lote 1 = 15 y lote 2 = 6, pesan igual");
    igual(D.tabla_lotes[0].n_puntos, 3, "cuenta los puntos de los 2 lotes");
    cierto(D.tabla_lotes[0].sin_areas, "se avisa que no hay áreas");
    cierto(D.tabla_lotes[0].adultos_sd > 0, "hay desviación para las barras de error");
    cerca(D.promedio_finca.adultos, 6.75, 1e-9, "el general es entre fincas: (10,5 + 3) / 2");
  });

  // Puntos con zona, % de zona y área del potrero (muestreo por zonas).
  const B = ESQUEMA.BASE;
  function puntoZona({ lote = 1, potrero = "P1", zona = 1, pctZona = 1, areaZona = "", areaPotrero = "", punto = 1, adultos = 0, fecha = "2026-09-24", finca = "FINCA" }) {
    const f = filaPunto({ lote, potrero, punto, adultos, fecha, finca });
    f[B.zona] = zona; f[B.pctZona] = pctZona; f[B.areaZona] = areaZona; f[B.areaPotrero] = areaPotrero;
    return f;
  }

  await pruebaAsync("dentro del potrero cada zona pesa su porcentaje, no su número de puntos", async () => {
    // Zona 1 = 80 % con un punto de 10; zona 2 = 20 % con tres puntos de 40.
    const filas = [
      puntoZona({ zona: 1, pctZona: 0.8, punto: 1, adultos: 10 }),
      puntoZona({ zona: 2, pctZona: 0.2, punto: 2, adultos: 40 }),
      puntoZona({ zona: 2, pctZona: 0.2, punto: 3, adultos: 40 }),
      puntoZona({ zona: 2, pctZona: 0.2, punto: 4, adultos: 40 }),
    ];
    const { Informes } = cargarInformes({ filas });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-24");
    cerca(D.tabla_lotes[0].adultos, 16, 1e-9, "0,8 × 10 + 0,2 × 40 (el promedio simple daría 32,5)");
  });

  await pruebaAsync("si la zona trae área y no porcentaje, se saca con el área del potrero", async () => {
    const filas = [
      puntoZona({ zona: 1, pctZona: "", areaZona: 3, areaPotrero: 4, adultos: 10 }),
      puntoZona({ zona: 2, pctZona: "", areaZona: 1, areaPotrero: 4, punto: 2, adultos: 30 }),
    ];
    const { Informes } = cargarInformes({ filas });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-24");
    cerca(D.tabla_lotes[0].adultos, 15, 1e-9, "3/4 × 10 + 1/4 × 30");
  });

  await pruebaAsync("los potreros de un lote pesan según su área", async () => {
    const filas = [
      puntoZona({ potrero: "P1", areaPotrero: 3, adultos: 10 }),
      puntoZona({ potrero: "P2", areaPotrero: 1, punto: 2, adultos: 30 }),
    ];
    const { Informes } = cargarInformes({ filas });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-24");
    cerca(D.tabla_lotes[0].adultos, 15, 1e-9, "(3 × 10 + 1 × 30) / 4");
    cierto(!D.tabla_lotes[0].sin_areas, "con áreas no hay aviso");
    noContiene(Informes.generarHtml(D, [], ""), "Sin areas de potreros registradas");
  });

  await pruebaAsync("sin área de algún potrero pesan igual y el informe lo dice", async () => {
    const filas = [
      puntoZona({ potrero: "P1", areaPotrero: 3, adultos: 10 }),
      puntoZona({ potrero: "P2", areaPotrero: "", punto: 2, adultos: 30 }),
    ];
    const { Informes } = cargarInformes({ filas });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-24");
    cerca(D.tabla_lotes[0].adultos, 20, 1e-9, "(10 + 30) / 2");
    contiene(Informes.generarHtml(D, [], ""), "Sin areas de potreros registradas");
  });

  await pruebaAsync("en el informe de lotes, el general de la finca da el mismo peso a cada lote", async () => {
    const filas = [
      puntoZona({ lote: 1, potrero: "P1", areaPotrero: 3, adultos: 10 }),
      puntoZona({ lote: 2, potrero: "P9", areaPotrero: 1, punto: 1, adultos: 2 }),
    ];
    const { Informes } = cargarInformes({ filas });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-24");
    cerca(D.promedio_finca.adultos, 6, 1e-9, "(10 + 2) / 2, como la columna x Finca del Excel");
  });

  await pruebaAsync("el historial también pondera", async () => {
    const filas = [
      puntoZona({ zona: 1, pctZona: 0.8, punto: 1, adultos: 10 }),
      puntoZona({ zona: 2, pctZona: 0.2, punto: 2, adultos: 40 }),
      puntoZona({ zona: 2, pctZona: 0.2, punto: 3, adultos: 40 }),
    ];
    const { Informes } = cargarInformes({ filas });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-24");
    const serie = D.historial["Individuos Adultos de Collaria"].lotes["1"];
    cerca(serie[serie.length - 1], 16, 1e-9, "mismo ponderado que la tabla");
  });

  await pruebaAsync("el informe por fincas usa Finca como unidad y trae las recomendaciones de cada visita", async () => {
    const { Informes } = cargarInformes({
      filas: filasDosFincas,
      recomendados: [["CLIENTE", "AMAZONAS", "2026-09-14", "", "LORSBAN", "INSECTICIDA", "EC", "cc", 150]],
      informesGenerados: [["CLIENTE", "AMAZONAS", "2026-09-14", "2026-09-15", "Aerea (Dron)", "20", "Repetir en 15 días"]],
    });
    const D = await Informes.calcularDatosCliente("CLIENTE", seleccionDosFincas);
    const html = Informes.generarHtml(D, [], "Nota general");
    contiene(html, "Informe Técnico por Fincas");
    contiene(html, "Finca AMAZONAS");
    contiene(html, "Fincas y fecha de muestreo", "la franja lista cada finca con su fecha");
    contiene(html, "14/09/2026", "con la fecha de la visita elegida de esa finca");
    contiene(html, "LORSBAN", "la recomendación guardada de esa visita");
    contiene(html, "Repetir en 15 días", "y sus observaciones");
    contiene(html, "Nota general", "más la nota general del cliente");
    noContiene(html, "Visita No:", "en el informe del cliente no hay número de visita");
  });

  await pruebaAsync("el historial agrupa por mes, no por día exacto", async () => {
    const { Informes } = cargarInformes({
      filas: [
        filaPunto({ finca: "AMAZONAS", fecha: "2026-07-02", adultos: 10 }),
        filaPunto({ finca: "AMAZONAS", fecha: "2026-09-14", adultos: 20 }),
        filaPunto({ finca: "SOLEDAD", fecha: "2026-07-20", adultos: 4 }),
        filaPunto({ finca: "SOLEDAD", fecha: "2026-09-10", adultos: 6 }),
      ],
    });
    const D = await Informes.calcularDatosCliente("CLIENTE", [{ finca: "AMAZONAS", fecha: "2026-09-14" }, { finca: "SOLEDAD", fecha: "2026-09-10" }]);
    const h = D.historial["Individuos Adultos de Collaria"];
    igual(h.fechas.join(","), "Jul,Sep", "julio y septiembre, aunque los días sean distintos");
    igual(h.lotes.AMAZONAS.join(","), "10,20", "cada finca cae en el punto de su mes");
    igual(h.lotes.SOLEDAD.join(","), "4,6");
  });

  await pruebaAsync("el historial del cliente lleva una línea por finca", async () => {
    const { Informes } = cargarInformes({ filas: filasDosFincas });
    const D = await Informes.calcularDatosCliente("CLIENTE", seleccionDosFincas);
    const h = D.historial["Individuos Adultos de Collaria"];
    igual(Object.keys(h.lotes).join(","), "AMAZONAS,SOLEDAD");
    igual(h.fechas.join(","), "Sep", "las dos visitas son del mismo mes: un solo punto en el eje");
  });

  // ---------------------------------------------------------------------------
  await pruebaAsync("en el informe por fincas la ventana incluye la columna Lote", async () => {
    const { Informes } = cargarInformes({ filas: filasDosFincas });
    const D = await Informes.calcularDatosCliente("CLIENTE", seleccionDosFincas);
    const html = Informes.generarHtml(D, [], "");
    contiene(html, "<th>Lote</th><th>Potrero</th><th>Zona</th><th>Punto</th>");
    igual(D.tabla_lotes[0].puntos.length, 3, "AMAZONAS tiene 3 puntos entre sus 2 lotes");
  });

  await pruebaAsync("la recomendación del informe por fincas se guarda y se vuelve a leer", async () => {
    const { Informes } = cargarInformes({
      filas: filasDosFincas,
      recomendados: [["CLIENTE", "AMAZONAS", "2026-09-14", "", "ORTHENE", "INSECTICIDA", "SC", "g", 200]],
      cola: [{ tipo: "recomendaciones_cliente", datos: { cliente: "CLIENTE", fechaInforme: "2026-09-16",
        tipoFumigacion: "Terrestre (Estacionaria)", volumenMezcla: "400", nota: "Nota general",
        productos: [{ producto: "LORSBAN", tipo: "INSECTICIDA", formulacion: "EC", unidad: "cc", dosis: "150" }] } }],
    });
    const rec = await Informes.recomendacionCliente("CLIENTE");
    igual(rec.productos.map((p) => p.nombre).join(","), "LORSBAN");
    igual(rec.volumenMezcla, "400");
    igual(rec.nota, "Nota general");
    const D = await Informes.calcularDatosCliente("CLIENTE", seleccionDosFincas);
    const html = Informes.generarHtml(D, rec.productos.map((p) => ({ ...p, tipoFumigacion: rec.tipoFumigacion })), rec.nota,
      { tipo: rec.tipoFumigacion, volumenMezcla: rec.volumenMezcla });
    contiene(html, "LORSBAN", "la recomendación del cliente va en el informe");
    contiene(html, "Lo recomendado en cada finca", "y debajo lo de cada visita");
  });

  await pruebaAsync("si ninguna finca tiene recomendación guardada, no sale el título vacío", async () => {
    const { Informes } = cargarInformes({ filas: filasDosFincas });
    const D = await Informes.calcularDatosCliente("CLIENTE", seleccionDosFincas);
    const html = Informes.generarHtml(D, [], "");
    noContiene(html, "Lo recomendado en cada finca", "no debe quedar un encabezado colgando");
    contiene(html, "Sin productos recomendados para este informe.");
  });

  // ---------------------------------------------------------------------------
  await pruebaAsync("lo que supera el umbral va en letra roja; lo demás, sin color", async () => {
    const { Informes } = cargarInformes({
      filas: [
        filaPunto({ lote: 1, punto: 1, adultos: 3 }),   // por debajo del umbral (5)
        filaPunto({ lote: 2, punto: 1, adultos: 8 }),   // supera el umbral (aunque no el máximo)
        filaPunto({ lote: 3, punto: 1, adultos: 20 }),  // supera el umbral
      ],
    });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    const html = Informes.generarHtml(D, [], "");
    contiene(html, `<td>3.0</td>`, "3 adultos: normal");
    contiene(html, `<td class="sem-alto">8.0</td>`, "8 adultos: rojo (ya no hay amarillo)");
    contiene(html, `<td class="sem-alto">20.0</td>`, "20 adultos: rojo");
    noContiene(html, "sem-ok", "ya no se pintan fondos verdes");
    noContiene(html, "sem-medio", "ya no se pintan fondos amarillos");
  });

  // Muestreo por potreros dentro del informe de lotes de una finca.
  function puntoPotrero(lote, potrero, punto, adultos) {
    const f = filaPunto({ lote, potrero, punto, adultos, fecha: "2026-09-24" });
    f[ESQUEMA.BASE.zona] = 1; f[ESQUEMA.BASE.pctZona] = 1;
    return f;
  }
  // Lote 1: potrero A (10) y potrero B (20). Lote 2: potrero C (6). Sin áreas.
  const filasPotreros = [puntoPotrero(1, "A", 1, 10), puntoPotrero(1, "B", 2, 20), puntoPotrero(2, "C", 1, 6)];

  await pruebaAsync("el general de la finca sigue la columna x Finca: cada lote igual, y adentro sus potreros", async () => {
    const { Informes } = cargarInformes({ filas: filasPotreros });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-24");
    cerca(D.tabla_lotes[0].adultos, 15, 1e-9, "lote 1: sus 2 potreros pesan igual (x Lotes)");
    // Pesos x Finca: A = 25 %, B = 25 %, C = 50 %  →  10×0,25 + 20×0,25 + 6×0,5
    cerca(D.promedio_finca.adultos, 10.5, 1e-9, "finca: cada lote 50 %");
    cierto(D.promedio_finca.sin_areas, "sin áreas se avisa");
  });

  await pruebaAsync("con áreas, los lotes siguen pesando igual en la finca (como la columna x Finca)", async () => {
    const f = (lote, potrero, punto, adultos, area) => { const x = puntoPotrero(lote, potrero, punto, adultos); x[ESQUEMA.BASE.areaPotrero] = area; return x; };
    const { Informes } = cargarInformes({ filas: [f(1, "A", 1, 10, 3), f(1, "B", 2, 30, 1), f(2, "C", 1, 6, 8)] });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-24");
    cerca(D.tabla_lotes[0].adultos, 15, 1e-9, "lote 1 por área: (3×10 + 1×30) / 4");
    cerca(D.promedio_finca.adultos, 10.5, 1e-9, "finca: (15 + 6) / 2, el lote 2 no pesa más por tener más área");
  });

  await pruebaAsync("un lote con 2 potreros trae filas y gráficas por potrero; uno con 1, no", async () => {
    const { Informes } = cargarInformes({ filas: filasPotreros });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-24");
    igual(D.tabla_lotes[0].potreros_detalle.length, 2, "lote 1 tiene A y B");
    igual(D.tabla_lotes[1].potreros_detalle.length, 0, "lote 2 tiene un solo potrero: no se repite");
    const html = Informes.generarHtml(D, [], "");
    contiene(html, `<tr class="fila-potrero">`, "fila de potrero con su fondo");
    contiene(html, `<tr class="fila-lote">`, "fila de lote con su fondo");
    contiene(html, `<tr class="fila-promedio">`, "fila general con su fondo");
    contiene(html, "Lote 1 — Potrero A", "gráficas del potrero A");
    contiene(html, "Lote 1 — Potrero B", "gráficas del potrero B");
    igual(html.split('class="lote-bloque lote-bloque-potrero"').length - 1, 2, "solo A y B: el lote 2 no repite gráficas");
  });

  await pruebaAsync("el informe por fincas no cambia: sin filas por potrero ni fondos por nivel", async () => {
    const { Informes } = cargarInformes({ filas: filasPotreros });
    const D = await Informes.calcularDatosCliente("CLIENTE", [{ finca: "FINCA", fecha: "2026-09-24" }]);
    const html = Informes.generarHtml(D, [], "");
    noContiene(html, `<tr class="fila-potrero">`);
    noContiene(html, `<tr class="fila-lote">`);
    cerca(D.tabla_lotes[0].adultos, 10.5, 1e-9, "la finca sigue pesando cada lote igual");
  });

  // ---------------------------------------------------------------------------
  // 4. Filas que se suben a Excel: las columnas con fórmula deben ir vacías
  // -------------------------------------------------------------------------
  console.log("\nFilas para Excel");

  prueba("un punto capturado en la app sube con sus datos crudos y sin los calculados", () => {
    const T = TITULOS_BASE_REALES;
    const paraExcel = filaHaciaExcel("BASE", T, filaPunto({ adultos: 7, incidColl: 0.5, sevColl: 0.2 }));
    igual(paraExcel[columna(T, "Collaria Adultos")], 7, "los adultos capturados no se deben borrar");
    cerca(paraExcel[columna(T, "Incidencia Daño Collaria (% de hojas)")], 0.5, 1e-9, "la incidencia capturada no se debe borrar");
    igual(paraExcel[columna(T, "Tipo de Fumigacion")], "Aerea (Dron)", "el manejo agronómico no se debe borrar");
    igual(paraExcel[columna(T, "Incidencia Daño Moluscos (% de hojas)")], null, "la incidencia de moluscos la calcula el Excel");
    igual(paraExcel.length, 40, "la fila debe tener las 40 columnas de la tabla");
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

  prueba("con estacionaria calcula canecas de 200, 500 y 1000 L por hectárea", () => {
    igual(app.textoCanecas("Terrestre (Estacionaria)", "400"), "Canecas de 200L/ha: 2 · Canecas de 500L/ha: 0.8 · Canecas de 1000L/ha: 0.4");
    igual(app.textoCanecas("Aerea (Dron)", "400"), "", "con dron no se muestran canecas");
    igual(app.textoCanecas("Terrestre (Estacionaria)", ""), "", "sin volumen no se muestra nada");
  });

  prueba("reconoce una visita ya muestreada del mismo cliente, finca y fecha", () => {
    const filas = [filaPunto({ cliente: "AVENDAÑOS", finca: "AMAZONAS", fecha: "2026-09-14" })];
    cierto(app.visitaYaExiste(filas, "AVENDAÑOS", "AMAZONAS", "2026-09-14"), "debería encontrarla");
    cierto(!app.visitaYaExiste(filas, "AVENDAÑOS", "AMAZONAS", "2026-09-15"), "otra fecha es otra visita");
    cierto(!app.visitaYaExiste(filas, "AVENDAÑOS", "SOLEDAD", "2026-09-14"), "otra finca es otra visita");
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

  // -------------------------------------------------------------------------
  // 7. Corregir el manejo de una visita que YA está en el Excel
  //    (bug real: cambiar tipo de fumigación o volumen no se guardaba ni se subía,
  //     porque esos datos viven en las filas de los puntos, no en una tabla aparte)
  // -------------------------------------------------------------------------
  console.log("\nManejo agronómico en filas ya subidas");

  function graphDePrueba(filas) {
    const escrituras = [];
    const g = cargarApp(["esquema.js", "graph.js"], {
      CONFIG: { TABLE_NAME: "TablaBaseDatos", CLIENT_ID: "x", AUTHORITY: "x", REDIRECT_URI: "x", GRAPH_SCOPES: [] },
      msal: { PublicClientApplication: function () { return { initialize: async () => {} }; } },
      fetch: async () => ({ ok: true, json: async () => ({}) }),
    }, ["Graph"]);
    g.Graph.conReintento = (fn) => fn("id-archivo");
    g.Graph.llamar = async (path) => {
      if (path.includes("/headerRowRange")) return { values: [TITULOS_BASE_REALES] };
      if (path.includes("/range?$select=address")) return { address: "'Base de datos'!A1:AN400" };
      // Las filas llegan como están en el Excel (40 columnas), no en el orden interno de la app.
      if (path.endsWith("/rows")) return { value: filas.map((f, i) => ({ index: i, values: [filaHaciaExcel("BASE", TITULOS_BASE_REALES, f)] })) };
      return {};
    };
    g.Graph.escribirRango = async (hoja, direccion, valores) => { escrituras.push({ hoja, direccion, valores }); };
    return { Graph: g.Graph, escrituras };
  }

  await pruebaAsync("cambia el manejo solo en las filas de esa visita y ese lote", async () => {
    const B = ESQUEMA.BASE;
    const fila = (lote, punto) => {
      const f = filaPunto({ cliente: "AVENDAÑOS", finca: "AMAZONAS", fecha: "2026-09-14" });
      f[B.lote] = lote; f[B.punto] = punto;
      return f;
    };
    const otra = filaPunto({ cliente: "OTRO", finca: "OTRA", fecha: "2026-09-14" });
    const { Graph, escrituras } = graphDePrueba([fila(1, 1), fila(1, 2), fila(2, 1), otra]);

    const cambiadas = await Graph.actualizarColumnasDonde("TablaBaseDatos",
      (f) => f[B.cliente] === "AVENDAÑOS" && String(f[B.lote]) === "1",
      { tipoFumigacion: "Aerea (Dron)", litrosMezclaHa: 30, ordenMezclaCorrecto: "Si", phFinalMezcla: 5.5 });

    igual(cambiadas, 2, "solo los 2 puntos del lote 1 de esa visita");
    igual(escrituras.length, 2, "una escritura por fila");
    igual(escrituras[0].hoja, "Base de datos", "la hoja sale de la dirección de la tabla");
    igual(escrituras[0].direccion, "AJ2:AM2", "primera fila de datos: encabezado en la 1, datos desde la 2");
    igual(escrituras[1].direccion, "AJ3:AM3", "segunda fila de datos");
    igual(escrituras[0].valores[0][0], "Aerea (Dron)", "escribe el tipo de fumigación");
    igual(escrituras[0].valores[0][3], 5.5, "escribe el pH");
  });

  await pruebaAsync("no toca las columnas de los datos capturados ni las de fórmula", async () => {
    const B = ESQUEMA.BASE;
    const { Graph, escrituras } = graphDePrueba([filaPunto({})]);
    await Graph.actualizarColumnasDonde("TablaBaseDatos", () => true,
      { tipoFumigacion: "", litrosMezclaHa: "", ordenMezclaCorrecto: "", phFinalMezcla: "" });
    igual(escrituras[0].direccion.split(":")[0].replace(/[0-9]/g, ""), "AJ",
      "el manejo va en las columnas con su título (AJ:AM), no encima de los hongos");
    igual(escrituras[0].valores[0].length, 4, "solo las 4 columnas del manejo");
  });

  // -------------------------------------------------------------------------
  // 8. El último punto no se pierde al terminar el lote
  //    (bug real: se exigía el formulario completo y, si faltaba un campo,
  //     el punto se descartaba en silencio; tocaba darle "Siguiente punto")
  // -------------------------------------------------------------------------
  console.log("\nÚltimo punto del lote");

  function appConFormulario(valores) {
    const elementos = new Map();
    const dame = (id) => {
      if (!elementos.has(id)) { const e = elementoFalso(); e.value = valores[id] || ""; elementos.set(id, e); }
      return elementos.get(id);
    };
    return cargarApp(["esquema.js", "app.js"], {
      CONFIG: { ASESOR: {} }, DB: {}, Graph: {}, Informes: {},
      document: {
        addEventListener() {}, getElementById: dame,
        querySelectorAll() { return []; }, querySelector() { return elementoFalso(); },
        createElement() { return elementoFalso(); },
      },
    });
  }

  prueba("un punto al que le falta un campo igual cuenta como escrito", () => {
    const a = appConFormulario({ adultos: "3", ninfas: "", "incid-coll": "20" });
    cierto(a.hayDatosEnPunto(), "con adultos e incidencia escritos hay que guardarlo");
  });

  prueba("un formulario en blanco no genera un punto vacío", () => {
    const a = appConFormulario({});
    cierto(!a.hayDatosEnPunto(), "sin nada escrito no se guarda nada");
  });

  prueba("el potrero solo no cuenta como punto (viene puesto del lote)", () => {
    const a = appConFormulario({ "potrero-nombre-punto": "Potrero 3" });
    cierto(!a.hayDatosEnPunto(), "el potrero es del lote, no un dato del punto");
  });

  // -------------------------------------------------------------------------
  // Subida automática mientras el asesor sigue trabajando (v67: antes se subían datos ya borrados
  // y lo corregido durante la subida quedaba marcado como "ya subido" sin haber llegado al Excel)
  // -------------------------------------------------------------------------
  console.log("\nSubida automática mientras se edita");

  function appConCola(items, alSubir) {
    const cola = new Map(items.map((it) => [it.id, { estado: "pendiente", ...it }]));
    const subidos = [];
    const marcados = [];
    const cache = {};
    const filasVisitas = [];
    const DB = {
      async leerCache(k) { return cache[k] ?? null; },
      async guardarCache(k, v) { cache[k] = v; },
      async agregarItem(tipo, datos) { const id = Math.max(0, ...cola.keys()) + 1; cola.set(id, { id, tipo, datos, estado: "pendiente" }); return id; },
      async listarItems() { return [...cola.values()].map((it) => ({ ...it })); },
      async leerItem(id) { return cola.has(id) ? { ...cola.get(id) } : null; },
      async eliminarItem(id) { cola.delete(id); },
      async actualizarDatosItem(id, datos) { const it = cola.get(id); it.datos = { ...it.datos, ...datos }; it.revision = (it.revision || 0) + 1; },
      async marcarSincronizado(id, revision) { marcados.push({ id, revision }); const it = cola.get(id); if (it && (it.revision || 0) === revision) it.estado = "sincronizado"; },
      async marcarError(id, msg) { const it = cola.get(id); if (it) it.ultimoError = msg; },
    };
    const Graph = {
      olvidarTitulos() {}, async agregarFila(fila) { subidos.push(fila); await alSubir(DB, subidos.length); },
      async eliminarFilasDonde() { return 0; },
      async agregarFilaEnTabla(tabla, fila) { if (tabla === "Visitas") filasVisitas.push(fila); },
    };
    const a = cargarApp(["esquema.js", "app.js"], { CONFIG: { ASESOR: {}, TABLA_VISITAS: "Visitas" }, DB, Graph, Informes: { invalidarCache() {} } });
    return { a, cola, subidos, marcados, filasVisitas };
  }
  const puntoCola = (id, lote) => ({ id, tipo: "punto", datos: { cliente: "C", finca: "F", fecha: "2026-09-23", lote, fila: new Array(24).fill(id) } });

  await pruebaAsync("un lote borrado mientras se subía ya no se sube", async () => {
    const { a, subidos } = appConCola([puntoCola(1, 1), puntoCola(2, 2)], async (DB, n) => { if (n === 1) await DB.eliminarItem(2); });
    await a.sincronizar({ silencioso: true });
    igual(subidos.length, 1, "solo debía subir el punto que sigue existiendo");
  });

  await pruebaAsync("lo corregido mientras se subía queda pendiente para volver a subir", async () => {
    const { a, cola, marcados } = appConCola([puntoCola(1, 1)], async (DB) => { await DB.actualizarDatosItem(1, { fila: [] }); });
    await a.sincronizar({ silencioso: true });
    igual(marcados[0].revision, 0, "debe avisar qué versión subió");
    igual(cola.get(1).estado, "pendiente", "la corrección no puede quedar como ya subida");
  });

  // -------------------------------------------------------------------------
  // Lista de visitas (hoja Visitas) para el agente del asesor
  // -------------------------------------------------------------------------
  console.log("\nLista de visitas");

  await pruebaAsync("cada visita queda una sola vez en la hoja Visitas, aunque tenga varios puntos", async () => {
    const { a, filasVisitas, subidos } = appConCola([puntoCola(1, 1), puntoCola(2, 2)], async () => {});
    await a.sincronizar({ silencioso: true });
    igual(subidos.length, 2, "los dos puntos suben");
    igual(filasVisitas.length, 1, "una sola fila para la visita");
    igual(JSON.stringify(filasVisitas[0]), JSON.stringify(["C", "F", "2026-09-23"]), "cliente, finca y fecha");
  });

  process.exit(resumen());
})();
