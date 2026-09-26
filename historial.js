// Pestaña Historial: lista de visitas y lo que le falta a cada una.

// ---------- Historial de visitas ----------

const TEXTO_TIPO_FUMIGACION = {
  "Aerea (Dron)": "Aérea (Dron)", "Terrestre (Estacionaria)": "Terrestre (Estacionaria)", "Terrestre (Bomba de espalda)": "Terrestre (Bomba de espalda)",
};
const SUFIJO_DOSIS = { "Aerea (Dron)": "/Hectárea", "Terrestre (Estacionaria)": "/Caneca 200L", "Terrestre (Bomba de espalda)": "/Bomba 20L" };

let visitasHistorial = [];

async function abrirHistorial() {
  el("historial-detalle").hidden = true;
  el("historial-filtros").hidden = false;
  const anterior = el("historial-cliente").value;
  el("historial-cliente").innerHTML = `<option value="">Todos los clientes</option>` +
    clientesOrdenados().map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  el("historial-cliente").value = anterior || "";
  mostrarPantalla("pantalla-historial");
  el("historial-estado").textContent = "Cargando visitas...";
  el("historial-lista").innerHTML = "";
  try {
    visitasHistorial = await Informes.visitasHistorial();
    renderListaHistorial();
  } catch (e) {
    el("historial-estado").textContent = "No se pudo cargar el historial: " + e.message;
  }
}

function renderListaHistorial() {
  const desde = el("historial-desde").value;
  const hasta = el("historial-hasta").value;
  const cliente = el("historial-cliente").value;
  const filtradas = visitasHistorial.filter((v) =>
    (!desde || v.fecha >= desde) && (!hasta || v.fecha <= hasta) && (!cliente || v.cliente === cliente));
  el("historial-estado").textContent = filtradas.length
    ? `${filtradas.length} visita(s)`
    : "No hay visitas para ese filtro.";
  el("historial-lista").innerHTML = filtradas.map((v, i) => `<p class="visita-hoy historial-visita" data-i="${visitasHistorial.indexOf(v)}">
    <strong>${Informes.formatoFechaVisible(v.fecha)}</strong> · ${esc(v.cliente)} · ${esc(v.finca)}<br>
    <span class="hint">${v.numeroLotes} lote(s)${borradores[v.clave] ? " · en curso" : ""} · Toca para ver el detalle</span>
    ${faltantesHistorial(v)}</p>`).join("");
  el("historial-lista").querySelectorAll(".historial-visita").forEach((p) => {
    p.addEventListener("click", () => verDetalleHistorial(visitasHistorial[Number(p.dataset.i)]));
  });
}

function faltantesHistorial(v) {
  const faltan = [
    v.faltaAplicados ? "productos aplicados" : "",
    v.faltaRecomendacion ? "recomendación" : "",
    v.faltaProductividad ? "datos de productividad" : "",
  ].filter(Boolean);
  return faltan.length
    ? `<span class="historial-faltantes">Falta: ${faltan.join(", ")}</span>`
    : `<span class="historial-completa">Información completa</span>`;
}

async function verDetalleHistorial(v) {
  el("historial-filtros").hidden = true;
  el("historial-detalle").hidden = false;
  const contenido = el("historial-detalle-contenido");
  contenido.innerHTML = `<p class="hint">Cargando...</p>`;
  window.scrollTo(0, 0);
  try {
    const d = await Informes.detalleVisita(v.cliente, v.finca, v.fecha);
    const num = (x, dec = 1) => (x == null || x === "" || Number.isNaN(Number(x)) ? "-" : Number(x).toFixed(dec));
    const dosis = (p, tipo) => (p.dosis ? ` — ${esc(p.dosis)}${esc(p.unidad || "")}${SUFIJO_DOSIS[tipo] || ""}` : "");
    const listaProductos = (productos, tipo) => productos.length
      ? `<ul>${productos.map((p) => `<li><strong>${esc(p.nombre)}</strong>${p.tipo ? ` (${esc(p.tipo)})` : ""}${dosis(p, tipo)}</li>`).join("")}</ul>`
      : `<p class="historial-dato">Sin productos registrados.</p>`;

    let html = `<h2>${esc(v.cliente)} · ${esc(v.finca)}</h2>
      <p class="historial-dato">Visita del ${Informes.formatoFechaVisible(v.fecha)}${d.informe && d.informe.fechaInforme ? ` · informe generado el ${Informes.formatoFechaVisible(d.informe.fechaInforme)}` : ""}</p>`;

    html += `<h3>Productos aplicados antes de la visita</h3>`;
    html += d.lotes.map((l) => {
      const m = l.manejo || {};
      const datosManejo = [
        m.tipoFumigacion ? `Fumigación: ${TEXTO_TIPO_FUMIGACION[m.tipoFumigacion] || esc(m.tipoFumigacion)}` : "",
        m.litrosMezclaHa ? `Volumen de mezcla: ${esc(m.litrosMezclaHa)} L/ha` : "",
        m.ordenMezclaCorrecto ? `Orden de mezcla correcto: ${esc(m.ordenMezclaCorrecto)}` : "",
        m.phFinalMezcla ? `pH final: ${esc(m.phFinalMezcla)}` : "",
      ].filter(Boolean).join(" · ");
      return `<div class="historial-bloque"><h4>Lote ${esc(l.lote)}${l.potrero ? ` · Potrero ${esc(l.potrero)}` : ""}</h4>
        ${datosManejo ? `<p class="historial-dato">${datosManejo}</p>` : ""}
        ${listaProductos(l.productos, m.tipoFumigacion)}
        ${l.observacion ? `<p class="historial-dato"><em>Observaciones: ${esc(l.observacion)}</em></p>` : ""}</div>`;
    }).join("");

    const tipoReco = d.informe ? d.informe.tipoFumigacion : "";
    html += `<h3>Productos recomendados</h3><div class="historial-bloque">
      ${tipoReco || (d.informe && d.informe.volumenMezcla) ? `<p class="historial-dato">${[
        tipoReco ? `Fumigación: ${TEXTO_TIPO_FUMIGACION[tipoReco] || esc(tipoReco)}` : "",
        d.informe.volumenMezcla ? `Volumen de mezcla: ${esc(d.informe.volumenMezcla)} L/ha` : "",
      ].filter(Boolean).join(" · ")}</p>` : ""}
      ${listaProductos(d.recomendados, tipoReco)}
      ${d.informe && d.informe.notas ? `<p class="historial-dato"><em>${esc(d.informe.notas).replace(/\n/g, "<br>")}</em></p>` : ""}</div>`;

    html += `<h3>Productividad de la finca</h3>`;
    html += d.productividad.length ? d.productividad.map((p) => `<div class="historial-bloque">
        <h4>${p.lote === "" || p.lote == null ? "Finca en general" : `Lote ${esc(p.lote)}`}</h4>
        <p class="historial-dato">Área ${num(p.area, 2)} ha · ${num(p.animales, 0)} animales en ordeño · rotación ${num(p.dias, 0)} días · ${num(p.produccion, 1)} L/vaca·día</p>
        <div class="historial-kpis">
          <div><strong>${num(p.productividadLecheria)}</strong>L leche/ha·día</div>
          <div><strong>${num(p.cargaAnimal, 2)}</strong>animales/ha</div>
          <div><strong>${num(p.areaDiaria)}</strong>m²/vaca·día</div>
        </div></div>`).join("")
      : `<p class="historial-dato">Sin datos de productividad en esta visita.</p>`;

    contenido.innerHTML = html;
  } catch (e) {
    contenido.innerHTML = `<p class="hint">No se pudo cargar el detalle: ${esc(e.message)}</p>`;
  }
}

