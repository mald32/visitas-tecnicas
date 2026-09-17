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
      return [];
    },
    async leerRango(hoja, rango) {
      if (rango === "A8:C19") return UMBRALES;
      if (rango === "A4:E500") return catalogo;
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
    noContiene(html, "Promedio general", "no debería haber fila de promedio con un solo lote");
    noContiene(html, "Estado general de la finca", "no debería haber bloque de promedio con un solo lote");
  });

  await pruebaAsync("con dos lotes SÍ incluye el promedio general", async () => {
    const { Informes } = cargarInformes({ filas: filasDosLotes });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    const html = Informes.generarHtml(D, [], "");
    contiene(html, "Promedio general");
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
    const { Informes } = cargarInformes({ leerTablaColgada: true, cache: { filasBase: filasDosLotes } });
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
    contiene(html, "<th>Potrero</th><th>Punto</th>", "pero sí el potrero de cada punto");
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

  await pruebaAsync("cada finca promedia todos los puntos de todos sus lotes", async () => {
    const { Informes } = cargarInformes({ filas: filasDosFincas });
    const D = await Informes.calcularDatosCliente("CLIENTE", seleccionDosFincas);
    igual(D.tabla_lotes.map((t) => t.lote).join(","), "AMAZONAS,SOLEDAD");
    cerca(D.tabla_lotes[0].adultos, 12, 1e-9, "promedio de los 3 puntos de AMAZONAS");
    igual(D.tabla_lotes[0].n_puntos, 3, "cuenta los puntos de los 2 lotes");
    cierto(D.tabla_lotes[0].adultos_sd > 0, "hay desviación para las barras de error");
    cerca(D.promedio_finca.adultos, 7.5, 1e-9, "el promedio general es entre fincas");
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
    contiene(html, "<th>Lote</th><th>Potrero</th><th>Punto</th>");
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
  await pruebaAsync("las tablas pintan el semáforo: verde, amarillo o rojo según umbral y máximo", async () => {
    const { Informes } = cargarInformes({
      filas: [
        filaPunto({ lote: 1, punto: 1, adultos: 3 }),   // por debajo del umbral (5) -> verde
        filaPunto({ lote: 2, punto: 1, adultos: 8 }),   // entre umbral y máximo (10) -> amarillo
        filaPunto({ lote: 3, punto: 1, adultos: 20 }),  // por encima del máximo -> rojo
      ],
    });
    const D = await Informes.calcularDatos("CLIENTE", "FINCA", "2026-09-14");
    igual(D.maximos["Umbral de Adultos de Collaria"], 10, "el máximo se lee de la columna C");
    const html = Informes.generarHtml(D, [], "");
    contiene(html, `<td class="sem-ok">3.0</td>`, "3 adultos: verde");
    contiene(html, `<td class="sem-medio">8.0</td>`, "8 adultos: amarillo");
    contiene(html, `<td class="sem-alto">20.0</td>`, "20 adultos: rojo");
  });

  // ---------------------------------------------------------------------------
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

  process.exit(resumen());
})();
