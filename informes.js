// Genera el informe HTML de una visita (Cliente/Finca/Fecha) leyendo directo de la hoja de Excel.
// Es la versión en el navegador de generar_informe.py + generar_informe_html.py.

const COL = {
  cliente: 0, finca: 1, fecha: 2, lote: 3, punto: 4,
  adultos: 5, ninfas: 6, incidColl: 7, sevColl: 8, danoCollTotal: 9,
  loritos: 10, lepidopteros: 11, hojasMoluscos: 12, incidMoluscos: 13, danoMoluscos: 14,
  incidHongos: 15, sevHongos: 16, danoHongos: 17, potrero: 18, observaciones: 19,
  tipoFumigacion: 20, litrosMezclaHa: 21,
  acondicionadorAguas: 22, dosisAcondicionador: 23,
  insecticida: 24, dosisInsecticida: 25,
  fungicida: 26, dosisFungicida: 27,
  fertilizanteFoliar: 28, dosisFertilizante: 29,
  abono: 30, dosisAbonoHa: 31,
  ordenMezclaCorrecto: 32, phFinalMezcla: 33,
};

// El valor puede ser el indice de columna, o una funcion(fila) para variables calculadas (ej. Pasto Sano).
const VARIABLES_HISTORIAL = {
  "Individuos Adultos de Collaria": COL.adultos,
  "Ninfas de Collaria": COL.ninfas,
  "Incidencia dano Collaria (%)": COL.incidColl,
  "Severidad dano Collaria (%)": COL.sevColl,
  "Individuos de Lorito": COL.loritos,
  "Numero de Lepidopteros": COL.lepidopteros,
  "Hojas atacadas por Moluscos": COL.hojasMoluscos,
  "Incidencia mancha fungica (%)": COL.incidHongos,
  "Severidad mancha fungica (%)": COL.sevHongos,
  "Dano Collaria (%)": COL.danoCollTotal,
  "Dano Hongos (%)": COL.danoHongos,
  "Dano Moluscos (%)": COL.danoMoluscos,
  "Pasto Sano (%)": (fila) => 1 - (fila[COL.danoCollTotal] || 0) - (fila[COL.danoMoluscos] || 0) - (fila[COL.danoHongos] || 0),
};

// Nombre del umbral en Configuracion para cada variable del historial (null = no tiene umbral comparable).
const UMBRAL_POR_VARIABLE_HISTORIAL = {
  "Individuos Adultos de Collaria": "Umbral de Adultos de Collaria",
  "Ninfas de Collaria": "Umbral de Ninfas de Collaria",
  "Incidencia dano Collaria (%)": "Umbral de Incidencia de ataques de Collaria",
  "Severidad dano Collaria (%)": "Umbral de Severidad promedio del Dano por Collaria",
  "Individuos de Lorito": "Umbral de Individuos de Lorito",
  "Numero de Lepidopteros": "Umbral de Numero de Lepidopteros",
  "Hojas atacadas por Moluscos": null,
  "Incidencia mancha fungica (%)": "Umbral de Incidencia de Manchas del Kikuyo",
  "Severidad mancha fungica (%)": "Umbral de Severidad Promedio del Ataque de Hongos",
  "Dano Collaria (%)": "Umbral de Dano Total de la Pastura por Collaria",
  "Dano Hongos (%)": "Umbral de Dano a la pastura por Hongos",
  "Dano Moluscos (%)": "Umbral de Dano por Moluscos",
  "Pasto Sano (%)": "Umbral (Min) de Pasto Sano",
};

// Umbral y etiqueta de cada indicador de la tabla de resultados (para el semaforo y las alertas).
const DEFINICIONES_UMBRAL = [
  { campo: "incid_coll", nombre: "Incidencia de dano Collaria", umbral: "Umbral de Incidencia de ataques de Collaria", pct: true },
  { campo: "sev_coll", nombre: "Severidad de dano Collaria", umbral: "Umbral de Severidad promedio del Dano por Collaria", pct: true },
  { campo: "incid_hongos", nombre: "Incidencia de manchas fungicas", umbral: "Umbral de Incidencia de Manchas del Kikuyo", pct: true },
  { campo: "sev_hongos", nombre: "Severidad de manchas fungicas", umbral: "Umbral de Severidad Promedio del Ataque de Hongos", pct: true },
  { campo: "adultos", nombre: "Individuos adultos de Collaria", umbral: "Umbral de Adultos de Collaria", pct: false },
  { campo: "ninfas", nombre: "Ninfas de Collaria", umbral: "Umbral de Ninfas de Collaria", pct: false },
  { campo: "loritos", nombre: "Individuos de Lorito", umbral: "Umbral de Individuos de Lorito", pct: false },
  { campo: "lepidopteros", nombre: "Numero de Lepidopteros", umbral: "Umbral de Numero de Lepidopteros", pct: false },
  { campo: "dano_mol", nombre: "Dano por Moluscos", umbral: "Umbral de Dano por Moluscos", pct: true },
  { campo: "dano_coll", nombre: "Dano total por Collaria", umbral: "Umbral de Dano Total de la Pastura por Collaria", pct: true },
  { campo: "dano_hongos", nombre: "Dano por Hongos", umbral: "Umbral de Dano a la pastura por Hongos", pct: true },
  { campo: "pasto_sano", nombre: "Pasto sano", umbral: "Umbral (Min) de Pasto Sano", pct: true, esMinimo: true },
];

const COLORES_LOTE = ["#2e6b3e", "#c9772e", "#3a6ea5", "#8a4fa0", "#a02e2e", "#2e8a8a"];
// Orden: Dano Collaria, Dano Moluscos, Dano Hongos, Pasto Sano
const COLORES_TORTA = ["#e6b800", "#888888", "#722f37", "#2e6b3e"];
const LOGO_DATA_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABVYAAAMACAMAAAD44MzwAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAGxQTFRFR3BMB4FAB4FAHRENHRENHRENHRENB4FAB4FAB4FAHRENB4FAB4FAB4FAB4FAB4FAB4FAHRENHRENHRENHRENHRENHRENB4FAB4FAB4FAB4FAHRENHRENHRENHRENDWUzFy8bHRENB4FAD1ctI9mLAAAAACF0Uk5TAO8Q74BAv0CAvxDPMGDfIJ9gnyDP3zCPcK9QcK+PUEDvhJbjrwAAIABJREFUeNrs3ct2nMgSBVDBBFgUj1lRNeT/P/Kqb7vtZaskAckjwHvPveSS0FEQGZn59gYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKzklvseAKwRp829ascfqkdZ+JYALJU3fTZ+8GgUrgALPPvxM/3NtwdgXqE6tONXKs0AgBmhWmbjd/rO9wlgtVB9lw2+VQATNJNC9f+dAAUrwHdu1Thd9vQNA/hSOc5T+pYBfFGq1uNcve8awGeGcYHe5gCAl/LHuEgtVwHWaQD80NoaAPDBMxuXuytYAX43jEmy8qsR1q74j7MEgL9EPyZ7DLcPadqUj+rPswWy6lE22gbApeXVuI73xPyhqtpvGrIfYxjgIrp6PEb2GGx/Ba7nlo0Hqu+KVkCqrqtVswIX0owRPJzZAkjVtUtWs6/ABQxjHFkpWIGz68dQBCsgVQUrQOBUdUMWIFU3WLyysxU4ozxqqv4zbmWOFThfqtZjYJkrsgCpuvKeVltaAam6LgUrIFUVrIBUDd1hNWsFSNWVRwJsDgCk6roFqxlWQKpauQKkqkYAwN+SquPYmggApOq6DdbGTw6I6fhrqxa6+9kBUlWDFZCqkbdcOdQKkKrrNlgtXAE76Ip30+q4k6eqhStgc8/7z2X9qvy2lDt9qr6Tq8B2iv6PmKy/zpzmAqk6jr0fPLCN5tX4afv84h+M1yBXgU0q1XbuFNJ9vIraoBWwtq6ae97TV/9CrgJ/u+HrJun9Y+pco61qgBXYvVT90WH9Y+mqqMaLMcAKrOc5pfBsh18V6/NyoSpXgRVNXnmq70NRPMtHNl6SXAVWkT9GbLgC1kvVWpzacAWsp5OqchVY0S2TpHIVWLFWlaofWLcCltNXfbVV13MBSNVV2cYKLHXZyaqq6suyKYriwwv9P+dzN2XZV1/sZyg8GcAy98vFaV2VQzG5N3orhrKqxSqwluZSgfoonwvXmrqifNSaAECyy4xW1f2wQn1ZDH1twgpIcYnlqqosVqwt86IsS/NVwDL3K0SqHyMQRnHyF/+7SAVCydsTHzP1aCwqAdGUZ83U9v5c+plvRVk+PplXbauqbHRVgcVuZ83UZcmX/zlC9Wkd/PRsAItUf0+mdk0/p+HRlp4OYL7zbQTI+iVLVPmzn99DbvUCgNlpc7aNAI8lE/p5s/TIA/sBgJnONbLaDt2emSpXgdlOtV616OX/2Se2HDpPCTBDdaJCdcGAal6mz+RWnhJgutOsVy2adir6Vb62PVzA9GLuHOtV2X3Ji3izViXu4hVgsvtl3/7fmhV35NoeC0x0hvWqatFKfLPqMQe6AMBE8derqkWJ1qx8dszgUQGmpU/4gapFe5ya1Q/ksocVmCT6elW/aGD0ucEph85cASa5XzBUi036Gg4GAKborheqXb/JfybzsABTVFcL1bdyo67G3cMCTPC8Wqg+N7s6xqEAwARh769aGKrddsW3OQBg0gvzleZUt3v/f1fbYwVMKe4uFarFhqV3ZgwAmOIRMFTbhQdG55tOijnFGphU3gU8pWppC/OZSVXgcPHWq+4LO5jdtnW3VAUmCbde9Vg6wzRkUhU4XhfsMIB66cF73cZbGqQqME0fq6m6OLw2LlUzJ6wA0xSXaKpuXqqarAKmqiNNqi7eGLpxqWoXADA9jwJNqi5+zd66VB0fUhWYKNDh1eXi6Gq2/hC9BwWYqj//+3+++R4xl1cBkxWnf//feFuVwSpgniDrVYvX/zc+AUCqAjPFWK+qls8u3Tbfd2tcFZhT6kVYr8oSOpfbb7s1rgrMEWG9KmF0qdv+/q3aDSvADAHWq9pi+X9/+7Uq46rAPMevVy1fqnrLdyi13bEKzHL4elWd0Le8bf83ITMCAMxy9HmAWcoVpkPs0Af+SgffX1UlLAblO/zfe21VYJ5j16tSpqreikwDAAgnP/T+qkfK3FKpAQAEdOT9VUkbl/Lth1VNAADz3c65AWCfBkDh+QB+6Yry3fO7ZKjOWaruUWTbAgDRYm14VO/KQ5pz3f1Xx7QavuhfDucsVXdoADhZBaKF6q+tP21z4Bf/kaxNtBZAWmjt0AConAEAsfx++cfOy8mv3o/b4VVxeNgUQNr79Q7HVbkGAIK5HfhC2dWTBzDz+oyl6g4NAKUqhFMdd7D8LZt8SNRRqZpWqu7QAFCqQjwvflV36gN8ffXob1VYV5+wVHVeNYjVn6XiLtM6zbcb3P+rWPMyO2GpusMZALWxKjhJrO6yYec55bzoviyKsj8mVBN32G9/YZVUhaBeZtb2yyC3CDdSbbgUtMchgFIVYuoPKVe74KmaOLW0xy0AmREACOrly3i2cSGU17FTNXF697bHx7OzCsJ62QPceMiqj52qZdqna/YoxStPLoT1cgyo3fRLDqFDtU2cWtrnb4ZiFeLKs73L1VvoVL2nNUB2GrHNPLigXP2V423gUE3du/vcaS3u4bkF5epPj8Cpmnpu6W73F5SeW4jsZTNws61WgRurqYdB5fsdtC1WIbTbnr+4gRurdeIk6J5bHMQqxFbvN24eeGI1Nal2LcN7Ty2ENuy3KnIPO1aVeMdevm/LuPbUQmj5bqORz6ipmrpWddt7vMGBABDb6wn29bew5kGPAki+EqHZ/YM1nloIrdhpOLKKmaqpF5fkB2zGNbgKwdW7tAGCzlalrlXdDlmGc4AVxNbscfhczNMAU48A2G1jlVkAOJdshwXnkLNVfWoD+bDZBuUqxPbZrsv79l/i1GtV3XF/K5SrENuna/SrrThH3F6Vuq/qqAbAv1y7CucsV1f75Q3YAkjeAXrs5gYnWUNs3afvyev08OK1AFL3VR3ZANhsvwawok9nL1e54TNeCyB1X9WxDYB//zB4aiG0z3dArZGr0VoAWXLPOMLpBrZaQWzlhjt6om0ESF6r6kL8nVCuwlnL1eRZnmgbAZLXqp5BPpByFc5arqbmaqyzALLUtao8zPGGzgeE4NqNcrW51lrVLVCjuPDUQmjPbfb0hDoOMPW+qiMOAbTVCs6r2uQXuA8UQ3Xq7oY82MWxjrOG2LovE2nhb3ARKISSjzjY/RaA7wyeWoit3CBX4wRR8lpVwL1iFq0gunr1N+g4SZS8VtVFvN3A+YAQ3G3tci/MyGr6WtUz5DHcRlfh1G2ABa28KAXe5daq1tsCBxzZBph9mn6UXavJa1VFGzNVx8wjC+duA8ws+24x3pvT16ruY1iaqxDetwXm9B31eYwS71L7qmy0ghP6tok4tWDNQ6RR+lpVOUZWemIhvAk15qQOa4xUvcgZgGIVTm1CRzQr83PEUXLoDFnsVHWlFZzClCOnvgvWEFOe6fdVVeMoVoF0kxa+s/7zHmuMKc8+da0qfKkqVuE0JqZiO7xM1q6MEEdZ6s2kJyhVxSqcxvTlprZvfl8UypsY+5Gqv6FUFatwolydNXJa9eVQvGvKPsi6efJY1TlKVZMAcCK3bDyx5LGq8jQfX6yCXD1B1Nzq83xWu6xArm5fqiaeVpWXZ/q0rl0BuRq9VA17WJUVK/gfe3fWFTeuhWEYm0FyewyBeCDJWuX//yMPdDiLTlJVWNKWreF9Lrp79Q1gVB/y1pZErh6yA8B1qjrH9fNymRVArvo1Or4TT7H9xNQAgNhytYtrquq4ftNUsf0ZGRijQGzKiNbEV+02dSvHNTocYg1EmKvRTOBcGwDaCCvJNK0CURqySJj43v/fih5UVoE4tREETOU2VY3x/f9Vw+AEIhX8wpXrCQBtnB26LUMToMDqh+MdgKqOMlTpAgDiNoWbLo5dVf28kqoAjigEhDqlc+uqirSoSqoCSRQCggygyq1xU0d7TBebVoEUhHcGSed2r0rbxRqqzhfKAAiETun9X0Ubqu6ndAMIRkgVVrf3f1VFG6rsrQKYsIa3/h9zqFZsAgASo4K4rNppxSbmUO3YAwCkJ4BDrZyKqjGHaqE5BQBI0sGHrwwuRVVCFUCIjtxz5VRajPr1fyJUgYQddqhV5bJSFW+f6usPTqcqkLhjbrlyCdVyijdUi5FGVYBcDSxU+zHabarrzEQVIFdDewtWc7yZ2lJRBcjVwGaq8b79F2QqkBkVQ6g2Q6Rv//WoGGJAdnbqB7DvUy2nOtJIXZimAnnaoX+10NahugwxvvhXWhGpQMZ8B1dnXVxs4lv6r2e90EgFZM/rS/ZgW11sxqhWqbpq0AvnUgH4V+ktvzrbDfDRZGpdVVovigkqgN9DLKyJqgo8U7tq1rpVilV+ABd5WLaq7SqqfTsHXE+tB83EFMAmwjuY6skqfJYx4F6qjoYpAAYky6vdaLFyUyod8nl/nWaSCsCMOnCe2rRj2B3/HOgHwILAtYHF3JpmqmrH4A+lrlmaAmDFdcJotu5fqlbPUexKnRgaAOy4d1nV1fjWd3R1YUe9xulYxXNtSkGHP4AjywAfnZ2vRv1hfPsfER6ZUrP4D+DAMkB6ClIVgAtFjv6BCgAANyNB+hvNkADgpqQM8FuFmBEBwFVDlv5Hy4AA4EwTph/rVQwHAAIoA3zsb2A0ABDQF+TpOw4CACCiJU/f0bMKQMZAoNIHAEASXVbvpwEyFAAIaSivvpkZCQCkUF5lixUAWZRXiVUAoiivEqsAZNG9SqwCkMUZgevIKAAgiWUrGqwAyBqIVQAQVWUeqxxgBUBY9u0ADAEAwnJvB1AMAQDCMt/FyuUAAMQtdFgBgKis26xoBQBArrJmBSB4I2tWACAq420BE799AOSqpIFfPgB7vdJjVc16IVdZswLgqlyG7mPP5kSusn0VgAM11p++++aaq4wOAIYaXW1bqsk0VxuGCACDSJ3mS3tTi5JcpcMKgFCkXuosGohVALCK1EtL4BOxCgA2kXpxraYlVgHAJlIvrtW0xCoAWETq5TzJ7vxVYhXAGUpXhVSeNF1esVoyfAD8Famy07TM7rdiBAGQiNSrb79lTo1WNaMIgESkflJU1JxgBSAvzVS5B8q1tZolm4UrzlsFYLzib7UE3uRSYO0ZUUDmmTrIrdNf7ywq5yxStWNMAVlbRKeQn3UWaWoAANImvUD/6RdUBTUAACmr1p1j9aasUk/VgWEFZEz8nXzLF52YrAJIVnFErB69lbXyO1/WDCsgY+qgNfByPGqNfnpvVShVa3PkwZYdVpwHAORM/MS+zTc5H7I1oGv/+C76dpRupS24xgrImj4sVo9oYZ3PziPLRTRaW0YVkLXpuFjdf8I6XMn4ZexIVQAC1JGxunOF9bNvrW8F9u+SqkDumkNj9TXW92sJ6LasJDXaqR5QLAwpIHvS4TWafgO7bWbdeg1KuVifkFDTsArgRnq2aN6z2e+z6coo73ub87wKTgIAcCO/d9WmFX7pAikB/FEPMHo2xUi7KgAf7+B2O4y0954Au6UkpTfOWjtNqAJ4nymGsXGz93zRlcPdUn07fjJt7QZWqgB8CGU/fOO1xKocn1Kv9HB2q2s9TOyqAvCbIYSX7V9v3P6CtRJ6WL1S+kOrSFQAZ8IsoGlh2wU6WQXw+Run+j/mG3NIAeYnWCtGPOBvatbq+a8SWVcNesk3Xss6qHmhj2BlRQnwEh5Kz9c/sJVe8mySEb1lWuB1WzxYuQcVkI/UzSe/1Vku60qeeCJSxWyrUJbRAJybi01mn9FuzHBjdz/VYS0OSXYFMFkFRDPV6hTNus2xGqBEDnOWS3qxzi+ulgIOztT3Dd59nk+sCCZWb25KLVJkLdhWCgh9Jl1fa4csg7XU4cTqjUyRlXOlAJkXWok3yDyDta8DitXXb8d1Al3zaQAEZlxiHTp5nvU2hBSrzlNW9nsAx09vOJm4DStWX3+n9lVW1qsA5w+g9AFzdY6znSG8V+5msPprybZVILRQzbUSYP3a7TPGFvNkrekCAMIL1TwnrH0RYKy+Vc1nUhXYT+nxfPn8CnQ6yFg1nLOSqoBbDni9DanK7QNaFqHG6luybtvnMZOqgAPl++7OLrdCgA44Vm+2nPTA9dKA09RqXv3L7Bik3nILxY6/9WXo2MsBeHonLNY9jHk91TqGKnQ/nb1wOtMjHYCopqq/JkBZ1ep0LIt7zR8XTlcjlwEATlSx7iarlWUVS6y+f7tKLfr1H0xTgWPmVOTqhrcAWtGALAsA1bqvnBoCOmIVyE9TrHsr8slVqz9ZlDWBqLXrAfLJVatda4phCURsXFdy1SNNrAKZGdaDFJksNhOrQF7Kej1MJv0AxCpAqpKrx8cqp5sApKqVmVjd884VAMmn6q4nihxmIVYBUnVHGZxnpYhVgFTdU/ptVsQqkI0gUnUtkl+csYlVLjoFYjSsYUg+QYhVIBPjGorUTxUhVvdy/+objwGHaddwJN76Tqz69/XLj4fTu6fHnzwQxPJR93dKYMmzzvtiGjfffjydfvf8wlPB7voipFhNPEQUhRGP/nl5Pp3xRDEAOwujtSqXMgCx6vHl//F0we0Xng52NQSWqmtHrBKrkqH6hgor9tSuwUk5RmxilcsBNrz+Xw3V1/nqV54RdhNYYfWXhM9eVVRFfHi5PX3iiYeE3dQBpmrKZ1kRqz6mqg+nz1FexV70GqR0g8QmVhvG6VX3txtS9fTMg8I+mjBTNeEGeJtYZZxeLwCctmG6iuhLAEX1r44jAolVrx43purpgWeFiEsAlV7+897aLKN5eifbZEWsHpWqpxPNAIi0BFAM59qB+qlmumobqxwJIJOqVAGwh0r+2pTLLZZqNrswkFglVj93Z5Cqp+88L3gnvRGg0Nf7TXuj/VyJNgMQq5J+mqTq6ZYHBt/KQjhUPz96SlXZh4lFrHKA1SVfb41ileIqvJM9unrcdp7flPtWK4tY5UiASx7MUpWDAeBbLxmq9eaO9abIe5JGrMr5YpiqpzueGfySXK8y+eBvztWCWGXv6jX/3JrG6g8eGkL7eF/sMTXbXLm5DtDy3InVK+5MU5UNAYhmsjqb3pKydeNVkgeuWMQqRwKc90ysIixyzVXmJdDN09UUb7WyiFVG61nGlVViFZ51UqnaekyWFKsAxKqU78QqEp2stj6TJcUqgHmsdgzXs07EKtKcrLZ+kyXBKoB5rLLJ6qyfFrFKJwAimKzavaVPa8ZVAGJVyA+LWKVvFR4JHbM6WX3xcvtUeSBWk3wIEp4sYvWex4aAPtqCn/fFoABR8OzZZHXeV4tU5agVeCTTs2p8dF+pWl2Zne+SXssmsSrDor3q9Mhjgzcyp1cXhutJbbVbmSGtWG0ZsWdYtFedvvHY4M0gEqtGWypLbXcKYXotVsrvg6YGQHsVjiBzdJXJq2lvHeTp9WwSqyLuLCqrnLYKf0TuBTTo+rGdqabZuWoeqz1D9m/m5wFwkxV8krgUoNj+WW+L3UoNacYqI/ZvX1ivQlBEtgJsXkbpq/1qDcRqNh5IVQRFortq80pSW+z1lZKN1YIh+xfzjasvPDR41O9YAijdew6Su9daeaxiZ8O0svpEaxW8krgYcGM3aS+xR5ZYZcz+ybAN4JapKjwTWLDaOINsRC7MTm0dnFh1ZnaN9fOXf3hk8GvZbSOATKom1wqgwli0+3b/6u7u7ufbv+/jCh6DQ1ZuHzldBf7Ne52wIpSqnrdu9kppras37/sP3v5T60n5Oo3g6Fi9f7l7OJdLzw/f717uY+iYf9wcqt9pVcUeyr3Wq6RS1VeHVa/0UF0/S6ue9fI/9s6tu1Fkh8Kxudn4gsEGO8F4Lfj/P/J00tMrnQSbkrQlyn1KDzMPswYoHL7atSVV4bsRZsTqsaymhd6pav0WeKUzU8PiP4RNXIw4B6Mq4wTC6Ye7vDpvTrg/7LBozWaS67eKkD5P4+S5qZoGpoawC3lu3mnjqiXsBEJ4xmZ7Jj/b+lLMiNUMwtSI3EHvp9prnQzV0P0fwjAKI7G6HvzEanFm8v5197xYbehM/bOOvnn295s7+KpRHIRqiCfzAJzE6mXwEqs7Ce0Xq+VTYrVMe0HUXjGqcagBqP5xqDZJG3fp7+jiOAmNDvPH3kSsboFUxfVu7sSDPxRzYFVE87LupeHNitpFqqb/8vL/WHbpeJIxsHXO2NqI1Q0Sq4MvUAUp1sxw/ACofhwD7YMAPHbR/3U71eOUY1SFHN1scTYRq5fBO6xmqBTaYvc8WL1hoOoDrvLS5YyV0/HfZWoUqnS9DbmMdFgGLxe+YbUAZtCGdfEcWG3SHhgz7lWSJ7HbUJCuan77vd6uu/lRnceu82PUhRII+5DXARwc7rIaPMPqCst5oWClYnXN/BR7cMQ6f5NJUsa/4j0B8/7vuEw+49d/uabOVQy4DVWT7q/UWHRz5/97oMF2rEg/Uxqada1Dvjp36OhEi1UpVrebAR0HicO6s8BqUvfwSMHmXdJWaYR7PBBVm/a73RA1Tv/XJ4mjtIM1qhGhGsD6jB6Ay9ZVaLEqxOplMeBjIzACVgZYjXuNiHBGQNKl4Ic7AaCfl6NpoakDW5NR4zMFpOcZUP24dSgMeCoPwGX5u/AJq8vDoBKLrcdYPZ56pYDkRPLyGuEfTUySW3f3tT1c1z+otpAaszH7PVWhLMAsxIdYuVRX7QaPsFpshsE3rlKxSt5p5Rb1vb9cTSqVB5NZAE2bMkc9VcKW8vvUREZO2LnbLMR7Ah4sbgLE6nYxDN5xVRurba8ZMq7mba30XHw/8dfKf2oeiiXkq3mvLO+kVngoCrAJix2ll4M/WN0NmsHlqjJWq773lat5rKajI7bH62KYpDLycXJIgJxjEKwmIT4XYD8PyvykKpurqljNr33vKVcVoTqdVRpf+V9FVyeQj9ymhsk5XoPDqh/i7M3Z4iawPQG0qep+/qwMq28UdJ16/eAlh8pI85mo1mpO231WTL6aJFhzVJlEHUoC1EPcv7m1uAlqByt9qg7DZmmA1cwzqvYRw7RrUt1n6kgPE5/EWpi8LCB0UzT1/GuLEK75GwsPoBg8waoFVV1P9bLCqg1V+/5EHnOs/UjOJsCxZGw++/PqjBo255onrK6vAvlU42LhAWSeYNWGqsNw8QirVlQlakPNOtrP1S4wQeWA1YZDPseGBXQlRzBYVePVwgNY4cnFOcvqbbCKrTpWne9Q9WZBcgpvkcETTbLjKGhCiBFUdeQq/lc8Ba4qhoUHoJCx4hw8qlmvymjnlWHVQ6r2NeFL7UyeqFSRqeNYZa/SHQCn8SueQgWrWmQmPuLah3X2cj/YxcoTrJa9ZTgnYAwqvn4vde8/gbxXNka96Umu6syNUSgI0ArxDtZvM2GVfpTTerCMwgusNr1tOAogO7/3zgMdqwg8iYjmr3SeFUfgqlaIu+OdiokGD7C6MqUqOaWmgtW8NsZq6hlV76TR2gitzUuNx1T3cQJXdWJpQw8FbJm7HcrcJ2LVrRvi2ltH4hdV+yjX41QM9FrKedzxKPirGvFm4yHOj1VTY9U9l8fGqtN01ppT1UWuEql6qt6PBihj5laslR6nYqCDfZ9vujnHUA/gpbWazYTVtfVA6bGbG6vHyB6r03KVRNXrl4NDE44j+oNXN3iCDpEXPM1UyRG46qO1+jITVg+0cWb2VCXKVQWspjNQdVKuUqh6/YFExsYsPx6oRmO1BGtf20qONFAQHkaicfYCpv0MWKXJVTxWb/0skaCy2lGCKc1qtYoj/gNhA1oUHGehauhjxUdmRDc81d5eFJk1h1yFY5VYBfB+xmmq/5XG8tUpFTXfbMsYrPNQVB2TjTb1cWEDVnCIceOY7saXjJK6Q11Pfd2vX1eXLMuKl+Wvf67Oa5u3w/kppuczZ3yk8e2zziYpq1pBddEV9IMtSKgg+8qrDovVBmdg36QD1SzfCOEeYtwt58IqaZguvbOvuzFSZ2eJ0H6dEau50ycZVSOHKjWd6HOOEUm0h5kUKm5aHcc5BZOvlq03QpmVLyFtkt/oMANcCOCwLeGDLf3fBHNCMR9WXTzMKL4Dr1xSL/9g2yjndNXE7gKlABtQrGL1ZCspRPt4bdc4TpKkjStiEVsoBwCGeK9V13w8fEM+0v5VBwlV3yXrxuAxwVjNhT02eQxczNJtzallaUfXlX/iCsQqeJX+tXeBWlp1av+ePfKSMn+EtBUwxLRz3e8EXt9ESbIXcvxdmLJ+PxtWXQj2eH/Uht0Lde8bdU/ATO/cemKTHpiyStDeZ8xPrY0cONhcAVNhCHIYNQO84CustthRTo5jyxSsbzNh1clZndpviluJHklRGE2vSRO2DsRhFZ9Qqrk+Rz2ORffjCoO9igujZgCFnBW4DGB6elhuVF0SMlYnnrgkfsQQC3NC+rjzzKXip+LqwBk6et2jpCv7j76Je/NQ7vyaQlcALKRw22hBA5mx2gGW1GyuLmbCqpsw7JS4OuoCHHugWKVc7lvZV+IzVmtyycTUNNQi57IQFo7nwe5WPE/XWZJvtbj6NgtWG6o4wnJ11AVIGcoSKFcrSjIPQsiPBgtqjVTCKAIoMT9h2CQQE+LTAQkdpNjzTgjWagEbynKhOfNAsdqJdCVv5T7xhSYMYQmVqwkz28WaV7rbH8Wd0052qYhTkMPc6PoTBhvg2TJW4NOs9gqD3E8PJtN0AaBYdddI6dSCm1WPFEse6er4xogFqCl5zmHr1O+gO8buo8+pQny6asL1csEGgIRVj9VHKn0uD8C9S2pdgNFHEtZIrFLyHVECqCn4UUIpcRNKxzdWMuXqUVmpjtKprN3Z1rJmiwc/oaNcDtUAXmSsFpSbbYBYLXRwvphCIGcv7JUOVgvcyn3CymRthJXzxWrv/HFHPsrV8fNMm9R9RiJNF07pPddp9hqYKA+xgCR1kAIbrQ6E25L840muvum9JCJWAXUArgYrxwa48ZXlyfm3rZhyVfPQl/EiCMqT0s7Fdivjj4lvKAQ/xAeukDpIgZsDUjaGohkdk1xl+Cb2WM0hLGDnhsYUMEGsds6/7Y0ACLC0AAAgAElEQVQ7TD2ujhkAuaI6dkwzuW7aUgcqikNcS0o7VQQmV0kimeprbOFTUWaO1aTHcrUSf+4lXH+xpo/P9Xmss+XemC0ca+7u52qYlIJpIQQpXi1VI1CuUhpXycn7RYEexMocqzFGZYnkKlus9oTNlKibUf0lhPNWQbGOzE6J6uZ+7jukOD5GFLaykoZd6yrIdKA7q4zS3M0SfMG1yiSHNkMTsFxNuKt1yjqU2of6tU3h2IKRdzVd/5Oye85yNQ5cnLkQYE+9IWRjgMWScktGuezjvaeXWvUSaxxWObR4KFMSofzV2qKOfCbJ90V6iZSsPzctbZQ7DyjvqoaTOsT8hQDvUSBard7USX4BWydba6yCpJYI1BXXRCC5e1Tb8meGp8Q5nz9ay27aZ6ZQEBgroDoEwHYUtK7islavtDuy9HCBHcNOAat7rLacShXRd336G2CklTCpxieVgyhHnRYQc9fd2mUAxPxekKvPVAjAXZN/wwnJAmAs2SdlOP2SZwWsrvFYfXTOCSNpxdWUpN+XnJwbq97C+J8nQOIQUHcgN8iDXBWFGHEZ/Z5LYZpssaXdL1MwGl51zBIcVluU3PorToIl8U1NgdE7wGpJOodkAajvPHB3t3DpbBvkqiQsdwRA2atUgczE6h7qAiyMscqVSY+yVnRI3HiFCTStlIvph0JgZe0AUPomaAZ5kKuSkOaPFqy7bheWtsNF4UaFzvwzP1YfydWEfzEa+oj16BGGReJjA79PSTd9qpL3R42DXDUI80IAMVfpZi7XP34oVzcqbokHWI2Q1QVXnm4jdqWT803jZbG5NGf/bUZqIn2qkhtNj4DpNcQU3kzL8hFcZaTI2Gm5RyQkb1N7scUqX3qVQH6lvMfRUmATUqzEilWDnbLJHoD7U4VWK37MUF8l4yqDqnysHpBvbmWLVX7F0BXJL5YHQJVgdBy26Jc2ou9iA6oyjqAOx1rph7i+KmPfmlMPsMhMB7lA2ifrZ8Hqg378hHutG0/jotPbU1PHDShWGwuq9vSv4ag1uYXAYXXLv/eSXNy1KYwHuQXWUGxssdppKCB6zv0/l7SSyD6FUoBImCd3eOrUgqqck6dOeko4BI8N0o1WvsYbzQg4m88dK6S5iv89zhopq4dUIydhSs7/R15+9lzcA9/aN7/W5sRsTl6pE0r6EOpY3ctuvyRU1e/ZfgMfq4+aZN/mx+pKB6sp0FqIOQti8vb0dGXYClfIk4WeJmKV2GJFBX6osWKGtGx1LX2AzHHr0sVKcA/28B4t3MmVq9mzYLUGWgsVLU3C/JzpDLvCXYAExWfNqlXa0iHUWDFD6gGc5Y+wcwHroXiZA6sDckqyxaok+wKE9W/le0XdHzaH3DNXK9Bc1NlglfU9XAHzawik4oLVV30B60RNwOJczDVKpIFyMcVqovKxkq96YlirJwOs3lPE7NLVFpf70s1YUdYOIWllreM4+57eje3hvvTb7JbSy+tg9awwBeGwmvuB1Z6xIqbDgiHNE/Bs9BXTNtVVzMb9Rvn6Aavzla3+yACdxzTr+lIArr1RwepFwTDBYfVFZ2nJuhZRAtI7hxgwjLGv7cQVhOaFAKTFQ+i0ss2RI+qrftQFZKvX9R/ZulgfVihoH1TGR52T1rZYTf3AakM3GumwaHBCj9nH34IsWuWSCeqfRhkY+fRYVYuLyvgKv7HKT5o82myl5nz5RMIzvmWcLcmcjY6wOU21ZIJqRYfSVVsZB6qv8t3rQFq2xlhlJ18eepspB6v6GgwnyXlAPOEcGPVCAJJnElwARqz/P7D6ojO+PV7aA5Ng/MrJConVmP4kDKyeZsZqNwtWU+bnkKuuHEJIsXr+x8d5gF7VFqv8Gp8SjNVEX4MxYAhtX03EXq9dIQDpTyO4AIzYC7G6epJxapwP4D1W2WmTI8SW+8Rq/O9jlb/KnqEQgPS6ggtgtzgGl62qB3e37gKa8FvaYpVrrtYvSKxeycmziPEDM/JzLRCr6TxYTbjfA2GQoSPAHqvZswyUJ8snNpJZ4d8WEqv5/9i70yVHcRgAwIQbcgIJualK3v8htzPTW9NHEixZku1E+rVVWxWOaT6ELNscORBm9mpuZxSxEyOXmVLcMiFWe+zjAHjj6owAcMS2rC5DudKSo8bhnNWRjwXkvisdNavrl2c1I3qjyTQCgNhPlEloWE+yCuZKlxxvjZ1rVkd+ELfayimiZlVgfHsgu04Uq78KkCKqWqyEIpESK6svzyqqF6Aivn3SrOJ6ATJavxKwMWfEPy/iqzunY/W3b4kEqzn+cUiss3oNNlar177UInRWU/pnFbHWCrTbKA2O1d+Jr8gsqzP+cchF8H7T2L0Pq4h0taKmei7NKmbj+4yc1UyA1dopq7/PWGRNAIs8EnJ+6qTIQI5pt3zo6WpB/ZOlNKsII8YGfj1lNXLK6u9XkcgKVhn+aUhlDqOsvvJsAFS6uorCZ7WGVleTmp7V5uVZ/d070XvOaiOTFCurL8/qErZJyiR+AVbBCjYRPaupBKtrl6zajQnJ91fB/hm1uAqMrSWrh6Cudkd9bQGwCizynSIPWEXN68kdsnpvk5iT36z2Qsd5y7BdaaUI63JXxGXjEFitIWncumZgtU8lvm1dsppbfmXL91fBiiZaXFVWn0RsvvnKNHoRVqPO/HM0Mej8hrOaibCaOmT1XtWifiFWtbgqy2ocvair0/hlWI36hFBVxCqu78mqQBXASjvIWKYuDijLanAXbOiqmarRgZzVmONrwdDVxGyWoqeswj+6WzJW7xaDB79ZhRRNNiqlsvrcrb3JPADDLLwkZ7VgKcL0azpVo5fJVumWWsms80FUDFKs6pqrsJjaqToJ8Zp3E4Jv9bBYjerxL9Lc8NHJlFWDtlWRQSurkaRW7EjvF280d/VfLJ/n6AvzcbhgWP34JN0QfVD6yip8tijdMtYE5UtMdDZPQUrwBtJQVr/i9RjWxRzwO/twWP14jp5UWFvzJ9RXVnOqZI+OVe50NRJjVceslFWjjHV7d7uA6Rz0K1VIrH485rk1qhh1ZFhdu2M1oaPeU1Z1zEqS1X3I1z7brb6Vlhf73ZL59jlmNYq64+lHzpqcGth4ROspq2QqkXVqgVqGpdtWgam0UinIahn8DZgVRfkRu6JAtOAWwbH651nP0vSU36JNG/jK73ApMuhqTjJLrST8rPKWAexYzfjfdMrqu7JqFdsgWbULRDdmJrEwYEemEiWrrMuungRZbdRKZVUm4gn0fs3DZzX3lFX4SFpLxuqJtOQrNDyfCR5LWVVWjQO+qmIRPKuY1Zk7P1lNyVh9dr71+iVY1VYAQVZ373zvEJtjBc8qas17cN0zFTmzTIRVRlclWdUlVwVZLd5Z1cnbsdrhGoZEdl6FY1jLsBrVXPVVy2EkwWYuZVVZNYrliud++ctqdsSmXeDpRrkEq5tIiFW2fa2UVWU1aEOLjzjcGrHK238V83LKdb98YbXPsvQW+WfYNGCCx7kwrIIT6VaO1ajPg2dVO6yUVarv/Hm5qhZXuhi/X3PX/wBZk56IEQC3GYmweqRj9Th+eg3D+gC1sqqsBhVxUe4pPTVe9bt0+A/QH1uW4RWwVBsJVns6Vo3IGU7091WQVe2wUlbtSD2spleeiLxltf81q5Xy8R/4wSCbx8/FahTVTfsvZ03yU/q3zKKsKquvzuqs5CLVY1aHlnMJuzVwm08ZVk/yrP5ftL5F/VXbJABWtXFVWcWaul1cWcNHVoeWeUf7HI4efCFR8NzVxhGrd9PYNfJ1JciqNq7Ksbq0PX4xvw2vH4oZq5bF7jaGP1LYjHfTK3d4x2qXsu8M8ueBXHM7BZ5k1XnEalQnyPuqrL4iq3YHX66+dtQvqupvAxPZxRUfnO6rf8fYP8G7WF35o/KM1Yx/c9DPB7L1jdUnqZ4DVlErXcmyqo2rgbA6fzxNqaqq1Z8stiiWUEpvCfC2ut8X9Wipk3l1vb4dq83mcpFiFdgQDx8fgXbcHylZtX8Oa2VVWSVhFbIZ9LS6xb58FH/+9xTL0Hxxvb4dq1Ko/p2KmnGzmpLVAJywilkYTFlVVn+XMidXB7GI3aHqE6tyqH4ayT3s3JLVANywithAq7U8JLCe26uWAbBaXp3EzzJAsRA8+Jb8tuBWZszWl4swq2vmRCwnqwG4YfWIvK9yCbJOswqB1YkbVqffewQq0YOXXrBat5eLOKtn5mlWG7IagBtWM2VVWbVndXZ1FF+GwOKt8LG9YPWYyKp6GW5HHZihIiwyKKvKqltW8SMmO1es/qsCHBbSxzZY9XvLzGqXX6QjQwx1Q+cDdAjpyVhdvwWrg2rpP6ulK1ZX/6eqe/ljG9yuipfVJrm4YRVYXM1YVdrQjh7lb8GqLgoQAKuVK1Y/i6sHF7Vd16xKV1W/EgnD6gj8czoSCqGsKqvKKqYeHK+cHNoxq/3ahaqflcee9RkGjYgltbKqrCqrpDGLotnUzaFjp6wOycUhq7Cx+pyTiJGGT2VVWbWM6v1YPTybNet6pRVGVo+Xi1NWQQkltMMK9MboXoPVQVlVVr1htVw5O7RLVltXqv4/Tj5gLOZoBBibnRQKq5myqqx6w6q7WDhk1Zmq/9BJ+MzICJNVOKutsqpBqdtBWaVdEoCJ1fp0cc8qqArQgP6aUkoEwaymyqoGpW6lshoCq/Xanar/GOv5HuKcMFlVVpVVZTWgWLlitXWo6pfHcYPJcalHrM6RsqqsMsdeWfVqSQAWVp2q+uVxhPQiJJA/JkAePNKzqqwqqwRRKqt+sbqg/0m3qn7pAwKtC1AD/pgAXhtM31JWlVW3rO6VVUDMDe4LfV2hcavq16e/ZULDfEDOZFUUZVVZdctqpawSt6OR/wNkF39YzZie4oSUIies9sqqsvp2rE638z8bYi+L3WoREqtd4prVGvckA/ZdMdf6HPnKagS/sUdl9UVZnb4Fq4vd9+1fZyVu9utSnlWb1qp1mzZZljVpa7VGK7IgAZi+atwQu6lZWG3csCq8JkCjWhpHwT8dM3RWF3dKonHJdbOIWT1jMTw13wjKUqzP34f0N7gs93lsaD+bU+mv8TBY1d0BlFWymDwYZyomIbA6IC083+mZ73AdBTl2/Mx4JZGetASgrCqrzlmNX5zV/cMLnPNUTEhZrXGF1dODiUhZYs0qIF09m/4pmWbk61pZVVaDYBW91sok5FQV92KoxFlFrQSQDJTD1T+n4Junq8bFVUOpE9ON7t2wulZWXyeWrlgNoqo6e3YFO+9ZRZUAnuZ0qX1OZZ6uGjJoepXGQy5uWM19Z1WxlONtjjxsHEJTVUyb6G+FWa039snlz5+0Z3WgrgLkFBemrCqrHrGKnb1aBK8q/BJM7tWMkNWUXFXMw5+hf8JsWYCMIAlXVpVVr1jdviyrY6rysAr90SfDYB2DqgiqM6SDpp/tZjgkXeQ5q/A7exJlda1WAmJhh0/1qqwuYvJLKDjuy+OfQvRDjad08A2xOvyJmQxamSFtPFwVEqu5KKu5WgmISlm9G7PRSzj4zSpi1N5g0Tz4CgN3CrQJ3WeuYf24iZRVZTUcVq8vyupu/BJKv1lFTDg1aMCnYBXQZDWaZJ7pVXXEauY5q7okgLJqGyZJ+J7jVpGxikhWTxwPf271QI9VJcyAPkfKqrIqGls3jatF6CWAKJp6zWrLUQKg2uzZfFmt53T0Rr8D3RjVDavwEcbE8ohr6k8ZDfynLA2rfvetrkwu4eozq4g2gJSFnNZy5KutpVV1xCpi9qroAXWSlSSr2MZVryevmqzgt+QoLJCxeuZJVsnWIgWs5/+wNarhUdUVq4nfrNZqJSAOlgJhG1er0JPVwmtWE55klYxVwAyw5P6AU32+8KjqitXcb1aVSskiJ7bDahd4ssrE6o6G1YYpWaUjBzKklg/YVBU6WhUWq70gqzobQJTVCfK4S39V3fPcOKNyCVHXFvwRbaXJAU0s2Jy/EdKfDbNx1Ir2jlglmMDGyKq2rcqOHWEP7G8V4MBz4wRZRQxY9UzP/uNJo9BehfycprctYNI8sSsfeMrq0WtWtb8KFrYIYZcG9LbFasJ04wRZhT+hay5yHv+UzTZb9DNW3bMKb1wdBFnVnaxkh+SxSwNad8w6HbCK4KspFHKswsE6yrOK3buAboEDv1iFf2LYZZC9g2t8n7D9GC+dHdlpDQB++nKsImoAHRM5T0tyPaerLbojyBGrkTCrsOxY+6tkcavwh14xfcVXH8FfLPaXVXgfgPEGJ0dKVhHfvZZdWV6zCh5nPMuxulEoZb/FJxbHPizITd3PP1f0W85xtO5NTx4qYCzGKnwLq5blWRz/4SNXAcCm98gVq+D5xrkcq9oIAAzbaVb4zVdvMd+Tolp9m8yP2XTavKhRcmTBJKzCv60bLlbHvlNzzwoALllNZVkd5OoNbxhzW8oKyxMo5uXfKD5/KS7KKe5Ufk75mnFezpyD1RXBWwCxeFXHxerYUFjHUF5NBmHeiFgFl0Q2cpepC61AVbNlteQ4q9mK5EwQFQ6uG7fgqXSXFF/WCdujn5EbNp7D2Y6upGy5/sgrRnb2asry3tX4rEHKTEqCc78gOBH4O2PKxWolxiq8tJq7Y7WjTlWP1n95VOsegCPxltVEnYSGLasLpvOKgZWASUzBqvlLIvaVVfg+1uYuHMmrC7STAnKCtMoZq7lo9aFlee9qfIb1aHzsh6slSYWj5HofibFawzE6spHDYAljVdUxq7JF3dzBFb5RWHflF1xnNptYJqsIVg9crG6lWEU0g2YOWSUcszrXUdCsDnyvQ0tWdY4VOKyb8ku2U4O0G61sfwD8jpgy3CUCVhG9oD0XOeMfjw0ZqmuqZ98Zq7XogSG1Ip1jxWoX9TwrwgLFgSYTB1Q0Kh9Y3durABn6oGaVbP7qk6GqLvuIPgBWwVXx1uZgkDeWKgkO2/0BrOZZjcTO0kP4fIAoMFYrimKlM1bJVL3z/V9nxzT/uojgJj83HQerJ6o/d/BaiUKsnlVJcNiv0DdjOzfz0fa7/QiI6QCAk9sysLpwweqGjdWRPG4gUvXn+H89PFyU9ceC2PcC3KBGNk7e8P3DWZXgdTIAIqxZ3XkwnlbR1DemgHMrGYq2BBUYhEpuWK3PNKh+L6p2TTvyLb1u6MZyaFnt+D4zrFjV0ioi/mPvzBbc1nEg2toXr5ItefdMe/7/Hye5yU3cttwmgAJJ2cRTXmJtzcNiAQTFh6Du9O6tFInBHYBSAatKWM06CFS7a0hmJ6My2C7zE6tkc1VQpUvIbAZrVVUROjBXCxFW56pY3XuJ1XocWK1bCFSvGwCeW3NP4Vh7iVXqSxEUPxC+ZLBWObHx2FxdiLCqW9VQeInVbBRYxbiqSfqHjn1L+8Wux2EVt7WTaq42VggeqlY5sfXZXBVR6w2wGnmN1UfD/oSFan2gGwqPT7qi5/xgf+3UpYagtCt3MGu8VchLARTN1chfrMY+YPXiNVaHdU59hEK1Z/oJmX9YpXZIEJR2JTYu8s4RXzw2Vyt/sfoRsMoiF+LI1b9QbdhNBR7pVZdYPah9OX5mMxy6qqsIHbQFEGG1GB1WYydY/bSKVQBVr6AqKSdIahBWceZjbwvohD+TUF6liy4XbQEqJl247obaezPCavFiWB2qIz96AtWHYs8lVqklVmzkmbd1CeVVzJCXAkzeEauzKGCVnlKRHgfQwaD6+aAFlFOsnixdOZW9oxAGfBBj9bJ4Q6wqbAco5G+eg9XMHlaFZ1j/Lf6H7CYYtAFyDJ2tuADsK5uvGcJ5K8yYyrE6c+37orBajA2rhVWsHqRY7TBQ7UHdr1sIVpFdnjs7VzY2uIMHwA45Vneubw2UAHpPrJoPzkz4w40AgfkfqKK6CQxrMbdYpT0auxQgeABjyFldHGO1Qk0XhORb8TJYPVnDKl+s5n8ldQM8UaBFYBVZ2UlzAbg9rMy/Y6gDcJizohxW4jVWl1pYnXmMVbWTV48osXoF1R55+tWQXM0V3x9yeS6psGpczBghZ6WJI0rEtrFaaWHVSAbvAa4Fhy1aWM3ZiZKvkrJnJ80YSp2OVaj/SLOvmaUAxlZD2AvgNGeltNGqsI3Vi1OsMg7AmSGw2lvCKg+qV4KyX4OpOrDjXfV4hedB6wvAxN6a/XZCmEfkqwsgw+qE8RzTkWH17nc5xuNBCauJ3KC4hipcqg5uWXCMVVp3QGa2DO+6h1DJWem4ADMRVjmPtVXCamULqxzr8aiE1RvekKmYfIEqXqoOPnuuqPbh7zjXvUQf2CiI0lcXoLSO1d3YsXqErIRBWK1FWE1rvunIl5oMrGI7knYaX47l3+YBjTbW2tZdgI0IWqXq9EB7aRNbWGUtlHvweBzmDQ1YX5TqR50rUfXOBWBcCJvYafgTl2EcnTzX20V88dQFqKxj1XxDADFtbwurrCImUw8tFSErZ0P1I0u0qHpXusrAagr9o68TbaGcaErhEKLkzm3ECvc1F2F1z3mMjZJzEutgdSddp5PKylMRb8yBlfcACc589lxOZmGkykTvncwWbxiADQEqfQFkziXL25grYdVEBdOPioUcvWruAqQi3pgCq7tZl+sZAEM7AhgXA3uQlBqroyK2ww4rYewBWK3wt1UIr61qEi/xs06FeOsdYiUMwmrO+d+nm+HcJ6pUvXUQcz2xbxqt7qXXTjR4MFd96Q44E2J1znkM01qASmiCamGVtZUpqVWw+kn/30kjTJNJjWWONAb/3a9Eu29RYji0BPTCXMWfEbARYnWnOT1M8GIeglWeD3nQweqKavvenTDValP1dgmvuk0NL1fpLaaaIFbHZK7O4XdVCZnFq8ddYn1fwtuBYJXXKdpsMUnuyJdRZdINJer1p37IsZqB//AJcpVurh7dPNM7BqJyFV+6KpWCvKeKjOQq2TeJVbA6ULgFcRiHg7xATommXmfXVh3QmqxZCZ4zJ8hVamKpZmn4ELoEg+xQMoupFKtMy3ipMhEZlAJMIFjl5c2N3FXyTx+JHsJXPjVWqPp1RmFZufC98yvwfEj3AIJYRcQOwVVw0morXmEzLeMp9ObMrWdMyy1mkaeJ4hJ6CyvaTaSfdiIVe7l4aZcyZ67nsVb51RAYSlhIWu0kcJFYxibppaWClsdgNUOshcUZ6sEl6poymltLVP2KEN4BBvDxSNhqRcvY9xo/GuJBLBBYBfdbicRY3evND3P8y1lgsMo0Vw26MTM2xp6JP7CyT9UvWrPXmpKocYAuM6iTVSgDAMUcwVXoTqvpRYxVdj3uVAGBT3+TlWEr2KleukPIIN3N+OxMEWelBGBAazKrZBVO0jOWzaSt+2YJqySIVVAgSqzM+jSZBqU8agHMrf8jLZ/l7bcKEhjVGqbh4qWBLUwfpfZTQw733acbrDJprmBFZqjPxvBsQzcAF9oQ0P/JICaA67It40kMF/dP55wd6I3XXLwkPdoDuFseP8dlfv7I2s9PN1hdAciMiiNz6pLPjF3oBuDCybTSHnCBwDnfMv6eq6z1+kLjC5TsZC+VqzWi20Dz6WHU8uKDM35Ami8OzOVq6uph3jaWELmKq7EiCc0ZQvISuMoyF570HOTl1zaidAeFqzzk3NbD5h5i9U+N5opdKKuR4zlw3/HDMBPjYScAMPYXv+TqBOJbCg7r/oarPG8h0pjXKnZegqh8zoiqUMEy28J+AEmeTGPdnDPfsdBXCPkq71yACNXNeooRgpLeXA+5OmW+qm8LJbh3KrLlhnTXMCDY/flvpZSHNsBvebaSVB9oZHnMxbNZgVfm7EmCC+DJloCNWLPJnyoqoFS9zGN0HcCDui0Ruroz1Fe4q9tK/ePq8QeW+pNoq2yiIVeN3/ra5NfMzPF1IKGHLgBKrtLQNVGqcCgHnqaINOYc9n0OCnXZZvr8dkN4JnJEeyT0r/nfNj9vdHU+dR6g+aQxJqE2QAsUviHsugAguToDLIUF2aW/AvN24R6LCnynGCv5aT+Ek5RYh78G2+ogLM2/q9dBNKZK2uvx33gAVo3mJObVAM+v3sD4HEJv3a0rV6l1obGaCJ/Prn57upHNPQ/tWoFXMWOnfL+HYZ7+jByAwDWcq0l685P10TlWVao9jROFyTOVabYtN1gA8MDsCIDIVWTbPfm23KrcFz9iu5T/1AOuShzguWj1aCXuuCo8SWUordb695SIOIGubjaTJcECwMfcG7lKXrlvcX6CbgxxdSE782YjUTmWiNMDzd91JrAOR8fVNeTqhuuDQ4AgPrYYcmzsi9Vvr1l5xdXo9hCFuJSa2kM2QOcXV5MUpqZP4vyOHlcVSj7Nq6zWvZSqocuqRixA5BBvtaKDsIJCWjeqawzul4BM4ZaboLBpPaYrBAKTMwBAerOHgtzL5O+mcai2Q2DOCJCfvsLgYGThsZBkLbdFMSs3KCFd3c9kyad3sU7PvwTVKus09KAPFbFdAx+VBCP6NARG03ReMFaVAmVDChtZTcAKeRFdXj52ew8ZA4/2ez3lhfPRnRyeb31P9To1nWCbAEClAPFnHluH+96Caex3RMvZdVlsnbweVZ8VVR48uc8kTxskWymFw93heupZGUM1VKzqRQka4pIiq5jF9g3YrB1pTKpNWf6sBiteUK4+lVO1T3ebnGAJLGIPmDzNfhZLZOcT4f+Fc1b8T1oZHV76IHCdnN7LBriL/70bVX0ostIRgPrZuJCuGkHS6ml3fXze3o5rHLjqTPyZbA71rFwXJwH7JFB1xAErRuIWr8bcPQmFhgYeefz3hbBqtOW+9u2uz+PgajgTUDnmqCG9512f3ZjgmZ07eUOs/mf9MlQ1TFP7dvhAAhuYmkI8lFaNpcbqErE2BfAbo1TPZLAFrka7svQpO2b3XGgPqOpfng5XtdQEqoYaK569KkktPbvcVDttVf3yIeSbUXFYfRWuHnzQdG7dVT2uBqqOqMaKc66VSFE+dR10uTr5a2B8BsIAAAnXSURBVO7GnmzrmnzY4WqX550nbOp9wyqy014TqDraiCN3XF3qXk2TqyXGIcbK5w99rh4Pv0dlptejn4Im74Q2cmyeFfJWXaCqlQAiYWbzytGHO65GUx8Lun5NNIodnvPmS13OWYfgpGOi1q+MVYV6gFBZZSkWF0dclaLIYAvCdK6z2o41JyexglYqkm/vdc5BowyIdJpJ/tJY/ejBS4JjoKqtWLrhqljgmZTKqtQDLLXfovTla5hy7WCpY49Xi7StSu1rYxXs6ZwC7UYpV827A8iXzXMj63ipRy/rBV3GOyTQIuf+cNY/wx4tF4k5n/TFsSo//vHKXQk9q8YqVy/L2No1zfoRzrAG62Sqn/uTl5xhDdbubE8v9gGrtwUBIKdlHZJV45Wrl4nBvgBMSZJh5cEUqSM3sZPCA3oOD2h7prU9e5PareQNsPqxghgBwQAYtVy9P73pLoo5XJ59G7Da3HnhpPCAte9sBcJd/mz/ONL+66h/utkbYBUxeXRZwJztQK9fd98K1hiWNTc2cheVlespFR5w7w4hWBOD5iHADtrZ2LHa6YzQXjhHnkIFgIMo0evR8rGQnOHYMzd/wr38qsvn7kbsskPAvZKuxb6n2XCEsY1+FKhvWM21hqjEYc2Dq/oScvUxWGdQQUepkxVeuSqcTFDC7RGZSOUYD0eUw7kaPVb1jjKpuS+5OwfAOQqN05+Wdx7rogSvkuekh5zxc1c741MQC1dGwIMEHh+sa8KKHFMOwMiq+IZVTV244rzlLlRVOQwVGES77R8cTfcbhWsQD9EqWMm5aElqeuimo9Xjxow8sOa04YjgalKPHqud7ihdtUmA6pii0Bvwk6qq1DbnU7sRxjNqbVc1I1/DxY6r7/yQngy9Izl3BMiPcRbQnnUGVM+314dO8yuGAMdIDyvdMYzk2c6Y8rstqzt3XM49ouo/o5FQBdWlnDM5zA+oB4pVz+pWrWjDzEyyrg8h++8+FuPEKrVr1r+WxPY5WqvNXvA+90uLXsDSoO3MyoysXcuWOHVzlJCV1QHaJ6zayw2d2yeaNT+E06r8iHKcWI3YZ2nHRbmp5sO2RTkr5G90v9HvExBVVbk3dSlWz7iXp+KUS/ZzPK+y7HCiWrqrUWM1Odq1MVdNOzxNJnka1v7+RDwfJ1fnsfDBi6LYl79i9uPfC+hbLbYP0H37FNV1bMqvUQwF70b75pQPsXXdHtCjsW4oZD2yrkFOx3U/nvPfuaPOYOFGHGZN2ub5+jdO8zw9ZEGlehb7kdoAk9j/dzu9p6LT+8myNE1PPwZifvzxj0ZtMBL6258tYDVJA3VCWI5d4GoIcBj3t2eWJlHM3OQQvkcI+zZANFauTsPH85arutuTKC5DyIyHcBHbkWL1Es3Cx/M1WsWEFWU3QBo+RQg3UY2Vq5dqEb7emOUq8yDoxq+S0hAhBmIRjZarl2UAq59hRD2m7XkKVA0RbADdHVez/7d3J7qJK0EUQMNmzL4PYZXg/z/yTTTL00QB2o7bYPucDwBkS1dFdXW3tasXtI7XAwgeBHA0Ps+0u1baIO0rWl9MEq8HELpilXgLPFO7da28v6P18zTtK2CfrROvBxA4ZtAxA8Bz9a81M53vvdVninhM6SHmTgMozvZaO9NUzfo0vXh7Ad6OWgBUxKh+uXptvXuvTxJSUS5zfnbMkVgo0qxVw1y9DhSsz3GMN/50NgVAZezrGKvXqR2uzzCMWE+erFdRHWktc7Vl9OoJQvZBdXJ+9sZGACpkV8tcddLVi/YA8h21GjZeZb2KV9Ee1TJXt97sS/YAcp6Ccoo4ugXFG9dy2eqqDVC2oEtRcl5L0LFeRbX0axmrcy+2ZJt4K1YhcwAb61W8kkktc1V3tVxBB/flXLE6xquDIZJajgPYFVCuJN6q0koLgAqaP/WQv3SfRlg323mtZQo7vD/fHquTFgByNdOS/a8/6/3C79hueatlCrtwJdcgwLCjBUAlPWnMqvX3suf2XHO1ysL27OdKv4UWANX0nPHVf6b2i87Vvrf6aj2AfLH6eMRgrQWAXP16L9RcrFZWNyxWIxWrNgIgV2+Nls7FalUd48Xq42L14PkjV28O7M/FakUl0WJ1EeucASglVwdlpmr61U+Yi9VqukSL1Y3ZKqqtxDmrSfRf4NDV8gyjxepBYxW5GjhYNY7/C7zN8vRixerjmVWHrPLy3ssZAbhzvlRRJxRMvczynGPF6inOvi0o1aSEcwLndyf198X8AptXS9SNFKsrE6vUwngaO1UfHYIyG5XxLRToFClWHw0YuL2Kiog8ENAKWKHfWrGqliROrD7qLXQsV1EZ24ipugvaqv/9k1e0Vsu0vsTYvPpwvcpyFRWyj9VgbYX+NW9/9wxYl1mV6RIlVk92V1EnsziNgNG4tJ+gB1D5WO0ZAqBmYkxapdl+Qn+gB1ANqxixOtxIVepmXHTBOsheQOYP1okXWKLQ3QCZjrE+Ga2ijgVrkR3WVr6gG89bitVGxupZqlJLs13Rd6vk0J4MdFbrEqvhh009mAKQqlRXv5jDAgez78X7ZKcF8MoOobEafvNqIlWpr8n3N10Nijiir58GF61TtWrJQveuhu8HOEhVBGvkUP1lPNkOHrZaR0rVF47VwFGAH1IVwVpGqP6tW/vv6Xbw079f9GGb7mde1yvHatia1f3GqlSlHva5Jp1acyEnVv+NxKDPW0tVGmG2zTrpNJq0PTax+skq4OOWUpXmlKwZZkhH7wpVsZpvb1RXqtKwZA1ps+5karMsLgWWq3c/7ChVqWU3YDK/M8zaGqRuPG2cXoZYfbQjYOEcABqq/55+Wom/TgfztK9KFavfu9NvUdSRAlBR7f5vBvAbbZUlVu/eQL10ajXAW/h5q7+uSjnf+phh4oYVgA+bTLl66898794ugPXKYwaaI8kWq5f1F5tYV0cjAAC/dS9ZJZ8apavlxWIVwB/nS3ad5eLP//ofh/tXt3Z6HjHQLMNLTslPD2/D1lYFmmd9iefk8QLNc4gWqhoAQCOtYqVqYgIA0AUosFQ9eLJAQy2ilKrWqoDm2ihVAYrUVaoCvHC5qlQFGu9cZKo6AgAg83krt23MqgK8va06Bf3/d64KQIFtgKX//wC/nQpY/3cHAMD/lpqqAIU6fitU3QEI8MlwKVQBXqEPIFQBbugKVYBC9TpCFaBIw0wLV8nZEwN44BxasHaW5lQBQgrWoA7remFHFUCg1fJBxbo5KVQBMlWsh9sXXK1lKkAOP7pfnBa4Xi4c/A+QW+/QTZKPurWTJMfuwa5/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC+8B9RQLXkuYBUGgAAAABJRU5ErkJggg==";

const ETIQUETAS_TORTA = ["Dano Collaria", "Dano Moluscos", "Dano Hongos", "Pasto Sano"];

function promedio(valores) {
  const usables = valores.filter((v) => v !== null && v !== undefined);
  if (usables.length === 0) return null;
  return usables.reduce((a, b) => a + b, 0) / usables.length;
}

function desviacion(valores) {
  const usables = valores.filter((v) => v !== null && v !== undefined);
  if (usables.length < 2) return 0;
  const m = promedio(usables);
  const varianza = usables.reduce((a, b) => a + (b - m) ** 2, 0) / (usables.length - 1);
  return Math.sqrt(varianza);
}

function fmt(v, pct) {
  return v === null || v === undefined ? "-" : pct ? `${(v * 100).toFixed(1)}%` : v.toFixed(1);
}

function fmtFechaCorta(fechaISO) {
  const [y, m, d] = fechaISO.split("-");
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${d}-${meses[Number(m) - 1]}`;
}

// Excel a veces guarda la fecha como numero de serie (dias desde 1899-12-30) en vez de texto.
function normalizarFecha(valor) {
  if (typeof valor === "number") {
    const ms = Math.round((valor - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  return String(valor).slice(0, 10);
}

function formatoFechaVisible(fechaISO) {
  const [y, m, d] = fechaISO.split("-");
  return `${d}/${m}/${y}`;
}

const Informes = {
  _filasCache: null,
  _umbralesCache: null,

  // Lee la tabla completa de Excel y la deja en caché local (IndexedDB) para poder generar
  // informes sin internet. Si no hay red o Graph falla, usa la última copia guardada.
  async filas() {
    if (!this._filasCache) {
      let crudas = null;
      if (navigator.onLine) {
        try {
          crudas = await Graph.leerTabla(CONFIG.TABLE_NAME);
          await DB.guardarCache("filasBase", crudas);
        } catch (e) {
          console.warn("No se pudo leer la base de datos de Excel, usando caché local:", e.message);
        }
      }
      if (!crudas) crudas = (await DB.leerCache("filasBase")) || [];

      // Se agregan los puntos guardados localmente que aun no se han sincronizado, para poder
      // generar el informe de una visita recien capturada antes de subirla a Excel.
      const pendientes = (await DB.listarItems()).filter((it) => it.tipo === "punto" && it.estado === "pendiente");
      const filasPendientes = pendientes.map((it) => it.datos.fila);

      this._filasCache = [...crudas, ...filasPendientes].map((f) => {
        const copia = [...f];
        copia[COL.fecha] = normalizarFecha(copia[COL.fecha]);
        return copia;
      });
    }
    return this._filasCache;
  },

  formatoFechaVisible,

  async umbrales() {
    if (!this._umbralesCache) {
      let valores = null;
      if (navigator.onLine) {
        try {
          const filas = await Graph.leerRango(CONFIG.HOJA_CONFIG, "A8:B19");
          valores = {};
          filas.forEach(([nombre, valor]) => { if (nombre) valores[nombre] = valor; });
          await DB.guardarCache("umbralesBase", valores);
        } catch (e) {
          console.warn("No se pudieron leer los umbrales de Excel, usando caché local:", e.message);
        }
      }
      this._umbralesCache = valores || (await DB.leerCache("umbralesBase")) || {};
    }
    return this._umbralesCache;
  },

  invalidarCache() {
    this._filasCache = null;
    this._umbralesCache = null;
  },

  async fechasDisponibles(cliente, finca) {
    const filas = await this.filas();
    const fechas = new Set(
      filas.filter((f) => f[COL.cliente] === cliente && f[COL.finca] === finca).map((f) => f[COL.fecha])
    );
    return [...fechas].sort().reverse();
  },

  async calcularDatos(cliente, finca, fecha) {
    const filas = await this.filas();
    const umbrales = await this.umbrales();

    const visita = filas.filter((f) => f[COL.cliente] === cliente && f[COL.finca] === finca && f[COL.fecha] === fecha);
    const lotesReales = [...new Set(visita.map((f) => f[COL.lote]))].sort((a, b) => a - b);

    const tablaLotes = lotesReales.map((lote) => {
      const sub = visita.filter((f) => f[COL.lote] === lote);
      const danoColl = promedio(sub.map((s) => s[COL.danoCollTotal]));
      const danoMol = promedio(sub.map((s) => s[COL.danoMoluscos]));
      const danoHongos = promedio(sub.map((s) => s[COL.danoHongos]));
      const potreros = [...new Set(sub.map((s) => s[COL.potrero]).filter(Boolean))];
      const observaciones = sub.map((s) => s[COL.observaciones]).filter((o) => o && String(o).trim()).join(" · ");
      const primero = sub[0] || [];
      return {
        lote, potrero: potreros.join(", "), observaciones,
        incid_coll: promedio(sub.map((s) => s[COL.incidColl])),
        sev_coll: promedio(sub.map((s) => s[COL.sevColl])),
        incid_hongos: promedio(sub.map((s) => s[COL.incidHongos])),
        sev_hongos: promedio(sub.map((s) => s[COL.sevHongos])),
        adultos: promedio(sub.map((s) => s[COL.adultos])),
        ninfas: promedio(sub.map((s) => s[COL.ninfas])),
        loritos: promedio(sub.map((s) => s[COL.loritos])),
        lepidopteros: promedio(sub.map((s) => s[COL.lepidopteros])),
        hojas_moluscos: promedio(sub.map((s) => s[COL.hojasMoluscos])),
        adultos_sd: desviacion(sub.map((s) => s[COL.adultos])),
        ninfas_sd: desviacion(sub.map((s) => s[COL.ninfas])),
        loritos_sd: desviacion(sub.map((s) => s[COL.loritos])),
        lepidopteros_sd: desviacion(sub.map((s) => s[COL.lepidopteros])),
        dano_coll: danoColl, dano_mol: danoMol, dano_hongos: danoHongos,
        pasto_sano: 1 - (danoColl || 0) - (danoMol || 0) - (danoHongos || 0),
        manejo: {
          tipoFumigacion: primero[COL.tipoFumigacion] || "",
          litrosMezclaHa: primero[COL.litrosMezclaHa] || "",
          acondicionadorAguas: primero[COL.acondicionadorAguas] || "",
          dosisAcondicionador: primero[COL.dosisAcondicionador] || "",
          insecticida: primero[COL.insecticida] || "",
          dosisInsecticida: primero[COL.dosisInsecticida] || "",
          fungicida: primero[COL.fungicida] || "",
          dosisFungicida: primero[COL.dosisFungicida] || "",
          fertilizanteFoliar: primero[COL.fertilizanteFoliar] || "",
          dosisFertilizante: primero[COL.dosisFertilizante] || "",
          abono: primero[COL.abono] || "",
          dosisAbonoHa: primero[COL.dosisAbonoHa] || "",
          ordenMezclaCorrecto: primero[COL.ordenMezclaCorrecto] || "",
          phFinalMezcla: primero[COL.phFinalMezcla] || "",
        },
      };
    });

    // Solo variables en "numero promedio de individuos" (se excluye Hojas por Moluscos, que es otra unidad).
    // Umbrales leidos en vivo de Configuracion (si falta alguno, se usa 5 como respaldo). Barras de error = +-1 desv. estandar / 2.
    const barrasEstatica = {
      categorias: ["Individuos Adultos de Collaria", "Ninfas de Collaria", "Individuos de Lorito", "Numero de Lepidopteros"],
      umbrales: [
        umbrales["Umbral de Adultos de Collaria"] ?? 5,
        umbrales["Umbral de Ninfas de Collaria"] ?? 5,
        umbrales["Umbral de Individuos de Lorito"] ?? 5,
        umbrales["Umbral de Numero de Lepidopteros"] ?? 5,
      ],
      lotes: Object.fromEntries(tablaLotes.map((t) => [
        String(t.lote), [t.adultos, t.ninfas, t.loritos, t.lepidopteros],
      ])),
      errores: Object.fromEntries(tablaLotes.map((t) => [
        String(t.lote), [t.adultos_sd, t.ninfas_sd, t.loritos_sd, t.lepidopteros_sd],
      ])),
    };

    const fechasFinca = [...new Set(
      filas.filter((f) => f[COL.cliente] === cliente && f[COL.finca] === finca).map((f) => f[COL.fecha])
    )].sort();
    const ultimas6 = fechasFinca.slice(-6);
    const lotesFinca = [...new Set(
      filas.filter((f) => f[COL.cliente] === cliente && f[COL.finca] === finca).map((f) => f[COL.lote])
    )].sort((a, b) => a - b);

    const historial = {};
    for (const [nombreVar, colOFn] of Object.entries(VARIABLES_HISTORIAL)) {
      const extraer = typeof colOFn === "function" ? colOFn : (fila) => fila[colOFn];
      const porLote = {}, erroresPorLote = {};
      for (const lote of lotesFinca) {
        const promedios = [], errores = [];
        for (const f of ultimas6) {
          const sub = filas.filter(
            (r) => r[COL.cliente] === cliente && r[COL.finca] === finca && r[COL.lote] === lote && r[COL.fecha] === f
          );
          promedios.push(promedio(sub.map(extraer)));
          errores.push(desviacion(sub.map(extraer)));
        }
        porLote[String(lote)] = promedios;
        erroresPorLote[String(lote)] = errores;
      }
      historial[nombreVar] = { fechas: ultimas6.map(fmtFechaCorta), lotes: porLote, errores: erroresPorLote };
    }

    const umbralesHistorial = {};
    for (const nombreVar of Object.keys(VARIABLES_HISTORIAL)) {
      const nombreUmbral = UMBRAL_POR_VARIABLE_HISTORIAL[nombreVar];
      umbralesHistorial[nombreVar] = nombreUmbral ? (umbrales[nombreUmbral] ?? null) : null;
    }

    const tortas = tablaLotes.map((t) => ({
      lote: t.lote, valores: [t.dano_coll || 0, t.dano_mol || 0, t.dano_hongos || 0, Math.max(t.pasto_sano || 0, 0)],
    }));

    // Alertas: cualquier indicador que supere (o, para pasto sano, no alcance) su umbral configurado.
    const alertas = [];
    for (const t of tablaLotes) {
      for (const def of DEFINICIONES_UMBRAL) {
        const valor = t[def.campo];
        const umbral = umbrales[def.umbral];
        if (valor == null || umbral == null) continue;
        const excede = def.esMinimo ? valor < umbral : valor > umbral;
        if (excede) {
          alertas.push(
            `Lote ${t.lote}: ${def.nombre} (${fmt(valor, def.pct)}) ${def.esMinimo ? "por debajo del minimo" : "supera el umbral"} (${fmt(umbral, def.pct)}).`
          );
        }
      }
    }

    const visitaNumero = fechasFinca.indexOf(fecha) + 1;

    return {
      cliente, finca, fecha, visita_numero: visitaNumero, lotes_reales: lotesReales, lotes_finca: lotesFinca,
      tabla_lotes: tablaLotes, barras_estatica: barrasEstatica, historial, umbrales_historial: umbralesHistorial, tortas, alertas, umbrales,
    };
  },

  generarHtml(D, recomendacionTexto) {
    const claseAlerta = (valor, umbral, esMinimo) => {
      if (valor == null || umbral == null) return "";
      const excede = esMinimo ? valor < umbral : valor > umbral;
      return excede ? ' class="alerta"' : "";
    };
    const u = D.umbrales;
    const um = (nombreDef) => u[DEFINICIONES_UMBRAL.find((d) => d.campo === nombreDef).umbral];

    const filasTabla = D.tabla_lotes.map((t) => `<tr>
      <td>Lote ${t.lote}</td>
      <td${claseAlerta(t.incid_coll, um("incid_coll"))}>${fmt(t.incid_coll, true)}</td>
      <td${claseAlerta(t.sev_coll, um("sev_coll"))}>${fmt(t.sev_coll, true)}</td>
      <td${claseAlerta(t.incid_hongos, um("incid_hongos"))}>${fmt(t.incid_hongos, true)}</td>
      <td${claseAlerta(t.sev_hongos, um("sev_hongos"))}>${fmt(t.sev_hongos, true)}</td>
      <td${claseAlerta(t.adultos, um("adultos"))}>${fmt(t.adultos)}</td>
      <td${claseAlerta(t.ninfas, um("ninfas"))}>${fmt(t.ninfas)}</td>
      <td${claseAlerta(t.loritos, um("loritos"))}>${fmt(t.loritos)}</td>
      <td${claseAlerta(t.lepidopteros, um("lepidopteros"))}>${fmt(t.lepidopteros)}</td>
      <td${claseAlerta(t.dano_mol, um("dano_mol"))}>${fmt(t.dano_mol, true)}</td>
      <td${claseAlerta(t.dano_coll, um("dano_coll"))}>${fmt(t.dano_coll, true)}</td>
      <td${claseAlerta(t.dano_hongos, um("dano_hongos"))}>${fmt(t.dano_hongos, true)}</td>
      <td${claseAlerta(t.pasto_sano, um("pasto_sano"), true)}>${fmt(t.pasto_sano, true)}</td>
    </tr>`).join("");

    function combinar(producto, dosis) {
      if (producto && dosis) return `${producto} — ${dosis}`;
      return producto || dosis || "";
    }

    function manejoHtml(m) {
      const filasM = [
        ["Tipo de fumigacion", m.tipoFumigacion], ["Litros de mezcla/ha", m.litrosMezclaHa],
        ["Acondicionador de aguas", combinar(m.acondicionadorAguas, m.dosisAcondicionador)],
        ["Insecticida", combinar(m.insecticida, m.dosisInsecticida)],
        ["Fungicida", combinar(m.fungicida, m.dosisFungicida)],
        ["Fertilizante foliar", combinar(m.fertilizanteFoliar, m.dosisFertilizante)],
        ["Abono", combinar(m.abono, m.dosisAbonoHa)],
        ["Orden de mezcla correcto", m.ordenMezclaCorrecto],
        ["pH final de la mezcla", m.phFinalMezcla],
      ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");
      if (filasM.length === 0) return "";
      return `<ul class="manejo-lista">${filasM.map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`).join("")}</ul>`;
    }

    const porLoteHtml = D.tabla_lotes.map((t, i) => {
      const leyenda = D.tortas[i].valores.map((v, vi) =>
        `<li><span class="leg-swatch" style="background:${COLORES_TORTA[vi]}"></span>${ETIQUETAS_TORTA[vi]}: ${fmt(v, true)}</li>`
      ).join("");
      const manejo = manejoHtml(t.manejo);
      return `<div class="lote-bloque">
        <h3>Lote ${t.lote}${t.potrero ? ` — Potrero ${t.potrero}` : ""}</h3>
        <div class="lote-fila">
          <div class="chart-box chart-barras"><canvas id="barrasLote${t.lote}" width="480" height="220"></canvas></div>
          <div class="torta-box">
            <canvas id="torta${i}" width="200" height="200"></canvas>
            <ul class="torta-legend">${leyenda}</ul>
          </div>
        </div>
        ${manejo ? `<div class="manejo-box"><strong>Manejo agronomico aplicado</strong>${manejo}</div>` : ""}
      </div>`;
    }).join("");

    const opcionesVariable = Object.keys(D.historial).map((v) => `<option value="${v}">${v}</option>`).join("");

    const historialCanvasHtml = `<div class="historial-fila">${D.lotes_finca.map((lote) =>
      `<div class="chart-box historial-item"><h3>Lote ${lote}</h3><canvas id="historialLote${lote}" width="380" height="220"></canvas></div>`
    ).join("")}</div>`;

    const observacionesTexto = D.tabla_lotes.map((t) => {
      const etiqueta = `Lote ${t.lote}` + (t.potrero ? ` (Potrero ${t.potrero})` : "");
      return `${etiqueta}: ${t.observaciones || "Sin observaciones."}`;
    }).join("\n\n");

    const resultadosHtml = D.alertas.length
      ? D.alertas.map((a) => `• ${a}`).join("<br>")
      : "Ningun indicador supero su umbral en esta visita.";

    const recomendacionHtml = recomendacionTexto && recomendacionTexto.trim()
      ? recomendacionTexto.trim().replace(/\n/g, "<br>")
      : "Sin recomendaciones registradas para esta visita.";

    const asesor = (typeof CONFIG !== "undefined" && CONFIG.ASESOR) || {};

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Informe de Visita - ${D.cliente}</title>
<style>
:root{--verde:#2e6b3e;--verde-claro:#eaf3ec;--gris:#555;--borde:#dcdcdc;--rojo:#c0392b;}
body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:820px;margin:0 auto;padding:24px 20px 60px;color:#222;}
header{border-bottom:3px solid var(--verde);padding-bottom:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;}
.titulo-box{display:flex;align-items:center;gap:14px;}
.logo{height:56px;width:auto;}
header h1{margin:0 0 4px;font-size:22px;color:var(--verde);}
.asesor-box{text-align:right;font-size:11px;color:var(--gris);line-height:1.5;white-space:nowrap;}
.datos-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;background:var(--verde-claro);padding:14px 16px;border-radius:8px;margin-bottom:24px;font-size:14px;}
.datos-grid div span{color:var(--gris);display:block;font-size:12px;}
h2{font-size:16px;color:var(--verde);border-bottom:1px solid var(--borde);padding-bottom:6px;margin-top:32px;}
h3{font-size:14px;color:#333;margin:18px 0 8px;}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px;}
th,td{text-align:center;padding:6px 4px;border-bottom:1px solid var(--borde);}
th{background:#f5f5f5;color:var(--gris);font-weight:600;}
td:first-child,th:first-child{text-align:left;}
td.alerta{background:#fbe4e1;color:var(--rojo);font-weight:600;}
.chart-box{margin-top:12px;border:1px solid var(--borde);border-radius:8px;padding:14px;}
.chart-box canvas{max-width:100%;height:auto;}
.lote-bloque{margin-top:20px;padding-top:4px;border-top:1px dashed var(--borde);}
.lote-bloque:first-child{border-top:none;}
.lote-fila{display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;margin-top:10px;}
.chart-barras{flex:2;min-width:320px;}
.torta-box{text-align:center;}
.historial-fila{display:flex;gap:16px;flex-wrap:wrap;}
.historial-item{flex:1;min-width:300px;margin-top:12px;}
.torta-legend{list-style:none;padding:0;margin:6px 0 0;font-size:11px;color:var(--gris);text-align:left;display:inline-block;}
.torta-legend li{display:flex;align-items:center;gap:5px;margin:2px 0;}
.manejo-box{flex:1;min-width:220px;background:#fafafa;border:1px solid var(--borde);border-radius:8px;padding:10px 12px;font-size:12px;color:var(--gris);}
.manejo-lista{list-style:none;padding:0;margin:6px 0 0;}
.manejo-lista li{margin:3px 0;}
.leg-swatch{width:10px;height:10px;border-radius:2px;display:inline-block;}
select{padding:6px 10px;border-radius:6px;border:1px solid var(--borde);font-size:13px;}
textarea{width:100%;min-height:70px;border:1px solid var(--borde);border-radius:6px;padding:8px;font-family:inherit;font-size:13px;box-sizing:border-box;}
.caja-fija{white-space:pre-wrap;border:1px solid var(--borde);border-radius:6px;padding:10px;font-size:13px;background:#fafafa;min-height:40px;}
.firma{margin-top:36px;font-size:12px;color:var(--gris);border-top:1px solid var(--borde);padding-top:12px;}
.hint{font-size:12px;color:var(--gris);}
footer{margin-top:40px;font-size:11px;color:#999;text-align:center;}
</style></head>
<body>

<header>
  <div class="titulo-box">
    <img src="${LOGO_DATA_URI}" alt="Logo" class="logo">
    <div><h1>Informe de Visita Tecnica</h1>
    <p style="color:var(--gris)">${D.cliente} - Finca ${D.finca} · Visita No. ${D.visita_numero}</p></div>
  </div>
  <div class="asesor-box">
    ${asesor.nombre ? `<strong>${asesor.nombre}</strong><br>` : ""}
    ${asesor.profesion ? `${asesor.profesion}<br>` : ""}
    ${asesor.cargo ? `${asesor.cargo}<br>` : ""}
    ${asesor.telefono ? `Tel: ${asesor.telefono}` : ""}
  </div>
</header>

<div class="datos-grid">
  <div><span>Fecha de visita</span>${D.fecha}</div>
  <div><span>Lotes revisados</span>${D.lotes_reales.map((l) => "Lote " + l).join(", ")}</div>
</div>

<h2>Tabla de resultados por lote</h2>
<table><thead><tr>
<th>Lote</th><th>Incid. Collaria</th><th>Sev. Collaria</th><th>Incid. hongos</th><th>Sev. hongos</th>
<th>Adultos</th><th>Ninfas</th><th>Loritos</th><th>Lepidopteros</th>
<th>Dano moluscos</th><th>Dano collaria</th><th>Dano hongos</th><th>Pasto sano</th>
</tr></thead><tbody>${filasTabla}</tbody></table>

<h2>Plagas y estado por lote (vs. umbral)</h2>
${porLoteHtml}

<h2>Historial de la variable (evolucion por visita)</h2>
<div style="margin:10px 0;"><label style="font-size:13px;color:var(--gris);">Variable: </label>
<select id="varSelect">${opcionesVariable}</select></div>
${historialCanvasHtml}

<h2>Observaciones</h2>
<textarea>${observacionesTexto}</textarea>

<h2>Resultados</h2>
<div class="caja-fija">${resultadosHtml}</div>

<h2>Recomendaciones</h2>
<div class="caja-fija">${recomendacionHtml}</div>

<div class="firma">
  ${asesor.nombre || ""}${asesor.profesion ? " — " + asesor.profesion : ""}${asesor.cargo ? " — " + asesor.cargo : ""}
</div>

<footer>Informe generado automaticamente a partir del registro de visitas tecnicas.</footer>

<script>
const COLORES = ${JSON.stringify(COLORES_LOTE)};
const barrasEstatica = ${JSON.stringify(D.barras_estatica)};
const historial = ${JSON.stringify(D.historial)};
const umbralesHistorial = ${JSON.stringify(D.umbrales_historial)};
const tortas = ${JSON.stringify(D.tortas)};
const lotesFinca = ${JSON.stringify(D.lotes_finca.map(String))};

function drawGroupedBars(canvasId, categorias, seriesByKey, keys, umbrales, errores, colorOffset) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height, padL = 50, padR = 20, padT = 20, padB = 60;
  ctx.clearRect(0,0,w,h);
  let maxVal = 1;
  keys.forEach(k => (seriesByKey[k]||[]).forEach(v => { if (v!=null && v>maxVal) maxVal=v; }));
  if (umbrales) umbrales.forEach(u => { if (u!=null && u>maxVal) maxVal=u; });
  if (errores) keys.forEach(k => (seriesByKey[k]||[]).forEach((v,ci) => {
    const e = (errores[k]||[])[ci];
    if (v!=null && e!=null && v+e/2>maxVal) maxVal = v+e/2;
  }));
  maxVal *= 1.15;
  const groupW = (w-padL-padR)/categorias.length;
  const barW = Math.min(28, groupW/(keys.length+1));

  const numTicks = 5;
  ctx.font="10px sans-serif"; ctx.textAlign="right";
  for (let i=0;i<=numTicks;i++) {
    const val = (maxVal/numTicks)*i;
    const y = h-padB-(val/maxVal)*(h-padT-padB);
    ctx.strokeStyle="#eee"; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w-padR, y); ctx.stroke();
    ctx.fillStyle="#888"; ctx.fillText(val.toFixed(1), padL-6, y+3);
  }

  ctx.strokeStyle="#ccc"; ctx.beginPath();
  ctx.moveTo(padL,padT); ctx.lineTo(padL,h-padB); ctx.lineTo(w-padR,h-padB); ctx.stroke();
  categorias.forEach((cat,ci) => {
    const gx = padL + ci*groupW + groupW/2 - (keys.length*barW)/2;
    keys.forEach((k,ki) => {
      const val = (seriesByKey[k]||[])[ci];
      if (val==null) return;
      const bh = (val/maxVal)*(h-padT-padB);
      const x = gx + ki*barW;
      const topY = h-padB-bh;
      ctx.fillStyle = COLORES[(ki+(colorOffset||0))%COLORES.length];
      ctx.fillRect(x, topY, barW-4, bh);

      const err = errores && (errores[k]||[])[ci];
      if (err!=null && err>0) {
        const halfPx = (err/2/maxVal)*(h-padT-padB);
        const cx = x + (barW-4)/2;
        ctx.strokeStyle="#333"; ctx.beginPath();
        ctx.moveTo(cx, topY-halfPx); ctx.lineTo(cx, topY+halfPx);
        ctx.moveTo(cx-4, topY-halfPx); ctx.lineTo(cx+4, topY-halfPx);
        ctx.moveTo(cx-4, topY+halfPx); ctx.lineTo(cx+4, topY+halfPx);
        ctx.stroke();
      }
    });
    ctx.fillStyle="#555"; ctx.font="11px sans-serif"; ctx.textAlign="center";
    ctx.save(); ctx.translate(padL+ci*groupW+groupW/2, h-padB+14);
    const words = cat.split(' '); ctx.fillText(words.slice(0,3).join(' '), 0, 0);
    if (words.length>3) ctx.fillText(words.slice(3).join(' '), 0, 12);
    ctx.restore();
    if (umbrales && umbrales[ci]!=null) {
      const uy = h-padB-(umbrales[ci]/maxVal)*(h-padT-padB);
      ctx.strokeStyle="#d33"; ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.moveTo(padL+ci*groupW, uy); ctx.lineTo(padL+(ci+1)*groupW, uy); ctx.stroke();
      ctx.setLineDash([]);
    }
  });
}

function drawPie(canvasId, valores) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  const colors = ${JSON.stringify(COLORES_TORTA)};
  const total = valores.reduce((a,b)=>a+b,0) || 1;
  let start = -Math.PI/2;
  const cx=100, cy=90, r=78;
  ctx.clearRect(0,0,200,200);
  valores.forEach((v,i) => {
    const angle = (v/total)*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,start,start+angle);
    ctx.closePath(); ctx.fillStyle=colors[i]; ctx.fill();
    start += angle;
  });
}

lotesFinca.forEach((lote, i) => {
  if (barrasEstatica.lotes[lote]) {
    drawGroupedBars("barrasLote"+lote, barrasEstatica.categorias,
      { [lote]: barrasEstatica.lotes[lote] }, [lote], barrasEstatica.umbrales,
      { [lote]: (barrasEstatica.errores||{})[lote] }, i);
  }
});
tortas.forEach((t,i) => drawPie("torta"+i, t.valores));

const varSelect = document.getElementById("varSelect");
function redrawHistorial() {
  const v = varSelect.value;
  const h = historial[v];
  const umbralVal = umbralesHistorial[v];
  const umbralesLinea = umbralVal != null ? h.fechas.map(() => umbralVal) : null;
  lotesFinca.forEach((lote, i) => {
    drawGroupedBars("historialLote"+lote, h.fechas, { [lote]: h.lotes[lote] }, [lote], umbralesLinea,
      { [lote]: (h.errores||{})[lote] }, i);
  });
}
varSelect.addEventListener("change", redrawHistorial);
redrawHistorial();
</script>
</body></html>`;
  },

  async generar(cliente, finca, fecha, recomendacionTexto) {
    const D = await this.calcularDatos(cliente, finca, fecha);
    return this.generarHtml(D, recomendacionTexto);
  },
};
