// Exportación de las tres vistas de Ausentismo (registro del día, historial y
// reincidentes) a PDF y CSV, con las mismas filas que se ven en pantalla.
//
// El CSV lleva un dato por columna (código, nombre y cédula separados) para
// que sirva como datos. El PDF agrupa como la tabla de la pantalla, porque
// una carta horizontal no aguanta trece columnas legibles.

import { descargarCsv, type CeldaCsv } from "@/lib/exportar/csv";
import { descargarPdfTabla, type ColumnaPdf } from "@/lib/exportar/pdf-tabla";
import {
  CONTACTO_LABEL, SOPORTE_LABEL, HISTORIAL_LIMITE, NIVEL_ALERTA_LABEL, CRITERIOS_REINCIDENCIA,
  etiquetaVehiculo, type AusentismoRegistro, type Concepto,
} from "./constants";
import { clave } from "./matriz-reglas";
import type { Reincidente } from "./data";

export type FormatoExport = "pdf" | "xlsx" | "csv";

const MODULO = "Recursos Humanos · Ausentismo";

function rango(ini: string | null, fin: string | null): string {
  return ini ? `${ini} a ${fin ?? "sin fin"}` : "";
}

function conductor(r: { codigo: string | null; nombre: string }): string {
  return r.codigo ? `${r.codigo} · ${r.nombre}` : r.nombre;
}

/** Nombre de archivo seguro: minúsculas, sin tildes ni espacios. */
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

// ── Registros (día e historial) ──────────────────────────────────────────────

function filasCsvRegistros(registros: AusentismoRegistro[], labels: Record<string, string>): CeldaCsv[][] {
  const cabecera = [
    "Fecha registro", "Código", "Conductor", "Cédula", "Teléfono", "Vehículo", "Placa",
    "Tipo", "Tipo inicial", "Contacto", "Inicio ausencia", "Fin ausencia", "Justificación",
    "Incapacidad inicio", "Incapacidad fin", "Reintegro", "Soporte", "Observaciones soporte",
    "Registrado por", "Motivo modificación",
  ];
  return [
    cabecera,
    ...registros.map((r) => [
      r.fecha, r.codigo ?? "", r.nombre, r.cedula, r.telefono ?? "",
      r.codigo_vehiculo ?? "", r.vehiculos?.placa ?? "",
      labels[r.tipo] ?? r.tipo, labels[r.tipo_inicial] ?? r.tipo_inicial,
      r.contacto ? (CONTACTO_LABEL[r.contacto] ?? r.contacto) : "",
      r.fecha_inicio ?? "", r.fecha_fin ?? "", r.justificacion ?? "",
      r.incapacidad_inicio ?? "", r.incapacidad_fin ?? "", r.reintegro ?? "",
      SOPORTE_LABEL[r.soporte] ?? r.soporte, r.soporte_observaciones ?? "",
      r.created_by_email ?? "", r.motivo_modificacion ?? "",
    ]),
  ];
}

function columnasPdfRegistros(conFecha: boolean): ColumnaPdf[] {
  return [
    ...(conFecha ? [{ titulo: "Fecha", ancho: 18 }] : []),
    { titulo: "Conductor", ancho: 40 },
    { titulo: "Vehículo", ancho: 24 },
    { titulo: "Tipo", ancho: 26 },
    { titulo: "Periodo", ancho: 26 },
    { titulo: "Justificación" },
    { titulo: "Incapacidad", ancho: 26 },
    { titulo: "Reintegro", ancho: 18 },
    { titulo: "Soporte" },
    { titulo: "Teléfono", ancho: 20 },
  ];
}

function filasPdfRegistros(registros: AusentismoRegistro[], labels: Record<string, string>, conFecha: boolean) {
  return registros.map((r) => [
    ...(conFecha ? [r.fecha] : []),
    `${conductor(r)}\nCC ${r.cedula}`,
    r.codigo_vehiculo ? etiquetaVehiculo({ codigo: r.codigo_vehiculo, placa: r.vehiculos?.placa ?? null }) : "",
    (labels[r.tipo] ?? r.tipo)
      + (r.tipo !== r.tipo_inicial ? `\n(antes: ${labels[r.tipo_inicial] ?? r.tipo_inicial})` : "")
      + (r.contacto ? `\n${CONTACTO_LABEL[r.contacto] ?? r.contacto}` : ""),
    rango(r.fecha_inicio, r.fecha_fin),
    r.justificacion ?? "",
    rango(r.incapacidad_inicio, r.incapacidad_fin),
    r.reintegro ?? "",
    (r.soporte === "no_aplica" ? "" : (SOPORTE_LABEL[r.soporte] ?? r.soporte))
      + (r.soporte_observaciones ? `\n${r.soporte_observaciones}` : ""),
    r.telefono ?? "",
  ]);
}

function resumenPorTipo(registros: AusentismoRegistro[], labels: Record<string, string>): string[] {
  const m = new Map<string, number>();
  for (const r of registros) m.set(r.tipo, (m.get(r.tipo) ?? 0) + 1);
  const partes = [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${labels[t] ?? t}: ${n}`);
  return [`Total: ${registros.length}`, ...partes];
}

export async function exportarRegistroDia({ formato, fecha, registros, labels }: {
  formato: FormatoExport;
  fecha: string;
  registros: AusentismoRegistro[];
  labels: Record<string, string>;
}) {
  const archivo = `ausentismo_dia_${fecha}`;
  if (formato === "csv") return descargarCsv(`${archivo}.csv`, filasCsvRegistros(registros, labels));
  await descargarPdfTabla({
    archivo,
    modulo: MODULO,
    titulo: `Registro del día ${fecha}`,
    contexto: ["Ausentes registrados en la fecha indicada, en el orden en que se anotaron."],
    resumen: registros.length > 0 ? resumenPorTipo(registros, labels) : undefined,
    columnas: columnasPdfRegistros(false),
    filas: filasPdfRegistros(registros, labels, false),
    orientacion: "landscape",
    vacio: `Sin ausentes registrados el ${fecha}.`,
  });
}

export async function exportarHistorial({ formato, desde, hasta, tipoFiltro, query, registros, labels }: {
  formato: FormatoExport;
  desde: string;
  hasta: string;
  tipoFiltro: string;
  query: string;
  registros: AusentismoRegistro[];
  labels: Record<string, string>;
}) {
  const tipoNombre = tipoFiltro ? (labels[tipoFiltro] ?? tipoFiltro) : "";
  const truncado = registros.length >= HISTORIAL_LIMITE;
  const archivo = `ausentismo_historial_${desde}_a_${hasta}${sufijo(tipoNombre)}${sufijo(query)}`;
  if (formato === "csv") return descargarCsv(`${archivo}.csv`, filasCsvRegistros(registros, labels));

  const filtros = [
    `Rango: ${desde} a ${hasta}`,
    `Tipo: ${tipoNombre || "todos"}`,
    query ? `Conductor: "${query}"` : null,
  ].filter((x): x is string => Boolean(x));

  await descargarPdfTabla({
    archivo,
    modulo: MODULO,
    titulo: "Historial de ausencias",
    contexto: [filtros.join("   ·   ")],
    resumen: registros.length > 0 ? resumenPorTipo(registros, labels) : undefined,
    columnas: columnasPdfRegistros(true),
    filas: filasPdfRegistros(registros, labels, true),
    orientacion: "landscape",
    vacio: "Sin registros en el rango elegido.",
    notas: truncado
      ? [`El historial se corta en ${HISTORIAL_LIMITE} registros. Acote el rango o el tipo para ver el resto.`]
      : undefined,
  });
}

// ── Reincidentes ─────────────────────────────────────────────────────────────

/** Segmentación de la pestaña Reincidentes, tal como viaja en la URL. */
export interface FiltrosReincidentesUI {
  corte: string;
  ventana: string;
  minimo: string;
  /** "" | alerta | critica | soportes */
  criterio: string;
  q: string;
}

/** Criterio y búsqueda se aplican sobre la lista ya calculada: es corta. */
export function filtrarReincidentes(lista: Reincidente[], f: FiltrosReincidentesUI): Reincidente[] {
  const q = clave(f.q);
  return lista.filter((r) => {
    if (f.criterio === "alerta" && !r.alerta) return false;
    if (f.criterio === "critica" && r.alerta !== "critica") return false;
    if (f.criterio === "soportes" && r.soportesPendientes === 0) return false;
    if (q && !clave(r.nombre).includes(q) && !r.cedula.startsWith(q) && !(r.codigo ?? "").toLowerCase().startsWith(q)) return false;
    return true;
  });
}

function criterioLabel(key: string) {
  return CRITERIOS_REINCIDENCIA.find((c) => c.key === key)?.label ?? "Todos";
}

export async function exportarReincidentes({ formato, filtros, reincidentes, labels, conceptos }: {
  formato: FormatoExport;
  filtros: FiltrosReincidentesUI;
  reincidentes: Reincidente[];
  labels: Record<string, string>;
  conceptos: Concepto[];
}) {
  const archivo =
    `ausentismo_reincidentes_${filtros.corte}_${filtros.ventana}d_min${filtros.minimo}` +
    (filtros.criterio ? sufijo(criterioLabel(filtros.criterio)) : "") + sufijo(filtros.q);
  const detalle = (r: Reincidente) =>
    Object.entries(r.tipos).map(([t, n]) => `${labels[t] ?? t}: ${n}`).join(" · ");
  const nivel = (r: Reincidente) => (r.alerta ? NIVEL_ALERTA_LABEL[r.alerta] : "Sin alerta");

  const cabeceraResumen = [
    "Alerta", "Código", "Conductor", "Cédula", "Teléfono", `Ausencias (${filtros.ventana} d)`,
    "No justificadas", "Soportes pendientes", "Detalle", "Última ausencia",
  ];
  const filasResumen = reincidentes.map((r) => [
    nivel(r), r.codigo ?? "", r.nombre, r.cedula, r.telefono ?? "", r.total,
    r.noJustificadas, r.soportesPendientes, detalle(r), r.ultimaFecha,
  ]);
  const cabeceraAusencias = [
    "Alerta", "Código", "Conductor", "Cédula", "Fecha", "Concepto", "Cuenta", "No justificada",
    "Inicio", "Fin", "Vehículo", "Placa", "Soporte", "Justificación",
  ];
  const filasAusencias = reincidentes.flatMap((r) => r.ausencias.map((a) => [
    nivel(r), r.codigo ?? "", r.nombre, r.cedula, a.fecha, labels[a.tipo] ?? a.tipo,
    a.cuenta ? "Sí" : "No (programado)", a.noJustificada ? "Sí" : "No",
    a.fecha_inicio ?? "", a.fecha_fin ?? "", a.codigo_vehiculo ?? "", a.placa ?? "",
    SOPORTE_LABEL[a.soporte] ?? a.soporte, a.justificacion ?? "",
  ]));

  if (formato === "csv") return descargarCsv(`${archivo}.csv`, [cabeceraResumen, ...filasResumen]);

  if (formato === "xlsx") {
    const XLSX = await import("xlsx");
    const libro = XLSX.utils.book_new();
    const hojaResumen = XLSX.utils.aoa_to_sheet([
      [`Reincidentes al ${filtros.corte} · ventana ${filtros.ventana} días · mínimo ${filtros.minimo} · ${criterioLabel(filtros.criterio)}${filtros.q ? ` · "${filtros.q}"` : ""}`],
      cabeceraResumen,
      ...filasResumen,
    ]);
    hojaResumen["!cols"] = [10, 8, 34, 14, 14, 12, 12, 12, 40, 12].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(libro, hojaResumen, "Reincidentes");
    const hojaAus = XLSX.utils.aoa_to_sheet([cabeceraAusencias, ...filasAusencias]);
    hojaAus["!cols"] = [10, 8, 34, 14, 11, 20, 14, 12, 11, 11, 9, 10, 20, 40].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(libro, hojaAus, "Ausencias");
    XLSX.writeFile(libro, `${archivo}.xlsx`);
    return;
  }

  const noCuentan = conceptos.filter((c) => !c.cuenta_reincidencia).map((c) => c.nombre.toLowerCase());
  const criticas = reincidentes.filter((r) => r.alerta === "critica").length;
  const altas = reincidentes.filter((r) => r.alerta === "alta").length;
  const enAlerta = reincidentes.filter((r) => r.alerta);
  await descargarPdfTabla({
    archivo,
    modulo: MODULO,
    titulo: `Reincidentes al ${filtros.corte}`,
    contexto: [
      `Ventana: ${filtros.ventana} días   ·   Mínimo: ${filtros.minimo} ausencias   ·   Criterio: ${criterioLabel(filtros.criterio)}` +
      (filtros.q ? `   ·   Conductor: "${filtros.q}"` : ""),
      `Conductores con ${filtros.minimo} o más ausencias en la ventana, o con soportes pendientes por entregar. ` +
      `No cuentan los conceptos programados: ${noCuentan.join(", ") || "ninguno"}. ` +
      `Alerta alta: una falta no justificada o soportes pendientes. Alerta crítica: dos o más no justificadas.`,
    ],
    resumen: [`Reincidentes: ${reincidentes.length}`, `Críticas: ${criticas}`, `Altas: ${altas}`],
    columnas: [
      { titulo: "Alerta", ancho: 16 },
      { titulo: "Conductor" },
      { titulo: "Teléfono", ancho: 22 },
      { titulo: `Aus. (${filtros.ventana} d)`, ancho: 16, alinear: "right" },
      { titulo: "No justif.", ancho: 16, alinear: "right" },
      { titulo: "Sop. pend.", ancho: 16, alinear: "right" },
      { titulo: "Detalle" },
      { titulo: "Última", ancho: 20 },
    ],
    filas: reincidentes.map((r) => [
      nivel(r), `${conductor(r)}\nCC ${r.cedula}`, r.telefono ?? "", r.total, r.noJustificadas,
      r.soportesPendientes, detalle(r), r.ultimaFecha,
    ]),
    anexos: enAlerta.length > 0
      ? [{
          titulo: `Ausencias de los ${enAlerta.length} conductor${enAlerta.length === 1 ? "" : "es"} en alerta`,
          columnas: [
            { titulo: "Conductor" },
            { titulo: "Fecha", ancho: 20 },
            { titulo: "Concepto", ancho: 30 },
            { titulo: "Periodo", ancho: 34 },
            { titulo: "Vehículo", ancho: 24 },
            { titulo: "Soporte", ancho: 28 },
            { titulo: "Justificación" },
          ],
          filas: enAlerta.flatMap((r) => r.ausencias.map((a) => [
            conductor(r), a.fecha,
            (labels[a.tipo] ?? a.tipo) + (a.cuenta ? "" : " (programado)"),
            rango(a.fecha_inicio, a.fecha_fin),
            a.codigo_vehiculo ? etiquetaVehiculo({ codigo: a.codigo_vehiculo, placa: a.placa }) : "",
            a.soporte === "no_aplica" ? "" : (SOPORTE_LABEL[a.soporte] ?? a.soporte),
            a.justificacion ?? "",
          ])),
        }]
      : undefined,
    orientacion: "landscape",
    vacio: `Sin reincidentes para este criterio en los ${filtros.ventana} días anteriores al ${filtros.corte}.`,
  });
}
