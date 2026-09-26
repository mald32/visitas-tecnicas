// Arranque: conexión, versión publicada, service worker y los botones de todas las pantallas.
// Va de último en index.html porque conecta funciones que viven en los demás archivos.

function actualizarEstadoConexion() {
  el("estado-conexion").textContent = navigator.onLine ? "En línea" : "Sin conexión (guardando localmente)";
  el("estado-conexion").className = navigator.onLine ? "en-linea" : "sin-conexion";
}

// Registra el service worker y hace que, apenas haya una version nueva instalada, la pagina se
// recargue sola una vez para aplicarla (sin tener que borrar datos del sitio a mano).
// La app pregunta a internet qué versión está publicada (version.json, sin caché) y se compara con
// la suya. Si el celular se quedó con una copia vieja, se refresca sola y ya: sin avisos ni botones,
// que era lo que estorbaba en pantalla. Como la visita en curso se guarda con cada tecla, al
// recargar vuelve exactamente a donde iba.
let revisandoVersion = false;
async function revisarVersionPublicada() {
  if (!navigator.onLine || revisandoVersion || sincronizando) return;
  revisandoVersion = true;
  try {
    const resp = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
    const datos = await resp.json();
    const publicada = String(datos.version || "");
    if (!publicada || publicada === APP_VERSION) return;
    // Una sola vez por sesión: si algo saliera mal, no se queda recargando en bucle.
    if (sessionStorage.getItem("intentoActualizar")) return;
    sessionStorage.setItem("intentoActualizar", "1");
    await actualizarAhora();
  } catch (e) {
    console.warn("No se pudo revisar la versión publicada:", e.message);
  } finally {
    revisandoVersion = false;
  }
}

// Borra las copias guardadas de los archivos y recarga: es lo único que siempre funciona cuando el
// celular se queda pegado en una versión vieja. No toca los datos capturados (esos van en otro lado).
async function actualizarAhora() {
  try {
    if ("serviceWorker" in navigator) {
      const registros = await navigator.serviceWorker.getRegistrations();
      for (const registro of registros) {
        if (registro.waiting) registro.waiting.postMessage("activar-ya");
        await registro.update().catch(() => {});
      }
    }
    if (window.caches) {
      const nombres = await caches.keys();
      await Promise.all(nombres.map((n) => caches.delete(n)));
    }
  } catch (e) {
    console.warn("No se pudieron borrar las copias guardadas:", e.message);
  }
  window.location.reload();
}

function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  let ultimaRevision = 0;
  navigator.serviceWorker.register("sw.js").then((registro) => {
    const revisar = () => {
      if (Date.now() - ultimaRevision < 30000) return; // no más de una revisión cada 30 s
      ultimaRevision = Date.now();
      registro.update().catch(() => {});
      // Si ya hay una versión nueva instalada esperando, que entre de una vez.
      if (registro.waiting) registro.waiting.postMessage("activar-ya");
    };
    revisar();
    // Al volver a la app (cambiar de pestaña, desbloquear el celular) se revisa otra vez: antes solo
    // se miraba al abrirla y la versión nueva podía tardar en entrar.
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { revisar(); revisarVersionPublicada(); } });
    window.addEventListener("online", () => { revisar(); revisarVersionPublicada(); });
    registro.addEventListener("updatefound", () => {
      const nuevo = registro.installing;
      if (nuevo) nuevo.addEventListener("statechange", () => { if (nuevo.state === "installed" && registro.waiting) registro.waiting.postMessage("activar-ya"); });
    });
  }).catch((e) => console.warn("SW no registrado:", e));

  let yaRecargando = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (yaRecargando) return;
    yaRecargando = true;
    window.location.reload();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  el("cliente").addEventListener("change", poblarSelectFinca);
  el("finca").addEventListener("change", onCambioFinca);
  el("btn-iniciar-monitoreo").addEventListener("click", onIniciarMonitoreo);
  el("fecha").addEventListener("change", revisarVisitaSeleccionada);
  el("nuevo-cliente").addEventListener("input", revisarVisitaSeleccionada);
  el("nueva-finca").addEventListener("input", revisarVisitaSeleccionada);

  el("productividad-modo").addEventListener("change", onCambioModoProductividad);
  ["pv-g-area", "pv-g-animales", "pv-g-dias", "pv-g-produccion"].forEach((id) => {
    el(id).addEventListener("input", () => { recalcularProductividadGeneral(); guardarCampoProductividadGeneral(); guardarProductividadVisita(); });
  });

  el("btn-nuevo-lote").addEventListener("click", onAgregarLoteNuevo);
  el("btn-fin-muestreo-lotes").addEventListener("click", onFinMuestreo);
  el("btn-terminar-lote").addEventListener("click", onTerminarLote);
  el("btn-punto-anterior").addEventListener("click", onPuntoAnterior);
  el("btn-finalizar-lote").addEventListener("click", onFinalizarLote);
  el("btn-borrar-visita").addEventListener("click", onBorrarVisita);

  // Cualquier cosa que se escriba durante la visita se guarda al instante en el celular.
  PANTALLAS_FLUJO.forEach((id) => {
    el(id).addEventListener("input", () => guardarBorrador());
    el(id).addEventListener("change", () => guardarBorrador());
  });
  el("manejo-modo").addEventListener("change", onCambioModoManejo);
  document.querySelectorAll(".seccion-titulo").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cuerpo = btn.nextElementSibling;
      cuerpo.hidden = !cuerpo.hidden;
      btn.setAttribute("aria-expanded", String(!cuerpo.hidden));
    });
  });

  el("btn-agregar-producto-informe").addEventListener("click", () => agregarBloqueProducto("lista-productos-informe"));
  el("informe-tipo-fumigacion").addEventListener("change", actualizarEtiquetasDosisRecomendacion);
  const canecasInforme = () => mostrarCanecas(el("informe-canecas"), el("informe-tipo-fumigacion").value, el("informe-volumen-mezcla").value);
  el("informe-tipo-fumigacion").addEventListener("change", canecasInforme);
  el("informe-volumen-mezcla").addEventListener("input", canecasInforme);

  el("form-punto").addEventListener("submit", onGuardarPunto);

  el("btn-sincronizar").addEventListener("click", async () => {
    if (!navigator.onLine) { alert("No tienes conexión ahora mismo. Los datos quedan guardados y podrás sincronizar cuando recuperes señal."); return; }
    el("btn-sincronizar").disabled = true;
    el("btn-sincronizar").textContent = "Sincronizando...";
    try {
      await sincronizar();
      await cargarConfigYClientes();
      poblarSelectCliente(true);
      await renderVisitasEnCurso();
      await refrescarResumenCola();
    } catch (e) {
      alert("Ocurrió un error al sincronizar: " + e.message);
    } finally {
      el("btn-sincronizar").textContent = "Sincronizar";
      await refrescarResumenCola(); // queda apagado si ya no hay nada pendiente
    }
  });

  el("btn-nueva-visita").addEventListener("click", async () => {
    await cargarConfigYClientes();
    await mostrarInicioVisitas();
  });

  el("informe-tipo").addEventListener("change", onCambioTipoInforme);
  el("informe-cliente").addEventListener("change", async () => {
    if (informePorCliente()) {
      await precargarRecomendacionCliente();
      await renderFincasDelCliente();
    } else {
      poblarSelectInformeFinca();
    }
  });
  el("informe-finca").addEventListener("change", poblarSelectInformeFecha);
  el("informe-fecha").addEventListener("change", cargarDatosInforme);
  window.addEventListener("resize", ajustarAlturaPreview);

  // Los cuadros de texto crecen con lo que se escriba, en vez de quedar con scroll adentro.
  document.querySelectorAll("textarea").forEach((campo) => {
    campo.addEventListener("input", () => ajustarAltoTexto(campo));
  });

  ["historial-desde", "historial-hasta", "historial-cliente"].forEach((id) => el(id).addEventListener("change", renderListaHistorial));
  el("btn-historial-volver").addEventListener("click", () => {
    el("historial-detalle").hidden = true;
    el("historial-filtros").hidden = false;
  });
  el("btn-generar-informe").addEventListener("click", onGenerarInforme);

  document.querySelectorAll(".tab-boton").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        document.querySelectorAll(".tab-boton").forEach((b) => b.classList.remove("activa"));
        btn.classList.add("activa");
        if (visita) await salirDeVisita(); // queda guardada en "Visitas en curso"
        if (btn.dataset.tab === "informes") {
          Informes.invalidarCache();
          poblarSelectInformeCliente();
          await onCambioTipoInforme();
          mostrarPantalla("pantalla-informes");
        } else if (btn.dataset.tab === "historial") {
          Informes.invalidarCache();
          await abrirHistorial();
        } else {
          await mostrarInicioVisitas();
        }
      } catch (e) {
        alert("Error al cambiar de pestaña: " + e.message);
      }
    });
  });

  iniciar();
});
