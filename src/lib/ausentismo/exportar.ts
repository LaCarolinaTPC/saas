// Exportación de las tres vistas de Ausentismo (registro del día, historial y
// reincidentes) a PDF y CSV, con las mismas filas que se ven en pantalla.
//
// El CSV lleva un dato por columna (código, nombre y cédula separados) para
// que sirva como datos. El PDF agrupa como la tabla de la pantalla, porque
// una carta horizontal no aguanta trece columnas legibles.

import { descargarCsv, type CeldaCsv } from "@/lib/exportar/csv";
import { descargarPdfTabla, type ColumnaPdf } from "@/lib/exportar/pdf-tabla";
import {
  CONTACTO_LABEL, SOPORTE_LABEL, HISTORIAL_LIMITE, REINCIDENCIA_DIAS, REINCIDENCIA_MINIMO,
  etiquetaVehiculo, type AusentismoRegistro, type Concepto,
} from "./constants";
import type { Reincidente } from "./data";

export type FormatoExport = "pdf" | "csv";

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

export async function exportarReincidentes({ formato, hoy, reincidentes, labels, conceptos }: {
  formato: FormatoExport;
  hoy: string;
  reincidentes: Reincidente[];
  labels: Record<string, string>;
  conceptos: Concepto[];
}) {
  const archivo = `ausentismo_reincidentes_${hoy}`;
  const detalle = (r: Reincidente) =>
    Object.entries(r.tipos).map(([t, n]) => `${labels[t] ?? t}: ${n}`).join(" · ");

  if (formato === "csv") {
    return descargarCsv(`${archivo}.csv`, [
      [
        "Código", "Conductor", "Cédula", "Teléfono", `Ausencias (${REINCIDENCIA_DIAS} d)`,
        "No justificadas", "Soportes pendientes", "Detalle", "Última ausencia",
      ],
      ...reincidentes.map((r) => [
        r.codigo ?? "", r.nombre, r.cedula, r.telefono ?? "", r.total,
        r.noJustificadas, r.soportesPendientes, detalle(r), r.ultimaFecha,
      ]),
    ]);
  }

  const noCuentan = conceptos.filter((c) => !c.cuenta_reincidencia).map((c) => c.nombre.toLowerCase());
  await descargarPdfTabla({
    archivo,
    modulo: MODULO,
    titulo: `Reincidentes al ${hoy}`,
    contexto: [
      `Conductores con ${REINCIDENCIA_MINIMO} o más ausencias en los últimos ${REINCIDENCIA_DIAS} días, o con soportes pendientes por entregar.`,
      `No cuentan los conceptos programados: ${noCuentan.join(", ") || "ninguno"}.`,
    ],
    resumen: [`Reincidentes: ${reincidentes.length}`],
    columnas: [
      { titulo: "Conductor", ancho: 55 },
      { titulo: "Teléfono", ancho: 24 },
      { titulo: `Ausencias (${REINCIDENCIA_DIAS} d)`, ancho: 22, alinear: "right" },
      { titulo: "No justif.", ancho: 18, alinear: "right" },
      { titulo: "Soportes pend.", ancho: 22, alinear: "right" },
      { titulo: "Detalle" },
      { titulo: "Última", ancho: 20 },
    ],
    filas: reincidentes.map((r) => [
      `${conductor(r)}\nCC ${r.cedula}`,
      r.telefono ?? "",
      r.total,
      r.noJustificadas,
      r.soportesPendientes,
      detalle(r),
      r.ultimaFecha,
    ]),
    orientacion: "portrait",
    vacio: `Sin reincidentes ni soportes pendientes en los últimos ${REINCIDENCIA_DIAS} días.`,
  });
}
