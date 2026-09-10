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
import { createAdminClient } from "@/lib/supabase/admin";
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

/** Ventana en la que no se repite el registro de una misma consulta. */
const MINUTOS_SIN_REPETIR = 5;

/**
 * Registra que alguien miró una corrida, una vez por persona, corrida y
 * ventana de cinco minutos.
 *
 * La primera versión registraba cada render del Server Component, y un solo
 * clic en Recalcular dejaba tres filas en un segundo (la acción revalida la
 * ruta y además navega). Una auditoría que hay que leer no puede estar llena
 * de repeticiones del mismo hecho: lo que importa es que consta quién entró a
 * ver los datos, no cuántas veces se repintó la pantalla.
 */
export async function auditarConsulta(datos: {
  corridaId: string | null;
  corte: string | null;
  rol?: string | null;
  /** Correo de quien consulta, para no repetir su registro. */
  userEmail?: string | null;
}): Promise<void> {
  try {
    if (datos.userEmail && datos.corridaId) {
      const desde = new Date(Date.now() - MINUTOS_SIN_REPETIR * 60_000).toISOString();
      const { data } = await createAdminClient()
        .from("tesoreria_audit_log")
        .select("id")
        .eq("modulo", "riesgo")
        .eq("accion", "riesgo_consultado")
        .eq("user_email", datos.userEmail)
        .eq("detalle->>corrida_id", datos.corridaId)
        .gte("created_at", desde)
        .limit(1);
      if (data && data.length > 0) return;
    }
  } catch (e) {
    // Si la comprobación falla se registra igual: perder el rastro es peor que
    // repetirlo.
    console.error("[riesgo] no se pudo comprobar la consulta previa:", e);
  }

  await logTesoreriaAudit({
    accion: "riesgo_consultado",
    modulo: "riesgo",
    rol: datos.rol ?? null,
    valorNuevo: datos.corte ? `corte ${datos.corte}` : "sin corrida",
    detalle: { corrida_id: datos.corridaId, corte: datos.corte },
  });
}
