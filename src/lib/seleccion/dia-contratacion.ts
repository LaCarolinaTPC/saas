/**
 * Día de contratación (entrega 4, I1): psicotécnica, entrevista e inducción.
 * Solo registro: Gestivo no decide nada aquí. PURO; lo que escribe está en
 * ./dia-contratacion-servidor.
 *
 * La psicotécnica puede venir de dos lados: la prueba psicosensotécnica de
 * Gestivo (psico_intentos, con el concepto de la psicóloga) o un resultado de
 * una IPS registrado a mano. Para contratar vale el más reciente.
 */
import { horaBogota } from "@/lib/comunicaciones/seguimiento";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import { citaVigente, hhmm, type AjustesAgenda, type Cita } from "./agenda";

export type ResultadoPsicoExterna = "apto" | "apto_con_observaciones" | "no_apto";

export const RESULTADOS_PSICO_EXTERNA: Record<ResultadoPsicoExterna, string> = {
  apto: "Apto",
  apto_con_observaciones: "Apto con observaciones",
  no_apto: "No apto",
};

export interface PsicoGestivo {
  concepto: "apto" | "no_apto";
  /** Cuándo dio el concepto la psicóloga (ISO). */
  en: string | null;
}

export interface PsicoExterna {
  resultado: ResultadoPsicoExterna;
  /** Fecha de la prueba (AAAA-MM-DD). */
  fecha: string | null;
  entidad: string | null;
}

export interface PsicoVigente {
  resultado: "apto" | "no_apto" | null;
  fuente: "gestivo" | "externa" | null;
  /** Para la lista de condiciones: «Apto (IPS Salud Vial, 20 nov)». */
  detalle: string;
}

/** La que cuenta para contratar: la más reciente de las dos. Con observaciones cuenta como apto. */
export function psicotecnicaVigente(gestivo: PsicoGestivo | null, externa: PsicoExterna | null): PsicoVigente {
  const deExterna = (e: PsicoExterna): PsicoVigente => ({
    resultado: e.resultado === "no_apto" ? "no_apto" : "apto",
    fuente: "externa",
    detalle: `${RESULTADOS_PSICO_EXTERNA[e.resultado]} (${e.entidad?.trim() || "registrada a mano"}${e.fecha ? `, ${e.fecha}` : ""})`,
  });
  const deGestivo = (g: PsicoGestivo): PsicoVigente => ({
    resultado: g.concepto,
    fuente: "gestivo",
    detalle: `${g.concepto === "apto" ? "Apto" : "No apto"} (prueba de Gestivo)`,
  });
  if (gestivo && externa) {
    // La de Gestivo se compara por el día del concepto (hora de Bogotá).
    const diaGestivo = gestivo.en ? fechaBogota(gestivo.en) : "";
    return (externa.fecha ?? "") >= diaGestivo ? deExterna(externa) : deGestivo(gestivo);
  }
  if (externa) return deExterna(externa);
  if (gestivo) return deGestivo(gestivo);
  return { resultado: null, fuente: null, detalle: "Sin concepto de psicología" };
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Valida el resultado de una IPS antes de guardarlo. */
export function validarPsicoExterna(
  d: { resultado?: unknown; fecha?: unknown; puntaje?: unknown; entidad?: unknown },
  hoy: string
): { ok: true; valor: { resultado: ResultadoPsicoExterna; fecha: string; puntaje: number | null; entidad: string | null } } | { ok: false; error: string } {
  const resultado = String(d.resultado ?? "");
  if (!(resultado in RESULTADOS_PSICO_EXTERNA)) return { ok: false, error: "Elija el resultado." };
  const fecha = String(d.fecha ?? "").trim();
  if (!FECHA_RE.test(fecha)) return { ok: false, error: "Escriba la fecha de la prueba." };
  if (fecha > hoy) return { ok: false, error: "La fecha de la prueba no puede ser futura." };
  const crudo = String(d.puntaje ?? "").trim().replace(",", ".");
  const puntaje = crudo ? Number(crudo) : null;
  if (puntaje != null && (!Number.isFinite(puntaje) || puntaje < 0 || puntaje > 1000)) return { ok: false, error: "El puntaje no es válido." };
  const entidad = String(d.entidad ?? "").trim().slice(0, 120) || null;
  return { ok: true, valor: { resultado: resultado as ResultadoPsicoExterna, fecha, puntaje, entidad } };
}

/**
 * ¿Toca el recordatorio de una cita de psicotécnica? Hoy, vigente, sin
 * recordatorio, desde la hora del recordatorio de citas y antes de la cita.
 */
export function tocaRecordatorioPsicotecnica(c: Cita, ahora: Date, a: Pick<AjustesAgenda, "recordatorioCitaHora">): boolean {
  if (c.tipo !== "psicotecnica" || !citaVigente(c) || c.recordatorio_at) return false;
  if (c.fecha !== fechaBogota(ahora.toISOString())) return false;
  const ya = horaBogota(ahora);
  return ya >= a.recordatorioCitaHora && ya < hhmm(c.hora);
}
