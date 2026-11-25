/**
 * Recordatorio del certificado bancario (24-nov-2026). PURO.
 *
 * Los salarios se pagan en una cuenta del Banco de Bogotá. Tras la respuesta a
 * la pregunta del banco (fase 1) se le pidió el certificado: si dijo que tiene
 * cuenta, de una vez; si no, después de abrirla con la carta. Si no llega, se
 * le recuerda cada `horas` (la primera vez, a quien no tenía cuenta, después de
 * `esperaApertura`), hasta `recordatorios` veces; después el chat queda para
 * una persona. Se detiene en cuanto envía un certificado (aunque falte que
 * Gestión Humana lo revise) o el ítem de la carpeta deja de estar pendiente.
 */

export const ITEM_CERTIFICADO = "Certificado bancario";

export interface AjustesCertificado {
  activo: boolean;
  horas: number;
  recordatorios: number;
  /** Horas antes del primer recordatorio a quien no tenía cuenta (tiene que abrirla). */
  esperaApertura: number;
}

export const AJUSTES_CERTIFICADO_POR_DEFECTO: AjustesCertificado = { activo: true, horas: 48, recordatorios: 3, esperaApertura: 72 };

export function ajustesCertificado(valor: (clave: string) => unknown): AjustesCertificado {
  const n = (v: unknown, def: number, min: number, max: number) => {
    const x = Number(v);
    return v === undefined || v === null || v === "" || !Number.isFinite(x) ? def : Math.min(Math.max(x, min), max);
  };
  const activo = valor("certificado_banco_activo");
  const d = AJUSTES_CERTIFICADO_POR_DEFECTO;
  return {
    activo: activo === undefined || activo === null ? d.activo : activo === true || activo === "true",
    horas: n(valor("certificado_banco_horas"), d.horas, 1, 24 * 14),
    recordatorios: Math.round(n(valor("certificado_banco_recordatorios"), d.recordatorios, 0, 10)),
    esperaApertura: n(valor("certificado_banco_espera_apertura_horas"), d.esperaApertura, 1, 24 * 30),
  };
}

/** Etapas en las que se espera el certificado (de la fase 1 a contratar). */
export const ESTADOS_CERTIFICADO = ["en_examenes", "en_examenes_fase2", "reconocimiento_ruta"] as const;

export interface SituacionCertificado {
  estado: string;
  banco_cuenta: "si" | "no" | string | null;
  banco_respondido_at: string | null;
  /** Estado del ítem «Certificado bancario» de la carpeta (sin fila = pendiente). */
  itemEstado: string | null;
  /** Ya mandó un certificado (leído), aunque falte revisarlo. */
  enviado: boolean;
  /** Recordatorios que ya salieron y el último. */
  recordatorios: number;
  ultimoAt: string | null;
  escalado: boolean;
}

export type AccionCertificado = "recordar" | "escalar" | null;

export function accionCertificado(s: SituacionCertificado, a: AjustesCertificado, ahora: Date): AccionCertificado {
  if (!a.activo) return null;
  if (!(ESTADOS_CERTIFICADO as readonly string[]).includes(s.estado)) return null;
  if ((s.banco_cuenta !== "si" && s.banco_cuenta !== "no") || !s.banco_respondido_at) return null;
  if ((s.itemEstado ?? "pendiente") !== "pendiente" || s.enviado || s.escalado) return null;
  const base = s.ultimoAt ?? s.banco_respondido_at;
  const espera = s.ultimoAt ? a.horas : s.banco_cuenta === "no" ? a.esperaApertura : a.horas;
  if (ahora.getTime() - new Date(base).getTime() < espera * 3_600_000) return null;
  return s.recordatorios < a.recordatorios ? "recordar" : "escalar";
}
