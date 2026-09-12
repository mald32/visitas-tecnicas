// Genera el informe HTML de una visita (Cliente/Finca/Fecha) leyendo directo de la hoja de Excel.
// Es la versión en el navegador de generar_informe.py + generar_informe_html.py.

const COL = {
  cliente: 0, finca: 1, fecha: 2, lote: 3, punto: 4,
  adultos: 5, ninfas: 6, incidColl: 7, sevColl: 8, danoCollTotal: 9,
  loritos: 10, lepidopteros: 11, hojasMoluscos: 12, incidMoluscos: 13, danoMoluscos: 14,
  incidHongos: 15, sevHongos: 16, danoHongos: 17, potrero: 18, observaciones: 19,
  tipoFumigacion: 20, litrosMezclaHa: 21, reguladorPhDosis: 22, insecticidaDosis: 23, fungicidaDosis: 24,
  fertilizanteDosis: 25, abonoDosisHa: 26, ordenMezclaCorrecto: 27, phFinalMezcla: 28,
};

const VARIABLES_HISTORIAL = {
  "Individuos Adultos de Collaria": COL.adultos,
  "Ninfas de Collaria": COL.ninfas,
  "Incidencia dano Collaria (%)": COL.incidColl,
  "Severidad dano Collaria (%)": COL.sevColl,
  "Individuos de Lorito": COL.loritos,
  "Numero de Lepidopteros": COL.lepidopteros,
  "Hojas atacadas por Moluscos": COL.hojasMoluscos,
  "Incidencia mancha fungica (%)": COL.incidHongos,
  "Severidad mancha fungica (%)": COL.sevHongos,
};

// Umbral y etiqueta de cada indicador de la tabla de resultados (para el semaforo y las alertas).
const DEFINICIONES_UMBRAL = [
  { campo: "incid_coll", nombre: "Incidencia de dano Collaria", umbral: "Umbral de Incidencia de ataques de Collaria", pct: true },
  { campo: "sev_coll", nombre: "Severidad de dano Collaria", umbral: "Umbral de Severidad promedio del Dano por Collaria", pct: true },
  { campo: "incid_hongos", nombre: "Incidencia de manchas fungicas", umbral: "Umbral de Incidencia de Manchas del Kikuyo", pct: true },
  { campo: "sev_hongos", nombre: "Severidad de manchas fungicas", umbral: "Umbral de Severidad Promedio del Ataque de Hongos", pct: true },
  { campo: "adultos", nombre: "Individuos adultos de Collaria", umbral: "Umbral de Adultos de Collaria", pct: false },
  { campo: "ninfas", nombre: "Ninfas de Collaria", umbral: "Umbral de Ninfas de Collaria", pct: false },
  { campo: "loritos", nombre: "Individuos de Lorito", umbral: "Umbral de Individuos de Lorito", pct: false },
  { campo: "lepidopteros", nombre: "Numero de Lepidopteros", umbral: "Umbral de Numero de Lepidopteros", pct: false },
  { campo: "dano_mol", nombre: "Dano por Moluscos", umbral: "Umbral de Dano por Moluscos", pct: true },
  { campo: "dano_coll", nombre: "Dano total por Collaria", umbral: "Umbral de Dano Total de la Pastura por Collaria", pct: true },
  { campo: "dano_hongos", nombre: "Dano por Hongos", umbral: "Umbral de Dano a la pastura por Hongos", pct: true },
  { campo: "pasto_sano", nombre: "Pasto sano", umbral: "Umbral (Min) de Pasto Sano", pct: true, esMinimo: true },
];

const COLORES_LOTE = ["#2e6b3e", "#c9772e", "#3a6ea5", "#8a4fa0", "#a02e2e", "#2e8a8a"];
// Orden: Dano Collaria, Dano Moluscos, Dano Hongos, Pasto Sano
const COLORES_TORTA = ["#e6b800", "#888888", "#722f37", "#2e6b3e"];
const ETIQUETAS_TORTA = ["Dano Collaria", "Dano Moluscos", "Dano Hongos", "Pasto Sano"];

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

const Informes = {
  _filasCache: null,
  _umbralesCache: null,

  async filas() {
    if (!this._filasCache) {
      const crudas = await Graph.leerTabla(CONFIG.TABLE_NAME);
      this._filasCache = crudas.map((f) => {
        const copia = [...f];
        copia[COL.fecha] = normalizarFecha(copia[COL.fecha]);
        return copia;
      });
    }
    return this._filasCache;
  },

  formatoFechaVisible,

  async umbrales() {
    if (!this._umbralesCache) {
      const filas = await Graph.leerRango(CONFIG.HOJA_CONFIG, "A8:B19");
      this._umbralesCache = {};
      filas.forEach(([nombre, valor]) => { if (nombre) this._umbralesCache[nombre] = valor; });
    }
    return this._umbralesCache;
  },

  invalidarCache() {
    this._filasCache = null;
    this._umbralesCache = null;
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
      return {
        lote, potrero: potreros.join(", "), observaciones,
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
          reguladorPhDosis: primero[COL.reguladorPhDosis] || "",
          insecticidaDosis: primero[COL.insecticidaDosis] || "",
          fungicidaDosis: primero[COL.fungicidaDosis] || "",
          fertilizanteDosis: primero[COL.fertilizanteDosis] || "",
          abonoDosisHa: primero[COL.abonoDosisHa] || "",
          ordenMezclaCorrecto: primero[COL.ordenMezclaCorrecto] || "",
          phFinalMezcla: primero[COL.phFinalMezcla] || "",
        },
      };
    });

    // Solo variables en "numero promedio de individuos" (se excluye Hojas por Moluscos, que es otra unidad).
    // El umbral se deja fijo en 5 para las cuatro, igual escala para todas. Barras de error = +-1 desv. estandar / 2.
    const barrasEstatica = {
      categorias: ["Individuos Adultos de Collaria", "Ninfas de Collaria", "Individuos de Lorito", "Numero de Lepidopteros"],
      umbrales: [5, 5, 5, 5],
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
    for (const [nombreVar, idxCol] of Object.entries(VARIABLES_HISTORIAL)) {
      const porLote = {}, erroresPorLote = {};
      for (const lote of lotesFinca) {
        const promedios = [], errores = [];
        for (const f of ultimas6) {
          const sub = filas.filter(
            (r) => r[COL.cliente] === cliente && r[COL.finca] === finca && r[COL.lote] === lote && r[COL.fecha] === f
          );
          promedios.push(promedio(sub.map((s) => s[idxCol])));
          errores.push(desviacion(sub.map((s) => s[idxCol])));
        }
        porLote[String(lote)] = promedios;
        erroresPorLote[String(lote)] = errores;
      }
      historial[nombreVar] = { fechas: ultimas6.map(fmtFechaCorta), lotes: porLote, errores: erroresPorLote };
    }

    const tortas = tablaLotes.map((t) => ({
      lote: t.lote, valores: [t.dano_coll || 0, t.dano_mol || 0, t.dano_hongos || 0, Math.max(t.pasto_sano || 0, 0)],
    }));

    // Alertas: cualquier indicador que supere (o, para pasto sano, no alcance) su umbral configurado.
    const alertas = [];
    for (const t of tablaLotes) {
      for (const def of DEFINICIONES_UMBRAL) {
        const valor = t[def.campo];
        const umbral = umbrales[def.umbral];
        if (valor == null || umbral == null) continue;
        const excede = def.esMinimo ? valor < umbral : valor > umbral;
        if (excede) {
          alertas.push(
            `Lote ${t.lote}: ${def.nombre} (${fmt(valor, def.pct)}) ${def.esMinimo ? "por debajo del minimo" : "supera el umbral"} (${fmt(umbral, def.pct)}).`
          );
        }
      }
    }

    const visitaNumero = fechasFinca.indexOf(fecha) + 1;

    return {
      cliente, finca, fecha, visita_numero: visitaNumero, lotes_reales: lotesReales, lotes_finca: lotesFinca,
      tabla_lotes: tablaLotes, barras_estatica: barrasEstatica, historial, tortas, alertas, umbrales,
    };
  },

  generarHtml(D, recomendacionTexto) {
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
    </tr>`).join("");

    const alertasHtml = D.alertas.length
      ? `<h2>Alertas de esta visita</h2><ul class="alertas-lista">${D.alertas.map((a) => `<li>${a}</li>`).join("")}</ul>`
      : `<h2>Alertas de esta visita</h2><p class="hint">Ningun indicador supero su umbral en esta visita.</p>`;

    function manejoHtml(m) {
      const filasM = [
        ["Tipo de fumigacion", m.tipoFumigacion], ["Litros de mezcla/ha", m.litrosMezclaHa],
        ["Regulador de pH y dosis", m.reguladorPhDosis], ["Insecticida y dosis", m.insecticidaDosis],
        ["Fungicida y dosis", m.fungicidaDosis], ["Fertilizante y dosis", m.fertilizanteDosis],
        ["Abono y dosis/ha", m.abonoDosisHa], ["Orden de mezcla correcto", m.ordenMezclaCorrecto],
        ["pH final de la mezcla", m.phFinalMezcla],
      ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");
      if (filasM.length === 0) return "";
      return `<ul class="manejo-lista">${filasM.map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`).join("")}</ul>`;
    }

    const porLoteHtml = D.tabla_lotes.map((t, i) => {
      const leyenda = D.tortas[i].valores.map((v, vi) =>
        `<li><span class="leg-swatch" style="background:${COLORES_TORTA[vi]}"></span>${ETIQUETAS_TORTA[vi]}: ${fmt(v, true)}</li>`
      ).join("");
      const manejo = manejoHtml(t.manejo);
      return `<div class="lote-bloque">
        <h3>Lote ${t.lote}${t.potrero ? ` — Potrero ${t.potrero}` : ""}</h3>
        <div class="chart-box"><canvas id="barrasLote${t.lote}" width="700" height="260"></canvas></div>
        <div class="torta-y-manejo">
          <div class="torta-box">
            <canvas id="torta${i}" width="200" height="200"></canvas>
            <ul class="torta-legend">${leyenda}</ul>
          </div>
          ${manejo ? `<div class="manejo-box"><strong>Manejo agronomico aplicado</strong>${manejo}</div>` : ""}
        </div>
      </div>`;
    }).join("");

    const opcionesVariable = Object.keys(D.historial).map((v) => `<option value="${v}">${v}</option>`).join("");

    const historialCanvasHtml = D.lotes_finca.map((lote) =>
      `<div class="chart-box"><h3>Lote ${lote}</h3><canvas id="historialLote${lote}" width="700" height="240"></canvas></div>`
    ).join("");

    const observacionesTexto = D.tabla_lotes.map((t) => {
      const etiqueta = `Lote ${t.lote}` + (t.potrero ? ` (Potrero ${t.potrero})` : "");
      return `${etiqueta}: ${t.observaciones || "Sin observaciones."}`;
    }).join("\n\n");

    const analisisBorrador = D.alertas.length
      ? D.alertas.join("\n")
      : "Ningun indicador supero su umbral en esta visita.";

    const recomendacionHtml = recomendacionTexto && recomendacionTexto.trim()
      ? recomendacionTexto.trim().replace(/\n/g, "<br>")
      : "Sin recomendaciones registradas para esta visita.";

    const asesor = (typeof CONFIG !== "undefined" && CONFIG.ASESOR) || {};

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Informe de Visita - ${D.cliente}</title>
<style>
:root{--verde:#2e6b3e;--verde-claro:#eaf3ec;--gris:#555;--borde:#dcdcdc;--rojo:#c0392b;}
body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:820px;margin:0 auto;padding:24px 20px 60px;color:#222;}
header{border-bottom:3px solid var(--verde);padding-bottom:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;}
header h1{margin:0 0 4px;font-size:22px;color:var(--verde);}
.asesor-box{text-align:right;font-size:11px;color:var(--gris);line-height:1.5;white-space:nowrap;}
.datos-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;background:var(--verde-claro);padding:14px 16px;border-radius:8px;margin-bottom:24px;font-size:14px;}
.datos-grid div span{color:var(--gris);display:block;font-size:12px;}
h2{font-size:16px;color:var(--verde);border-bottom:1px solid var(--borde);padding-bottom:6px;margin-top:32px;}
h3{font-size:14px;color:#333;margin:18px 0 8px;}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px;}
th,td{text-align:center;padding:6px 4px;border-bottom:1px solid var(--borde);}
th{background:#f5f5f5;color:var(--gris);font-weight:600;}
td:first-child,th:first-child{text-align:left;}
td.alerta{background:#fbe4e1;color:var(--rojo);font-weight:600;}
.alertas-lista{margin:10px 0 0;padding-left:18px;font-size:13px;color:var(--rojo);}
.chart-box{margin-top:12px;border:1px solid var(--borde);border-radius:8px;padding:14px;}
.lote-bloque{margin-top:20px;padding-top:4px;border-top:1px dashed var(--borde);}
.lote-bloque:first-child{border-top:none;}
.torta-y-manejo{display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;margin-top:10px;}
.torta-box{text-align:center;}
.torta-legend{list-style:none;padding:0;margin:6px 0 0;font-size:11px;color:var(--gris);text-align:left;display:inline-block;}
.torta-legend li{display:flex;align-items:center;gap:5px;margin:2px 0;}
.manejo-box{flex:1;min-width:220px;background:#fafafa;border:1px solid var(--borde);border-radius:8px;padding:10px 12px;font-size:12px;color:var(--gris);}
.manejo-lista{list-style:none;padding:0;margin:6px 0 0;}
.manejo-lista li{margin:3px 0;}
.leg-swatch{width:10px;height:10px;border-radius:2px;display:inline-block;}
select{padding:6px 10px;border-radius:6px;border:1px solid var(--borde);font-size:13px;}
textarea{width:100%;min-height:70px;border:1px solid var(--borde);border-radius:6px;padding:8px;font-family:inherit;font-size:13px;box-sizing:border-box;}
.caja-fija{white-space:pre-wrap;border:1px solid var(--borde);border-radius:6px;padding:10px;font-size:13px;background:#fafafa;min-height:40px;}
.firma{margin-top:36px;font-size:12px;color:var(--gris);border-top:1px solid var(--borde);padding-top:12px;}
.hint{font-size:12px;color:var(--gris);}
footer{margin-top:40px;font-size:11px;color:#999;text-align:center;}
</style></head>
<body>

<header>
  <div><h1>Informe de Visita Tecnica</h1>
  <p style="color:var(--gris)">${D.cliente} - Finca ${D.finca} · Visita No. ${D.visita_numero}</p></div>
  <div class="asesor-box">
    ${asesor.nombre ? `<strong>${asesor.nombre}</strong><br>` : ""}
    ${asesor.profesion ? `${asesor.profesion}<br>` : ""}
    ${asesor.cargo ? `${asesor.cargo}<br>` : ""}
    ${asesor.telefono ? `Tel: ${asesor.telefono}` : ""}
  </div>
</header>

<div class="datos-grid">
  <div><span>Fecha de visita</span>${D.fecha}</div>
  <div><span>Lotes revisados</span>${D.lotes_reales.map((l) => "Lote " + l).join(", ")}</div>
</div>

${alertasHtml}

<h2>Tabla de resultados por lote</h2>
<table><thead><tr>
<th>Lote</th><th>Incid. Collaria</th><th>Sev. Collaria</th><th>Incid. hongos</th><th>Sev. hongos</th>
<th>Adultos</th><th>Ninfas</th><th>Loritos</th><th>Lepidopteros</th>
<th>Dano moluscos</th><th>Dano collaria</th><th>Dano hongos</th><th>Pasto sano</th>
</tr></thead><tbody>${filasTabla}</tbody></table>

<h2>Plagas y estado por lote (vs. umbral)</h2>
${porLoteHtml}

<h2>Historial de la variable (evolucion por visita)</h2>
<div style="margin:10px 0;"><label style="font-size:13px;color:var(--gris);">Variable: </label>
<select id="varSelect">${opcionesVariable}</select></div>
${historialCanvasHtml}

<h2>Observaciones</h2>
<textarea>${observacionesTexto}</textarea>

<h2>Analisis de resultados y discusion</h2>
<textarea>${analisisBorrador}</textarea>

<h2>Recomendaciones</h2>
<div class="caja-fija">${recomendacionHtml}</div>

<div class="firma">
  ${asesor.nombre || ""}${asesor.profesion ? " — " + asesor.profesion : ""}${asesor.cargo ? " — " + asesor.cargo : ""}
</div>

<footer>Informe generado automaticamente a partir del registro de visitas tecnicas.</footer>

<script>
const COLORES = ${JSON.stringify(COLORES_LOTE)};
const barrasEstatica = ${JSON.stringify(D.barras_estatica)};
const historial = ${JSON.stringify(D.historial)};
const tortas = ${JSON.stringify(D.tortas)};
const lotesFinca = ${JSON.stringify(D.lotes_finca.map(String))};

function drawGroupedBars(canvasId, categorias, seriesByKey, keys, umbrales, errores, colorOffset) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height, padL = 50, padR = 20, padT = 20, padB = 60;
  ctx.clearRect(0,0,w,h);
  let maxVal = 1;
  keys.forEach(k => (seriesByKey[k]||[]).forEach(v => { if (v!=null && v>maxVal) maxVal=v; }));
  if (umbrales) umbrales.forEach(u => { if (u!=null && u>maxVal) maxVal=u; });
  if (errores) keys.forEach(k => (seriesByKey[k]||[]).forEach((v,ci) => {
    const e = (errores[k]||[])[ci];
    if (v!=null && e!=null && v+e/2>maxVal) maxVal = v+e/2;
  }));
  maxVal *= 1.15;
  const groupW = (w-padL-padR)/categorias.length;
  const barW = Math.min(28, groupW/(keys.length+1));

  const numTicks = 5;
  ctx.font="10px sans-serif"; ctx.textAlign="right";
  for (let i=0;i<=numTicks;i++) {
    const val = (maxVal/numTicks)*i;
    const y = h-padB-(val/maxVal)*(h-padT-padB);
    ctx.strokeStyle="#eee"; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w-padR, y); ctx.stroke();
    ctx.fillStyle="#888"; ctx.fillText(val.toFixed(1), padL-6, y+3);
  }

  ctx.strokeStyle="#ccc"; ctx.beginPath();
  ctx.moveTo(padL,padT); ctx.lineTo(padL,h-padB); ctx.lineTo(w-padR,h-padB); ctx.stroke();
  categorias.forEach((cat,ci) => {
    const gx = padL + ci*groupW + groupW/2 - (keys.length*barW)/2;
    keys.forEach((k,ki) => {
      const val = (seriesByKey[k]||[])[ci];
      if (val==null) return;
      const bh = (val/maxVal)*(h-padT-padB);
      const x = gx + ki*barW;
      const topY = h-padB-bh;
      ctx.fillStyle = COLORES[(ki+(colorOffset||0))%COLORES.length];
      ctx.fillRect(x, topY, barW-4, bh);

      const err = errores && (errores[k]||[])[ci];
      if (err!=null && err>0) {
        const halfPx = (err/2/maxVal)*(h-padT-padB);
        const cx = x + (barW-4)/2;
        ctx.strokeStyle="#333"; ctx.beginPath();
        ctx.moveTo(cx, topY-halfPx); ctx.lineTo(cx, topY+halfPx);
        ctx.moveTo(cx-4, topY-halfPx); ctx.lineTo(cx+4, topY-halfPx);
        ctx.moveTo(cx-4, topY+halfPx); ctx.lineTo(cx+4, topY+halfPx);
        ctx.stroke();
      }
    });
    ctx.fillStyle="#555"; ctx.font="11px sans-serif"; ctx.textAlign="center";
    ctx.save(); ctx.translate(padL+ci*groupW+groupW/2, h-padB+14);
    const words = cat.split(' '); ctx.fillText(words.slice(0,3).join(' '), 0, 0);
    if (words.length>3) ctx.fillText(words.slice(3).join(' '), 0, 12);
    ctx.restore();
    if (umbrales && umbrales[ci]!=null) {
      const uy = h-padB-(umbrales[ci]/maxVal)*(h-padT-padB);
      ctx.strokeStyle="#d33"; ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.moveTo(padL+ci*groupW, uy); ctx.lineTo(padL+(ci+1)*groupW, uy); ctx.stroke();
      ctx.setLineDash([]);
    }
  });
}

function drawPie(canvasId, valores) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  const colors = ${JSON.stringify(COLORES_TORTA)};
  const total = valores.reduce((a,b)=>a+b,0) || 1;
  let start = -Math.PI/2;
  const cx=100, cy=90, r=78;
  ctx.clearRect(0,0,200,200);
  valores.forEach((v,i) => {
    const angle = (v/total)*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,start,start+angle);
    ctx.closePath(); ctx.fillStyle=colors[i]; ctx.fill();
    start += angle;
  });
}

lotesFinca.forEach((lote, i) => {
  if (barrasEstatica.lotes[lote]) {
    drawGroupedBars("barrasLote"+lote, barrasEstatica.categorias,
      { [lote]: barrasEstatica.lotes[lote] }, [lote], barrasEstatica.umbrales,
      { [lote]: (barrasEstatica.errores||{})[lote] }, i);
  }
});
tortas.forEach((t,i) => drawPie("torta"+i, t.valores));

const varSelect = document.getElementById("varSelect");
function redrawHistorial() {
  const v = varSelect.value;
  const h = historial[v];
  lotesFinca.forEach((lote, i) => {
    drawGroupedBars("historialLote"+lote, h.fechas, { [lote]: h.lotes[lote] }, [lote], null,
      { [lote]: (h.errores||{})[lote] }, i);
  });
}
varSelect.addEventListener("change", redrawHistorial);
redrawHistorial();
</script>
</body></html>`;
  },

  async generar(cliente, finca, fecha, recomendacionTexto) {
    const D = await this.calcularDatos(cliente, finca, fecha);
    return this.generarHtml(D, recomendacionTexto);
  },
};
