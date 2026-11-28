/**
 * Exámenes médicos del aspirante (entrega 3, M1–M3). PURO: qué pasa con el
 * proceso cuando una persona registra el resultado de una fase.
 *
 * Fase 1 apta → fase 2 (cita en el laboratorio el siguiente día hábil y el
 * mensaje «examenes_fase2», en ayunas). Fase 2 apta → reconocimiento de ruta.
 * No apta → Gestivo propone cerrar con «Exámenes médicos»; lo confirma una
 * persona (regla de la entrega 1: la máquina propone, una persona decide).
 * Aplazado (el laboratorio pide repetir o completar algo: hemograma,
 * optometría…; Salud Ocupacional, 21-nov-2026) → no cierra ni avanza: queda
 * en su etapa con el motivo, para registrar después el resultado definitivo.
 * Desistió (27-nov-2026: no fue al laboratorio, dejó la fase a medias o dijo
 * que no sigue) → se cierra el proceso con «Desistimiento» y la causa.
 */

export type FaseExamen = 1 | 2;
export type ResultadoExamen = "apto" | "no_apto" | "aplazado" | "desistio";

/** Cómo se muestra cada resultado. */
export const ETIQUETA_RESULTADO: Record<ResultadoExamen | "pendiente", string> = {
  apto: "Apto",
  no_apto: "No apto",
  aplazado: "Aplazado",
  desistio: "Desistió",
  pendiente: "Sin resultado",
};

export const CAUSA_EXAMENES = "Exámenes médicos";
/** Causa de cierre cuando desiste en los exámenes (la misma de la lista de Candidatos). */
export const CAUSA_DESISTIMIENTO = "Desistimiento";

export interface ExamenGuardado {
  fase: FaseExamen;
  resultado: "pendiente" | ResultadoExamen;
  observacion?: string | null;
}

export interface EfectoExamen {
  /** Estado al que pasa el proceso; null si no cambia. */
  estado: string | null;
  /** Hay que citarlo a la fase 2 y enviarle el mensaje. */
  citarFase2: boolean;
  /** Se le propone a una persona cerrar el proceso. */
  proponeCierre: boolean;
  /** Desistió: se cierra el proceso con «Desistimiento» (27-nov-2026). */
  cerrarDesistimiento?: boolean;
}

/** Qué hacer al registrar un resultado, o el motivo por el que no se puede. */
export function efectoExamen(
  fase: FaseExamen,
  resultado: ResultadoExamen,
  estadoActual: string,
  previos: readonly ExamenGuardado[]
): EfectoExamen | { error: string } {
  if (fase !== 1 && fase !== 2) return { error: "Fase no válida." };
  if (resultado !== "apto" && resultado !== "no_apto" && resultado !== "aplazado" && resultado !== "desistio") return { error: "Elija apto, no apto, aplazado o desistió." };
  if (estadoActual === "cierre" || estadoActual === "contratado") return { error: "El proceso ya está cerrado o contratado." };
  if (fase === 2 && previos.find((e) => e.fase === 1)?.resultado !== "apto") return { error: "Primero registre la fase 1 como apta." };
  if (resultado === "desistio") return { estado: null, citarFase2: false, proponeCierre: false, cerrarDesistimiento: true };
  if (resultado === "no_apto") return { estado: null, citarFase2: false, proponeCierre: true };
  // Aplazado: ni cierra ni avanza; queda en su etapa hasta el resultado definitivo.
  if (resultado === "aplazado") return { estado: null, citarFase2: false, proponeCierre: false };
  // Solo se avanza desde la etapa que corresponde: corregir un resultado viejo no mueve el proceso hacia atrás.
  if (fase === 1) return estadoActual === "en_examenes" ? { estado: "en_examenes_fase2", citarFase2: true, proponeCierre: false } : { estado: null, citarFase2: false, proponeCierre: false };
  return estadoActual === "en_examenes_fase2" ? { estado: "reconocimiento_ruta", citarFase2: false, proponeCierre: false } : { estado: null, citarFase2: false, proponeCierre: false };
}

/** ¿Las dos fases están aptas? */
export const examenesAptos = (examenes: readonly ExamenGuardado[]): boolean =>
  ([1, 2] as const).every((f) => examenes.find((e) => e.fase === f)?.resultado === "apto");

/** Examen aplazado (a la espera del resultado definitivo), si lo hay. */
export const examenAplazado = (examenes: readonly ExamenGuardado[]): ExamenGuardado | null => examenes.find((e) => e.resultado === "aplazado") ?? null;

/** Exámenes no aptos sin cerrar todavía: lo que se le propone cerrar a una persona. */
export const examenNoApto = (examenes: readonly ExamenGuardado[]): ExamenGuardado | null => examenes.find((e) => e.resultado === "no_apto") ?? null;
