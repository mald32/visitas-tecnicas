// Genera el informe HTML de una visita (Cliente/Finca/Fecha) leyendo directo de la hoja de Excel.
// Es la versión en el navegador de generar_informe.py + generar_informe_html.py.

const COL = {
  cliente: 0, finca: 1, fecha: 2, lote: 3, punto: 4,
  adultos: 5, ninfas: 6, incidColl: 7, sevColl: 8, danoCollTotal: 9,
  loritos: 10, lepidopteros: 11, hojasMoluscos: 12, incidMoluscos: 13, danoMoluscos: 14,
  incidHongos: 15, sevHongos: 16, danoHongos: 17, potrero: 18, observaciones: 19,
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

const COLORES_LOTE = ["#2e6b3e", "#c9772e", "#3a6ea5", "#8a4fa0", "#a02e2e", "#2e8a8a"];
// Orden: Dano Collaria, Dano Moluscos, Dano Hongos, Pasto Sano
const COLORES_TORTA = ["#e6b800", "#888888", "#722f37", "#2e6b3e"];

function promedio(valores) {
  const usables = valores.filter((v) => v !== null && v !== undefined);
  if (usables.length === 0) return null;
  return usables.reduce((a, b) => a + b, 0) / usables.length;
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
        dano_coll: danoColl, dano_mol: danoMol, dano_hongos: danoHongos,
        pasto_sano: 1 - (danoColl || 0) - (danoMol || 0) - (danoHongos || 0),
      };
    });

    // Solo variables en "numero promedio de individuos" (se excluye Hojas por Moluscos, que es otra unidad).
    // El umbral se deja fijo en 5 para las cuatro, igual escala para todas.
    const barrasEstatica = {
      categorias: ["Individuos Adultos de Collaria", "Ninfas de Collaria", "Individuos de Lorito", "Numero de Lepidopteros"],
      umbrales: [5, 5, 5, 5],
      lotes: Object.fromEntries(tablaLotes.map((t) => [
        String(t.lote), [t.adultos, t.ninfas, t.loritos, t.lepidopteros],
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
      const porLote = {};
      for (const lote of lotesFinca) {
        porLote[String(lote)] = ultimas6.map((f) => {
          const sub = filas.filter(
            (r) => r[COL.cliente] === cliente && r[COL.finca] === finca && r[COL.lote] === lote && r[COL.fecha] === f
          );
          return promedio(sub.map((s) => s[idxCol]));
        });
      }
      historial[nombreVar] = { fechas: ultimas6.map(fmtFechaCorta), lotes: porLote };
    }

    const tortas = tablaLotes.map((t) => ({
      lote: t.lote, valores: [t.dano_coll || 0, t.dano_mol || 0, t.dano_hongos || 0, Math.max(t.pasto_sano || 0, 0)],
    }));

    return { cliente, finca, fecha, lotes_reales: lotesReales, tabla_lotes: tablaLotes, barras_estatica: barrasEstatica, historial, tortas };
  },

  generarHtml(D) {
    const fmt = (v, pct) => (v === null || v === undefined ? "-" : pct ? `${(v * 100).toFixed(1)}%` : v.toFixed(1));

    const filasTabla = D.tabla_lotes.map((t) => `<tr>
      <td>Lote ${t.lote}</td>
      <td>${fmt(t.incid_coll, true)}</td><td>${fmt(t.sev_coll, true)}</td>
      <td>${fmt(t.incid_hongos, true)}</td><td>${fmt(t.sev_hongos, true)}</td>
      <td>${fmt(t.adultos)}</td><td>${fmt(t.ninfas)}</td>
      <td>${fmt(t.loritos)}</td><td>${fmt(t.lepidopteros)}</td>
      <td>${fmt(t.dano_mol, true)}</td><td>${fmt(t.dano_coll, true)}</td>
      <td>${fmt(t.dano_hongos, true)}</td><td>${fmt(t.pasto_sano, true)}</td>
    </tr>`).join("");

    const ETIQUETAS_TORTA = ["Dano Collaria", "Dano Moluscos", "Dano Hongos", "Pasto Sano"];
    const tortasHtml = D.tortas.map((t, i) => {
      const leyenda = t.valores.map((v, vi) =>
        `<li><span class="leg-swatch" style="background:${COLORES_TORTA[vi]}"></span>${ETIQUETAS_TORTA[vi]}: ${fmt(v, true)}</li>`
      ).join("");
      return `<div class="torta-box">
        <canvas id="torta${i}" width="220" height="220"></canvas>
        <div class="torta-label">Lote ${t.lote}</div>
        <ul class="torta-legend">${leyenda}</ul>
      </div>`;
    }).join("");

    const lotesFinca = [...new Set(Object.values(D.historial).flatMap((h) => Object.keys(h.lotes)))].sort((a, b) => a - b);
    const leyendaLotes = lotesFinca.map((l, i) =>
      `<span class="leg-item"><span class="leg-swatch" style="background:${COLORES_LOTE[i % 6]}"></span>Lote ${l}</span>`
    ).join("");

    const opcionesVariable = Object.keys(D.historial).map((v) => `<option value="${v}">${v}</option>`).join("");

    const observacionesTexto = D.tabla_lotes.map((t) => {
      const etiqueta = `Lote ${t.lote}` + (t.potrero ? ` (Potrero ${t.potrero})` : "");
      return `${etiqueta}: ${t.observaciones || "Sin observaciones."}`;
    }).join("\n\n");

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Informe de Visita - ${D.cliente}</title>
<style>
:root{--verde:#2e6b3e;--verde-claro:#eaf3ec;--gris:#555;--borde:#dcdcdc;}
body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:820px;margin:0 auto;padding:24px 20px 60px;color:#222;}
header{border-bottom:3px solid var(--verde);padding-bottom:14px;margin-bottom:20px;}
header h1{margin:0 0 4px;font-size:22px;color:var(--verde);}
.datos-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;background:var(--verde-claro);padding:14px 16px;border-radius:8px;margin-bottom:24px;font-size:14px;}
.datos-grid div span{color:var(--gris);display:block;font-size:12px;}
h2{font-size:16px;color:var(--verde);border-bottom:1px solid var(--borde);padding-bottom:6px;margin-top:32px;}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px;}
th,td{text-align:center;padding:6px 4px;border-bottom:1px solid var(--borde);}
th{background:#f5f5f5;color:var(--gris);font-weight:600;}
td:first-child,th:first-child{text-align:left;}
.chart-box{margin-top:12px;border:1px solid var(--borde);border-radius:8px;padding:14px;}
.tortas-row{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin-top:12px;}
.torta-box{text-align:center;}
.torta-label{font-size:13px;color:var(--gris);margin-top:4px;font-weight:600;}
.torta-legend{list-style:none;padding:0;margin:6px 0 0;font-size:11px;color:var(--gris);text-align:left;display:inline-block;}
.torta-legend li{display:flex;align-items:center;gap:5px;margin:2px 0;}
.leyenda{display:flex;gap:16px;justify-content:center;margin-top:10px;font-size:12px;flex-wrap:wrap;}
.leg-item{display:flex;align-items:center;gap:5px;}
.leg-swatch{width:10px;height:10px;border-radius:2px;display:inline-block;}
select{padding:6px 10px;border-radius:6px;border:1px solid var(--borde);font-size:13px;}
textarea{width:100%;min-height:70px;border:1px solid var(--borde);border-radius:6px;padding:8px;font-family:inherit;font-size:13px;box-sizing:border-box;}
footer{margin-top:40px;font-size:11px;color:#999;text-align:center;}
</style></head>
<body>

<header><h1>Informe de Visita Tecnica</h1>
<p style="color:var(--gris)">${D.cliente} - Finca ${D.finca}</p></header>

<div class="datos-grid">
  <div><span>Fecha de visita</span>${D.fecha}</div>
  <div><span>Lotes revisados</span>${D.lotes_reales.map((l) => "Lote " + l).join(", ")}</div>
</div>

<h2>Tabla de resultados por lote</h2>
<table><thead><tr>
<th>Lote</th><th>Incid. Collaria</th><th>Sev. Collaria</th><th>Incid. hongos</th><th>Sev. hongos</th>
<th>Adultos</th><th>Ninfas</th><th>Loritos</th><th>Lepidopteros</th>
<th>Dano moluscos</th><th>Dano collaria</th><th>Dano hongos</th><th>Pasto sano</th>
</tr></thead><tbody>${filasTabla}</tbody></table>

<h2>Estado actual de cada lote</h2>
<div class="tortas-row">${tortasHtml}</div>

<h2>Plagas de la visita actual (vs. umbral)</h2>
<div class="chart-box"><canvas id="barrasActual" width="700" height="300"></canvas></div>
<div class="leyenda">${leyendaLotes}</div>

<h2>Historial de la variable (evolucion por visita)</h2>
<div class="chart-box">
  <div style="margin-bottom:8px;"><label style="font-size:13px;color:var(--gris);">Variable: </label>
  <select id="varSelect">${opcionesVariable}</select></div>
  <canvas id="barrasHistorial" width="700" height="300"></canvas>
</div>
<div class="leyenda">${leyendaLotes}</div>

<h2>Observaciones</h2>
<textarea>${observacionesTexto}</textarea>

<h2>Analisis de resultados y discusion</h2>
<textarea placeholder="Pega aqui el parrafo de analisis..."></textarea>

<h2>Recomendaciones</h2>
<textarea placeholder="Pega aqui el parrafo de recomendaciones (indicando los productos a usar)..."></textarea>

<footer>Informe generado automaticamente a partir del registro de visitas tecnicas.</footer>

<script>
const COLORES = ${JSON.stringify(COLORES_LOTE)};
const barrasEstatica = ${JSON.stringify(D.barras_estatica)};
const historial = ${JSON.stringify(D.historial)};
const tortas = ${JSON.stringify(D.tortas)};

function drawGroupedBars(canvasId, categorias, seriesByKey, keys, umbrales) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height, padL = 50, padR = 20, padT = 20, padB = 60;
  ctx.clearRect(0,0,w,h);
  let maxVal = 1;
  keys.forEach(k => (seriesByKey[k]||[]).forEach(v => { if (v!=null && v>maxVal) maxVal=v; }));
  if (umbrales) umbrales.forEach(u => { if (u!=null && u>maxVal) maxVal=u; });
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
      ctx.fillStyle = COLORES[ki%COLORES.length];
      ctx.fillRect(x, h-padB-bh, barW-4, bh);
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
  const cx=110, cy=100, r=85;
  ctx.clearRect(0,0,220,220);
  valores.forEach((v,i) => {
    const angle = (v/total)*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,start,start+angle);
    ctx.closePath(); ctx.fillStyle=colors[i]; ctx.fill();
    start += angle;
  });
}

drawGroupedBars("barrasActual", barrasEstatica.categorias, barrasEstatica.lotes, Object.keys(barrasEstatica.lotes), barrasEstatica.umbrales);
tortas.forEach((t,i) => drawPie("torta"+i, t.valores));

const varSelect = document.getElementById("varSelect");
function redrawHistorial() {
  const v = varSelect.value;
  const h = historial[v];
  drawGroupedBars("barrasHistorial", h.fechas, h.lotes, Object.keys(h.lotes), null);
}
varSelect.addEventListener("change", redrawHistorial);
redrawHistorial();
</script>
</body></html>`;
  },

  async generar(cliente, finca, fecha) {
    const D = await this.calcularDatos(cliente, finca, fecha);
    return this.generarHtml(D);
  },
};
