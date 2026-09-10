/**
 * Exportación del módulo Riesgo a CSV, Excel y PDF, con las mismas filas y el
 * mismo orden que se ven en pantalla.
 *
 * Todo se genera en el navegador con las filas ya cargadas, como en
 * Reincidentes y en el tablero de Operativo: no hay ruta de servidor que
 * volver a autorizar ni consulta que repetir.
 *
 * Los tres formatos llevan el corte, la calidad del modelo y el aviso de datos
 * personales. Un archivo de estos sale de la aplicación y pierde el permiso
 * del módulo: al menos debe decir de cuándo es, cuánto vale la predicción y
 * que no se reenvía.
 */
import { descargarCsv, type CeldaCsv } from "@/lib/exportar/csv";
import { descargarPdfTabla, type CeldaPdf } from "@/lib/exportar/pdf-tabla";
import type { FormatoExport } from "@/lib/exportar/formatos";
import type { ConductorPuntuado } from "./corrida";
import type { CorridaGuardada } from "./persistir";

const MODULO = "Recursos Humanos · Riesgo predictivo";

export type Objetivo = "retiro" | "novedad";

const OBJETIVO_LABEL: Record<Objetivo, string> = {
  retiro: "Riesgo de retiro (60 días)",
  novedad: "Riesgo de falta no justificada (30 días)",
};

const NIVEL_COLOR: Record<string, string> = {
  Alto: "#DC2626",
  Medio: "#D97706",
  Bajo: "#059669",
};

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d).replace(".", ",")}%`;
const nDec = (x: number, d = 1) => x.toFixed(d).replace(".", ",");

function sufijo(texto: string): string {
  const limpio = texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  return limpio ? `_${limpio}` : "";
}

export interface FiltrosRiesgoUI {
  objetivo: Objetivo;
  soloRiesgo: boolean;
  q: string;
}

/** Las líneas de contexto que van bajo el título, iguales en los tres formatos. */
function contexto(corrida: CorridaGuardada, filtros: FiltrosRiesgoUI, filas: number): string[] {
  const m = filtros.objetivo === "retiro" ? corrida.modelos?.retiro : corrida.modelos?.novedad;
  const lineas = [
    `Corte ${corrida.corte} · calculado el ${new Date(corrida.ejecutadaAt).toLocaleString("es-CO")}` +
      ` · ${corrida.origen === "cron" ? "automático" : "a mano"}` +
      (corrida.observaciones ? ` · ${corrida.observaciones} observaciones conductor-mes` : ""),
    `${OBJETIVO_LABEL[filtros.objetivo]} · ${filas} conductor${filas === 1 ? "" : "es"}` +
      (filtros.soloRiesgo ? " · solo nivel alto y medio" : " · toda la plantilla") +
      (filtros.q ? ` · búsqueda "${filtros.q}"` : ""),
  ];
  if (m) {
    lineas.push(
      `Calidad del modelo: AUC ${nDec(m.auc, 3)} en los meses de prueba (${m.mesesTest.join(", ")})` +
        ` · tasa general ${pct(m.base)} · el 10 % de mayor puntaje acertó ${pct(m.precisionTop10)}` +
        ` (${nDec(m.liftTop10)}× la tasa general) · el 20 % superior capturó ${pct(m.capturaTop20, 0)}`
    );
  }
  return lineas;
}

const NOTAS = [
  "Riesgo alto = probabilidad de al menos 3 veces la tasa general; medio = entre 1,5 y 3 veces. Es una lista de prioridad para conversar con el conductor o revisar su asignación, no un diagnóstico.",
  '"Vehículo en taller" y "sin ningún cierre en 30 días" salen protectores porque quien no opera no acumula retiros ni faltas registradas: es sesgo de exposición, no protección real.',
  "Contiene datos personales de los trabajadores. Úselo dentro de RRHH y Gerencia; no lo reenvíe por correo ni lo suba a la wiki.",
];

const CABECERA = [
  "#",
  "Cédula",
  "Código",
  "Nombre",
  "Tipo de conductor",
  "Probabilidad",
  "Nivel",
  "Factores que pesan",
  "Prob. retiro 60d",
  "Nivel retiro",
  "Prob. falta no justificada 30d",
  "Nivel falta no justificada",
  "Ausencias 90d",
  "No justificadas 90d",
  "Viajes perdidos 90d",
  "Antigüedad (meses)",
];

export async function exportarRiesgo({
  formato,
  corrida,
  filtros,
  filas,
}: {
  formato: FormatoExport;
  corrida: CorridaGuardada;
  filtros: FiltrosRiesgoUI;
  filas: ConductorPuntuado[];
}): Promise<void> {
  const prob = (c: ConductorPuntuado) =>
    filtros.objetivo === "retiro" ? c.probRetiro : c.probNovedad;
  const nivel = (c: ConductorPuntuado) =>
    filtros.objetivo === "retiro" ? c.nivelRetiro : c.nivelNovedad;
  const factores = (c: ConductorPuntuado) =>
    (filtros.objetivo === "retiro" ? c.factoresRetiro : c.factoresNovedad)
      .map((f) => f.etiqueta)
      .join(" · ");

  const archivo =
    `riesgo_conductores_${corrida.corte}` +
    sufijo(filtros.objetivo === "retiro" ? "retiro" : "falta no justificada") +
    (filtros.soloRiesgo ? "_alto_y_medio" : "") +
    sufijo(filtros.q);

  const fila = (c: ConductorPuntuado, i: number): CeldaCsv[] => [
    i + 1,
    c.cedula,
    c.codigo ?? "",
    c.nombre,
    c.tipoConductor ?? "",
    pct(prob(c)),
    nivel(c),
    factores(c),
    pct(c.probRetiro),
    c.nivelRetiro,
    pct(c.probNovedad),
    c.nivelNovedad,
    c.variables.aus90 ?? 0,
    c.variables.nj90 ?? 0,
    c.variables.vp_cond90 ?? 0,
    Math.round(c.variables.antig_meses ?? 0),
  ];

  const titulo = OBJETIVO_LABEL[filtros.objetivo];
  const lineasContexto = contexto(corrida, filtros, filas.length);

  if (formato === "csv") {
    // El contexto va como filas de cabecera: un CSV suelto tiene que decir de
    // qué corte es y qué advertencia lleva.
    return descargarCsv(`${archivo}.csv`, [
      [`${MODULO} — ${titulo}`],
      ...lineasContexto.map((l) => [l]),
      [NOTAS[NOTAS.length - 1]],
      [],
      CABECERA,
      ...filas.map(fila),
    ]);
  }

  if (formato === "xlsx") {
    const XLSX = await import("xlsx");
    const libro = XLSX.utils.book_new();

    const hoja = XLSX.utils.aoa_to_sheet([
      [`${MODULO} — ${titulo}`],
      ...lineasContexto.map((l) => [l]),
      [],
      CABECERA,
      ...filas.map(fila),
    ]);
    hoja["!cols"] = [5, 13, 9, 34, 24, 13, 8, 60, 14, 12, 16, 16, 13, 16, 16, 16].map((wch) => ({
      wch,
    }));
    XLSX.utils.book_append_sheet(libro, hoja, "Conductores");

    // Hoja de la corrida: métricas de los dos modelos y sus pesos. Es lo que
    // permite defender el listado si alguien pregunta de dónde sale.
    const metricas: CeldaCsv[][] = [["Calidad de los modelos"], []];
    for (const [clave, m] of [
      ["Retiro en 60 días", corrida.modelos?.retiro],
      ["Falta no justificada en 30 días", corrida.modelos?.novedad],
    ] as const) {
      if (!m) continue;
      metricas.push(
        [clave],
        ["AUC (meses no vistos)", nDec(m.auc, 3)],
        ["Meses de prueba", m.mesesTest.join(", ")],
        ["Tasa general", pct(m.base)],
        ["Acierto del 10 % de mayor puntaje", pct(m.precisionTop10)],
        ["Veces la tasa general", `${nDec(m.liftTop10)}×`],
        ["Captura del 20 % superior", pct(m.capturaTop20, 0)],
        ["Observaciones (entrena / prueba / casos)", `${m.n} / ${m.nTest} / ${m.positivos}`],
        [],
        ["Variable", "Peso estandarizado", "Lectura"],
        ...m.coeficientes.map((c) => [
          c.etiqueta,
          nDec(c.peso, 3),
          c.peso > 0 ? "A más valor, más riesgo" : "A más valor, menos riesgo",
        ]),
        []
      );
    }
    const hojaModelo = XLSX.utils.aoa_to_sheet(metricas);
    hojaModelo["!cols"] = [46, 20, 30].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(libro, hojaModelo, "Modelos");

    // Tasas observadas por tramo: el "por qué" detrás de los puntajes.
    if (corrida.descriptivos.length > 0) {
      const tramos: CeldaCsv[][] = [["Tasas observadas por tramo"], []];
      for (const d of corrida.descriptivos) {
        tramos.push([d.titulo], ["Tramo", "Conductor-mes", "Tasa"]);
        for (const x of d.datos) tramos.push([x.etiqueta, x.n, pct(x.tasa)]);
        tramos.push([]);
      }
      const hojaTramos = XLSX.utils.aoa_to_sheet(tramos);
      hojaTramos["!cols"] = [60, 16, 12].map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(libro, hojaTramos, "Tasas por tramo");
    }

    const hojaNotas = XLSX.utils.aoa_to_sheet([["Cómo leer esto"], [], ...NOTAS.map((n) => [n])]);
    hojaNotas["!cols"] = [120].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(libro, hojaNotas, "Cómo leer esto");

    XLSX.writeFile(libro, `${archivo}.xlsx`);
    return;
  }

  // PDF: horizontal y con menos columnas que el Excel — en una hoja carta no
  // caben las dieciséis y un informe ilegible no sirve de nada.
  const celdaNivel = (c: ConductorPuntuado): CeldaPdf => ({
    texto: nivel(c),
    fondo: NIVEL_COLOR[nivel(c)] ?? "#64748B",
    color: "#FFFFFF",
    negrita: true,
  });
  const m = filtros.objetivo === "retiro" ? corrida.modelos?.retiro : corrida.modelos?.novedad;

  await descargarPdfTabla({
    archivo,
    modulo: MODULO,
    titulo,
    contexto: lineasContexto,
    resumen: [
      `${filas.length} conductor${filas.length === 1 ? "" : "es"}`,
      `Alto: ${filas.filter((c) => nivel(c) === "Alto").length}`,
      `Medio: ${filas.filter((c) => nivel(c) === "Medio").length}`,
      ...(m ? [`AUC ${nDec(m.auc, 3)}`, `Tasa general ${pct(m.base)}`] : []),
    ],
    orientacion: "landscape",
    // Carta horizontal deja 259 mm útiles entre márgenes. Los anchos fijos
    // suman 199 y el resto (unos 60 mm) se lo lleva "Conductor", que es la
    // columna que más texto tiene: con menos, el nombre y la cédula se parten
    // en tres líneas y la tabla se vuelve ilegible.
    columnas: [
      { titulo: "#", ancho: 9, alinear: "right" },
      { titulo: "Conductor" },
      { titulo: "Tipo", ancho: 28 },
      { titulo: "Prob.", ancho: 15, alinear: "right" },
      { titulo: "Nivel", ancho: 17, alinear: "center" },
      { titulo: "Factores que pesan", ancho: 60 },
      { titulo: "Aus. 90d", ancho: 16, alinear: "right" },
      { titulo: "No just. 90d", ancho: 19, alinear: "right" },
      { titulo: "V. perd. 90d", ancho: 20, alinear: "right" },
      { titulo: "Antig.", ancho: 15, alinear: "right" },
    ],
    filas: filas.map((c, i) => [
      i + 1,
      `${c.nombre}\n${c.codigo ? `${c.codigo} · ` : ""}CC ${c.cedula}`,
      c.tipoConductor ?? "",
      pct(prob(c)),
      celdaNivel(c),
      factores(c) || "—",
      c.variables.aus90 ?? 0,
      c.variables.nj90 ?? 0,
      c.variables.vp_cond90 ?? 0,
      Math.round(c.variables.antig_meses ?? 0),
    ]),
    notas: NOTAS,
    vacio: "Ningún conductor cumple el filtro.",
  });
}
