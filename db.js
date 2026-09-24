// Cola local (IndexedDB): puntos de muestreo y clientes/fincas nuevos pendientes de sincronizar,
// más una caché simple de parámetros/clientes para uso offline.
const DB_NAME = "visitas-tecnicas";
const DB_VERSION = 2;
const STORE_COLA = "cola";
const STORE_CACHE = "cache";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_COLA)) {
        const store = db.createObjectStore(STORE_COLA, { keyPath: "id", autoIncrement: true });
        store.createIndex("estado", "estado");
        store.createIndex("tipo", "tipo");
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: "clave" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = fn(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    // Si algo falla dentro de la transacción, IndexedDB la aborta sin disparar onerror: sin esto la
    // promesa quedaba esperando para siempre y la sincronización se congelaba hasta cerrar la app.
    tx.onabort = () => reject(tx.error || new Error("Se canceló la escritura en el celular."));
  });
}

const DB = {
  // tipo: "punto" | "cliente_finca"
  async agregarItem(tipo, datos) {
    let id;
    await withStore(STORE_COLA, "readwrite", (store) => {
      const req = store.add({ tipo, datos, estado: "pendiente", creado: new Date().toISOString() });
      req.onsuccess = () => (id = req.result);
    });
    return id;
  },

  async listarItems() {
    return withStore(STORE_COLA, "readonly", (store) => {
      return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result.sort((a, b) => a.id - b.id));
        req.onerror = () => reject(req.error);
      });
    });
  },

  async leerItem(id) {
    return withStore(STORE_COLA, "readonly", (store) => {
      return new Promise((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    });
  },

  // Solo se marca como subido si nadie lo cambió mientras subía (misma revisión). Con la subida
  // automática el asesor puede estar escribiendo justo cuando ese dato va para el Excel: si se
  // marcaba igual, la corrección quedaba como "ya subida" sin haber llegado nunca.
  async marcarSincronizado(id, revision) {
    await withStore(STORE_COLA, "readwrite", (store) => {
      const req = store.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (!item) return; // se borró mientras subía
        if (revision !== undefined && (item.revision || 0) !== revision) return; // cambió: queda pendiente
        item.estado = "sincronizado";
        delete item.ultimoError;
        store.put(item);
      };
    });
  },

  async eliminarItem(id) {
    await withStore(STORE_COLA, "readwrite", (store) => { store.delete(id); });
  },

  async actualizarDatosItem(id, cambiosDatos) {
    await withStore(STORE_COLA, "readwrite", (store) => {
      const req = store.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (!item) return;
        item.datos = { ...item.datos, ...cambiosDatos };
        item.revision = (item.revision || 0) + 1;
        item.estado = "pendiente"; // lo cambiado siempre tiene que volver a subir
        store.put(item);
      };
    });
  },

  async marcarError(id, mensaje) {
    await withStore(STORE_COLA, "readwrite", (store) => {
      const req = store.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (!item) return;
        item.estado = "pendiente";
        item.ultimoError = mensaje;
        store.put(item);
      };
    });
  },

  async guardarCache(clave, valor) {
    await withStore(STORE_CACHE, "readwrite", (store) => {
      store.put({ clave, valor, actualizado: new Date().toISOString() });
    });
  },

  async leerCache(clave) {
    return withStore(STORE_CACHE, "readonly", (store) => {
      return new Promise((resolve, reject) => {
        const req = store.get(clave);
        req.onsuccess = () => resolve(req.result ? req.result.valor : null);
        req.onerror = () => reject(req.error);
      });
    });
  },
};
