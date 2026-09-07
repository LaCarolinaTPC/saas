// Informe de exceso de velocidad (PDF, Excel, CSV) del periodo consultado,
// generado en el navegador con las mismas incidencias que muestra la pantalla:
// una sección por semana con los conductores, el detalle de sus incidencias y
// las que no tienen conductor asignado. Si el periodo es un mes calendario
// completo el informe se titula mensual; si no, lleva las fechas exactas.

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
    const XLSX = await import("xlsx");
    const libro = XLSX.utils.book_new();
    const hojaResumen = XLSX.utils.aoa_to_sheet([
      [titulo], ...contexto.map((c) => [c]), [], cabeceraResumen, ...resumen.map(filaResumen), [],
      ...reglaTexto(parametros).map((t) => [t]),
    ]);
    hojaResumen["!cols"] = [10, 12, 12, 14, 12, 12, 12, 14].map((w) => ({ wch: w }));
    const hojaConsol = XLSX.utils.aoa_to_sheet([
      [`${titulo} · consolidado por conductor`],
      ["Incidencias por semana (lunes a domingo). Semana reportable: la que llega al mínimo. Estado por semana: reportado a RRHH o pendiente."],
      [], cabeceraConsolidado, ...consolidado.map(filaConsolidado), [], ...filasTotales,
    ]);
    hojaConsol["!cols"] = [36, 14, 10, ...semanas.map(() => 16), 8, 12, 18, 12, 12, 11, 44, 24].map((w) => ({ wch: w }));
    // El libro abre en la hoja de la vista activa: Consolidado o Resumen.
    if (vista === "consolidado") {
      XLSX.utils.book_append_sheet(libro, hojaConsol, "Consolidado");
      XLSX.utils.book_append_sheet(libro, hojaResumen, "Resumen");
    } else {
      XLSX.utils.book_append_sheet(libro, hojaResumen, "Resumen");
      XLSX.utils.book_append_sheet(libro, hojaConsol, "Consolidado");
    }
    const hojaCond = XLSX.utils.aoa_to_sheet([[titulo], cabeceraConductores, ...grupos.map(filaConductor)]);
    hojaCond["!cols"] = [8, 11, 11, 36, 14, 10, 11, 12, 18, 18, 40, 10, 40, 40].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(libro, hojaCond, "Conductores");
    const anchosInc = [11, 7, 7, 9, 36, 14, 9, 30, 10, 8, 12, 12, 18, 40, 12, 12].map((w) => ({ wch: w }));
    const hojaInc = XLSX.utils.aoa_to_sheet([[`${titulo} · detalle de incidencias`], cabeceraIncidencias, ...incidenciasDetalle.map(filaIncidencia)]);
    hojaInc["!cols"] = anchosInc;
    XLSX.utils.book_append_sheet(libro, hojaInc, "Incidencias");
    const hojaSin = XLSX.utils.aoa_to_sheet([
      ["Incidencias sin conductor asignado (ningún viaje despachado cubre la hora): revisar por vehículo"],
      cabeceraIncidencias, ...sinConductor.map(filaIncidencia),
    ]);
    hojaSin["!cols"] = anchosInc;
    XLSX.utils.book_append_sheet(libro, hojaSin, "Sin conductor");
    XLSX.writeFile(libro, `${archivo}${vista === "consolidado" ? "_consolidado" : ""}.xlsx`);
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
