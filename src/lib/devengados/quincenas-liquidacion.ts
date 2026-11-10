/**
 * Quincenas que se pueden consultar en «Liquidación conductor» (/liquidacion).
 *
 * Pedido del 2026-11-10: la pantalla solo deja ver la quincena actual o la
 * anterior, para todos los usuarios (administradores incluidos). La actual va
 * desde su día 1 o 16 hasta la fecha del último cierre de GEMA cargado en el
 * sistema: los días sin cierre todavía no tienen liquidación. Funciones puras
 * (sin base de datos) para poder probarlas.
 */
import { quincenaDe } from "./engine";

export type ClaveQuincena = "actual" | "anterior";

export interface OpcionQuincena {
  clave: ClaveQuincena;
  /** Texto del selector, p. ej. «Quincena actual · 1 al 15 de noviembre de 2026». */
  etiqueta: string;
  /** Aclaración corta: hasta qué día hay cierres, o que aún no hay. */
  nota: string;
  /** Rango que se consulta (la actual termina en el último cierre). */
  ini: string;
  fin: string;
  /** false si todavía no hay ningún cierre en esa quincena. */
  disponible: boolean;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** 'YYYY-MM-DD' del día anterior (sin zona horaria: son fechas contables). */
export function diaAnterior(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** «1 al 15 de noviembre de 2026» (una quincena nunca cruza de mes). */
export function rangoQuincena(ini: string, fin: string): string {
  const [y, m] = ini.split("-").map(Number);
  return `${Number(ini.slice(8))} al ${Number(fin.slice(8))} de ${MESES.at(m - 1)} de ${y}`;
}

/** «9 de noviembre». */
function diaYMes(fecha: string): string {
  return `${Number(fecha.slice(8))} de ${MESES.at(Number(fecha.slice(5, 7)) - 1)}`;
}

/**
 * Las dos quincenas consultables, la actual primero.
 * @param hoy fecha operativa del módulo (getFechaOperativa)
 * @param ultimoCierre fecha del último cierre cargado (≤ hoy), o null si no hay
 */
export function quincenasConsultables(hoy: string, ultimoCierre: string | null): OpcionQuincena[] {
  const actual = quincenaDe(hoy);
  const anterior = quincenaDe(diaAnterior(actual.ini));
  // Hasta dónde hay datos: el último cierre, nunca después de la fecha operativa.
  const tope = ultimoCierre ? (ultimoCierre < hoy ? ultimoCierre : hoy) : "";

  const hayEnActual = tope >= actual.ini;
  const finActual = hayEnActual ? (tope < actual.fin ? tope : actual.fin) : actual.ini;

  const hayEnAnterior = tope >= anterior.ini;
  // Normalmente la anterior va completa; si el sistema aún no tiene sus
  // últimos cierres (p. ej. el día 16 temprano), llega hasta el último.
  const finAnterior = hayEnAnterior && tope < anterior.fin ? tope : anterior.fin;

  return [
    {
      clave: "actual",
      etiqueta: `Quincena actual · ${rangoQuincena(actual.ini, actual.fin)}`,
      nota: hayEnActual ? `con cierres hasta el ${diaYMes(finActual)}` : "todavía sin cierres",
      ini: actual.ini,
      fin: finActual,
      disponible: hayEnActual,
    },
    {
      clave: "anterior",
      etiqueta: `Quincena anterior · ${rangoQuincena(anterior.ini, anterior.fin)}`,
      nota:
        hayEnAnterior && finAnterior < anterior.fin
          ? `con cierres hasta el ${diaYMes(finAnterior)}`
          : hayEnAnterior
            ? "completa"
            : "sin cierres",
      ini: anterior.ini,
      fin: finAnterior,
      disponible: hayEnAnterior,
    },
  ];
}

/**
 * La quincena pedida (?q=) si se puede consultar; si no, la actual cuando ya
 * tiene cierres y, si no, la anterior. null si ninguna tiene cierres.
 */
export function elegirQuincena(opciones: OpcionQuincena[], pedida: string | null | undefined): OpcionQuincena | null {
  const disponibles = opciones.filter((o) => o.disponible);
  return disponibles.find((o) => o.clave === pedida) ?? disponibles[0] ?? null;
}
