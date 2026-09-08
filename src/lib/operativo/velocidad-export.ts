// Informe de exceso de velocidad (PDF, Excel, CSV) del periodo consultado,
// generado en el navegador con las mismas incidencias que muestra la pantalla:
// una sección por semana con los conductores, el detalle de sus incidencias y
// las que no tienen conductor asignado. Si el periodo es un mes calendario
// completo el informe se titula mensual; si no, lleva las fechas exactas.
//
// El Excel va con exceljs (no con la librería `xlsx`, que no escribe colores)
// para que la hoja Consolidado salga tal como la matriz de la pantalla: una
// celda por semana con el mismo color (rojo pendiente, verde reportado, gris
// bajo el mínimo), la velocidad con su banda y el pie con los mismos totales.

import type ExcelJS from "exceljs";
import { descargarCsv, type CeldaCsv } from "@/lib/exportar/csv";
import { descargarPdfTabla, type CeldaPdf, type ColumnaPdf } from "@/lib/exportar/pdf-tabla";
import type { FormatoExport } from "@/lib/exportar/formatos";
import {
  NIVEL_VELOCIDAD_COLOR, NIVEL_VELOCIDAD_LABEL, ddmm, ddmmaaaa, duracionMinutos, estadoRrhhTexto, horaDe, mesCompleto,
  mesLabel, nivelVelocidad, rangoLabel, reglaTexto, semanaCorta, totalesConsolidado,
  type ConductorConsolidado, type ConductorSemana, type Incidencia, type ParametrosVelocidad, type ResumenSemana, type Semana,
} from "./velocidad-reglas";

const MODULO = "Operativo · Exceso de velocidad";

export type VistaVelocidad = "semanas" | "consolidado";

/** Semanas que caben como columnas en el PDF horizontal; el resto queda en Excel. */
const MAX_SEMANAS_PDF = 6;

const ANCHOS_INCIDENCIAS = [11, 7, 7, 9, 36, 14, 9, 30, 10, 8, 12, 12, 18, 40, 12, 12];

// Colores de la pantalla, en ARGB para exceljs.
const argb = (hex: string) => `FF${hex.replace("#", "")}`;
const COLOR = {
  indigo: argb("#4F46E5"), blanco: argb("#FFFFFF"), gris: argb("#64748B"), grisClaro: argb("#94A3B8"),
  pendienteFondo: argb("#FEE2E2"), pendienteTexto: argb("#991B1B"),
  reportadoFondo: argb("#D1FAE5"), reportadoTexto: argb("#065F46"),
  bajoFondo: argb("#F1F5F9"), bajoTexto: argb("#334155"),
  pieFondo: argb("#F8FAFC"), pieTexto: argb("#334155"), rojo: argb("#B91C1C"),
};
const relleno = (color: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: color } });

export async function exportarInformeVelocidad({
  formato, vista, desde, hasta, consulta, hoy, semanas, resumen, grupos, consolidado, sinConductor, parametros, soloReportables, query,
}: {
  formato: FormatoExport;
  /** Vista activa en pantalla: decide qué tabla sale en el CSV. */
  vista: VistaVelocidad;
  /** Periodo pedido en pantalla (fechas inclusivas). */
  desde: string;
  hasta: string;
  /** Fechas realmente consultadas: semanas completas de lunes a domingo. */
  consulta: { desde: string; hasta: string };
  hoy: string;
  semanas: Semana[];
  resumen: ResumenSemana[];
  /** Conductores por semana ya filtrados como se ven en pantalla. */
  grupos: ConductorSemana[];
  /** Una fila por conductor con una celda por semana, filtrado como se ve en pantalla. */
  consolidado: ConductorConsolidado[];
  sinConductor: Incidencia[];
  parametros: ParametrosVelocidad;
  soloReportables: boolean;
  query: string;
}) {
  const mes = mesCompleto(desde, hasta, hoy);
  const archivo = `operativo_exceso_velocidad_${mes ?? `${desde}_a_${hasta}`}${soloReportables ? "_reportables" : ""}`;
  const titulo = mes
    ? `Informe mensual de exceso de velocidad · ${mesLabel(mes)}`
    : `Informe de exceso de velocidad · ${rangoLabel(desde, hasta)}`;
  const contexto = [
    `Periodo consultado: ${ddmmaaaa(desde)} al ${ddmmaaaa(hasta)} · ${resumen.length} semana${resumen.length === 1 ? "" : "s"} completa${resumen.length === 1 ? "" : "s"} de lunes a domingo, del ${ddmmaaaa(consulta.desde)} al ${ddmmaaaa(consulta.hasta)}`,
    soloReportables
      ? `Conductores con ${parametros.minimoIncidencias} o más incidencias en la misma semana (reportables a RRHH)`
      : "Todos los conductores con al menos una incidencia",
    `Umbral ${parametros.umbralKmh} km/h · incidencias separadas por ${parametros.minutosAgrupacion} min · semanas de lunes a domingo`,
    ...(query ? [`Filtro: "${query}"`] : []),
  ];
  const estadoReporte = (g: ConductorSemana) =>
    g.reporte
      ? `Reportado el ${g.reporte.reportadoEn}${g.reporte.createdByEmail ? ` · ${g.reporte.createdByEmail}` : ""}`
      : g.reportable ? "PENDIENTE de reportar" : "Bajo el mínimo";
  const vel = (v: number) => `${v.toFixed(0)} km/h`;

  const cabeceraConductores = [
    "Semana", "Lunes", "Domingo", "Conductor", "Cédula", "Código", "Incidencias", "Velocidad máx (km/h)",
    "Nivel", "Vehículos", "Rutas", "Reportable", "Reporte RRHH", "Observaciones",
  ];
  const filaConductor = (g: ConductorSemana): CeldaCsv[] => [
    g.semana.numero, g.semana.desde, g.semana.hasta, g.nombre, g.cedula, g.codigo ?? "",
    g.incidencias.length, g.velocidadMax, NIVEL_VELOCIDAD_LABEL[nivelVelocidad(g.velocidadMax)],
    g.vehiculos.join(" · "), g.rutas.join(" · "), g.reportable ? "Sí" : "No", estadoReporte(g),
    g.reporte?.observaciones ?? "",
  ];
  const cabeceraIncidencias = [
    "Fecha", "Inicio", "Fin", "Duración (min)", "Conductor", "Cédula", "Vehículo", "Ruta", "Viaje",
    "Eventos", "Velocidad máx (km/h)", "Velocidad prom (km/h)", "Nivel", "Dirección", "Latitud", "Longitud",
  ];
  const filaIncidencia = (i: Incidencia): CeldaCsv[] => [
    i.fecha, horaDe(i.inicio), horaDe(i.fin), duracionMinutos(i), i.nombre ?? "Sin conductor", i.cedula ?? "",
    i.vehiculo, i.ruta ?? "", i.viaje ?? "", i.eventos, i.velocidadMax, i.velocidadProm ?? "",
    NIVEL_VELOCIDAD_LABEL[nivelVelocidad(i.velocidadMax)], i.direccion ?? "", i.latitud ?? "", i.longitud ?? "",
  ];
  const cabeceraResumen = ["Semana", "Lunes", "Domingo", "Conductores", "Reportables", "Reportados", "Incidencias", "Sin conductor"];
  const filaResumen = (r: ResumenSemana): CeldaCsv[] => [
    r.semana.numero, r.semana.desde, r.semana.hasta, r.conductores, r.reportables, r.reportados, r.incidencias, r.sinConductor,
  ];
  const incidenciasDetalle = grupos.flatMap((g) => g.incidencias);

  // Consolidado: conductor × semana, con totales por columna.
  const totales = totalesConsolidado(consolidado, semanas);
  const cabeceraConsolidado = [
    "Conductor", "Cédula", "Código", ...semanas.map(semanaCorta), "Total", "Velocidad máx (km/h)", "Nivel",
    "Semanas reportables", "Reportadas a RRHH", "Pendientes", "Estado por semana", "Vehículos",
  ];
  const filaConsolidado = (f: ConductorConsolidado): CeldaCsv[] => [
    f.nombre, f.cedula, f.codigo ?? "",
    ...semanas.map((s) => f.semanas[s.numero]?.incidencias ?? 0),
    f.total, f.velocidadMax, NIVEL_VELOCIDAD_LABEL[nivelVelocidad(f.velocidadMax)],
    f.semanasReportables, f.semanasReportadas, f.semanasReportables - f.semanasReportadas,
    estadoRrhhTexto(f, semanas), f.vehiculos.join(" · "),
  ];
  const filasTotales: CeldaCsv[][] = [
    ["Total incidencias", "", "", ...semanas.map((s) => totales[s.numero]?.incidencias ?? 0), consolidado.reduce((a, f) => a + f.total, 0)],
    ["Conductores con exceso", "", "", ...semanas.map((s) => totales[s.numero]?.conductores ?? 0), consolidado.length],
    ["Reportables", "", "", ...semanas.map((s) => totales[s.numero]?.reportables ?? 0)],
    ["Pendientes de reportar", "", "", ...semanas.map((s) => totales[s.numero]?.pendientes ?? 0)],
  ];

  if (formato === "csv") {
    return vista === "consolidado"
      ? descargarCsv(`${archivo}_consolidado.csv`, [cabeceraConsolidado, ...consolidado.map(filaConsolidado), ...filasTotales])
      : descargarCsv(`${archivo}.csv`, [cabeceraConductores, ...grupos.map(filaConductor)]);
  }

  if (formato === "xlsx") {
    await descargarExcelVelocidad({
      archivo: `${archivo}${vista === "consolidado" ? "_consolidado" : ""}.xlsx`,
      vista, titulo, contexto, semanas, consolidado, totales, parametros,
      hojas: [
        { nombre: "Resumen", filas: [[titulo], ...contexto.map((c) => [c]), [], cabeceraResumen, ...resumen.map(filaResumen), [], ...reglaTexto(parametros).map((t) => [t])], cabeceraEn: 2 + contexto.length + 1, anchos: [10, 12, 12, 14, 12, 12, 12, 14] },
        { nombre: "Conductores", filas: [[titulo], cabeceraConductores, ...grupos.map(filaConductor)], cabeceraEn: 2, anchos: [8, 11, 11, 36, 14, 10, 11, 12, 18, 18, 40, 10, 40, 40] },
        { nombre: "Incidencias", filas: [[`${titulo} · detalle de incidencias`], cabeceraIncidencias, ...incidenciasDetalle.map(filaIncidencia)], cabeceraEn: 2, anchos: ANCHOS_INCIDENCIAS },
        {
          nombre: "Sin conductor",
          filas: [["Incidencias sin conductor asignado (ningún viaje despachado cubre la hora): revisar por vehículo"], cabeceraIncidencias, ...sinConductor.map(filaIncidencia)],
          cabeceraEn: 2,
          anchos: ANCHOS_INCIDENCIAS,
        },
      ],
    });
    return;
  }

  const chipVel = (v: number): CeldaPdf => {
    const c = NIVEL_VELOCIDAD_COLOR[nivelVelocidad(v)];
    return { texto: vel(v), fondo: c.fuerte, color: "#FFFFFF", negrita: true };
  };
  const columnas: ColumnaPdf[] = [
    { titulo: "Conductor", ancho: 60 },
    { titulo: "Cédula", ancho: 22 },
    { titulo: "Cód.", ancho: 14 },
    { titulo: "Incid.", ancho: 14, alinear: "right" },
    { titulo: "Vel. máx", ancho: 20, alinear: "center" },
    { titulo: "Vehículos", ancho: 30 },
    { titulo: "Rutas" },
    { titulo: "Reporte a RRHH", ancho: 48 },
  ];
  const filaPdf = (g: ConductorSemana): CeldaPdf[] => [
    g.nombre, g.cedula, g.codigo ?? "", g.incidencias.length, chipVel(g.velocidadMax),
    g.vehiculos.join(", "), g.rutas.join(" · "),
    g.reporte
      ? { texto: `Reportado ${ddmm(g.reporte.reportadoEn)}`, fondo: "#D1FAE5", color: "#065F46", negrita: true }
      : g.reportable
        ? { texto: "PENDIENTE", fondo: "#FEE2E2", color: "#991B1B", negrita: true }
        : "Bajo el mínimo",
  ];
  // En el PDF el consolidado es la tabla principal y las semanas van como
  // anexos, porque cada bloque lleva columnas distintas.
  const semanasPdf = semanas.length > MAX_SEMANAS_PDF ? semanas.slice(-MAX_SEMANAS_PDF) : semanas;
  const celdaSemana = (f: ConductorConsolidado, s: Semana): CeldaPdf => {
    const c = f.semanas[s.numero];
    if (!c) return { texto: "·", color: "#94A3B8" };
    if (c.reportable && !c.reporte) return { texto: `${c.incidencias} !`, fondo: "#FEE2E2", color: "#991B1B", negrita: true };
    if (c.reportable && c.reporte) return { texto: `${c.incidencias} ✓`, fondo: "#D1FAE5", color: "#065F46", negrita: true };
    return { texto: String(c.incidencias), fondo: "#F1F5F9", color: "#334155" };
  };
  const colsConsolidado: ColumnaPdf[] = [
    { titulo: "Conductor", ancho: 54 },
    { titulo: "Cédula", ancho: 22 },
    { titulo: "Cód.", ancho: 12 },
    ...semanasPdf.map((s) => ({ titulo: `S${s.numero} ${ddmm(s.desde)}-${ddmm(s.hasta)}`, ancho: 22, alinear: "center" as const })),
    { titulo: "Total", ancho: 13, alinear: "right" },
    { titulo: "Vel. máx", ancho: 20, alinear: "center" },
    { titulo: "Sem. rep.", ancho: 16, alinear: "center" },
    { titulo: "RRHH", ancho: 18, alinear: "center" },
    { titulo: "Vehículos" },
  ];
  const filaConsolidadoPdf = (f: ConductorConsolidado): CeldaPdf[] => [
    f.nombre, f.cedula, f.codigo ?? "",
    ...semanasPdf.map((s) => celdaSemana(f, s)),
    f.total, chipVel(f.velocidadMax),
    f.semanasReportables || "—",
    f.semanasReportables === 0
      ? "—"
      : f.semanasReportables > f.semanasReportadas
        ? { texto: `${f.semanasReportadas} de ${f.semanasReportables}`, fondo: "#FEE2E2", color: "#991B1B", negrita: true }
        : { texto: `${f.semanasReportadas} de ${f.semanasReportables}`, fondo: "#D1FAE5", color: "#065F46", negrita: true },
    f.vehiculos.join(", "),
  ];
  const negrita = (texto: string | number): CeldaPdf => ({ texto: String(texto), negrita: true, fondo: "#F8FAFC" });
  const filasTotalesPdf: CeldaPdf[][] = consolidado.length === 0 ? [] : [
    [negrita("Total incidencias"), "", "", ...semanasPdf.map((s) => negrita(totales[s.numero]?.incidencias ?? 0)), negrita(consolidado.reduce((a, f) => a + f.total, 0)), "", "", "", ""],
    [negrita("Conductores con exceso"), "", "", ...semanasPdf.map((s) => negrita(totales[s.numero]?.conductores ?? 0)), negrita(consolidado.length), "", "", "", ""],
    [negrita("Reportables · pendientes"), "", "", ...semanasPdf.map((s) => negrita(`${totales[s.numero]?.reportables ?? 0} · ${totales[s.numero]?.pendientes ?? 0}`)), "", "", "", "", ""],
  ];

  const seccionesSemana = resumen.map((r) => {
    const propios = grupos.filter((g) => g.semana.desde === r.semana.desde);
    return {
      titulo: `${r.semana.label} · ${propios.length} conductor${propios.length === 1 ? "" : "es"} · ${r.reportables} reportable${r.reportables === 1 ? "" : "s"} · ${r.incidencias} incidencias`,
      columnas,
      filas: propios.map(filaPdf),
    };
  }).filter((s) => s.filas.length > 0);
  const colsInc: ColumnaPdf[] = [
    { titulo: "Fecha", ancho: 18, alinear: "center" },
    { titulo: "Hora", ancho: 24, alinear: "center" },
    { titulo: "Min", ancho: 10, alinear: "right" },
    { titulo: "Conductor", ancho: 56 },
    { titulo: "Bus", ancho: 12, alinear: "center" },
    { titulo: "Ruta", ancho: 50 },
    { titulo: "Ev.", ancho: 10, alinear: "right" },
    { titulo: "Vel. máx", ancho: 20, alinear: "center" },
    { titulo: "Dirección" },
  ];
  const filaIncPdf = (i: Incidencia): CeldaPdf[] => [
    ddmm(i.fecha), `${horaDe(i.inicio)}–${horaDe(i.fin)}`, duracionMinutos(i), i.nombre ?? "Sin conductor",
    i.vehiculo, i.ruta ?? "", i.eventos, chipVel(i.velocidadMax), i.direccion ?? "",
  ];
  const totalReportables = grupos.filter((g) => g.reportable).length;
  const totalReportados = grupos.filter((g) => g.reportable && g.reporte).length;

  await descargarPdfTabla({
    archivo,
    modulo: MODULO,
    titulo,
    contexto: [
      ...contexto,
      `Consolidado por conductor: una columna por semana (${semanasPdf.length} de ${semanas.length})${semanasPdf.length < semanas.length ? " · el PDF muestra las últimas; el Excel trae todas" : ""} · "!" pendiente de reportar · "✓" reportado a RRHH`,
    ],
    resumen: [
      `${consolidado.length} conductor${consolidado.length === 1 ? "" : "es"} con exceso`,
      `${grupos.length} conductor-semana`,
      `${totalReportables} reportables a RRHH`,
      `${totalReportados} ya reportados`,
      `${incidenciasDetalle.length} incidencias`,
      `${sinConductor.length} sin conductor`,
    ],
    columnas: colsConsolidado,
    filas: [...consolidado.map(filaConsolidadoPdf), ...filasTotalesPdf],
    anexos: [
      ...seccionesSemana,
      { titulo: "Detalle de incidencias de los conductores listados", columnas: colsInc, filas: incidenciasDetalle.map(filaIncPdf) },
      ...(sinConductor.length
        ? [{ titulo: "Incidencias sin conductor asignado (revisar por vehículo)", columnas: colsInc, filas: sinConductor.map(filaIncPdf) }]
        : []),
    ],
    notas: reglaTexto(parametros),
    orientacion: "landscape",
    vacio: "Sin incidencias con estos filtros.",
  });
}

// ── Excel ────────────────────────────────────────────────────────────────────

type HojaPlana = {
  nombre: string;
  filas: CeldaCsv[][];
  /** Fila (1-based) con los títulos de columna, para resaltarla y fijarla. */
  cabeceraEn: number;
  anchos: number[];
};

/**
 * Libro Excel del informe. La hoja Consolidado replica la matriz de la
 * pantalla (una fila por conductor, una columna por semana, mismos colores y
 * mismo pie); las demás hojas son listados planos. El libro abre en la hoja de
 * la vista activa.
 */
async function descargarExcelVelocidad({
  archivo, vista, titulo, contexto, semanas, consolidado, totales, parametros, hojas,
}: {
  archivo: string;
  vista: VistaVelocidad;
  titulo: string;
  contexto: string[];
  semanas: Semana[];
  consolidado: ConductorConsolidado[];
  totales: ReturnType<typeof totalesConsolidado>;
  parametros: ParametrosVelocidad;
  hojas: HojaPlana[];
}) {
  const Excel = (await import("exceljs")).default;
  const libro = new Excel.Workbook();
  libro.creator = "Gestivo · La Carolina De Transporte";
  libro.created = new Date();

  const cabecera = (fila: ExcelJS.Row) => {
    fila.eachCell((c) => {
      c.font = { bold: true, color: { argb: COLOR.blanco } };
      c.fill = relleno(COLOR.indigo);
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
    fila.height = 30;
  };
  const hojaPlana = ({ nombre, filas, cabeceraEn, anchos }: HojaPlana) => {
    const hoja = libro.addWorksheet(nombre);
    hoja.addRows(filas.map((f) => f.map((c) => (c === undefined ? null : c))));
    hoja.getRow(1).font = { bold: true, size: 13 };
    cabecera(hoja.getRow(cabeceraEn));
    hoja.columns = anchos.map((w) => ({ width: w }));
    hoja.views = [{ state: "frozen", ySplit: cabeceraEn }];
    return hoja;
  };

  const consolidadoHoja = () => {
    const hoja = libro.addWorksheet("Consolidado");
    const nSem = semanas.length;
    const colTotal = 4 + nSem;
    const colVel = colTotal + 1;
    const colSemRep = colTotal + 2;
    const colRrhh = colTotal + 3;
    const colVeh = colTotal + 4;

    hoja.getCell(1, 1).value = `${titulo} · consolidado por conductor`;
    hoja.getCell(1, 1).font = { bold: true, size: 13 };
    contexto.forEach((c, i) => {
      hoja.getCell(2 + i, 1).value = c;
      hoja.getCell(2 + i, 1).font = { color: { argb: COLOR.gris } };
    });
    const filaCab = 2 + contexto.length + 1;
    const cab = hoja.getRow(filaCab);
    cab.values = ["Conductor", "Cédula", "Cód.", ...semanas.map(semanaCorta), "Total", "Vel. máx", "Sem. report.", "Reportadas RRHH", "Vehículos"];
    cabecera(cab);
    hoja.getCell(filaCab, colSemRep).note = `Semanas con ${parametros.minimoIncidencias} o más incidencias`;

    for (const f of consolidado) {
      const fila = hoja.addRow([
        f.nombre, f.cedula, f.codigo ?? "—",
        ...semanas.map((s) => f.semanas[s.numero]?.incidencias ?? "·"),
        f.total, f.velocidadMax,
        f.semanasReportables || "—",
        f.semanasReportables > 0 ? `${f.semanasReportadas} de ${f.semanasReportables}` : "—",
        f.vehiculos.join(", "),
      ]);
      fila.getCell(1).font = { bold: true };
      semanas.forEach((s, i) => {
        const celda = fila.getCell(4 + i);
        celda.alignment = { horizontal: "center" };
        const c = f.semanas[s.numero];
        if (!c) {
          celda.font = { color: { argb: COLOR.grisClaro } };
          return;
        }
        const pendiente = c.reportable && !c.reporte;
        const reportado = c.reportable && !!c.reporte;
        celda.fill = relleno(pendiente ? COLOR.pendienteFondo : reportado ? COLOR.reportadoFondo : COLOR.bajoFondo);
        celda.font = { bold: pendiente || reportado, color: { argb: pendiente ? COLOR.pendienteTexto : reportado ? COLOR.reportadoTexto : COLOR.bajoTexto } };
        celda.note = pendiente
          ? `${c.incidencias} incidencias · máx ${c.velocidadMax.toFixed(0)} km/h · PENDIENTE de reportar a RRHH`
          : reportado
            ? `${c.incidencias} incidencias · máx ${c.velocidadMax.toFixed(0)} km/h · reportado el ${c.reporte!.reportadoEn}`
            : `${c.incidencias} incidencias · máx ${c.velocidadMax.toFixed(0)} km/h · bajo el mínimo`;
      });
      fila.getCell(colTotal).font = { bold: true };
      const vel = fila.getCell(colVel);
      vel.numFmt = '0 "km/h"';
      vel.alignment = { horizontal: "center" };
      vel.fill = relleno(argb(NIVEL_VELOCIDAD_COLOR[nivelVelocidad(f.velocidadMax)].fuerte));
      vel.font = { bold: true, color: { argb: COLOR.blanco } };
      vel.note = NIVEL_VELOCIDAD_LABEL[nivelVelocidad(f.velocidadMax)];
      fila.getCell(colSemRep).alignment = { horizontal: "center" };
      if (f.semanasReportables > 0) fila.getCell(colSemRep).font = { bold: true };
      const rrhh = fila.getCell(colRrhh);
      rrhh.alignment = { horizontal: "center" };
      if (f.semanasReportables > f.semanasReportadas) rrhh.font = { bold: true, color: { argb: COLOR.pendienteTexto } };
      else if (f.semanasReportables > 0) rrhh.font = { color: { argb: COLOR.reportadoTexto } };
    }

    if (consolidado.length === 0) {
      hoja.addRow(["Sin incidencias con estos filtros."]).getCell(1).font = { italic: true, color: { argb: COLOR.gris } };
    } else {
      // Pie con los mismos tres renglones de la pantalla.
      const pie = (etiqueta: string, porSemana: (s: Semana) => string | number, total: string | number, negrita: boolean) => {
        const fila = hoja.addRow([etiqueta, "", "", ...semanas.map(porSemana), total]);
        for (let col = 1; col <= colVeh; col++) {
          const c = fila.getCell(col);
          c.fill = relleno(COLOR.pieFondo);
          c.font = { bold: negrita, color: { argb: COLOR.pieTexto } };
          if (col >= 4) c.alignment = { horizontal: "center" };
        }
        return fila;
      };
      pie("Total incidencias", (s) => totales[s.numero]?.incidencias ?? 0, consolidado.reduce((a, f) => a + f.total, 0), true);
      pie("Conductores con exceso", (s) => totales[s.numero]?.conductores ?? 0, consolidado.length, false);
      const filaRep = pie("Reportables · pendientes", (s) => `${totales[s.numero]?.reportables ?? 0} · ${totales[s.numero]?.pendientes ?? 0}`, "", false);
      semanas.forEach((s, i) => {
        if (totales[s.numero]?.pendientes) filaRep.getCell(4 + i).font = { bold: true, color: { argb: COLOR.rojo } };
      });
    }

    hoja.addRow([]);
    for (const t of [
      `Rojo: ${parametros.minimoIncidencias}+ incidencias en la semana, pendiente de reportar · Verde: reportado a RRHH · Gris: bajo el mínimo · "·": sin incidencias esa semana`,
      ...reglaTexto(parametros),
    ]) {
      hoja.addRow([t]).getCell(1).font = { color: { argb: COLOR.gris }, size: 9 };
    }

    hoja.columns = Array.from({ length: colVeh }, (_, i) => {
      const col = i + 1;
      return { width: col === 1 ? 36 : col <= 3 ? 12 : col < colTotal ? 15 : col === colTotal ? 8 : col === colVel ? 11 : col === colVeh ? 28 : 14 };
    });
    hoja.views = [{ state: "frozen", xSplit: 1, ySplit: filaCab }];
    hoja.autoFilter = { from: { row: filaCab, column: 1 }, to: { row: filaCab + Math.max(consolidado.length, 1), column: colVeh } };
  };

  // El libro abre en la hoja de la vista activa: Consolidado o Resumen.
  const [resumen, ...resto] = hojas;
  if (vista === "consolidado") {
    consolidadoHoja();
    hojaPlana(resumen);
  } else {
    hojaPlana(resumen);
    consolidadoHoja();
  }
  resto.forEach(hojaPlana);

  const buffer = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = archivo;
  a.click();
  URL.revokeObjectURL(url);
}
