/**
 * Día de contratación (entrega 4, I1): psicotécnica, entrevista e inducción.
 * Solo registro: Gestivo no decide nada aquí. PURO; lo que escribe está en
 * ./dia-contratacion-servidor.
 *
 * La psicotécnica se presenta en la plataforma externa (con el correo que el
 * aspirante valida en la fase 1, ./correo-psico) y Gestión Humana registra
 * aquí el resultado. La prueba propia de Gestivo se quitó el 24-nov-2026.
 */
export type ResultadoPsicoExterna = "apto" | "apto_con_observaciones" | "no_apto";

export const RESULTADOS_PSICO_EXTERNA: Record<ResultadoPsicoExterna, string> = {
  apto: "Apto",
  apto_con_observaciones: "Apto con observaciones",
  no_apto: "No apto",
};

export interface PsicoExterna {
  resultado: ResultadoPsicoExterna;
  /** Fecha de la prueba (AAAA-MM-DD). */
  fecha: string | null;
  entidad: string | null;
}

export interface PsicoVigente {
  resultado: "apto" | "no_apto" | null;
  fuente: "externa" | null;
  /** Para la lista de condiciones: «Apto (IPS Salud Vial, 20 nov)». */
  detalle: string;
}

/** La que cuenta para contratar: el resultado registrado. Con observaciones cuenta como apto. */
export function psicotecnicaVigente(externa: PsicoExterna | null): PsicoVigente {
  if (!externa) return { resultado: null, fuente: null, detalle: "Sin resultado registrado" };
  return {
    resultado: externa.resultado === "no_apto" ? "no_apto" : "apto",
    fuente: "externa",
    detalle: `${RESULTADOS_PSICO_EXTERNA[externa.resultado]} (${externa.entidad?.trim() || "registrada a mano"}${externa.fecha ? `, ${externa.fecha}` : ""})`,
  };
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
