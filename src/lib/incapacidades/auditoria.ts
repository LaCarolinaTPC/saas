/**
 * Auditoría del módulo de Recuperación de incapacidades, sobre
 * `tesoreria_audit_log` con módulo "incapacidades": la bitácora general que
 * revisa gestión en Tesorería › Auditoría. La bitácora fila a fila
 * (`ausentismo_log`) la escribe la base desde los triggers.
 *
 * Se registra quién consultó porque el expediente lleva cédula, diagnóstico y
 * salario. Las consultas se deduplican por persona, objeto y ventana de cinco
 * minutos, como en Riesgo: una auditoría llena de repintados no se puede leer.
 *
 * Nunca bloquea la operación: si falla, queda en el log del servidor.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logTesoreriaAudit, type AccionAudit } from "@/lib/devengados/audit";

const MODULO = "incapacidades";
const MINUTOS_SIN_REPETIR = 5;

async function yaRegistrada(accion: AccionAudit, userEmail: string | null | undefined, clave: string, valor: string): Promise<boolean> {
  if (!userEmail) return false;
  try {
    const desde = new Date(Date.now() - MINUTOS_SIN_REPETIR * 60_000).toISOString();
    const { data } = await createAdminClient()
      .from("tesoreria_audit_log")
      .select("id")
      .eq("modulo", MODULO)
      .eq("accion", accion)
      .eq("user_email", userEmail)
      .eq(`detalle->>${clave}`, valor)
      .gte("created_at", desde)
      .limit(1);
    return !!data && data.length > 0;
  } catch (e) {
    // Si la comprobación falla se registra igual: perder el rastro es peor que repetirlo.
    console.error("[incapacidades] no se pudo comprobar la consulta previa:", e);
    return false;
  }
}

/** Alguien abrió la bandeja. Una vez por persona y filtro cada cinco minutos. */
export async function auditarConsultaBandeja(datos: {
  filtros: Record<string, string | null | undefined>;
  filas: number;
  rol?: string | null;
  userEmail?: string | null;
}): Promise<void> {
  const filtro = JSON.stringify(Object.fromEntries(Object.entries(datos.filtros).filter(([, v]) => v)));
  if (await yaRegistrada("incapacidades_consultado", datos.userEmail, "filtro", filtro)) return;
  await logTesoreriaAudit({
    accion: "incapacidades_consultado",
    modulo: MODULO,
    rol: datos.rol ?? null,
    valorNuevo: `${datos.filas} expediente(s)`,
    detalle: { filtro, filas: datos.filas },
  });
}

/** Alguien abrió un expediente. Una vez por persona y expediente cada cinco minutos. */
export async function auditarConsultaExpediente(datos: {
  expedienteId: string;
  cedula: string | null;
  nombre: string | null;
  estado: string | null;
  rol?: string | null;
  userEmail?: string | null;
}): Promise<void> {
  if (await yaRegistrada("expediente_consultado", datos.userEmail, "expediente_id", datos.expedienteId)) return;
  await logTesoreriaAudit({
    accion: "expediente_consultado",
    modulo: MODULO,
    rol: datos.rol ?? null,
    cedulaConductor: datos.cedula,
    conductorNombre: datos.nombre,
    valorNuevo: datos.estado ?? null,
    detalle: { expediente_id: datos.expedienteId },
  });
}

/** Una operación de la etapa 2 sobre un expediente: completar, homologar, ajustar, liquidar. */
export async function auditarOperacion(datos: {
  accion:
    | "expediente_completado" | "expediente_homologado" | "ajuste_liquidacion" | "liquidacion_calculada"
    | "radicacion_registrada" | "radicacion_radicada" | "radicacion_devuelta" | "radicacion_anulada"
    | "recaudo_registrado" | "recaudo_anulado" | "recaudo_aplicado" | "aplicacion_anulada"
    | "ajuste_monetario" | "ajuste_monetario_anulado" | "expediente_cerrado" | "expediente_reabierto"
    | "adjunto_subido" | "adjunto_anulado";
  /** null en las operaciones sobre un recaudo que no tocan un expediente. */
  expedienteId: string | null;
  rol?: string | null;
  resultado?: "exitoso" | "fallido";
  valor?: number | null;
  valorAnterior?: string | null;
  valorNuevo?: string | null;
  detalle: Record<string, unknown>;
}): Promise<void> {
  await logTesoreriaAudit({
    accion: datos.accion,
    modulo: MODULO,
    rol: datos.rol ?? null,
    resultado: datos.resultado ?? "exitoso",
    valor: datos.valor ?? null,
    valorAnterior: datos.valorAnterior ?? null,
    valorNuevo: datos.valorNuevo ?? null,
    detalle: { expediente_id: datos.expedienteId, ...datos.detalle },
  });
}

/**
 * Una descarga. Se audita siempre, sin deduplicar: el archivo sale de la
 * aplicación y deja de estar protegido por el permiso del módulo.
 */
export async function auditarExportacion(datos: {
  pantalla: string;
  formato: string;
  filas: number;
  archivo: string;
  rol?: string | null;
}): Promise<void> {
  await logTesoreriaAudit({
    accion: "exportacion",
    modulo: MODULO,
    rol: datos.rol ?? null,
    valorNuevo: `${datos.formato.toUpperCase()} · ${datos.pantalla} · ${datos.filas} fila(s)`,
    detalle: { pantalla: datos.pantalla, formato: datos.formato, filas: datos.filas, archivo: datos.archivo },
  });
}

export async function auditarAltaManual(datos: {
  expedienteId: string | null;
  ausentismoId: string;
  cedula: string | null;
  nombre: string | null;
  motivo: string;
  resultado?: "exitoso" | "fallido";
  error?: string | null;
  rol?: string | null;
}): Promise<void> {
  await logTesoreriaAudit({
    accion: "expediente_alta_manual",
    modulo: MODULO,
    resultado: datos.resultado ?? "exitoso",
    rol: datos.rol ?? null,
    cedulaConductor: datos.cedula,
    conductorNombre: datos.nombre,
    valorNuevo: datos.motivo,
    detalle: {
      expediente_id: datos.expedienteId,
      ausentismo_id: datos.ausentismoId,
      motivo: datos.motivo,
      error: datos.error ?? null,
    },
  });
}

export async function auditarParametro(datos: {
  clave: string;
  anterior: string | null;
  nuevo: string;
  rol?: string | null;
}): Promise<void> {
  await logTesoreriaAudit({
    accion: "incapacidades_parametro_editado",
    modulo: MODULO,
    rol: datos.rol ?? null,
    valorAnterior: datos.anterior,
    valorNuevo: datos.nuevo,
    detalle: { clave: datos.clave },
  });
}

export async function auditarCatalogo(datos: {
  entidadId: string;
  nombre: string;
  anterior: Record<string, unknown>;
  nuevo: Record<string, unknown>;
  rol?: string | null;
}): Promise<void> {
  const resumen = (o: Record<string, unknown>) =>
    Object.entries(o).map(([k, v]) => `${k}=${v ?? "—"}`).join(" · ");
  await logTesoreriaAudit({
    accion: "incapacidades_catalogo_editado",
    modulo: MODULO,
    rol: datos.rol ?? null,
    valorAnterior: resumen(datos.anterior),
    valorNuevo: resumen(datos.nuevo),
    detalle: { entidad_id: datos.entidadId, nombre: datos.nombre, anterior: datos.anterior, nuevo: datos.nuevo },
  });
}
