// Autenticación (MSAL) y llamadas a Microsoft Graph / Excel API.
const msalApp = new msal.PublicClientApplication({
  auth: {
    clientId: CONFIG.CLIENT_ID,
    authority: CONFIG.AUTHORITY,
    redirectUri: CONFIG.REDIRECT_URI,
  },
  cache: { cacheLocation: "localStorage" },
});

let cuentaActiva = null;
const tablasListas = new Set(); // tablas ya verificadas/creadas en esta sesión
let msalListo = false;

const Graph = {
  async init() {
    if (!msalListo) {
      await msalApp.initialize();
      msalListo = true;
    }
  },

  async iniciarSesion() {
    const resultado = await msalApp.loginPopup({ scopes: CONFIG.GRAPH_SCOPES });
    cuentaActiva = resultado.account;
    msalApp.setActiveAccount(cuentaActiva);
    return cuentaActiva;
  },

  cuentaGuardada() {
    const cuentas = msalApp.getAllAccounts();
    if (cuentas.length > 0) {
      cuentaActiva = cuentas[0];
      msalApp.setActiveAccount(cuentaActiva);
    }
    return cuentaActiva;
  },

  async token() {
    if (!cuentaActiva) throw new Error("No hay sesión iniciada");
    if (!navigator.onLine) throw new Error("Sin conexión a internet");
    try {
      const r = await msalApp.acquireTokenSilent({ scopes: CONFIG.GRAPH_SCOPES, account: cuentaActiva });
      return r.accessToken;
    } catch (e) {
      // Solo se abre la ventana de login si Microsoft de verdad pide volver a iniciar sesión. Si el
      // fallo es por falta de internet, abrir una ventana solo produce "popup_window_error".
      if (!(e instanceof msal.InteractionRequiredAuthError)) {
        throw new Error("No se pudo conectar con Microsoft (revisa tu internet)");
      }
      try {
        const r = await msalApp.acquireTokenPopup({ scopes: CONFIG.GRAPH_SCOPES });
        return r.accessToken;
      } catch (e2) {
        throw new Error("Tu sesión de Microsoft expiró. Cuando tengas internet, dale a \"Sincronizar\" para volver a conectarte");
      }
    }
  },

  // Con una red Wi-Fi sin internet real el celular dice "en línea", pero fetch se queda colgado
  // sin responder nunca. Por eso toda llamada se corta a los 20 s y falla con un error claro.
  async llamar(path, opciones = {}) {
    const token = await this.token();
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), 20000);
    let resp;
    try {
      resp = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
        ...opciones,
        signal: control.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(opciones.headers || {}),
        },
      });
    } catch (e) {
      throw new Error(e.name === "AbortError" ? "Sin respuesta de internet (la red no tiene conexión real)" : e.message);
    } finally {
      clearTimeout(temporizador);
    }
    if (!resp.ok) {
      const detalle = await resp.text().catch(() => "");
      throw new Error(`Graph ${resp.status}: ${detalle}`);
    }
    return resp.status === 204 ? null : resp.json();
  },

  // Ubica el archivo por su ruta dentro de OneDrive y cachea su ID (localStorage).
  async idArchivo(forzarRefresco = false) {
    if (!forzarRefresco) {
      const cacheado = localStorage.getItem("driveItemId");
      if (cacheado) return cacheado;
    }
    const item = await this.llamar(`/me/drive/root:/${CONFIG.RUTA_ARCHIVO}`);
    localStorage.setItem("driveItemId", item.id);
    return item.id;
  },

  // Si el ID de archivo guardado quedo desactualizado (ej. moviste/renombraste el Excel), Graph responde
  // "itemNotFound". Aqui se busca el archivo de nuevo por su ruta y se reintenta una sola vez.
  async conReintento(construirYLlamar) {
    const id = await this.idArchivo();
    try {
      return await construirYLlamar(id);
    } catch (e) {
      if (!String(e.message).includes("itemNotFound")) throw e;
      const idNuevo = await this.idArchivo(true);
      return await construirYLlamar(idNuevo);
    }
  },

  async leerRango(hoja, direccion) {
    return this.conReintento((id) => {
      const path = `/me/drive/items/${id}/workbook/worksheets('${encodeURIComponent(
        hoja
      )}')/range(address='${direccion}')`;
      return this.llamar(path).then((r) => r.values);
    });
  },

  // Devuelve todas las filas de una tabla (sin encabezados), como arreglos de valores en el orden de las columnas.
  async leerTabla(nombreTabla) {
    return this.conReintento((id) => {
      const path = `/me/drive/items/${id}/workbook/tables('${nombreTabla}')/rows`;
      return this.llamar(path).then((r) => (r.value || []).map((fila) => fila.values[0]));
    });
  },

  async agregarFila(valores) {
    return this.conReintento((id) => {
      const path = `/me/drive/items/${id}/workbook/tables('${CONFIG.TABLE_NAME}')/rows/add`;
      return this.llamar(path, { method: "POST", body: JSON.stringify({ values: [valores] }) });
    });
  },

  async escribirRango(hoja, direccion, valores) {
    return this.conReintento((id) => {
      const path = `/me/drive/items/${id}/workbook/worksheets('${encodeURIComponent(
        hoja
      )}')/range(address='${direccion}')`;
      return this.llamar(path, { method: "PATCH", body: JSON.stringify({ values: valores }) });
    });
  },

  // Agrega una fila a Clientes_Fincas leyendo primero cuántas filas hay, para escribir justo debajo.
  async agregarClienteFinca(cliente, finca, numeroLotes) {
    const filas = await this.leerRango(CONFIG.HOJA_CLIENTES, "A4:C200");
    const usadas = filas.filter((f) => f[0]).length;
    const fila = 4 + usadas;
    await this.escribirRango(CONFIG.HOJA_CLIENTES, `A${fila}:C${fila}`, [[cliente, finca, numeroLotes]]);
  },

  // Actualiza el número de lotes de una finca ya existente en Clientes_Fincas.
  async actualizarNumeroLotes(cliente, finca, numeroLotes) {
    const filas = await this.leerRango(CONFIG.HOJA_CLIENTES, "A4:C200");
    const idx = filas.findIndex((f) => f[0] === cliente && f[1] === finca);
    if (idx === -1) throw new Error(`No se encontró ${cliente} / ${finca} en Clientes_Fincas`);
    const fila = 4 + idx;
    await this.escribirRango(CONFIG.HOJA_CLIENTES, `C${fila}:C${fila}`, [[numeroLotes]]);
  },

  // Agrega un producto nuevo al catálogo de la hoja Productos, usando la Tabla real (no un rango
  // suelto) para que la formula de la columna Orden se autocalcule igual que en las demas filas.
  // Columnas reales: A Nombre, B Tipo, C Formulacion, D Siglas, E Orden (formula), F Unidad.
  // Las Siglas se sacan del propio texto de Formulacion (ej. "SC" de "SC (Suspension Concentrada)").
  async agregarProductoCatalogo(nombre, tipo, formulacion, unidad) {
    const filas = await this.leerRango(CONFIG.HOJA_PRODUCTOS, "A4:A500");
    const yaExiste = filas.some((f) => f[0] && String(f[0]).trim().toLowerCase() === nombre.trim().toLowerCase());
    if (yaExiste) return;
    const siglas = formulacion ? String(formulacion).split(" (")[0].trim() : "";
    return this.conReintento((id) => {
      const path = `/me/drive/items/${id}/workbook/tables('${CONFIG.TABLA_PRODUCTOS}')/rows/add`;
      return this.llamar(path, { method: "POST", body: JSON.stringify({ values: [[nombre, tipo, formulacion, siglas, null, unidad]] }) });
    });
  },

  // Agrega una fila a la tabla Productos_Aplicados (un producto usado en un lote/visita).
  async agregarProductoAplicado(valores) {
    return this.conReintento((id) => {
      const path = `/me/drive/items/${id}/workbook/tables('${CONFIG.TABLA_PRODUCTOS_APLICADOS}')/rows/add`;
      return this.llamar(path, { method: "POST", body: JSON.stringify({ values: [valores] }) });
    });
  },

  // Agrega una fila a la tabla Productos_Recomendados (un producto recomendado en el informe de una visita).
  async agregarProductoRecomendado(valores) {
    return this.conReintento((id) => {
      const path = `/me/drive/items/${id}/workbook/tables('${CONFIG.TABLA_PRODUCTOS_RECOMENDADOS}')/rows/add`;
      return this.llamar(path, { method: "POST", body: JSON.stringify({ values: [valores] }) });
    });
  },

  // Si una tabla todavía no existe en el Excel (por ejemplo Observaciones_Lotes en archivos
  // viejos), la crea: agrega una hoja con ese nombre, escribe los encabezados y la convierte en
  // tabla. Así no hay que armarla a mano para que sincronicen esos datos.
  async asegurarTabla(nombreTabla, encabezados) {
    if (tablasListas.has(nombreTabla)) return;
    try {
      await this.conReintento((id) => this.llamar(`/me/drive/items/${id}/workbook/tables('${nombreTabla}')`));
      tablasListas.add(nombreTabla);
      return;
    } catch (e) {
      if (!/itemnotfound/i.test(e.message)) throw e;
    }

    try {
      await this.conReintento((id) => this.llamar(`/me/drive/items/${id}/workbook/worksheets/add`, {
        method: "POST", body: JSON.stringify({ name: nombreTabla }),
      }));
    } catch (e) {
      if (!/itemalreadyexists/i.test(e.message)) throw e; // la hoja ya estaba, solo falta la tabla
    }

    const ultimaColumna = String.fromCharCode(64 + encabezados.length); // A, B, C...
    const rango = `A1:${ultimaColumna}1`;
    await this.escribirRango(nombreTabla, rango, [encabezados]);
    const tabla = await this.conReintento((id) => this.llamar(`/me/drive/items/${id}/workbook/tables/add`, {
      method: "POST", body: JSON.stringify({ address: `${nombreTabla}!${rango}`, hasHeaders: true }),
    }));
    if (tabla && tabla.name !== nombreTabla) {
      await this.conReintento((id) => this.llamar(`/me/drive/items/${id}/workbook/tables('${tabla.id}')`, {
        method: "PATCH", body: JSON.stringify({ name: nombreTabla }),
      }));
    }
    tablasListas.add(nombreTabla);
  },

  // Borra de una tabla todas las filas para las que coincide(valores) sea verdadero. Se borra de la
  // última a la primera para que los índices de las filas que faltan no se corran.
  async eliminarFilasDonde(nombreTabla, coincide) {
    return this.conReintento(async (id) => {
      const base = `/me/drive/items/${id}/workbook/tables('${nombreTabla}')/rows`;
      const r = await this.llamar(base);
      const indices = (r.value || []).filter((f) => coincide(f.values[0])).map((f) => f.index).sort((a, b) => b - a);
      for (const i of indices) await this.llamar(`${base}/itemAt(index=${i})`, { method: "DELETE" });
      return indices.length;
    });
  },

  // Agrega una fila a cualquier tabla por su nombre.
  async agregarFilaEnTabla(nombreTabla, valores) {
    return this.conReintento((id) => {
      const path = `/me/drive/items/${id}/workbook/tables('${nombreTabla}')/rows/add`;
      return this.llamar(path, { method: "POST", body: JSON.stringify({ values: [valores] }) });
    });
  },

  // Agrega una fila a la tabla Productividad_Fincas. Las ultimas 3 columnas (Carga Animal, Area
  // Diaria por Animal, Productividad de la Lecheria) son formulas de la propia tabla: se dejan en
  // null para que Excel las calcule solo, igual que con las demas tablas con columnas calculadas.
  async agregarProductividad(valores) {
    return this.conReintento((id) => {
      const path = `/me/drive/items/${id}/workbook/tables('${CONFIG.TABLA_PRODUCTIVIDAD}')/rows/add`;
      return this.llamar(path, { method: "POST", body: JSON.stringify({ values: [valores] }) });
    });
  },
};
