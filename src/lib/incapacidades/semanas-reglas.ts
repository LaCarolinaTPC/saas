/**
 * Requisito de semanas cotizadas para cobrar a la EPS (migración
 * 20260929221301). La regla corre en la base (`incapacidad_requisito_semanas`)
 * y llega a la vista como `requisito_semanas`; aquí solo se lee su resultado.
 * Sin acceso a datos; se prueba con node:test.
 *
 * La EPS paga la incapacidad de origen común solo si el trabajador cotizó
 * cuatro semanas ininterrumpidas antes de su inicio (Decreto 1427 de 2022). A
 * la ARL no se le aplica: queda `no_aplica`.
 */
import type { ExpedienteVista, RequisitoSemanas } from "./expedientes";

export const ACREDITACION_MIN = 10;

type ConSemanas = Pick<ExpedienteVista, "requisito_semanas">;

/**
 * La EPS no la paga (o no se sabe): bloquea el cobro. Sin la migración la
 * columna no llega y no se bloquea nada.
 */
export function faltanSemanas(v: ConSemanas): boolean {
  return v.requisito_semanas === "no_cumple" || v.requisito_semanas === "sin_dato";
}

export const REQUISITO_SEMANAS: Record<RequisitoSemanas, { label: string; color: string }> = {
  no_aplica: { label: "No aplica (ARL)", color: "#64748B" },
  cumple: { label: "Cumple", color: "#047857" },
  acreditado: { label: "Acreditado por RRHH", color: "#0891B2" },
  no_cumple: { label: "Sin 4 semanas cotizadas", color: "#B91C1C" },
  sin_dato: { label: "Sin fecha de vinculación", color: "#B45309" },
};

export function etiquetaSemanas(r: RequisitoSemanas | null | undefined): string {
  return r ? REQUISITO_SEMANAS[r].label : "—";
}

/** Motivo que se muestra al bloquear el cobro. */
export function mensajeSemanas(v: Pick<ExpedienteVista, "requisito_semanas" | "semanas_min_cotizacion" | "dias_previos_vinculacion" | "fecha_vinculacion">): string | null {
  const semanas = v.semanas_min_cotizacion ?? 4;
  if (v.requisito_semanas === "no_cumple") {
    return `La EPS no paga esta incapacidad: el trabajador tenía ${v.dias_previos_vinculacion ?? "—"} día(s) de vinculación antes del inicio y se exigen ${semanas} semanas (${semanas * 7} días) cotizadas. Si cotizaba con otro empleador, RRHH puede acreditarlo con el certificado de la EPS.`;
  }
  if (v.requisito_semanas === "sin_dato") {
    return `No hay fecha de vinculación en el maestro para comprobar las ${semanas} semanas cotizadas que exige la EPS. Complétela en el maestro o acredite las semanas con el certificado de la EPS.`;
  }
  return null;
}

/** Solo se acredita donde hace falta: EPS que no cumple por la fecha o no tiene dato. */
export function puedeAcreditar(v: ConSemanas): boolean {
  return faltanSemanas(v);
}

export function acreditacionValida(motivo: string | null | undefined, adjuntoId: string | null | undefined): string | null {
  const m = (motivo ?? "").replace(/\s+/g, " ").trim();
  if (m.length < ACREDITACION_MIN) return `Escribe el motivo de la acreditación (mínimo ${ACREDITACION_MIN} caracteres).`;
  if (!adjuntoId) return "Elige el soporte (certificado de semanas de la EPS) cargado al expediente.";
  return null;
}
