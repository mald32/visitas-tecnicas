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
let msalListo = false;

// Excel devuelve la dirección de un rango como "'Base de datos'!A1:X40". De ahí salen la hoja y
// dónde empieza la tabla, que es lo que se necesita para escribir en una celda suelta.
function partesDeDireccion(direccion) {
  const m = String(direccion || "").match(/^(?:'([^']+)'|([^!]+))!([A-Z]+)(\d+)/);
  if (!m) return null;
  return { hoja: m[1] || m[2], columna: m[3], fila: Number(m[4]) };
}

function numeroDeColumna(letras) {
  return [...letras].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0);
}

// Qué parte de esquema.js describe cada tabla (para traducir por títulos al leer y al escribir).
function esquemaDeTabla(nombreTabla) {
  return {
    [CONFIG.TABLE_NAME]: "BASE",
    [CONFIG.TABLA_PRODUCTOS_APLICADOS]: "PRODUCTOS_APLICADOS",
    [CONFIG.TABLA_PRODUCTOS_RECOMENDADOS]: "PRODUCTOS_RECOMENDADOS",
    [CONFIG.TABLA_PRODUCTIVIDAD]: "PRODUCTIVIDAD",
    [CONFIG.TABLA_OBSERVACIONES_LOTES]: "OBSERVACIONES_LOTES",
    [CONFIG.TABLA_INFORMES_GENERADOS]: "INFORMES_GENERADOS",
    [CONFIG.TABLA_RECOMENDACIONES_CLIENTE]: "RECOMENDACIONES_CLIENTE",
    [CONFIG.TABLA_PRODUCTOS]: "PRODUCTOS",
    [CONFIG.TABLA_VISITAS]: "VISITAS",
  }[nombreTabla] || null;
}

function letraDeColumna(numero) {
  let n = numero, letras = "";
  while (n > 0) { const resto = (n - 1) % 26; letras = String.fromCharCode(65 + resto) + letras; n = Math.floor((n - 1) / 26); }
  return letras;
}

const Graph = {
  _titulos: {},

  // Los títulos se vuelven a pedir al empezar cada sincronización: si alguien movió o agregó una
  // columna en el Excel con la app abierta, se escribe según cómo está la tabla en ese momento.
  olvidarTitulos() {
    this._titulos = {};
  },

  // Títulos reales de la primera fila de una tabla, tal como están en el Excel.
  async titulos(nombreTabla) {
    if (!this._titulos[nombreTabla]) {
      this._titulos[nombreTabla] = await this.conReintento(async (id) => {
        const r = await this.llamar(`/me/drive/items/${id}/workbook/tables('${nombreTabla}')/headerRowRange?$select=values`);
        return (r.values && r.values[0]) || [];
      });
    }
    return this._titulos[nombreTabla];
  },

  // Convierte filas del Excel al orden interno de la app (si la tabla está descrita en esquema.js).
  async _filasDesdeExcel(nombreTabla, filasExcel) {
    const clave = esquemaDeTabla(nombreTabla);
    if (!clave) return filasExcel;
    const titulos = await this.titulos(nombreTabla);
    const posiciones = posicionesEnExcel(clave, titulos);
    return filasExcel.map((f) => filaDesdeExcel(clave, titulos, f, posiciones));
  },

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

  // Devuelve todas las filas de una tabla (sin encabezados) en el orden interno de la app: cada
  // dato sale de la columna que tiene su título, no de una posición fija.
  async leerTabla(nombreTabla) {
    const filas = await this.conReintento((id) => {
      const path = `/me/drive/items/${id}/workbook/tables('${nombreTabla}')/rows`;
      return this.llamar(path).then((r) => (r.value || []).map((fila) => fila.values[0]));
    });
    return this._filasDesdeExcel(nombreTabla, filas);
  },

  // Agrega un punto de muestreo a la tabla de la Base de datos.
  async agregarFila(valores) {
    return this.agregarFilaEnTabla(CONFIG.TABLE_NAME, valores);
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
    const P = ESQUEMA.PRODUCTOS;
    const filas = await this.leerTabla(CONFIG.TABLA_PRODUCTOS);
    const yaExiste = filas.some((f) => f[P.nombre] && String(f[P.nombre]).trim().toLowerCase() === nombre.trim().toLowerCase());
    if (yaExiste) return;
    const siglas = formulacion ? String(formulacion).split(" (")[0].trim() : "";
    const fila = [];
    fila[P.nombre] = nombre; fila[P.tipo] = tipo; fila[P.formulacion] = formulacion; fila[P.siglas] = siglas; fila[P.unidad] = unidad;
    return this.agregarFilaEnTabla(CONFIG.TABLA_PRODUCTOS, fila);
  },

  // Agrega una fila a la tabla Productos_Aplicados (un producto usado en un lote/visita).
  async agregarProductoAplicado(valores) {
    return this.agregarFilaEnTabla(CONFIG.TABLA_PRODUCTOS_APLICADOS, valores);
  },

  // Agrega una fila a la tabla Productos_Recomendados (un producto recomendado en el informe de una visita).
  async agregarProductoRecomendado(valores) {
    return this.agregarFilaEnTabla(CONFIG.TABLA_PRODUCTOS_RECOMENDADOS, valores);
  },

  // Borra de una tabla todas las filas para las que coincide(valores) sea verdadero. Se borra de la
  // última a la primera para que los índices de las filas que faltan no se corran.
  async eliminarFilasDonde(nombreTabla, coincide) {
    return this.conReintento(async (id) => {
      const base = `/me/drive/items/${id}/workbook/tables('${nombreTabla}')/rows`;
      const r = await this.llamar(base);
      const filas = await this._filasDesdeExcel(nombreTabla, (r.value || []).map((f) => f.values[0]));
      const indices = (r.value || []).filter((f, i) => coincide(filas[i])).map((f) => f.index).sort((a, b) => b - a);
      for (const i of indices) await this.llamar(`${base}/itemAt(index=${i})`, { method: "DELETE" });
      return indices.length;
    });
  },

  // Cambia SOLO unas columnas de las filas que coincidan, dejando el resto de la fila como está
  // (las columnas con fórmula siguen siendo fórmula). Se usa para corregir el manejo agronómico de
  // una visita que ya está en el Excel: esos datos viven en las mismas filas de los puntos.
  // `cambios` es { dato: valor } con los nombres de esquema.js; cada uno va a la columna con su título.
  async actualizarColumnasDonde(nombreTabla, coincide, cambios) {
    const clave = esquemaDeTabla(nombreTabla);
    const titulos = await this.titulos(nombreTabla);
    const posiciones = posicionesEnExcel(clave, titulos);
    const columnas = Object.entries(cambios).map(([dato, valor]) => {
      if (posiciones[dato] === undefined) {
        throw new Error(`En la tabla ${nombreTabla} del Excel no encuentro la columna "${tituloDe(clave, dato)}".`);
      }
      return { posicion: posiciones[dato], valor };
    }).sort((a, b) => a.posicion - b.posicion);
    // Si las columnas están seguidas se escriben de una vez; si no, una por una.
    const seguidas = columnas.every((c, i) => i === 0 || c.posicion === columnas[i - 1].posicion + 1);
    const tramos = seguidas ? [columnas] : columnas.map((c) => [c]);
    return this.conReintento(async (id) => {
      const base = `/me/drive/items/${id}/workbook/tables('${nombreTabla}')`;
      const rango = await this.llamar(`${base}/range?$select=address`);
      const sitio = partesDeDireccion(rango.address);
      if (!sitio) throw new Error("No pude ubicar la tabla " + nombreTabla + " en la hoja.");
      const r = await this.llamar(`${base}/rows`);
      const filas = await this._filasDesdeExcel(nombreTabla, (r.value || []).map((f) => f.values[0]));
      const indices = (r.value || []).filter((f, i) => coincide(filas[i])).map((f) => f.index);
      const primeraColumna = numeroDeColumna(sitio.columna);
      for (const i of indices) {
        const fila = sitio.fila + 1 + i; // +1 por la fila de encabezados de la tabla
        for (const tramo of tramos) {
          const desde = letraDeColumna(primeraColumna + tramo[0].posicion);
          const hasta = letraDeColumna(primeraColumna + tramo[tramo.length - 1].posicion);
          await this.escribirRango(sitio.hoja, `${desde}${fila}:${hasta}${fila}`, [tramo.map((c) => c.valor)]);
        }
      }
      return indices.length;
    });
  },

  // Agrega una fila a cualquier tabla por su nombre. `valores` viene en el orden interno de la app
  // y aquí se acomoda según los títulos reales: cada dato a su columna, y las columnas que la app
  // no conoce (fórmulas, ponderados, abonos) vacías. Si falta una columna que la app necesita,
  // falla y el dato queda pendiente en el celular en vez de caer donde no es.
  async agregarFilaEnTabla(nombreTabla, valores) {
    const clave = esquemaDeTabla(nombreTabla);
    const fila = clave ? filaHaciaExcel(clave, await this.titulos(nombreTabla), valores, nombreTabla) : valores;
    return this.conReintento((id) => {
      const path = `/me/drive/items/${id}/workbook/tables('${nombreTabla}')/rows/add`;
      return this.llamar(path, { method: "POST", body: JSON.stringify({ values: [fila] }) });
    });
  },

  // Agrega una fila a la tabla Productividad_Fincas. Las columnas con fórmula (Carga Animal, Área
  // diaria por animal, Productividad de la lechería) se mandan vacías para que Excel las calcule.
  async agregarProductividad(valores) {
    return this.agregarFilaEnTabla(CONFIG.TABLA_PRODUCTIVIDAD, valores);
  },
};
