/**
 * Prueba psicosensotécnica — quién puede presentarla (PURO).
 *
 * Una asignación (fila «asignado» puesta por una persona de la empresa) es una
 * autorización expresa: vale aunque la cédula no tenga proceso de selección y
 * aunque ya haya gastado sus intentos. Así se concede un intento extra.
 */

import type { ConfigPsico } from "./config";

/** Una prueba a medias se puede retomar durante este tiempo; después queda abandonada. */
export const VIDA_EN_CURSO_MS = 24 * 3600_000;

export interface SituacionCedula {
  /** El equipo desde el que entra está vinculado (o no se exige). */
  equipoValido: boolean;
  /** Tiene una prueba asignada sin presentar. */
  tieneAsignacion: boolean;
  /** Tiene una prueba a medias que todavía se puede retomar. */
  enCurso: boolean;
  /** Tiene un proceso de selección abierto o una ficha de candidato. */
  esCandidato: boolean;
  /** Pruebas terminadas y no anuladas. */
  terminadas: number;
}

export type MotivoRechazo = "inactiva" | "equipo" | "no_candidato" | "sin_intentos";

export const MENSAJE_RECHAZO: Record<MotivoRechazo, string> = {
  inactiva: "La prueba no está disponible en este momento.",
  equipo: "Esta prueba solo se presenta en un equipo de la empresa.",
  no_candidato: "No encontramos una prueba pendiente para esa cédula. Comuníquese con el área de selección.",
  sin_intentos: "Ya presentó la prueba. Si necesita repetirla, comuníquese con el área de selección.",
};

export function puedePresentar(config: ConfigPsico, s: SituacionCedula): { ok: true } | { ok: false; motivo: MotivoRechazo } {
  const no = (motivo: MotivoRechazo) => ({ ok: false as const, motivo });
  if (!config.activo) return no("inactiva");
  if (config.exigirEquipoVinculado && !s.equipoValido) return no("equipo");
  if (s.tieneAsignacion || s.enCurso) return { ok: true };
  if (config.acceso === "solo_candidatos" && !s.esCandidato) return no("no_candidato");
  if (s.terminadas >= config.intentosMaximos) return no("sin_intentos");
  return { ok: true };
}

export const enCursoVigente = (iniciadoEn: string | null, ahora: Date): boolean =>
  !!iniciadoEn && ahora.getTime() - new Date(iniciadoEn).getTime() < VIDA_EN_CURSO_MS;
