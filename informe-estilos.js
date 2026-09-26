// Estilos del informe (van dentro del HTML del informe, que se guarda como PDF o se comparte solo).
// Se sacaron de generarHtml para que ese archivo sea solo la estructura del informe.

const ESTILOS_INFORME = `/* ===========================================================================
   SISTEMA DE DISEÑO DEL INFORME
   Cada color tiene un rol: si un color no tiene rol, no entra aquí.
   Los tamaños salen de una escala (no se inventan valores sueltos como 14.5px)
   y todos los espacios son múltiplos de 4. Eso es lo que da el "ritmo" que se
   percibe como profesional. Para cambiar la identidad del informe se tocan
   estas variables y nada más.
   =========================================================================== */
:root{
  /* Marca: tomada del logo de Galagro */
  --marca:#00783c;         /* verde del logo */
  --marca-honda:#004f28;   /* verde profundo: encabezado y títulos */
  --marca-tenue:#eef5f0;   /* tinte de fondo */

  /* Neutros (el negro del logo es cálido, no azulado) */
  --tinta:#1a1614;
  --tinta-media:#5d5751;
  --tinta-suave:#8b847d;
  --linea:#e5e1db;
  --papel:#ffffff;
  --papel-suave:#faf8f5;

  /* Semánticos: solo significan, nunca decoran */
  --alerta:#a52a1f;
  --alerta-fondo:#fbeeec;

  /* Escala tipográfica */
  --t-micro:11px; --t-peq:13px; --t-base:15px; --t-med:18px; --t-gde:24px; --t-xl:30px;

  /* Escala de espaciado (múltiplos de 4) */
  --e1:4px; --e2:8px; --e3:12px; --e4:16px; --e6:24px; --e8:32px; --e12:48px;

  --radio:3px;
  --serif:Georgia,"Times New Roman",serif;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
}
*{box-sizing:border-box;}
html,body{background:var(--papel);}
body{font-family:var(--sans);font-size:var(--t-base);line-height:1.55;max-width:900px;margin:0 auto;padding:var(--e8) var(--e6) var(--e12);color:var(--tinta);}

/* --- Encabezado: banda de marca --- */
/* Dos columnas independientes (la visita a la izquierda, el asesor a la derecha), cada una con
   su propio contenido de arriba hacia abajo. Comparten el mismo fondo, así quedan al mismo nivel
   sin tener que acomodar todo en una sola línea de texto. */
header{background:var(--marca-honda);color:var(--papel);padding:var(--e6);margin-bottom:var(--e6);
  display:grid;grid-template-columns:1fr auto;gap:var(--e6);align-items:start;}
.enc-visita{min-width:0;}
.enc-marca{display:flex;align-items:center;gap:var(--e4);margin-bottom:var(--e4);}
.logo{height:48px;width:auto;background:var(--papel);padding:var(--e2);}
header h1{margin:0;font-family:var(--serif);font-size:var(--t-gde);font-weight:400;letter-spacing:.3px;color:var(--papel);line-height:1.2;}
.enc-datos{margin:0;display:grid;grid-template-columns:auto 1fr;gap:2px var(--e3);font-size:var(--t-base);}
.enc-datos dt{color:#b9d6c5;font-size:var(--t-peq);}
.enc-datos dd{margin:0;color:var(--papel);font-weight:600;}
.enc-asesor{border-left:1px solid rgba(255,255,255,.25);padding-left:var(--e6);min-width:0;}
.enc-rotulo{display:block;font-size:var(--t-micro);text-transform:uppercase;letter-spacing:1.2px;color:#b9d6c5;margin-bottom:var(--e2);}
.asesor-nombre{font-family:var(--serif);font-size:var(--t-med);color:var(--papel);line-height:1.3;}
.asesor-detalle{margin-top:var(--e1);font-size:var(--t-peq);color:#d6e8dd;line-height:1.6;}

/* --- Datos de la visita: celdas separadas al mismo nivel, sobre una misma franja --- */
.datos-grid{display:grid;grid-template-columns:1fr 2fr;margin-bottom:var(--e6);
  background:var(--papel-suave);border-bottom:1px solid var(--linea);}
.datos-grid>div{display:grid;grid-template-columns:auto 1fr;gap:0 var(--e3);align-items:start;padding:var(--e3) var(--e4);}
.datos-grid>div+div{border-left:1px solid var(--linea);}
.datos-grid .icono{grid-row:span 2;width:24px;height:24px;color:var(--marca);padding-top:2px;}
.datos-grid .icono svg{width:20px;height:20px;display:block;}
.datos-grid .etiqueta{color:var(--tinta-suave);font-size:var(--t-micro);text-transform:uppercase;letter-spacing:1px;}
.datos-grid .valor{color:var(--tinta);font-weight:600;}
.datos-grid-cliente{grid-template-columns:1fr;}
.lista-fincas{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:2px var(--e5);}
.lista-fincas em{font-style:normal;font-weight:400;color:var(--tinta-media);}

/* --- Títulos de sección: serif + regla de marca (lenguaje de documento, no de plantilla) --- */
h2{font-family:var(--serif);font-size:var(--t-gde);font-weight:400;color:var(--marca-honda);
  margin:var(--e8) 0 var(--e3);padding-bottom:var(--e1);border-bottom:2px solid var(--marca);}
h2:first-of-type{margin-top:var(--e6);}
h3{font-family:var(--serif);font-size:var(--t-med);font-weight:400;color:var(--tinta);margin:var(--e6) 0 var(--e2);}
.rotulo{display:block;font-size:var(--t-micro);text-transform:uppercase;letter-spacing:1.2px;color:var(--marca);margin-bottom:var(--e2);}

/* --- Tablas: sin cuadrícula pesada, solo líneas horizontales --- */
table{width:100%;border-collapse:collapse;font-size:var(--t-peq);margin-top:var(--e2);}
/* Cabe completa en el ancho de la hoja, sin partir los títulos en varias líneas. */
.tabla-lotes{font-size:var(--t-micro);}
.tabla-lotes th,.tabla-lotes td{padding:var(--e2) 3px;white-space:nowrap;}
.tabla-lotes th{letter-spacing:0;}
th,td{text-align:right;padding:var(--e2) var(--e2);border-bottom:1px solid var(--linea);}
th{color:var(--tinta-suave);font-weight:600;font-size:var(--t-micro);text-transform:uppercase;letter-spacing:.6px;
  border-bottom:1px solid var(--tinta);text-align:right;}
td:first-child,th:first-child{text-align:left;padding-left:0;}
td:last-child,th:last-child{padding-right:0;}
tbody tr:nth-child(even) td{background:var(--papel-suave);}
td.alerta{color:var(--alerta);font-weight:700;}
/* Lo que supera su umbral: solo la letra en rojo. */
td.sem-alto{color:var(--alerta);font-weight:700;}
/* Un fondo por nivel en el informe de lotes: lote, potrero (debajo de su lote) y general. */
.fila-lote td{background:#e8eef6 !important;font-weight:600;}
.fila-potrero td{background:#faf8f4 !important;}
.fila-potrero td:first-child{padding-left:var(--e4);}
.fila-promedio td{font-weight:700;border-top:2px solid var(--marca);background:var(--marca-tenue) !important;}
.lote-bloque-potrero{background:#faf8f4;}

/* --- Bloque por lote: barras y anillo lado a lado --- */
/* --- Indicadores de productividad: tarjetas destacadas --- */
.kpi-bloque{margin-bottom:var(--e4);}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--e3);}
.kpi{background:var(--marca-honda);color:var(--papel);padding:var(--e3) var(--e4);display:flex;flex-direction:column;}
.kpi:first-child{background:var(--marca);}
.kpi-num{font-family:var(--serif);font-size:var(--t-xl);line-height:1.1;}
.kpi-unidad{font-size:var(--t-micro);color:#cfe6d8;letter-spacing:.3px;}
.kpi-nombre{font-size:var(--t-peq);font-weight:600;margin-top:var(--e2);}
.kpi-base{font-size:var(--t-peq);color:var(--tinta-media);margin:var(--e2) 0 0;}

/* Dos lotes por fila: cada bloque ocupa media página, así las barras no quedan estiradas. */
.lotes-grid{display:flex;flex-wrap:wrap;justify-content:center;gap:var(--e4);}
.lote-bloque{border:1px solid var(--linea);padding:var(--e3) var(--e4);min-width:0;box-sizing:border-box;flex:0 1 calc(50% - var(--e4) / 2);}
/* Si el último bloque queda solo en su fila (un solo lote, o un número impar), se ensancha un poco
   para que no se vea perdido en la mitad de la hoja. */
.lote-bloque:last-child:nth-child(odd){flex-basis:64%;}
.lote-bloque h3{margin:0 0 var(--e2);font-size:var(--t-base);}
.lote-fila{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(0,1.1fr);gap:var(--e3);align-items:center;}
.panel-barras,.panel-anillo{min-width:0;}
.panel-anillo{text-align:center;}
.lote-bloque-promedio{background:var(--marca-tenue);border-color:var(--marca);}
.nota-puntos{font-size:var(--t-micro);color:var(--tinta-suave);margin:var(--e2) 0 0;line-height:1.4;}

/* --- Barras horizontales contra umbral (bullet chart) --- */
.bullet-lista{list-style:none;padding:0;margin:0;}
.bullet-fila{margin-bottom:var(--e2);}
.bullet-cab{display:flex;justify-content:space-between;align-items:baseline;gap:var(--e2);margin-bottom:var(--e1);}
.bullet-nombre{font-size:var(--t-micro);color:var(--tinta-media);}
.bullet-valor{font-size:var(--t-peq);font-weight:700;color:var(--tinta);font-variant-numeric:tabular-nums;}
.bullet-valor.sobre{color:var(--alerta);}
.bullet-pista{position:relative;height:8px;background:var(--papel-suave);border:1px solid var(--linea);}
.bullet-relleno{position:absolute;top:0;bottom:0;left:0;background:var(--marca);}
.bullet-relleno.sobre{background:var(--alerta);}
.bullet-dispersion{position:absolute;top:50%;height:1px;background:var(--tinta);opacity:.55;}
.bullet-dispersion::before,.bullet-dispersion::after{content:"";position:absolute;top:-3px;width:1px;height:7px;background:var(--tinta);}
.bullet-dispersion::before{left:0;} .bullet-dispersion::after{right:0;}
.bullet-umbral{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--tinta);}
.bullet-pie{font-size:10px;color:var(--tinta-suave);margin-top:1px;}

/* --- Anillo de composición --- */
.anillo{width:100%;max-width:160px;height:auto;display:block;margin:0 auto;}
.anillo-num{font-family:var(--serif);font-size:19px;fill:var(--marca-honda);}
.anillo-lbl{font-size:6.5px;fill:var(--tinta-suave);text-transform:uppercase;letter-spacing:.6px;}
.torta-legend{list-style:none;padding:0;margin:var(--e1) 0 0;font-size:10px;line-height:1.3;color:var(--tinta-media);text-align:left;}
.torta-legend li{display:flex;align-items:center;gap:var(--e1);margin:3px 0;justify-content:space-between;}
.torta-legend li span:first-child{display:flex;align-items:center;gap:var(--e1);}
.leg-swatch{width:8px;height:8px;display:inline-block;flex:0 0 auto;}

/* --- Historial --- */
.historial-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:var(--e4);}
.historial-grid.todas{grid-template-columns:repeat(3,1fr);}
.historial-item{margin-top:var(--e3);min-width:0;}
.historial-item h3{margin:0 0 var(--e1);font-size:var(--t-micro);color:var(--tinta-media);text-align:center;}
.historial-item canvas{width:100%;height:auto;display:block;}
.leyenda-lotes{display:flex;flex-wrap:wrap;gap:var(--e3);font-size:var(--t-micro);color:var(--tinta-media);margin:var(--e2) 0;}
.leyenda-lotes i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px;}
.chart-box{margin-top:var(--e2);}
.chart-box canvas{max-width:100%;height:auto;}

/* --- Manejo agronómico --- */
.manejo-box{background:var(--papel-suave);border-left:3px solid var(--marca);padding:var(--e3) var(--e4);
  font-size:var(--t-peq);color:var(--tinta-media);margin-bottom:var(--e3);}
.manejo-box strong{color:var(--tinta);display:block;margin-bottom:var(--e2);font-size:var(--t-peq);}
.manejo-subtitulo{display:block;font-size:var(--t-micro);font-weight:700;color:var(--marca);text-transform:uppercase;letter-spacing:1px;margin:var(--e3) 0 var(--e1);}
.manejo-lista{list-style:none;padding:0;margin:0;}
.manejo-lista li{margin:var(--e1) 0;color:var(--tinta);}
/* Dos bloques por hilera (dos lotes, o dos fincas): con muchos lotes, uno debajo de otro se hacía
   un larguero. Los datos de cada bloque van uno debajo del otro, no en dos columnas apretadas. */
.manejo-grid{display:flex;flex-wrap:wrap;gap:var(--e4);align-items:flex-start;}
.manejo-grid>.manejo-box{flex:0 1 calc(50% - var(--e4) / 2);box-sizing:border-box;margin-bottom:0;min-width:0;}
.manejo-grid>.manejo-box:last-child:nth-child(odd){flex-basis:100%;}
.manejo-columnas{display:grid;grid-template-columns:1fr;gap:var(--e2);margin-bottom:var(--e2);color:var(--tinta);}
.manejo-etiqueta{display:block;font-size:var(--t-micro);color:var(--tinta-suave);text-transform:uppercase;letter-spacing:1px;}

/* --- Recomendaciones --- */
.reco-lista{list-style:none;counter-reset:reco;padding:0;margin:0 0 var(--e6);}
.reco-lista li{counter-increment:reco;position:relative;padding:var(--e3) 0 var(--e3) var(--e8);border-bottom:1px solid var(--linea);}
.reco-lista li:first-child{border-top:1px solid var(--linea);}
.reco-lista li::before{content:counter(reco);position:absolute;left:0;top:var(--e3);
  font-family:var(--serif);color:var(--marca);font-size:var(--t-med);}
.reco-texto strong{font-size:var(--t-base);color:var(--tinta);}
.reco-detalle{color:var(--tinta-suave);font-size:var(--t-peq);}
.reco-dosis{margin-top:var(--e1);font-size:var(--t-peq);color:var(--marca-honda);}

/* --- Bloques de texto --- */
select{padding:var(--e1) var(--e2);border-radius:var(--radio);border:1px solid var(--linea);font-size:var(--t-peq);font-family:var(--sans);}
textarea{width:100%;min-height:72px;border:1px solid var(--linea);border-radius:var(--radio);padding:var(--e3);
  font-family:var(--sans);font-size:var(--t-peq);color:var(--tinta);background:var(--papel-suave);}
.caja-fija{white-space:pre-wrap;border-left:3px solid var(--linea);padding:var(--e2) var(--e4);font-size:var(--t-peq);
  min-height:32px;color:var(--tinta-media);}
.firma{margin-top:var(--e12);font-size:var(--t-peq);color:var(--tinta-media);border-top:1px solid var(--linea);padding-top:var(--e3);}
.hint{font-size:var(--t-peq);color:var(--tinta-suave);}
footer{margin-top:var(--e8);font-size:var(--t-micro);color:var(--tinta-suave);text-align:center;letter-spacing:.3px;}
.tabla-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}
.solo-pdf{display:none;}
@media print{.solo-pdf{display:inline;}}
.ver-detalle{background:none;border:none;padding:0;margin:0;font:inherit;color:inherit;cursor:pointer;text-align:left;}
.ver-detalle:hover .lupa{background:var(--marca);color:#fff;}
.lupa{font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--marca);
  border:1px solid var(--marca);border-radius:10px;padding:1px 6px;vertical-align:2px;white-space:nowrap;}
.detalle-puntos{border:none;border-radius:var(--radio);padding:var(--e4);max-width:96vw;box-shadow:0 10px 40px rgba(0,0,0,.25);}
.detalle-puntos::backdrop{background:rgba(0,0,0,.45);}
.detalle-puntos h3{margin:0 0 var(--e1);}
.cerrar-detalle{margin-top:var(--e3);background:var(--marca);color:#fff;border:none;border-radius:20px;
  padding:var(--e2) var(--e5);font-family:var(--sans);font-size:var(--t-peq);cursor:pointer;}
.historial-cab{display:flex;align-items:center;gap:var(--e2);margin:var(--e3) 0;font-size:var(--t-peq);color:var(--tinta-media);}
/* Va en su propia línea arriba del informe: flotando se montaba sobre el encabezado. */
.boton-imprimir{display:block;margin:0 0 var(--e3) auto;background:var(--marca);color:#fff;border:none;border-radius:20px;
  padding:var(--e2) var(--e4);font-family:var(--sans);font-size:var(--t-peq);cursor:pointer;}

/* --- Versión para imprimir / PDF: el mismo informe de la pantalla, tal cual --- */
@page{margin:12mm;}
@media print{
  /* Sin esto el navegador imprime en blanco los fondos: el encabezado verde y las franjas de color
     desaparecían y el informe no se parecía al de la pantalla. */
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
  body{max-width:none;padding:0;background:#fff;}
  .no-imprimir{display:none !important;}
  /* Las rejillas flexibles no se saben partir entre hojas y dejaban media página en blanco: al
     imprimir, los bloques se acomodan de a dos como cajas normales, que sí pueden pasar de hoja. */
  .manejo-grid,.lotes-grid{display:block;}
  .manejo-grid>.manejo-box,.lotes-grid>.lote-bloque{display:inline-block;width:49%;vertical-align:top;box-sizing:border-box;}
  .lotes-grid>.lote-bloque{margin-bottom:var(--e3);}
  .kpi-bloque,.historial-item,table,.caja-fija,.reco-lista li{break-inside:avoid;}
}

@media (max-width:640px){
  body{padding:var(--e4) var(--e4) var(--e8);}
  header{padding:var(--e4);}
  header h1{font-size:var(--t-med);}
  .logo{height:40px;}
  h2{font-size:var(--t-med);margin-top:var(--e8);}
  .lote-bloque{flex-basis:100%;}
  header{grid-template-columns:1fr;}
  .enc-asesor{border-left:none;border-top:1px solid rgba(255,255,255,.25);padding-left:0;padding-top:var(--e4);}
  .datos-grid{grid-template-columns:1fr;}
  .datos-grid>div+div{border-left:none;border-top:1px solid var(--linea);}
  .kpi-grid{grid-template-columns:1fr;}
  .manejo-columnas{grid-template-columns:1fr;}
}`;
