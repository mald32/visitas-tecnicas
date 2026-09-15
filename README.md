# Visitas Técnicas — Galagro

App web (PWA) para registrar visitas técnicas de monitoreo de plagas en campo y generar el informe
para el cliente. Funciona sin señal y sube todo al Excel de OneDrive cuando hay conexión.

- **En línea:** https://mald32.github.io/visitas-tecnicas/
- **Base de datos:** `BASE_DE_DATOS_v2.xlsx` en OneDrive (se accede vía Microsoft Graph).

## Cómo está organizado

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Todas las pantallas de la app (visita, lotes, puntos, informes). |
| `app.js` | Flujo de la app: login, captura, productividad, cola y sincronización. |
| `informes.js` | Lee los datos, calcula los indicadores y arma el informe HTML con sus gráficas. |
| `graph.js` | Todas las llamadas a Microsoft Graph (leer/escribir el Excel). |
| `db.js` | Cola local en IndexedDB: lo capturado sin señal espera aquí. |
| `esquema.js` | **Único lugar** donde se define qué columna es cada cosa en el Excel. |
| `config.js` | Datos del asesor, nombres de hojas y tablas, credencial de la app. |
| `sw.js` | Service worker: permite usarla sin internet y controla la versión. |
| `pruebas/` | Pruebas automatizadas (se corren con Node, sin navegador). |
| `publicar.js` | Sube la versión de la app en un solo paso, corriendo antes las pruebas. |

## Cómo se guarda la información

Nada se sube directo: todo lo capturado entra primero a una **cola local** (IndexedDB) con estado
`pendiente`. Al darle *Sincronizar* (o al generar un informe, para las recomendaciones), la cola se
vacía contra el Excel y cada elemento pasa a `sincronizado`. Si algo falla, queda en `error` con el
mensaje, y se reintenta la próxima vez. Por eso se puede trabajar el día entero sin señal.

La visita en curso (pantalla, manejo, punto a medio llenar, observaciones) se guarda además en el
celular con cada tecla (`visitaEnCurso`): si se recarga o se cierra la app, al volver sigue donde iba.
Productividad y observaciones por lote tienen un solo pendiente por visita/lote que, al sincronizar,
**reemplaza** sus filas en el Excel; quitar un producto aplicado encola su borrado en el Excel.

Tabla que debe existir en el Excel: `Observaciones_Lotes` con encabezados
`Cliente | Finca | Fecha visita | Lote | Potrero | Observaciones`.

Las columnas que en el Excel son **fórmulas** (daños calculados, carga animal, etc.) se suben
vacías a propósito, para que las calcule la propia hoja y no un valor fijo de la app.

## Antes de publicar un cambio

```bash
node pruebas/correr.js   # 30 pruebas: cálculos, informe, escape de HTML, formato de filas
node publicar.js         # corre las pruebas y sube la versión en app.js y sw.js a la vez
git add -A && git commit -m "..." && git push
```

El número de versión se ve arriba en la app (ej. `v35`), al lado del título: sirve para confirmar
que el celular ya tiene la última versión y no una cacheada.

## Si algún día cambia el Excel

Si se mueve, renombra o agrega una columna en la hoja `Base de datos`, hay que actualizar
`esquema.js` (y nada más). La app compara los encabezados reales contra los esperados cada vez que
inicia sesión y muestra un aviso arriba si no coinciden, en vez de escribir en la celda equivocada
en silencio.
