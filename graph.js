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
    try {
      const r = await msalApp.acquireTokenSilent({ scopes: CONFIG.GRAPH_SCOPES, account: cuentaActiva });
      return r.accessToken;
    } catch (e) {
      const r = await msalApp.acquireTokenPopup({ scopes: CONFIG.GRAPH_SCOPES });
      return r.accessToken;
    }
  },

  async llamar(path, opciones = {}) {
    const token = await this.token();
    const resp = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...opciones,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(opciones.headers || {}),
      },
    });
    if (!resp.ok) {
      const detalle = await resp.text().catch(() => "");
      throw new Error(`Graph ${resp.status}: ${detalle}`);
    }
    return resp.status === 204 ? null : resp.json();
  },

  // Ubica el archivo por su ruta dentro de OneDrive y cachea su ID (localStorage).
  async idArchivo() {
    const cacheado = localStorage.getItem("driveItemId");
    if (cacheado) return cacheado;
    const item = await this.llamar(`/me/drive/root:/${CONFIG.RUTA_ARCHIVO}`);
    localStorage.setItem("driveItemId", item.id);
    return item.id;
  },

  async leerRango(hoja, direccion) {
    const id = await this.idArchivo();
    const path = `/me/drive/items/${id}/workbook/worksheets('${encodeURIComponent(
      hoja
    )}')/range(address='${direccion}')`;
    const r = await this.llamar(path);
    return r.values;
  },

  // Devuelve todas las filas de una tabla (sin encabezados), como arreglos de valores en el orden de las columnas.
  async leerTabla(nombreTabla) {
    const id = await this.idArchivo();
    const path = `/me/drive/items/${id}/workbook/tables('${nombreTabla}')/rows`;
    const r = await this.llamar(path);
    return (r.value || []).map((fila) => fila.values[0]);
  },

  async agregarFila(valores) {
    const id = await this.idArchivo();
    const path = `/me/drive/items/${id}/workbook/tables('${CONFIG.TABLE_NAME}')/rows/add`;
    return this.llamar(path, { method: "POST", body: JSON.stringify({ values: [valores] }) });
  },

  async escribirRango(hoja, direccion, valores) {
    const id = await this.idArchivo();
    const path = `/me/drive/items/${id}/workbook/worksheets('${encodeURIComponent(
      hoja
    )}')/range(address='${direccion}')`;
    return this.llamar(path, { method: "PATCH", body: JSON.stringify({ values: valores }) });
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
};
