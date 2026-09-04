// Informe mensual de exceso de velocidad (PDF, Excel, CSV), generado en el
// navegador con las mismas incidencias que muestra la pantalla: una sección
// por semana con los conductores, el detalle de sus incidencias y las que no
// tienen conductor asignado.

import { descargarCsv, type CeldaCsv } from "@/lib/exportar/csv";
import { descargarPdfTabla, type CeldaPdf, type ColumnaPdf } from "@/lib/exportar/pdf-tabla";
import type { FormatoExport } from "@/lib/exportar/formatos";
import {
  NIVEL_VELOCIDAD_COLOR, NIVEL_VELOCIDAD_LABEL, ddmm, duracionMinutos, horaDe, mesLabel, nivelVelocidad, reglaTexto,
  type ConductorSemana, type Incidencia, type ParametrosVelocidad, type ResumenSemana,
} from "./velocidad-reglas";

const MODULO = "Operativo · Exceso de velocidad";

export async function exportarInformeVelocidad({
  formato, mes, resumen, grupos, sinConductor, parametros, soloReportables, query,
}: {
  formato: FormatoExport;
  mes: string;
  resumen: ResumenSemana[];
  /** Conductores por semana ya filtrados como se ven en pantalla. */
  grupos: ConductorSemana[];
  sinConductor: Incidencia[];
  parametros: ParametrosVelocidad;
  soloReportables: boolean;
  query: string;
}) {
  const archivo = `operativo_exceso_velocidad_${mes}${soloReportables ? "_reportables" : ""}`;
  const titulo = `Informe mensual de exceso de velocidad · ${mesLabel(mes)}`;
  const contexto = [
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
    "Semana", "Desde", "Hasta", "Conductor", "Cédula", "Código", "Incidencias", "Velocidad máx (km/h)",
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
  const cabeceraResumen = ["Semana", "Desde", "Hasta", "Conductores", "Reportables", "Reportados", "Incidencias", "Sin conductor"];
  const filaResumen = (r: ResumenSemana): CeldaCsv[] => [
    r.semana.numero, r.semana.desde, r.semana.hasta, r.conductores, r.reportables, r.reportados, r.incidencias, r.sinConductor,
  ];
  const incidenciasDetalle = grupos.flatMap((g) => g.incidencias);

  if (formato === "csv") return descargarCsv(`${archivo}.csv`, [cabeceraConductores, ...grupos.map(filaConductor)]);

  if (formato === "xlsx") {
    const XLSX = await import("xlsx");
    const libro = XLSX.utils.book_new();
    const hojaResumen = XLSX.utils.aoa_to_sheet([
      [titulo], ...contexto.map((c) => [c]), [], cabeceraResumen, ...resumen.map(filaResumen), [],
      ...reglaTexto(parametros).map((t) => [t]),
    ]);
    hojaResumen["!cols"] = [10, 12, 12, 14, 12, 12, 12, 14].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(libro, hojaResumen, "Resumen");
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
    XLSX.writeFile(libro, `${archivo}.xlsx`);
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
  const secciones = resumen.map((r) => {
    const propios = grupos.filter((g) => g.semana.desde === r.semana.desde);
    return {
      titulo: `${r.semana.label} · ${propios.length} conductor${propios.length === 1 ? "" : "es"} · ${r.reportables} reportable${r.reportables === 1 ? "" : "s"} · ${r.incidencias} incidencias`,
      color: r.reportables > 0 ? "#B91C1C" : "#4F46E5",
      filas: propios.map(filaPdf),
    };
  });
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
    contexto,
    resumen: [
      `${grupos.length} conductor-semana`,
      `${totalReportables} reportables a RRHH`,
      `${totalReportados} ya reportados`,
      `${incidenciasDetalle.length} incidencias`,
      `${sinConductor.length} sin conductor`,
    ],
    columnas,
    filas: [],
    secciones,
    anexos: [
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
