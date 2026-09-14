// Exportación de las tres vistas de Ausentismo (registro del día, historial y
// reincidentes) a PDF y CSV, con las mismas filas que se ven en pantalla.
//
// El CSV lleva un dato por columna (código, nombre y cédula separados) para
// que sirva como datos. El PDF agrupa como la tabla de la pantalla, porque
// una carta horizontal no aguanta trece columnas legibles.

import { descargarCsv, type CeldaCsv } from "@/lib/exportar/csv";
import { descargarPdfTabla, type CeldaPdf, type ColumnaPdf } from "@/lib/exportar/pdf-tabla";
import {
  CONTACTO_LABEL, SOPORTE_LABEL, HISTORIAL_LIMITE, CRITERIOS_REINCIDENCIA, CATEGORIAS_REINCIDENCIA,
  NIVELES_ALERTA, NIVEL_ALERTA_LABEL, NIVEL_ALERTA_ACCION, NIVEL_ALERTA_COLOR, conteoPorNivel,
  NIVELES_NOTIFICABLES, nivelesRequeridos,
  DIAS_DESCARGOS, DIAS_TERMINACION, CONCEPTO_EPS, CONCEPTO_INCAPACIDAD, CONCEPTO_NO_JUSTIFICADA,
  VENTANA_MES, etiquetaMes, etiquetaVentana, textoVentana,
  etiquetaVehiculo, type AusentismoRegistro, type Concepto, type NivelNotificable,
} from "./constants";
import { clave } from "./matriz-reglas";
import type { FilaHistorico, HistoricoReincidencias, Reincidente } from "./data";

import type { FormatoExport } from "@/lib/exportar/formatos";
export type { FormatoExport };

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
  /** "mes" (mes en curso del corte) | "30" | "60" | "90" días corridos. */
  ventana: string;
  minimo: string;
  /** "" | eps | incapacidad | no_justificada (clave del concepto). */
  categoria: string;
  /** "" | alerta | terminacion | descargos | critica | soportes */
  criterio: string;
  /** "1": listar también a los retirados del maestro (por defecto, fuera). */
  retirados: string;
  q: string;
}

/** Cómo quedó la situación del conductor en el maestro, para informes. */
export function textoSituacion(r: { retirado: boolean; fechaRetiro: string | null }): string {
  return r.retirado ? `Retirado${r.fechaRetiro ? ` ${r.fechaRetiro}` : ""}` : "Activo";
}

/** Criterio y búsqueda se aplican sobre la lista ya calculada: es corta. */
export function filtrarReincidentes(lista: Reincidente[], f: FiltrosReincidentesUI): Reincidente[] {
  const q = clave(f.q);
  return lista.filter((r) => {
    if (f.criterio === "alerta" && !r.alerta) return false;
    if (f.criterio === "terminacion" && r.alerta !== "terminacion") return false;
    if (f.criterio === "descargos" && r.alerta !== "descargos") return false;
    if (f.criterio === "critica" && r.alerta !== "critica") return false;
    if (f.criterio === "sin_notificar" && r.pendientes.length === 0) return false;
    if (f.criterio === "soportes" && r.soportesPendientes === 0) return false;
    if (q && !clave(r.nombre).includes(q) && !r.cedula.startsWith(q) && !(r.codigo ?? "").toLowerCase().startsWith(q)) return false;
    return true;
  });
}

export function criterioLabel(key: string) {
  return CRITERIOS_REINCIDENCIA.find((c) => c.key === key)?.label ?? "Todos";
}

export function categoriaLabel(key: string) {
  return CATEGORIAS_REINCIDENCIA.find((c) => c.key === key)?.label ?? "Todas las ausencias";
}

/** Texto de la racha: "4 días seguidos (2026-09-01 a 2026-09-04)" o vacío. */
export function textoRacha(r: Reincidente): string {
  if (r.racha.dias === 0 || !r.racha.desde || !r.racha.hasta) return "";
  const n = r.racha.dias;
  const cuando = n === 1 ? r.racha.hasta : `${r.racha.desde} a ${r.racha.hasta}`;
  return `${n} día${n === 1 ? "" : "s"} seguido${n === 1 ? "" : "s"} (${cuando})`;
}

/**
 * Estado de la notificación de un nivel: "" si la racha no lo exige,
 * "Notificado <fecha> · <quién>" si hay marca, "PENDIENTE" si falta.
 */
export function textoNotificacion(r: Reincidente, nivel: NivelNotificable): string {
  if (!nivelesRequeridos(r.racha.dias).includes(nivel)) return "";
  const n = r.notificaciones[nivel];
  if (!n) return "PENDIENTE";
  return `Notificado ${n.notificado_en}${n.created_by_email ? ` · ${n.created_by_email}` : ""}`;
}

/** Regla completa de la alerta en una frase, para contexto de informes y ayudas. */
export function reglaAlertaTexto(): string {
  return (
    `Alerta alta: una falta no justificada o soportes pendientes. Crítica: dos o más no justificadas en la ventana. ` +
    `Citación a descargos: ${DIAS_DESCARGOS} días seguidos sin justificar. ` +
    `Terminación de contrato: ${DIAS_TERMINACION} o más días seguidos sin justificar.`
  );
}

export async function exportarReincidentes({ formato, filtros, reincidentes, labels, conceptos }: {
  formato: FormatoExport;
  filtros: FiltrosReincidentesUI;
  reincidentes: Reincidente[];
  labels: Record<string, string>;
  conceptos: Concepto[];
}) {
  const archivo =
    `ausentismo_reincidentes_${filtros.corte}_` +
    `${filtros.ventana === VENTANA_MES ? "mes" : `${filtros.ventana}d`}_min${filtros.minimo}` +
    (filtros.categoria ? sufijo(categoriaLabel(filtros.categoria)) : "") +
    (filtros.criterio ? sufijo(criterioLabel(filtros.criterio)) : "") +
    (filtros.retirados === "1" ? "_con_retirados" : "") + sufijo(filtros.q);
  const detalle = (r: Reincidente) =>
    Object.entries(r.tipos).map(([t, n]) => `${labels[t] ?? t}: ${n}`).join(" · ");
  const nivel = (r: Reincidente) => (r.alerta ? NIVEL_ALERTA_LABEL[r.alerta] : "Sin alerta");
  const accion = (r: Reincidente) => (r.alerta ? NIVEL_ALERTA_ACCION[r.alerta] : "");
  const incap = (r: Reincidente) => (r.incapacidades ? `${r.incapacidades} (${r.diasIncapacidad} d)` : "0");
  const conteos = conteoPorNivel(reincidentes);
  const criterioTxt = criterioLabel(filtros.criterio);
  const categoriaTxt = categoriaLabel(filtros.categoria);
  const queSeMide =
    filtros.categoria === CONCEPTO_EPS ? "citas médicas / EPS"
    : filtros.categoria === CONCEPTO_INCAPACIDAD ? "incapacidades"
    : filtros.categoria === CONCEPTO_NO_JUSTIFICADA ? "faltas no justificadas"
    : "ausencias";

  const cabeceraResumen = [
    "Alerta", "Acción", "Código", "Conductor", "Cédula", "Situación", "Teléfono",
    `Ausencias (${etiquetaVentana(filtros.ventana)})`,
    "No justificadas", "Días seguidos sin justificar", "Racha desde", "Racha hasta",
    "Descargos notificado", "Terminación notificado",
    "Citas EPS", "Incapacidades", "Días incapacidad", "Soportes pendientes", "Detalle", "Última ausencia",
  ];
  const filaResumen = (r: Reincidente): CeldaCsv[] => [
    nivel(r), accion(r), r.codigo ?? "", r.nombre, r.cedula, textoSituacion(r), r.telefono ?? "", r.total,
    r.noJustificadas, r.racha.dias, r.racha.desde ?? "", r.racha.hasta ?? "",
    textoNotificacion(r, "descargos"), textoNotificacion(r, "terminacion"),
    r.eps, r.incapacidades, r.diasIncapacidad, r.soportesPendientes, detalle(r), r.ultimaFecha,
  ];
  /** Líneas "Descargos: notificado…" / "Terminación: PENDIENTE" para el PDF. */
  const lineasNotificacion = (r: Reincidente) =>
    NIVELES_NOTIFICABLES
      .map((n) => {
        const t = textoNotificacion(r, n);
        return t ? `${NIVEL_ALERTA_LABEL[n]}: ${t === "PENDIENTE" ? "PENDIENTE de notificar" : t.toLowerCase()}` : "";
      })
      .filter(Boolean);
  const sinNotificar = reincidentes.filter((r) => r.pendientes.length > 0).length;
  const filasResumen = reincidentes.map(filaResumen);
  const cabeceraAusencias = [
    "Alerta", "Código", "Conductor", "Cédula", "Fecha", "Concepto", "Cuenta", "No justificada",
    "Inicio", "Fin", "Incapacidad inicio", "Incapacidad fin", "Vehículo", "Placa", "Soporte", "Justificación",
  ];
  const filasAusencias = reincidentes.flatMap((r) => r.ausencias.map((a) => [
    nivel(r), r.codigo ?? "", r.nombre, r.cedula, a.fecha, labels[a.tipo] ?? a.tipo,
    a.cuenta ? "Sí" : "No (programado)", a.noJustificada ? "Sí" : "No",
    a.fecha_inicio ?? "", a.fecha_fin ?? "", a.incapacidad_inicio ?? "", a.incapacidad_fin ?? "",
    a.codigo_vehiculo ?? "", a.placa ?? "",
    SOPORTE_LABEL[a.soporte] ?? a.soporte, a.justificacion ?? "",
  ]));
  const ventanaTxt = textoVentana(filtros.ventana, filtros.corte);
  const tituloInforme =
    `Reincidentes al ${filtros.corte} · ${categoriaTxt} · ${ventanaTxt} · mínimo ${filtros.minimo} · ${criterioTxt}` +
    (filtros.retirados === "1" ? " · incluye retirados" : "") +
    (filtros.q ? ` · "${filtros.q}"` : "");

  if (formato === "csv") return descargarCsv(`${archivo}.csv`, [cabeceraResumen, ...filasResumen]);

  if (formato === "xlsx") {
    const XLSX = await import("xlsx");
    const libro = XLSX.utils.book_new();
    const anchos = [12, 44, 8, 34, 14, 16, 14, 12, 12, 12, 12, 12, 30, 30, 10, 12, 12, 12, 40, 12].map((w) => ({ wch: w }));
    const hojaResumen = XLSX.utils.aoa_to_sheet([[tituloInforme], cabeceraResumen, ...filasResumen]);
    hojaResumen["!cols"] = anchos;
    XLSX.utils.book_append_sheet(libro, hojaResumen, "Reincidentes");
    // Una hoja por nivel de alerta, para trabajar cada segmento por separado.
    for (const n of NIVELES_ALERTA) {
      const filas = reincidentes.filter((r) => r.alerta === n);
      if (filas.length === 0) continue;
      const hoja = XLSX.utils.aoa_to_sheet([
        [`${NIVEL_ALERTA_LABEL[n]} · ${NIVEL_ALERTA_ACCION[n]} · ${filas.length} conductor${filas.length === 1 ? "" : "es"}`],
        cabeceraResumen,
        ...filas.map(filaResumen),
      ]);
      hoja["!cols"] = anchos;
      XLSX.utils.book_append_sheet(libro, hoja, NIVEL_ALERTA_LABEL[n]);
    }
    const hojaAus = XLSX.utils.aoa_to_sheet([cabeceraAusencias, ...filasAusencias]);
    hojaAus["!cols"] = [12, 8, 34, 14, 11, 20, 14, 12, 11, 11, 12, 12, 9, 10, 20, 40].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(libro, hojaAus, "Ausencias");
    XLSX.writeFile(libro, `${archivo}.xlsx`);
    return;
  }

  const noCuentan = conceptos.filter((c) => !c.cuenta_reincidencia).map((c) => c.nombre.toLowerCase());
  const enAlerta = reincidentes.filter((r) => r.alerta);
  const celdaNivel = (r: Reincidente): CeldaPdf =>
    r.alerta
      ? { texto: NIVEL_ALERTA_LABEL[r.alerta], fondo: NIVEL_ALERTA_COLOR[r.alerta].fuerte, color: "#FFFFFF", negrita: true }
      : "Sin alerta";
  const filaPdf = (r: Reincidente): CeldaPdf[] => [
    celdaNivel(r),
    `${conductor(r)}\nCC ${r.cedula}${r.telefono ? `\nTel. ${r.telefono}` : ""}` +
      (r.retirado ? `\nRETIRADO${r.fechaRetiro ? ` ${r.fechaRetiro}` : ""}` : ""),
    r.total,
    r.noJustificadas,
    textoRacha(r) || (r.racha.dias ? String(r.racha.dias) : "-"),
    r.eps,
    incap(r),
    r.soportesPendientes,
    [detalle(r), ...(r.alerta ? [NIVEL_ALERTA_ACCION[r.alerta]] : []), ...lineasNotificacion(r)].join("\n"),
    r.ultimaFecha,
  ];
  const columnas: ColumnaPdf[] = [
    { titulo: "Alerta", ancho: 20 },
    { titulo: "Conductor", ancho: 50 },
    { titulo: `Aus. (${etiquetaVentana(filtros.ventana)})`, ancho: 14, alinear: "right" },
    { titulo: "No justif.", ancho: 14, alinear: "right" },
    { titulo: "Seguidos sin justificar", ancho: 36 },
    { titulo: "EPS", ancho: 10, alinear: "right" },
    { titulo: "Incap. (días)", ancho: 18, alinear: "right" },
    { titulo: "Sop. pend.", ancho: 14, alinear: "right" },
    { titulo: "Detalle y acción" },
    { titulo: "Última", ancho: 20 },
  ];
  // El informe va segmentado por nivel: primero terminación, luego descargos,
  // críticas, altas y al final los reincidentes sin alerta.
  const secciones = [
    ...NIVELES_ALERTA.map((n) => ({
      titulo: `${NIVEL_ALERTA_LABEL[n]} · ${NIVEL_ALERTA_ACCION[n]} (${conteos[n]})`,
      color: NIVEL_ALERTA_COLOR[n].fuerte,
      filas: reincidentes.filter((r) => r.alerta === n).map(filaPdf),
    })),
    {
      titulo: `Sin alerta · reincidentes con todas sus ausencias justificadas (${reincidentes.filter((r) => !r.alerta).length})`,
      color: "#64748B",
      filas: reincidentes.filter((r) => !r.alerta).map(filaPdf),
    },
  ];
  await descargarPdfTabla({
    archivo,
    modulo: MODULO,
    titulo: `Reincidentes al ${filtros.corte} · ${categoriaTxt}`,
    contexto: [
      `Categoría: ${categoriaTxt}   ·   Ventana: ${ventanaTxt}   ·   Mínimo: ${filtros.minimo} ${queSeMide}   ·   Criterio: ${criterioTxt}` +
      (filtros.q ? `   ·   Conductor: "${filtros.q}"` : ""),
      (filtros.categoria
        ? `Conductores con ${filtros.minimo} o más ${queSeMide} en ${ventanaTxt}. `
        : `Conductores con ${filtros.minimo} o más ausencias en ${ventanaTxt}, o con soportes pendientes por entregar. `) +
      `Quien lleve ${DIAS_DESCARGOS} o más días seguidos sin justificar, o dos o más faltas no justificadas, entra siempre. ` +
      `No cuentan los conceptos programados: ${noCuentan.join(", ") || "ninguno"}.`,
      filtros.retirados === "1"
        ? "Incluye a los conductores RETIRADOS en el maestro, marcados en la columna Situación."
        : "No incluye a los conductores retirados en el maestro.",
      reglaAlertaTexto(),
    ],
    resumen: [
      `Reincidentes: ${reincidentes.length}`,
      `Terminación: ${conteos.terminacion}`,
      `Descargos: ${conteos.descargos}`,
      `Críticas: ${conteos.critica}`,
      `Altas: ${conteos.alta}`,
      `Pendientes de notificar: ${sinNotificar}`,
      `Con soporte pendiente: ${reincidentes.filter((r) => r.soportesPendientes > 0).length}`,
    ],
    columnas,
    filas: [],
    secciones,
    anexos: enAlerta.length > 0
      ? [{
          titulo: `Ausencias de los ${enAlerta.length} conductor${enAlerta.length === 1 ? "" : "es"} en alerta`,
          columnas: [
            { titulo: "Alerta", ancho: 20 },
            { titulo: "Conductor" },
            { titulo: "Fecha", ancho: 20 },
            { titulo: "Concepto", ancho: 30 },
            { titulo: "Periodo", ancho: 34 },
            { titulo: "Incapacidad", ancho: 34 },
            { titulo: "Vehículo", ancho: 24 },
            { titulo: "Soporte", ancho: 28 },
            { titulo: "Justificación" },
          ],
          filas: enAlerta.flatMap((r) => r.ausencias.map((a): CeldaPdf[] => [
            celdaNivel(r), conductor(r), a.fecha,
            (labels[a.tipo] ?? a.tipo) + (a.cuenta ? "" : " (programado)"),
            rango(a.fecha_inicio, a.fecha_fin),
            rango(a.incapacidad_inicio, a.incapacidad_fin),
            a.codigo_vehiculo ? etiquetaVehiculo({ codigo: a.codigo_vehiculo, placa: a.placa }) : "",
            a.soporte === "no_aplica" ? "" : (SOPORTE_LABEL[a.soporte] ?? a.soporte),
            a.justificacion ?? "",
          ])),
        }]
      : undefined,
    orientacion: "landscape",
    vacio: `Sin reincidentes para este criterio en ${ventanaTxt}.`,
  });
}

// ── Reincidencias históricas ─────────────────────────────────────────────────

/**
 * Reporte histórico: una fila por conductor y una columna por mes del rango.
 * En Excel y CSV va la matriz completa (un mes por columna, con las no
 * justificadas entre paréntesis); el PDF resume los meses en una sola celda
 * porque una carta horizontal no aguanta doce columnas de mes más los totales.
 */
export async function exportarHistoricoReincidencias({ formato, historico, labels }: {
  formato: FormatoExport;
  historico: HistoricoReincidencias;
  labels: Record<string, string>;
}) {
  const { desde, hasta, meses, filas, minimo } = historico;
  const archivo =
    `ausentismo_reincidencias_historicas_${desde}_${hasta}_min${minimo}` +
    (historico.incluirRetirados ? "_con_retirados" : "");
  const detalle = (r: FilaHistorico) =>
    Object.entries(r.tipos)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${labels[t] ?? t}: ${n}`)
      .join(" · ");
  /** "sep 26: 4 (2 nj)" por cada mes con ausencias. */
  const porMesTexto = (r: FilaHistorico) =>
    meses
      .filter((m) => r.porMes[m])
      .map((m) => {
        const v = r.porMes[m];
        return `${etiquetaMes(m)}: ${v.total}${v.noJustificadas > 0 ? ` (${v.noJustificadas} nj)` : ""}`;
      })
      .join("  ·  ");
  const contexto = [
    `Rango: ${desde} a ${hasta}   ·   Mínimo: ${minimo} ausencias en todo el rango   ·   ` +
    `Conductores: ${filas.length} de ${historico.conductores} con registros   ·   Registros leídos: ${historico.registros}`,
    "Cuenta las ausencias que el catálogo marca como reincidencia (los conceptos programados quedan fuera). " +
    "\"nj\" son las faltas no justificadas del mes. Ordenado por meses con ausencia y luego por total: " +
    "arriba quedan los que repiten mes tras mes.",
    historico.incluirRetirados
      ? "Incluye a los conductores RETIRADOS en el maestro, marcados en la columna Situación."
      : `No incluye a los conductores retirados en el maestro${
          historico.retiradosOcultos > 0 ? ` (${historico.retiradosOcultos} quedaron fuera)` : ""
        }.`,
  ];

  const cabecera = [
    "Código", "Conductor", "Cédula", "Situación", "Teléfono", "Meses con ausencia",
    "Total ausencias", "No justificadas", "Citas EPS", "Incapacidades", "Días incapacidad",
    "Soportes pendientes", "Mes pico", "Primera ausencia", "Última ausencia",
    ...meses.flatMap((m) => [etiquetaMes(m), `${etiquetaMes(m)} no just.`]),
    "Detalle por concepto",
  ];
  const fila = (r: FilaHistorico): CeldaCsv[] => [
    r.codigo ?? "", r.nombre, r.cedula, textoSituacion(r), r.telefono ?? "", r.mesesConAusencia,
    r.total, r.noJustificadas, r.eps, r.incapacidades, r.diasIncapacidad,
    r.soportesPendientes, r.mesPico ? etiquetaMes(r.mesPico) : "", r.primeraFecha, r.ultimaFecha,
    ...meses.flatMap((m) => [r.porMes[m]?.total ?? 0, r.porMes[m]?.noJustificadas ?? 0]),
    detalle(r),
  ];

  if (formato === "csv") return descargarCsv(`${archivo}.csv`, [cabecera, ...filas.map(fila)]);

  if (formato === "xlsx") {
    const XLSX = await import("xlsx");
    const libro = XLSX.utils.book_new();
    const hoja = XLSX.utils.aoa_to_sheet([
      [`Reincidencias históricas ${desde} a ${hasta}`],
      [contexto[0]],
      cabecera,
      ...filas.map(fila),
    ]);
    hoja["!cols"] = [
      8, 34, 14, 16, 14, 10, 12, 12, 10, 12, 12, 12, 10, 14, 14,
      ...meses.flatMap(() => [8, 10]),
      44,
    ].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(libro, hoja, "Histórico");
    // Una hoja larga (conductor · mes) para tablas dinámicas.
    const largo = [
      ["Código", "Conductor", "Cédula", "Situación", "Mes", "Ausencias", "No justificadas"],
      ...filas.flatMap((r) =>
        meses.filter((m) => r.porMes[m]).map((m) => [
          r.codigo ?? "", r.nombre, r.cedula, textoSituacion(r), m,
          r.porMes[m].total, r.porMes[m].noJustificadas,
        ])
      ),
    ];
    const hojaLargo = XLSX.utils.aoa_to_sheet(largo);
    hojaLargo["!cols"] = [8, 34, 14, 16, 10, 12, 14].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(libro, hojaLargo, "Conductor por mes");
    XLSX.writeFile(libro, `${archivo}.xlsx`);
    return;
  }

  await descargarPdfTabla({
    archivo,
    modulo: MODULO,
    titulo: `Reincidencias históricas · ${desde} a ${hasta}`,
    contexto,
    resumen: [
      `Conductores: ${filas.length}`,
      `Ausencias: ${filas.reduce((s, r) => s + r.total, 0)}`,
      `No justificadas: ${filas.reduce((s, r) => s + r.noJustificadas, 0)}`,
      `Con 3+ meses: ${filas.filter((r) => r.mesesConAusencia >= 3).length}`,
      `Soportes pendientes: ${filas.reduce((s, r) => s + r.soportesPendientes, 0)}`,
    ],
    columnas: [
      { titulo: "Conductor", ancho: 50 },
      { titulo: "Meses", ancho: 12, alinear: "right" },
      { titulo: "Total", ancho: 12, alinear: "right" },
      { titulo: "No justif.", ancho: 14, alinear: "right" },
      { titulo: "EPS", ancho: 10, alinear: "right" },
      { titulo: "Incap. (días)", ancho: 18, alinear: "right" },
      { titulo: "Sop. pend.", ancho: 14, alinear: "right" },
      { titulo: "Mes a mes" },
      { titulo: "Última", ancho: 20 },
    ],
    filas: filas.map((r): CeldaPdf[] => [
      `${conductor(r)}\nCC ${r.cedula}${r.telefono ? `\nTel. ${r.telefono}` : ""}` +
        (r.retirado ? `\nRETIRADO${r.fechaRetiro ? ` ${r.fechaRetiro}` : ""}` : ""),
      r.mesesConAusencia,
      r.total,
      r.noJustificadas,
      r.eps,
      r.incapacidades ? `${r.incapacidades} (${r.diasIncapacidad} d)` : "0",
      r.soportesPendientes,
      [porMesTexto(r), detalle(r)].filter(Boolean).join("\n"),
      r.ultimaFecha,
    ]),
    orientacion: "landscape",
    vacio: `Ningún conductor llega a ${minimo} ausencias entre el ${desde} y el ${hasta}.`,
    notas: historico.truncado
      ? ["El rango llegó al tope de lectura de registros: acótelo para que no falten ausencias."]
      : undefined,
  });
}
