# Guía del proyecto para Claude

Este archivo lo lee Claude Code automáticamente al abrir una sesión en esta carpeta. Es el
"traspaso de turno": si se cierra una sesión y se abre otra (en el PC, en el celular, en la web),
lo que hay aquí debería bastar para seguir trabajando sin volver a preguntar nada.

**Dueño del proyecto:** Miguel León — Ingeniero Agrónomo, Asesor Técnico Comercial de Galagro
Norte de Antioquia. No es programador: explica en términos de campo (lotes, potreros, plagas) y
espera respuestas en español, sin jerga, y cambios ya hechos, no propuestas largas.

---

## 1. Qué es la app

PWA (web app instalable) para registrar **visitas técnicas de monitoreo de plagas en pasturas** y
generar el **informe para el cliente**. Se usa en el celular, en potrero, **muchas veces sin señal**.

- **Publicada en:** https://mald32.github.io/visitas-tecnicas/ (GitHub Pages, rama `main`).
- **Base de datos:** `BASE_DE_DATOS_v2.xlsx` en el OneDrive del usuario, leído y escrito con
  **Microsoft Graph** (Excel API). No hay servidor propio: la app habla directo con Graph.
- **Sin framework.** JavaScript plano, sin build, sin npm en el navegador. Los archivos que están
  en el repo son exactamente los que corren.

### Regla de oro
> "No puedo dejar que ninguna información que vaya metiendo se pierda. Es tiempo que pierdo en campo."

Todo lo que el usuario escribe debe sobrevivir a: perder señal, recargar la página, cerrar la app,
cambiar de pantalla. Cuando haya que elegir entre elegancia y no perder un dato, gana no perder el
dato.

---

## 2. Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Todas las pantallas (login, visita, lotes, punto, fin, informes, historial). |
| `app.js` (~2.600 líneas) | Flujo completo: login, captura, manejo, productividad, cola, sincronización, informes, historial. |
| `informes.js` (~1.650 líneas) | Lee datos, calcula indicadores y **genera el HTML del informe** (con su propio CSS y gráficas en SVG). |
| `graph.js` | Todas las llamadas a Microsoft Graph. |
| `db.js` | Cola local e IndexedDB. |
| `esquema.js` | **Único** lugar donde se dice qué columna es cada cosa en el Excel. |
| `config.js` | Nombres de hojas/tablas, `CLIENT_ID` de Azure, datos del asesor. |
| `sw.js` | Service worker (offline + control de versión). |
| `version.json` | `{"version":"NN"}` — lo que la app consulta para saber si se quedó atrás. |
| `publicar.js` | Sube la versión en un paso, corriendo antes las pruebas. |
| `pruebas/` | 48 pruebas en Node, sin navegador (`arnes.js` carga los archivos con `vm`). |
| `lib/msal-browser.min.js` | MSAL copiado al repo **a propósito** (desde CDN no abría sin internet). |

---

## 3. Flujo de datos (lo más importante de entender)

**Nada se escribe directo al Excel.** Todo pasa por una **cola local en IndexedDB** (`db.js`,
store `cola`), con estado `pendiente` → `sincronizado` (o vuelve a `pendiente` con `ultimoError`).
Se vacía al tocar *Sincronizar* o al generar un informe.

### Tipos de item de la cola
`punto`, `cliente_finca`, `actualizar_lotes`, `producto_nuevo`, `producto_aplicado`,
`eliminar_producto_aplicado`, `producto_recomendado`, `eliminar_producto_recomendado`,
`recomendaciones_visita`, `productividad`, `productividad_visita`, `observacion_lote`,
`informe_generado`, `recomendaciones_cliente`, `eliminar_visita`, `eliminar_lote`.

### Patrón "item de reemplazo"
Varios tipos **no agregan: reemplazan**. Un solo pendiente por visita (o por lote) que, al subir,
**borra todas las filas de esa visita en la tabla y las reescribe**. Aplica a
`productividad_visita`, `recomendaciones_visita`, `recomendaciones_cliente`, `observacion_lote`,
`informe_generado`.

> Esto nació de un bug real: al borrar recomendaciones duplicadas, comparar producto a producto no
> detectaba duplicados idénticos y el Excel no cambiaba. Si vas a tocar esto, **no vuelvas a la
> comparación por producto**.

### Borrados
`Graph.eliminarFilasDonde(tabla, coincide)` borra de mayor a menor índice (si no, los índices se
corren). `eliminar_visita` y `eliminar_lote` además **detienen** los demás pendientes de ese grupo
para no subir datos de algo que se va a borrar.

### Borrador de visita
La visita en curso se guarda en el celular **con cada tecla**: caché `visitasEnCurso` (mapa por
`cliente|finca|fecha`) + `visitaActiva` + `sinGuardar = {manejo, punto, obs}`. Al recargar vuelve
exactamente a donde iba; al retomar una visita vuelve al menú de lotes.

---

## 4. El Excel (`BASE_DE_DATOS_v2.xlsx`)

Los índices de columna **solo** viven en `esquema.js`. Si cambia una columna en el Excel, se toca
ese archivo y nada más. Al iniciar sesión, `verificarEncabezados` compara los encabezados reales
contra los esperados y muestra un aviso si no coinciden (antes escribía en la celda equivocada en
silencio).

| Hoja / Tabla | Contenido |
|---|---|
| `Base de datos` / `TablaBaseDatos` | Una fila **por punto de muestreo**. 24 columnas. |
| `Productos_Aplicados` | Lo que el ganadero **ya aplicó** (manejo agronómico). 9 columnas. |
| `Productos_Recomendados` | Lo que el asesor **recomienda** en el informe por finca. 9 columnas. La columna Lote va vacía **por diseño**. |
| `Productividad_Fincas` | Área, animales, días, producción. 11 columnas. |
| `Observaciones_Lotes` | Lo que se escribe al terminar cada lote. 6 columnas. |
| `Informes_Generados` | Una fila por visita con informe. 7 columnas. **Alimenta el Historial.** |
| `Recomendaciones_Cliente` | La recomendación del informe **por fincas de un cliente**. 10 columnas. |
| `Productos` / `Tabla2` | Catálogo de productos (nombre, tipo, formulación, siglas, orden de mezcla). |
| `Clientes_Fincas` | Clientes, fincas y sus lotes. |
| `Configuracion` | `A8:C19` = variable, **umbral** (col B), **máximo permitido** (col C). |

### Columnas fórmula
Las columnas que en el Excel son fórmulas se suben **vacías** (`null`) a propósito, para que las
calcule la hoja: `BASE_CALCULADAS` (daño Collaria total, incidencia/daño moluscos, daño hongos) y
`PRODUCTIVIDAD_CALCULADAS` (carga animal, área diaria, productividad lechería). En local se
calculan igual, solo para poder generar informes antes de sincronizar.

> Si Graph devuelve **400 InvalidArgument**, casi siempre es una fila con distinto número de
> columnas. `descripcionItem(it)` existe para que el aviso diga **qué dato** falló.
> **404 ItemNotFound** = falta crear esa tabla en el Excel (el mensaje ya lo dice).

---

## 5. El informe (`informes.js`)

Dos modos, mismo motor:

1. **Por lotes de una finca** → `calcularDatos(cliente, finca, fecha)`. Unidad = **Lote**.
2. **Por fincas de un cliente** → `calcularDatosCliente(cliente, seleccion)`. Unidad = **Finca**.
   El asesor elige **qué fincas y de qué visita**; se promedian todos los puntos de la finca.

El motor está parametrizado por unidad: `metricasDeUnidad(sub)`, `puntosDeUnidad(sub)`,
`resumenDeTabla(tabla, umbrales)`, `historialDeSeries(filas, meses, series, umbrales)`, y
`D.etiqueta_unidad` / `D.plural_unidad` / `D.es_cliente` deciden si se dice "Lote" o "Finca".

Otros detalles del informe:
- **Semáforo:** verde hasta el umbral, amarillo entre umbral y máximo, rojo por encima. Clases
  `sem-ok` / `sem-medio` / `sem-alto`. **Pasto sano va al revés** (es un mínimo).
- **Historial:** agrupado **por mes**, no por día (`mesDeFecha`, `fmtMes`). 13 gráficas, una línea
  por lote/finca, en 3 grupos (Conteos / Epidemiología / Estado de las pasturas) + opción "Todas"
  (3 por hilera, que es la versión para imprimir).
- Sección llamada **"Manejo Fitosanitario Actual"** (en el informe; dentro de la app todavía se
  llama "Manejo agronómico"), en vertical, dos bloques por hilera.
- Al tocar un lote/finca se abre un `<dialog>` con la **tabla de puntos** (incluye Potrero).
- La tabla principal **no lleva Pasto Sano ni los 3 daños**: era para que quepa sin scroll.
- **PDF:** botón que imprime. El formato debe quedar **exactamente igual que el HTML** (fue pedido
  explícito): `print-color-adjust: exact`, `.no-imprimir`, y las rejillas flex pasan a
  `inline-block` al imprimir porque flex no se sabe partir entre hojas.
- Caché remota por sesión (`_remoto`) + merge fresco de los pendientes, para no releer el Excel en
  cada pantalla. **Si subes algo, invalida la caché** (ya hubo un bug por olvidarlo).
- `conLimiteDeTiempo(...)` con `LIMITE_LECTURA_MS = 6000`: sin esto, un Wi-Fi sin internet dejaba
  la app colgada para siempre (bug real reportado en campo).

---

## 6. Offline

Lecciones ya aprendidas, **no deshacer**:

- MSAL se sirve desde `lib/`, no desde CDN (sin internet no cargaba → `popup_window_error`).
- `token()` **no abre popup** si no hay internet.
- El service worker responde `index.html` a toda navegación (antes salía el dinosaurio de Chrome).
- `Graph.llamar` usa `AbortController` con 20 s.
- Navegación **network-first** con 3 s de límite; el resto de archivos,
  **stale-while-revalidate**.

---

## 7. Versiones y publicación

Este fue un dolor real: el celular se quedaba pegado en versiones viejas ("que pereza, sigo en la
61"). El mecanismo actual **no depende del service worker**:

1. `publicar.js` sube el número en **tres** lugares a la vez: `APP_VERSION` (app.js),
   `CACHE_NAME` (sw.js) y `version.json`.
2. `sw.js` **nunca** intercepta `version.json`.
3. `app.js` → `revisarVersionPublicada()` pide `version.json` con `cache: "no-store"` al abrir, al
   volver a la app (`visibilitychange`) y al recuperar conexión. Si está atrasada, hace **un**
   intento automático por sesión (`sessionStorage`) y muestra la franja verde con el botón
   **Actualizar** → `actualizarAhora()`: `postMessage("activar-ya")`, `registro.update()`, borra
   **todas** las cachés y recarga. **No toca los datos capturados.**

### Cómo publicar
```bash
node pruebas/correr.js                       # 48 pruebas
node publicar.js                             # corre las pruebas y sube la versión
git add -A && git commit -m "..." && git push
```
Después vale la pena verificar con `curl` que el sitio ya sirve lo nuevo — GitHub Pages tarda un
minuto y la primera consulta a veces da 404:
```bash
curl -s https://mald32.github.io/visitas-tecnicas/version.json
```

**Advertencia:** antes de decirle al usuario que borre datos del sitio, confirma que el botón
**Sincronizar esté en gris** (sin pendientes), o pierde trabajo de campo.

---

## 8. Cómo trabajar en este repo

- **Todo en español**, incluidos nombres de funciones, variables y comentarios. Mantener los
  acentos.
- **Comentarios que explican el porqué**, no el qué. El estilo del repo es explicar qué problema
  real resolvía ese código ("antes pasaba X y por eso…"). Seguirlo.
- **Correr `node pruebas/correr.js` antes de publicar.** Si una prueba falla porque el
  comportamiento cambió a propósito, se actualiza la prueba.
- Para cambios grandes en archivos largos se han usado **scripts de parcheo en el scratchpad**
  (Node con `replace`). Cuidado con `${}` dentro de template literals y con `\n` en comillas
  simples de bash — ya rompió `pruebas/correr.js` dos veces.
- Los commits van en español, en una línea, describiendo el cambio desde el punto de vista del
  usuario.
- El repo es **público**: no guardar ahí informes de clientes ni datos personales.

---

## 9. Preferencias del usuario (dichas explícitamente)

- Rapidez sobre validación exhaustiva: nada de navegadores automatizados ni dry-runs pesados.
- Un solo botón por acción, no dos que hagan lo mismo.
- Nada preseleccionado al abrir: "Elija cliente", y los clientes **ordenados por nombre**.
- "No arrumes las cosas así" — no apretar títulos ni texto para que quepa (se revirtió
  `table-layout: fixed` por esto).
- Nada de scroll interno en los recuadros de texto.
- El pie de página con su nombre **no va** en el informe.

---

## 10. Estado al 17 de septiembre de 2026

- Última versión publicada: **v64**, commit `5e1900e`, `main` al día con `origin/main`.
- 48 pruebas pasando.

### Pendiente de decisión del usuario
1. ¿Registrar el manejo "En general" en **todos los lotes con puntos** también al **salir** de la
   visita? Hoy solo se registra al abrir cada lote y en "Fin del muestreo". **Ofrecido, sin
   respuesta.**
2. ¿Guardar los PDF/informes en una carpeta "Informes" de **OneDrive**? (El repositorio se
   descartó por ser público.)
3. ¿Renombrar también dentro de la app la sección "Manejo agronómico" a "Manejo Fitosanitario
   Actual"? (En el informe ya se llama así.)

### Tarea del usuario en el Excel
- Revisar la visita "fantasma" **JOSE Y CARLOS · EL CUEVERO · 15/09/2026**: tiene productos
  aplicados pero ningún punto de muestreo.
- Hay huecos en `Observaciones_Lotes` (visitas sin su fila).

---

## 11. Bitácora corta (de dónde viene cada cosa)

- **v35 y antes:** informe rediseñado varias veces (paleta, encabezado, gráficas con barras de
  error, eje Y adaptativo, promedio general de la finca).
- Productividad por finca/lote y tabla `Productividad_Fincas`.
- Manejo agronómico separado de los resultados; dosis según tipo de fumigación.
- **Offline duro:** MSAL vendorizado, SW que no muestra el dinosaurio.
- **Historial de visitas** como tercera pestaña, con lo que le falta a cada visita.
- **Menú de visita** en tres secciones plegables (Lotes → Manejo → Productividad), papelera por
  lote, herencia en vivo del Lote 1.
- **Una sola visita** por cliente+finca+fecha; el botón cambia a "Modificar datos de visita".
- **Informe por fincas de un cliente** + tabla `Recomendaciones_Cliente`.
- **Semáforo** con umbral y máximo de la hoja `Configuracion`.
- **Historial por mes**, ventana de puntos por lote/finca, PDF idéntico al HTML.
- **v64:** aviso de versión nueva con botón Actualizar, sin depender del service worker.
