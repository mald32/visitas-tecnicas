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
| `app.js` | Núcleo: estado compartido, utilidades, arranque de sesión y visitas en curso. |
| `visita.js` · `productividad.js` · `manejo.js` · `captura.js` | Paso 1 (cliente/finca), productividad, manejo agronómico, pasos 2-3 (lote y puntos). |
| `pantalla-informes.js` · `historial.js` | Pestañas Informes e Historial. |
| `sincronizacion.js` | Cola, subida de cada tipo de dato, subida automática. |
| `arranque.js` | Versión publicada, service worker y los botones; **va de último** en index.html. |
| `informes.js` | Lee datos y **calcula** el informe (pesos, métricas, historial). |
| `informe-html.js` · `informe-estilos.js` | Arma el HTML del informe (`Informes.generarHtml`) y su CSS. |

> Desde la 2.3 el código está dividido por tema (antes `app.js` tenía 2.700 líneas y `generarHtml`
> 840). Son scripts normales que comparten variables globales; el orden de index.html importa. **Todo
> archivo nuevo debe ir en index.html, en `ARCHIVOS` de sw.js (si no, la app no abre sin señal) y en
> `ARCHIVOS_APP`/`ARCHIVOS_INFORME` de pruebas/arnes.js**; hay una prueba que lo revisa.
| `graph.js` | Todas las llamadas a Microsoft Graph. |
| `db.js` | Cola local e IndexedDB. |
| `esquema.js` | **Único** lugar donde se dice qué columna es cada cosa en el Excel. |
| `config.js` | Nombres de hojas/tablas, `CLIENT_ID` de Azure, datos del asesor. |
| `sw.js` | Service worker (offline + control de versión). |
| `version.json` | `{"version":"2.N"}` — lo que la app consulta para saber si se quedó atrás. |
| `publicar.js` | Sube la versión en un paso, corriendo antes las pruebas. |
| `pruebas/` | 75 pruebas en Node, sin navegador (`arnes.js` carga los archivos con `vm`). |
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
`informe_generado`, `recomendaciones_cliente`, `eliminar_visita`, `eliminar_lote`, `visita`.

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

**Desde la v68 la app ubica cada columna por su TÍTULO, no por su posición.** `esquema.js` tiene,
por tabla, el orden interno de la app (números fijos: del 0 al 23 en "Base de datos" es el orden
viejo, **no cambiarlo**, hay puntos pendientes guardados así en los celulares) y el título de la
columna de cada dato (`ESQUEMA.TITULOS`). La traducción se hace solo en `graph.js`
(`leerTabla`, `agregarFilaEnTabla`, `eliminarFilasDonde`, `actualizarColumnasDonde`), pidiendo los
títulos con `headerRowRange` (se vuelven a pedir en cada sincronización). Al comparar títulos no
importan tildes, ñ, mayúsculas ni espacios. Si falta una columna que la app necesita, lo de esa
tabla **no se sube** (queda pendiente con el error) y al entrar sale el aviso (`verificarFormatoDelExcel`).
Mover o agregar columnas en el Excel ya no rompe nada. `Clientes_Fincas` y `Configuracion` no son
tablas: se siguen leyendo por rango.

| Hoja / Tabla | Contenido |
|---|---|
| `Base de datos` / `TablaBaseDatos` | Una fila **por punto de muestreo**. 48 columnas (con "ID punto" y las auxiliares "Peso en el potrero" y "Area x peso en el potrero", 2.3): Lote (de ganado) → Potrero → Zona (área, % de la zona) → Punto; datos crudos; ponderados "(Pond)", "Daño Pasturas" y "Suma pesos del potrero", que son fórmulas. |
| `Productos_Aplicados` | Lo que el ganadero **ya aplicó** (manejo agronómico). 9 columnas. |
| `Productos_Recomendados` | Lo que el asesor **recomienda** en el informe **de una finca** (cliente+finca+fecha). 9 columnas. La columna Lote va vacía **por diseño**. |
| `Productividad_Fincas` | Área, animales, días, producción + abonos (estos los llena el usuario a mano). 25 columnas. |
| `Observaciones_Lotes` | Lo que se escribe al terminar cada lote. 6 columnas. |
| `Informes_Generados` | Una fila por visita con informe. 7 columnas. **Alimenta el Historial.** |
| `Recomendaciones_Cliente` | La recomendación del informe **por fincas de un cliente** (cliente+fecha del informe, sin finca). 10 columnas. Es una tabla aparte a propósito: no se mezcla con `Productos_Recomendados`. |
| `Productos` / `Tabla2` | Catálogo de productos (nombre, tipo, formulación, siglas, orden de mezcla). |
| `Visitas` / `Visitas` | **Una fila por visita** (Cliente, Finca, Fecha visita; y fórmulas: Lotes muestreados, Puntos de muestreo, Días desde la visita). Creada el 24/09/2026 con las 42 visitas que había. **La lee un agente del usuario** para decirle a quién hace rato no visita. La app la llena sola (item `visita`, se anota con el primer punto de cada visita, una sola vez: caché `visitasRegistradas`; al subir reemplaza la fila; `eliminar_visita` también la borra). |
| `Clientes_Fincas` | Clientes, fincas y sus lotes. |
| `Configuracion` | `A8:C19` = variable, **umbral** (col B), **máximo permitido** (col C). |

### Columnas fórmula
Toda columna del Excel que la app no conoce, o que está en `ESQUEMA.CALCULADAS`, se sube **vacía**
(`null`) para que la calcule la hoja. Los daños **por punto** (Collaria, moluscos, hongos) ya no tienen
columna en el Excel (allá solo están ponderados): `completarFilaBase` los calcula al leer con los
datos crudos. Un punto sin zona se sube como **Zona 1, 100 %** (`ESQUEMA.POR_DEFECTO`); si no, el
"Porcentaje del punto" daría 0.

> Si Graph devuelve **400 InvalidArgument**, casi siempre es una fila con distinto número de
> columnas. `descripcionItem(it)` existe para que el aviso diga **qué dato** falló.
> **404 ItemNotFound** = falta crear esa tabla en el Excel (el mensaje ya lo dice).

---

## 5. El informe (`informes.js`)

Dos modos, mismo motor:

1. **Por lotes de una finca** → `calcularDatos(cliente, finca, fecha)`. Unidad = **Lote**.
2. **Por fincas de un cliente** → `calcularDatosCliente(cliente, seleccion)`. Unidad = **Finca**.
   El asesor elige **qué fincas y de qué visita**; cada finca se pondera (lotes por área, o iguales sin áreas).

El motor está parametrizado por unidad: `metricasDeUnidad(sub)`, `puntosDeUnidad(sub)`,
`resumenDeTabla(tabla, umbrales)`, `historialDeSeries(filas, meses, series, umbrales)`, y
`D.etiqueta_unidad` / `D.plural_unidad` / `D.es_cliente` deciden si se dice "Lote" o "Finca".

Otros detalles del informe:
- **Semáforo (desde la 2.0):** solo **letra roja** (`sem-alto`) si supera el umbral; nada de fondos
  verde/amarillo (el usuario lo pidió así; los fondos ahora distinguen niveles). **Pasto sano va al
  revés** (es un mínimo). El máximo permitido ya no se usa para colorear.
- **Informe de lotes de una finca (2.0):** tabla con fila por lote (fondo azul claro `fila-lote`),
  debajo sus potreros (`fila-potrero`, fondo crema) y "Ponderado general" (`fila-promedio`, verde).
  Gráficas de barras + torta por lote, por potrero y del estado general. Filas y gráficas por potrero
  **solo si el lote tiene 2 o más potreros** (con uno serían idénticas al lote). El 100 % se reparte:
  potrero = entre sus puntos por zona; lote = entre sus potreros (por área si todos la tienen, si no
  iguales); **general de la finca = cada lote igual** (`lotesIguales`, desde la 2.1; en la 2.0 era
  "todos los potreros iguales" y el usuario lo corrigió). El **informe por fincas de un cliente queda
  como estaba** (finca = lotes por área, o iguales sin áreas), pedido explícito.
- **Columnas de peso del Excel (24/09/2026, las llenó Claude con fórmulas de columna de la tabla):**
  K "Peso de cada zona" (a mano) → L "Peso de cada punto" (fórmula del usuario: K ÷ puntos de la zona)
  → H "Peso de cada Potrero" (parte del potrero en el lote) → M "Peso de cada punto (x Lotes)" =
  L/"Suma pesos del potrero" × H → E "% del Lote" = 1 ÷ lotes de la finca en esa visita → N "Peso de
  cada punto (x Finca)" = M × E. O "(x Fincas de un cliente)" **no se llena** (pedido explícito). El
  informe hace estas mismas cuentas en `pesosDePuntos`. Para tocar el Excel se usa **Excel por COM** desde
  PowerShell (ver 2.2 en la sección 10): **nunca con el Excel abierto** y comprobando que el archivo no
  cambió desde que se leyó.
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

## 6 bis. Subida automática

Desde la v66 no hay que darle a "Sincronizar": lo pendiente sube solo al entrar, al recuperar señal,
al volver a la app, al terminar una visita y cada 2 minutos (`sincronizarEnSegundoPlano`). En
silencio: si algo falla queda pendiente y se reintenta, sin sacar avisos. **No sube mientras se está
muestreando un lote** (`capturandoLote`): el potrero se les pone a todos los puntos al terminar el
lote y un punto ya subido no se puede corregir. El botón queda **naranja** cuando hay algo esperando
y **gris** cuando no.

## 7. Versiones y publicación

Este fue un dolor real: el celular se quedaba pegado en versiones viejas ("que pereza, sigo en la
61"). El mecanismo actual **no depende del service worker**:

1. `publicar.js` sube la versión (**2.0, 2.1, 2.2… después de 2.9 sigue 2.10**; el usuario no quiere
   el conteo 69, 70…) en **tres** lugares a la vez: `APP_VERSION` (app.js),
   `CACHE_NAME` (sw.js) y `version.json`.
2. `sw.js` **nunca** intercepta `version.json`.
3. `app.js` → `revisarVersionPublicada()` pide `version.json` con `cache: "no-store"` al abrir, al
   volver a la app (`visibilitychange`) y al recuperar conexión. Si está atrasada, se actualiza sola
   **una vez por sesión** (`sessionStorage`) con `actualizarAhora()`: `postMessage("activar-ya")`,
   `registro.update()`, borra **todas** las cachés y recarga. **En silencio**: la franja verde con el
   botón "Actualizar" se quitó en la v66 porque estorbaba en pantalla (el usuario la quiere así: que
   se actualice sola al refrescar). **No toca los datos capturados.**

### Cómo publicar
```bash
node pruebas/correr.js                       # todas las pruebas
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

## 10. Estado al 24 de septiembre de 2026

- Última versión publicada: **v2.3**, `main` al día con `origin/main`.
- 75 pruebas pasando.
- v65: el manejo agronómico (tipo de fumigación, volumen, orden y pH) de una visita **ya subida** se
  corrige en el Excel con `Graph.actualizarColumnasDonde` (cola: `manejo_puntos`), porque esos datos
  viven en las filas de los puntos (hoy columnas AN:AQ; la app las ubica por título). Y el **último punto** ya no se pierde al
  terminar el lote: antes se exigía el formulario completo y si faltaba un campo se descartaba en
  silencio.
- v66: subida automática, botón naranja/gris, sin franja de versión.
- v67: la subida automática vuelve a leer cada dato justo antes de subirlo (no sube lo que se borró
  mientras tanto) y usa `revision` en la cola: si un dato se corrigió mientras subía, queda
  pendiente en vez de marcarse como subido. `withStore` rechaza en `onabort` (antes se congelaba).

- v68: lectura y escritura del Excel **por títulos** de columna (el usuario reorganizó "Base de
  datos" para el muestreo por zonas y agregó abonos a Productividad).
- **2.3**: código dividido por tema (ver sección 2). **ID único por punto** (`idPunto` en los datos
  del item, columna "ID punto" del Excel; los 329 puntos viejos recibieron uno): antes de reintentar
  una subida que pudo haber llegado (`DB.anotarIntento` > 0) se revisa con
  `Graph.existeValorEnColumna` si ya está, y no se duplica. En el Excel, H "Peso de cada Potrero" y M
  pasaron de SUMAPRODUCTO sobre toda la tabla a SUMAR.SI.CONJUNTO sobre las auxiliares (mismos
  valores exactos; recalcular 174 → 96 ms con 329 filas). **Ojo: el Excel está en OneDrive y tiene
  guardado automático: por COM, los cambios se graban aunque se cierre "sin guardar"**. Poner
  `$wb.AutoSaveOn = $false` al abrir, o trabajar sobre una copia y reemplazar al final.
- **2.2**: hoja/tabla `Visitas` que la app llena sola (para el agente del usuario). En el Excel se
  llenaron con fórmulas E "% del Lote", H "Peso de cada Potrero", M y N (verificado con Excel: M suma
  100 % en los 83 lotes y N en las 42 fincas-visita). Para tocar el Excel se usó **Excel por COM
  desde PowerShell** (instancia oculta, `New-Object -ComObject Excel.Application`), solo con su
  archivo cerrado: así Excel mismo escribe y calcula, y se pueden leer los resultados. Ojo: en
  PowerShell `$N` y `$n` son la misma variable, y una función que devuelve `Value2` necesita `, `
  delante para no aplanar la tabla.
- **2.1**: general de la finca = cada lote igual (como la columna N del Excel); la app acepta los
  nombres "Peso de cada zona/punto" y los viejos "Porcentaje de la zona/del punto".
- **2.0** (antes v70): nueva numeración; filas y gráficas por potrero con fondos por nivel; general de
  la finca por todos sus potreros; semáforo solo en letra roja; columna Zona en la ventana de puntos.
- v69: el informe (tabla, general, barras de error e historial) **pondera** por zona, potrero y
  lote en vez de promediar puntos; "Promedio general" pasó a "Ponderado general".

### Muestreo por zonas (en curso, 24/09/2026)
El usuario cambió el método: por finca, cada **lote de ganado** (columna Lote) tiene uno o más
**potreros** (casi siempre el que entra el ganado al día siguiente), cada potrero se divide en
**zonas** con área o % (la app debe convertir área ↔ % sola) y cada zona tiene puntos. Ya no se
promedia: se pondera. Reglas acordadas:
- Peso del punto = % de la zona ÷ puntos de la zona (así está la fórmula del Excel).
- Potrero = suma de valor × peso de sus puntos.
- Lote de ganado = potreros ponderados por área; **si falta el área de algún potrero, pesan igual**
  y el informe dice **"Sin areas de potreros registradas"**.
- Finca: en el informe de lotes, **cada lote igual** (columna N del Excel); en el informe por
  fincas de un cliente, lotes por área o iguales sin áreas.
- El informe hace la misma cuenta de las columnas "(Pond)" pero con lo del celular + lo del Excel
  (`pesosDePuntos`, `ponderado`, `desviacionPonderada` en `informes.js`); **no** lee "(Pond)"
  porque con puntos sin subir o una visita retomada esas fórmulas todavía no tienen el número bueno.
  Verificado el 24/09/2026: los 85 potreros del Excel dan igual que la suma de sus "(Pond)".
- **Ojo al explicarle esto al usuario:** decir "datos crudos" lo confundió (creyó que se botaban los
  ponderados). Decir: "la app hace la misma cuenta del ponderado".
Falta: la captura por potreros/zonas en la app (hoy todo punto nuevo sube como Zona 1 = 100 %).

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
