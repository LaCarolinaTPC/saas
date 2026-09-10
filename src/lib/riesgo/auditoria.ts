/**
 * Auditoría del módulo Riesgo, sobre `tesoreria_audit_log` con módulo
 * "riesgo" — la misma bitácora general que revisa gestión en
 * Tesorería › Auditoría.
 *
 * Se registran dos cosas: quién recalculó y quién consultó. Lo segundo importa
 * porque la corrida contiene datos personales de todos los conductores: saber
 * quién los miró es la mitad de la razón para haber traído el informe dentro de
 * la aplicación en vez de seguir repartiéndolo por correo.
 *
 * Nunca bloquea la operación: si falla, queda en el log del servidor.
 */
import { logTesoreriaAudit } from "@/lib/devengados/audit";

export async function auditarCorrida(datos: {
  corridaId: string | null;
  corte: string;
  origen: "cron" | "manual";
  observaciones?: number | null;
  conductores?: number | null;
  duracionMs?: number | null;
  resultado?: "exitoso" | "fallido";
  error?: string | null;
  rol?: string | null;
  /** Para el cron, que corre sin sesión. */
  emailOverride?: string | null;
}): Promise<void> {
  await logTesoreriaAudit({
    accion: "riesgo_corrida_ejecutada",
    modulo: "riesgo",
    resultado: datos.resultado ?? "exitoso",
    rol: datos.rol ?? null,
    userEmailOverride: datos.emailOverride ?? null,
    valorNuevo: `corte ${datos.corte} · ${datos.origen}`,
    detalle: {
      corrida_id: datos.corridaId,
      corte: datos.corte,
      origen: datos.origen,
      observaciones: datos.observaciones ?? null,
      conductores: datos.conductores ?? null,
      duracion_ms: datos.duracionMs ?? null,
      error: datos.error ?? null,
    },
  });
}

export async function auditarConsulta(datos: {
  corridaId: string | null;
  corte: string | null;
  rol?: string | null;
}): Promise<void> {
  await logTesoreriaAudit({
    accion: "riesgo_consultado",
    modulo: "riesgo",
    rol: datos.rol ?? null,
    valorNuevo: datos.corte ? `corte ${datos.corte}` : "sin corrida",
    detalle: { corrida_id: datos.corridaId, corte: datos.corte },
  });
}
