// Filtros de la pestaña Reincidentes: el rango de fechas que se mide y lo que
// se filtra sobre la lista ya calculada. Lógica pura (sin base ni navegador)
// para que la pantalla, las exportaciones y las pruebas usen la misma regla.

import {
  VENTANA_DEFECTO, VENTANA_MES, diasEntre, esVentana, rangoVentana, sumarDias,
} from "./constants";
import { clave } from "./matriz-reglas";
import type { Reincidente } from "./data";

/** Ventana elegida a mano: Desde y Hasta libres, sin atajo. */
export const VENTANA_RANGO = "rango";

/**
 * Rango más largo que mide la pestaña. Para años completos mes a mes está el
 * reporte histórico; aquí se lee todo el rango registro por registro.
 */
export const RANGO_REINCIDENCIA_MAX_DIAS = 366;

export interface FiltrosReincidentesUI {
  /** Inicio del rango medido (incluido). */
  desde: string;
  /** Fin del rango medido (incluido): la fecha de corte. */
  corte: string;
  /** "mes" (mes del corte) | "30" | "60" | "90" días corridos | "rango" (Desde a mano). */
  ventana: string;
  minimo: string;
  /** "" | eps | incapacidad | no_justificada (clave del concepto). */
  categoria: string;
  /** "" | alerta | terminacion | descargos | critica | alta | sin_notificar | soportes */
  criterio: string;
  /** "1": listar también a los retirados del maestro (por defecto, fuera). */
  retirados: string;
  q: string;
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const fechaValida = (f?: string | null): f is string =>
  !!f && FECHA_RE.test(f) && !Number.isNaN(Date.parse(`${f}T12:00:00Z`));

/**
 * Rango de la URL ya saneado. El corte no pasa de hoy. Con `desde` válido y
 * anterior al corte, el rango es ese (recortado a
 * `RANGO_REINCIDENCIA_MAX_DIAS`); si coincide con un atajo, se informa el
 * atajo. Sin `desde`, manda la ventana (enlaces viejos con corte y ventana).
 */
export function resolverRangoReincidentes(
  p: { desde?: string | null; corte?: string | null; ventana?: string | null },
  hoy: string
): { desde: string; corte: string; ventana: string } {
  const corte = fechaValida(p.corte) && p.corte <= hoy ? p.corte : hoy;
  const atajo = esVentana(p.ventana ?? undefined) ? p.ventana! : VENTANA_DEFECTO;

  if (fechaValida(p.desde) && p.desde <= corte) {
    const minimo = sumarDias(corte, -(RANGO_REINCIDENCIA_MAX_DIAS - 1));
    const desde = p.desde < minimo ? minimo : p.desde;
    if (p.ventana !== VENTANA_RANGO && rangoVentana(corte, atajo).desde === desde) {
      return { desde, corte, ventana: atajo };
    }
    return { desde, corte, ventana: VENTANA_RANGO };
  }
  return { desde: rangoVentana(corte, atajo).desde, corte, ventana: atajo };
}

/** Error de un rango puesto en el formulario, o null si sirve. */
export function errorRangoReincidentes(desde: string, corte: string, hoy: string): string | null {
  if (!fechaValida(desde) || !fechaValida(corte)) return "Ponga las dos fechas del rango.";
  if (corte > hoy) return "La fecha final no puede ser posterior a hoy.";
  if (desde > corte) return "El rango termina antes de empezar.";
  if (diasEntre(desde, corte) + 1 > RANGO_REINCIDENCIA_MAX_DIAS) {
    return `El rango pasa de ${RANGO_REINCIDENCIA_MAX_DIAS} días; para periodos más largos use el reporte histórico.`;
  }
  return null;
}

/** El rango en una frase: "el mes en curso (…)", "los 30 días anteriores al …" o "del … al …". */
export function textoRangoReincidentes(f: { desde: string; corte: string; ventana: string }): string {
  if (f.ventana === VENTANA_MES) return `el mes en curso (${f.desde} a ${f.corte})`;
  if (f.ventana === VENTANA_RANGO) return `el rango del ${f.desde} al ${f.corte}`;
  return `los ${diasEntre(f.desde, f.corte) + 1} días anteriores al ${f.corte}`;
}

/** Etiqueta corta para cabeceras: "mes", "30 d" o "2026-09-01 a 2026-10-28". */
export function etiquetaRangoReincidentes(f: { desde: string; corte: string; ventana: string }): string {
  if (f.ventana === VENTANA_MES) return "mes";
  if (f.ventana === VENTANA_RANGO) return `${f.desde} a ${f.corte}`;
  return `${f.ventana} d`;
}

/** Criterio y búsqueda se aplican sobre la lista ya calculada: es corta. */
export function filtrarReincidentes(
  lista: Reincidente[],
  f: Pick<FiltrosReincidentesUI, "criterio" | "q">
): Reincidente[] {
  const q = clave(f.q);
  return lista.filter((r) => {
    if (f.criterio === "alerta" && !r.alerta) return false;
    if (f.criterio === "terminacion" && r.alerta !== "terminacion") return false;
    if (f.criterio === "descargos" && r.alerta !== "descargos") return false;
    if (f.criterio === "critica" && r.alerta !== "critica") return false;
    if (f.criterio === "alta" && r.alerta !== "alta") return false;
    if (f.criterio === "sin_notificar" && r.pendientes.length === 0) return false;
    if (f.criterio === "soportes" && r.soportesPendientes === 0) return false;
    if (q && !clave(r.nombre).includes(q) && !r.cedula.startsWith(q) && !(r.codigo ?? "").toLowerCase().startsWith(q)) return false;
    return true;
  });
}
