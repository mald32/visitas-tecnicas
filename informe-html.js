// Arma el HTML del informe a partir de los datos ya calculados por informes.js (Informes.calcularDatos
// o calcularDatosCliente). Estaba dentro de informes.js como una sola función de 840 líneas.

Informes.generarHtml = function (D, productosRecomendados, notasAdicionales, manejoFumigacion = {}) {
    const U = D.etiqueta_unidad || "Lote";              // Lote (informe de visita) o Finca (informe de cliente)
    const UP = D.plural_unidad || "lotes";
    const nombreUnidad = (valor) => `${U} ${valor}`;
    // Lo que supera su umbral va en letra roja; lo demás, normal. Antes cada celda llevaba fondo
    // verde, amarillo o rojo, pero la tabla ahora usa fondos para distinguir potrero, lote y
    // finca, y los dos colores juntos no se leían. En Pasto sano es al revés (es un mínimo).
    const semaforo = (valor, def) => {
      if (!def || valor == null) return "";
      const umbral = D.umbrales[def.umbral];
      if (umbral == null) return "";
      const supera = def.esMinimo ? valor < umbral : valor > umbral;
      return supera ? ' class="sem-alto"' : "";
    };
    const defDe = (campo) => DEFINICIONES_UMBRAL.find((d) => d.campo === campo);
    const u = D.umbrales;
    const um = (nombreDef) => u[DEFINICIONES_UMBRAL.find((d) => d.campo === nombreDef).umbral];

    const celdasTabla = (t) => `
      <td${semaforo(t.incid_coll, defDe("incid_coll"))}>${fmt(t.incid_coll, true)}</td>
      <td${semaforo(t.sev_coll, defDe("sev_coll"))}>${fmt(t.sev_coll, true)}</td>
      <td${semaforo(t.incid_hongos, defDe("incid_hongos"))}>${fmt(t.incid_hongos, true)}</td>
      <td${semaforo(t.sev_hongos, defDe("sev_hongos"))}>${fmt(t.sev_hongos, true)}</td>
      <td${semaforo(t.adultos, defDe("adultos"))}>${fmt(t.adultos)}</td>
      <td${semaforo(t.ninfas, defDe("ninfas"))}>${fmt(t.ninfas)}</td>
      <td${semaforo(t.loritos, defDe("loritos"))}>${fmt(t.loritos)}</td>
      <td${semaforo(t.lepidopteros, defDe("lepidopteros"))}>${fmt(t.lepidopteros)}</td>`;
    // En el informe de lotes cada nivel lleva su fondo (lote / potrero / general); el informe por
    // fincas queda como estaba.
    const claseLote = D.es_cliente ? "" : ' class="fila-lote"';
    const filasTabla = D.tabla_lotes.map((t) => `<tr${claseLote}>
      <td>${esc(nombreUnidad(t.lote))}</td>${celdasTabla(t)}
    </tr>` + (t.potreros_detalle || []).map((p) => `<tr class="fila-potrero">
      <td>Potrero ${esc(p.potrero)}</td>${celdasTabla(p)}
    </tr>`).join("")).join("") + (D.tabla_lotes.length > 1 ? `<tr class="fila-promedio">
      <td>Ponderado general</td>
      <td${semaforo(D.promedio_finca.incid_coll, defDe("incid_coll"))}>${fmt(D.promedio_finca.incid_coll, true)}</td>
      <td${semaforo(D.promedio_finca.sev_coll, defDe("sev_coll"))}>${fmt(D.promedio_finca.sev_coll, true)}</td>
      <td${semaforo(D.promedio_finca.incid_hongos, defDe("incid_hongos"))}>${fmt(D.promedio_finca.incid_hongos, true)}</td>
      <td${semaforo(D.promedio_finca.sev_hongos, defDe("sev_hongos"))}>${fmt(D.promedio_finca.sev_hongos, true)}</td>
      <td${semaforo(D.promedio_finca.adultos, defDe("adultos"))}>${fmt(D.promedio_finca.adultos)}</td>
      <td${semaforo(D.promedio_finca.ninfas, defDe("ninfas"))}>${fmt(D.promedio_finca.ninfas)}</td>
      <td${semaforo(D.promedio_finca.loritos, defDe("loritos"))}>${fmt(D.promedio_finca.loritos)}</td>
      <td${semaforo(D.promedio_finca.lepidopteros, defDe("lepidopteros"))}>${fmt(D.promedio_finca.lepidopteros)}</td>
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
        ? `<strong>${g.lotes.length > 1 ? U + "s " : U + " "}${g.lotes.join(", ")}</strong>`
        : "";
      return `<div class="manejo-box">${subtitulo}${manejo}</div>`;
    }).join("");

    // Indicadores de productividad como tarjetas: los 3 valores calculados son lo que el productor
    // quiere ver (van grandes y resaltados); los datos de entrada van debajo, en pequeño.
    const numero = (v, dec = 1) => (v == null || Number.isNaN(Number(v)) ? "-" : Number(v).toFixed(dec));
    const productividadHtml = (D.productividad || []).length
      ? D.productividad.map((p) => `<div class="kpi-bloque">
          <span class="rotulo">${p.lote ? esc(nombreUnidad(p.lote)) : "Finca en general"}</span>
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
      const nota = (t.n_puntos === 1
        ? "1 punto de muestreo (sin dispersión)."
        : `Ponderado de ${t.n_puntos} puntos de muestreo según zonas y potreros.`) +
        (t.sin_areas ? " Sin areas de potreros registradas." : "");
      return `<div class="lote-bloque">
        <h3><button type="button" class="ver-detalle no-imprimir" onclick="document.getElementById('detalle${i}').showModal()">
          ${esc(nombreUnidad(t.lote))}${t.subtitulo ? ` — ${esc(t.subtitulo)}` : ""} <span class="lupa">ver puntos</span>
        </button><span class="solo-pdf">${esc(nombreUnidad(t.lote))}${t.subtitulo ? ` — ${esc(t.subtitulo)}` : ""}</span></h3>
        ${detalleHtml(t, i)}
        ${panelesHtml(valores, errores, D.tortas[i].valores)}
        <p class="nota-puntos">${nota}</p>
      </div>` + (t.potreros_detalle || []).map((p) => `<div class="lote-bloque lote-bloque-potrero">
        <h3>${esc(nombreUnidad(t.lote))} — Potrero ${esc(p.potrero)}</h3>
        ${panelesHtml([p.adultos, p.ninfas, p.loritos, p.lepidopteros], [p.adultos_sd, p.ninfas_sd, p.loritos_sd, p.lepidopteros_sd],
          [p.dano_coll || 0, p.dano_mol || 0, p.dano_hongos || 0, Math.max(p.pasto_sano || 0, 0)])}
        <p class="nota-puntos">${p.n_puntos === 1 ? "1 punto de muestreo (sin dispersión)." : `Ponderado de ${p.n_puntos} puntos de muestreo según sus zonas.`}</p>
      </div>`).join("");
    }).join("") + (D.tabla_lotes.length <= 1 ? "" : `<div class="lote-bloque lote-bloque-promedio">
        <h3>Estado general de la finca</h3>
        ${panelesHtml(D.promedio_barras.valores, D.promedio_barras.errores, D.promedio_torta)}
        <p class="nota-puntos">${D.es_cliente ? `Ponderado de las ${D.tabla_lotes.length} fincas.` : "Ponderado de la finca: cada lote pesa igual y, dentro de él, cada potrero según su área o por partes iguales."}${D.promedio_finca.sin_areas ? " Sin areas de potreros registradas." : ""}</p>
      </div>`);

    const opcionesVariable = GRUPOS_HISTORIAL.map((g) => `<option value="${g.id}">${g.nombre}</option>`).join("") +
      `<option value="todas">Todas (versión para imprimir)</option>`;

    // Una gráfica por variable, con una línea por lote: así se comparan los lotes entre sí en cada
    // visita. Se dibujan todas al abrir el informe; el desplegable solo muestra u oculta grupos.
    const variablesHistorial = GRUPOS_HISTORIAL.flatMap((g) => g.variables.map((v) => ({ grupo: g.id, variable: v })));
    const historialCanvasHtml = `<div class="leyenda-lotes">${D.lotes_finca.map((lote, i) =>
      `<span><i style="background:${COLORES_LOTE[i % COLORES_LOTE.length]}"></i>${esc(nombreUnidad(lote))}</span>`).join("")}</div>
      <div id="historialGrid" class="historial-grid">${variablesHistorial.map((v, i) =>
        `<div class="chart-box historial-item" data-grupo="${v.grupo}"><h3>${esc(v.variable)}</h3>
          <canvas id="hist${i}" data-variable="${esc(v.variable)}" width="330" height="200"></canvas></div>`).join("")}</div>`;

    const observacionesTexto = esc(D.tabla_lotes.map((t) => {
      const etiqueta = nombreUnidad(t.lote) + (t.subtitulo ? ` (${t.subtitulo})` : "");
      const texto = [t.observacion_lote, t.observaciones].filter(Boolean).join(" · ");
      return `${etiqueta}: ${texto || "Sin observaciones."}`;
    }).join("\n\n"));

    const baseResultados = D.tabla_lotes.length === 1
      ? esc(nombreUnidad(D.tabla_lotes[0].lote))
      : `Ponderado de ${U === "Finca" ? "las" : "los"} ${D.tabla_lotes.length} ${UP}`;
    const resultadosHtml = `<strong>${baseResultados}:</strong><br>` + (D.alertas.length
      ? D.alertas.map((a) => `• ${esc(a)}`).join("<br>")
      : "Ningún indicador superó su umbral en esta visita.");

    const TIPOS_FUMIGACION_TEXTO = {
      "Aerea (Dron)": "Aérea (Dron)",
      "Terrestre (Estacionaria)": "Terrestre (Estacionaria)",
      "Terrestre (Bomba de espalda)": "Terrestre (Bomba de espalda)",
    };
    // Con estacionaria la dosis se da por caneca de 200 L; se agrega la equivalencia para canecas
    // de 500 y 1000 L (2,5 y 5 veces), que también se usan en campo.
    function formatearDosis(p) {
      if (!p.dosis) return "";
      const sufijo = UNIDAD_APLICACION_POR_TIPO[p.tipoFumigacion] || "";
      const unidad = p.unidad || "";
      let texto = `${p.dosis}${unidad}${sufijo}`;
      const n = Number(String(p.dosis).trim().replace(",", "."));
      if (p.tipoFumigacion === "Terrestre (Estacionaria)" && Number.isFinite(n) && n > 0) {
        const redondear = (x) => String(Number(x.toFixed(2)));
        texto += ` (${redondear(n * 2.5)}${unidad}/Caneca 500L - ${redondear(n * 5)}${unidad}/Caneca 1000L)`;
      }
      return texto;
    }

    // Ventana (se abre al tocar el nombre del lote o de la finca) con todos los puntos capturados.
    function detalleHtml(t, i) {
      const conLote = !!D.es_cliente;
      const filas = (t.puntos || []).map((p) => `<tr>
        ${conLote ? `<td>${esc(p.lote)}</td>` : ""}
        <td>${esc(p.potrero || "")}</td>
        <td>${esc(p.zona)}</td>
        <td>${esc(p.punto)}</td>
        <td${semaforo(p.adultos, defDe("adultos"))}>${fmt(p.adultos)}</td>
        <td${semaforo(p.ninfas, defDe("ninfas"))}>${fmt(p.ninfas)}</td>
        <td${semaforo(p.loritos, defDe("loritos"))}>${fmt(p.loritos)}</td>
        <td${semaforo(p.lepidopteros, defDe("lepidopteros"))}>${fmt(p.lepidopteros)}</td>
        <td${semaforo(p.incid_coll, defDe("incid_coll"))}>${fmt(p.incid_coll, true)}</td>
        <td${semaforo(p.sev_coll, defDe("sev_coll"))}>${fmt(p.sev_coll, true)}</td>
        <td${semaforo(p.incid_hongos, defDe("incid_hongos"))}>${fmt(p.incid_hongos, true)}</td>
        <td${semaforo(p.sev_hongos, defDe("sev_hongos"))}>${fmt(p.sev_hongos, true)}</td>
      </tr>`).join("");
      return `<dialog id="detalle${i}" class="detalle-puntos no-imprimir">
        <h3>${esc(nombreUnidad(t.lote))}${t.subtitulo ? ` — ${esc(t.subtitulo)}` : ""}</h3>
        <p class="hint">Datos de cada punto de muestreo, tal como se capturaron.</p>
        <div class="tabla-scroll"><table class="tabla-lotes"><thead><tr>
          ${conLote ? "<th>Lote</th>" : ""}<th>Potrero</th><th>Zona</th><th>Punto</th>
          <th>Collaria Adultos</th><th>Collaria Ninfas</th><th>Loritos</th><th>Lepidópteros</th>
          <th>Incidencia Collaria</th><th>Severidad Collaria</th><th>Incidencia Hongo</th><th>Severidad Hongo</th>
        </tr></thead><tbody>${filas}</tbody></table></div>
        <button type="button" class="cerrar-detalle" onclick="this.closest('dialog').close()">Cerrar</button>
      </dialog>`;
    }

    const tipoFumigacionTexto = TIPOS_FUMIGACION_TEXTO[manejoFumigacion.tipo] || "";
    const tipoFumigacionHtml = (tipoFumigacionTexto || manejoFumigacion.volumenMezcla)
      ? `<div class="manejo-columnas">
          ${tipoFumigacionTexto ? `<div><span class="manejo-etiqueta">Tipo de fumigación</span>${tipoFumigacionTexto}</div>` : ""}
          ${manejoFumigacion.volumenMezcla ? `<div><span class="manejo-etiqueta">Volumen de mezcla/hectárea</span>${esc(manejoFumigacion.volumenMezcla)}L</div>` : ""}
        </div>`
      : "";

    // En el informe por fincas se muestra lo que ya se recomendó en la visita de cada finca.
    const fincaConRecomendacion = (t) => (t.recomendados || []).length > 0 || (t.informe && (t.informe.notas || t.informe.tipoFumigacion));
    const recomendacionesPorFinca = () => D.tabla_lotes.filter(fincaConRecomendacion).map((t) => {
      const informe = t.informe || {};
      const productos = (t.recomendados || []).map((p) => ({ ...p, tipoFumigacion: informe.tipoFumigacion }));
      const encabezado = [
        informe.tipoFumigacion ? `Fumigación: ${TIPOS_FUMIGACION_TEXTO[informe.tipoFumigacion] || esc(informe.tipoFumigacion)}` : "",
        informe.volumenMezcla ? `Volumen de mezcla: ${esc(informe.volumenMezcla)}L/ha` : "",
      ].filter(Boolean).join(" · ");
      const lista = productos.length
        ? `<ol class="reco-lista">${productos.map((p) => {
            const dosis = formatearDosis(p);
            return `<li><div class="reco-texto"><strong>${esc(p.nombre)}</strong>${p.tipo ? `<span class="reco-detalle"> — ${esc(p.tipo)}</span>` : ""}
              ${dosis ? `<div class="reco-dosis">${esc(dosis)}</div>` : ""}</div></li>`;
          }).join("")}</ol>`
        : `<p class="hint">Sin productos recomendados en esta visita.</p>`;
      return `<div class="manejo-box"><strong>${esc(nombreUnidad(t.lote))}</strong>
        ${encabezado ? `<p class="hint">${encabezado}</p>` : ""}${lista}
        ${informe.notas ? `<p class="nota-puntos">${esc(informe.notas).replace(/\n/g, "<br>")}</p>` : ""}</div>`;
    }).join("");

    const listaProductosHtml = (productos) => `<ol class="reco-lista">${productos.map((p) => {
      const dosis = formatearDosis(p);
      return `<li>
        <div class="reco-texto">
          <strong>${esc(p.nombre)}</strong>${p.tipo ? `<span class="reco-detalle"> — ${esc(p.tipo)}</span>` : ""}
          ${dosis ? `<div class="reco-dosis">${esc(dosis)}</div>` : ""}
        </div>
      </li>`;
    }).join("")}</ol>`;

    const productosRecomendadosHtml = D.es_cliente
      ? (((productosRecomendados || []).length ? tipoFumigacionHtml + listaProductosHtml(productosRecomendados) : "")
        + (D.tabla_lotes.some(fincaConRecomendacion) ? `<h3>Lo recomendado en cada finca</h3>` + recomendacionesPorFinca() : "")
        || `<p class="hint">Sin productos recomendados para este informe.</p>`)
      : (productosRecomendados || []).length
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

    // El encabezado se repite arriba de cada página al imprimir el informe en PDF.
    const encabezadoHtml = `<header>
  <div class="enc-visita">
    <div class="enc-marca">
      <img src="${LOGO_DATA_URI}" alt="Galagro" class="logo">
      <h1>${D.es_cliente ? "Informe Técnico por Fincas" : "Informe de Visita Técnica"}</h1>
    </div>
    <dl class="enc-datos">
      <dt>Cliente:</dt><dd>${esc(D.cliente)}</dd>
      ${D.es_cliente
        ? `<dt>Fincas:</dt><dd>${D.tabla_lotes.length}</dd>`
        : `<dt>Finca:</dt><dd>${esc(D.finca)}</dd><dt>Visita No:</dt><dd>${esc(D.visita_numero)}</dd>`}
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
</header>`;

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Informe de Visita - ${esc(D.cliente)}</title>
<style>
${ESTILOS_INFORME}
</style></head>
<body>

<button type="button" class="no-imprimir boton-imprimir" onclick="window.print()">Guardar como PDF / Imprimir</button>
${encabezadoHtml}

<div class="datos-grid${D.es_cliente ? " datos-grid-cliente" : ""}">
  ${D.es_cliente
    ? `<div><span class="icono">${ICONO_CALENDARIO}</span><span class="etiqueta">Fincas y fecha de muestreo</span>
        <span class="valor lista-fincas">${D.tabla_lotes.map((t) =>
          `<span>${esc(t.lote)} <em>${formatoFechaVisible(t.fecha)}</em></span>`).join("")}</span></div>`
    : `<div><span class="icono">${ICONO_CALENDARIO}</span><span class="etiqueta">Fecha de visita</span><span class="valor">${esc(D.fecha)}</span></div>
      <div><span class="icono">${ICONO_LOTES}</span><span class="etiqueta">Lotes revisados</span><span class="valor">${D.lotes_reales.map((l) => {
        const t = D.tabla_lotes.find((x) => x.lote === l);
        return esc(nombreUnidad(l)) + (t && t.subtitulo ? ` (${esc(t.subtitulo)})` : "");
      }).join(", ")}</span></div>`}
</div>

<h2 class="banner-naranja">Indicadores de productividad</h2>
${productividadHtml}

<h2 class="banner-azul">Manejo Fitosanitario Actual</h2>
${manejoTodosHtml ? `<div class="manejo-grid">${manejoTodosHtml}</div>` : '<p class="hint">Sin manejo agronómico registrado en esta visita.</p>'}

<h2>Tabla de resultados por lote</h2>
<table class="tabla-lotes"><thead><tr>
<th>Lote</th><th>Incid. Collaria</th><th>Sev. Collaria</th><th>Incid. hongos</th><th>Sev. hongos</th>
<th>Adultos</th><th>Ninfas</th><th>Loritos</th><th>Lepidópteros</th>
</tr></thead><tbody>${filasTabla}</tbody></table>

<h2 class="banner-amarillo">Plagas y estado por lote (vs. umbral)</h2>
<p class="hint">La marca negra en cada barra es el umbral; en rojo, lo que lo supera. La línea fina muestra la dispersión entre puntos de muestreo.</p>
<div class="lotes-grid">${porLoteHtml}</div>

<h2 class="banner-naranja">Historial de la variable (evolucion por visita)</h2>
<div class="historial-cab no-imprimir"><label for="varSelect">Grupo de variables:</label>
<select id="varSelect">${opcionesVariable}</select></div>
${historialCanvasHtml}

<h2 class="banner-azul">Observaciones</h2>
<div class="caja-fija">${observacionesTexto}</div>

<h2>Resultados</h2>
<div class="caja-fija">${resultadosHtml}</div>

<h2 class="banner-azul">Recomendaciones</h2>
${productosRecomendadosHtml}

<h3>Observaciones adicionales</h3>
<div class="caja-fija">${notasHtml}</div>

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
function drawLineChart(canvasId, etiquetas, series, umbral, opciones) {
  opciones = opciones || {};
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const { ctx, w, h } = prepararCanvas(canvas);
  const padL = 40, padR = 10, padT = 12, padB = 28;

  let maxVal = 0;
  series.forEach((s) => s.valores.forEach((v) => { if (v != null && v > maxVal) maxVal = v; }));
  if (umbral != null && umbral > maxVal) maxVal = umbral;
  const escala = calcularEscalaEjeY(maxVal, !!opciones.pct);
  maxVal = escala.max;

  const puntosEje = (series[0] && series[0].valores.length) || 1;
  const x = (i) => padL + (puntosEje <= 1 ? (w - padL - padR) / 2 : (i * (w - padL - padR)) / (puntosEje - 1));
  const y = (v) => h - padB - (v / maxVal) * (h - padT - padB);
  const fmtTick = (val) => opciones.pct ? Math.round(val * 100) + "%"
    : (Number.isInteger(Math.round(val * 10) / 10) ? String(Math.round(val * 10) / 10) : (Math.round(val * 10) / 10).toFixed(1));

  ctx.font = "9.5px " + FUENTE_GRAFICA;
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

  series.forEach((serie) => {
    const color = serie.color || COLORES[0];
    const puntos = serie.valores.map((v, i) => (v == null ? null : { x: x(i), y: y(v) })).filter(Boolean);
    if (puntos.length > 1) {
      ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.lineJoin = "round";
      ctx.beginPath(); puntos.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    }
    puntos.forEach((p) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = "#fff"; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
    });
  });

  ctx.fillStyle = TINTA.texto; ctx.font = "9.5px " + FUENTE_GRAFICA; ctx.textAlign = "center";
  etiquetas.forEach((et, i) => { ctx.fillText(et, x(i), h - padB + 13); });
}

const varSelect = document.getElementById("varSelect");
const grid = document.getElementById("historialGrid");

function dibujarHistorial() {
  grid.querySelectorAll("canvas").forEach((canvas) => {
    const v = canvas.dataset.variable;
    const h = historial[v];
    if (!h) return;
    const series = lotesFinca.map((lote, i) => ({ valores: h.lotes[lote], color: COLORES[i % COLORES.length] }));
    drawLineChart(canvas.id, h.fechas, series, umbralesHistorial[v], { pct: v.indexOf("(%)") !== -1 });
  });
}

function filtrarHistorial() {
  const elegido = varSelect.value;
  grid.classList.toggle("todas", elegido === "todas");
  grid.querySelectorAll(".historial-item").forEach((item) => {
    item.hidden = elegido !== "todas" && item.dataset.grupo !== elegido;
  });
}

varSelect.addEventListener("change", filtrarHistorial);
dibujarHistorial();
filtrarHistorial();
</script>
</body></html>`;
};
