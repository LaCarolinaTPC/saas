/**
 * Auditoría de la Matriz de Ausentismo. Cada movimiento deja dos rastros:
 *
 *  - `ausentismo_log`: la bitácora propia del módulo, con la fila completa
 *    antes y después (respaldo detallado).
 *  - `tesoreria_audit_log` con módulo "ausentismo": la auditoría general de la
 *    aplicación (Tesorería · Auditoría), donde gestión revisa quién hizo qué.
 *
 * Nunca bloquea la operación de negocio: si falla, queda en el log del servidor.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import type { MatrizFila } from "./matriz";

export type AccionMatriz =
  | "incapacidad_registrada"
  | "incapacidad_editada"
  | "incapacidad_eliminada"
  | "incapacidad_restaurada";

/** Columnas que se comparan para el detalle de "qué cambió". */
const CAMPOS_COMPARABLES: (keyof MatrizFila)[] = [
  "consecutivo_incapacidad", "indicador_prorroga", "dias_it_pagados", "origen",
  "fecha_inicio", "fecha_fin", "eps", "arl", "ips", "profesional_responsable",
  "tipo_conductor", "cie10", "diagnostico", "soat", "grd", "estado_registro",
];

/** Resumen de una línea de la incapacidad, para las columnas "valor ant. → nuevo". */
export function resumenIncapacidad(f: Partial<MatrizFila> | null | undefined): string | null {
  if (!f) return null;
  const partes = [
    f.origen ?? null,
    f.fecha_inicio && f.fecha_fin ? `${f.fecha_inicio}→${f.fecha_fin}` : null,
    f.dias_it_pagados != null ? `${f.dias_it_pagados}d` : null,
    f.arl ?? f.eps ?? null,
    f.cie10 ?? null,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

/** Pares campo → {antes, despues} con lo que realmente cambió. */
export function diferencias(
  antes: Partial<MatrizFila> | null,
  despues: Partial<MatrizFila> | null
): Record<string, { antes: unknown; despues: unknown }> {
  const out: Record<string, { antes: unknown; despues: unknown }> = {};
  if (!antes || !despues) return out;
  for (const k of CAMPOS_COMPARABLES) {
    const a = antes[k] ?? null;
    const d = despues[k] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(d)) out[k] = { antes: a, despues: d };
  }
  return out;
}

export interface MovimientoMatriz {
  accion: AccionMatriz;
  registroId: string;
  /** Fila completa antes del cambio (null al registrar). */
  anterior: Partial<MatrizFila> | null;
  /** Fila completa después del cambio. */
  nuevo: Partial<MatrizFila> | null;
  motivo?: string | null;
  /** Marcas extra para el detalle (solape confirmado, fila reutilizada…). */
  extra?: Record<string, unknown>;
  userId: string | null;
  userEmail: string | null;
  rol?: string | null;
}

export async function auditarMatriz(m: MovimientoMatriz): Promise<void> {
  const fila = m.nuevo ?? m.anterior;
  await Promise.all([
    escribirBitacora(m),
    logTesoreriaAudit({
      accion: m.accion,
      modulo: "ausentismo",
      cedulaConductor: fila?.cedula ?? null,
      conductorNombre: fila?.nombre ?? null,
      valor: fila?.dias_it_pagados ?? null,
      rol: m.rol ?? null,
      valorAnterior: resumenIncapacidad(m.anterior),
      valorNuevo: resumenIncapacidad(m.nuevo),
      detalle: {
        registro_id: m.registroId,
        motivo: m.motivo ?? null,
        consecutivo: fila?.consecutivo_incapacidad ?? null,
        estado_registro: m.nuevo?.estado_registro ?? m.anterior?.estado_registro ?? null,
        origen_registro: fila?.origen_registro ?? null,
        ...(m.accion === "incapacidad_editada" ? { cambios: diferencias(m.anterior, m.nuevo) } : {}),
        ...m.extra,
      },
    }),
  ]);
}

async function escribirBitacora(m: MovimientoMatriz) {
  try {
    const supabase = createAdminClient();
    await supabase.from("ausentismo_log").insert({
      registro_id: m.registroId,
      accion: m.accion,
      datos_anteriores: m.anterior ?? null,
      datos_nuevos: m.nuevo ? { ...m.nuevo, motivo: m.motivo ?? undefined } : null,
      user_id: m.userId,
      user_email: m.userEmail,
    });
  } catch (e) {
    console.error("[matriz] no se pudo escribir la bitácora:", e);
  }
}

/** Alta de un valor del catálogo desde el formulario, también en la auditoría general. */
export async function auditarCatalogoCreado(
  item: { tipo: string; nombre: string; codigo: string | null; relacionado: string | null },
  rol?: string | null
): Promise<void> {
  await logTesoreriaAudit({
    accion: "catalogo_ausentismo_creado",
    modulo: "ausentismo",
    rol: rol ?? null,
    valorNuevo: `${item.tipo}: ${item.codigo ? `${item.codigo} · ` : ""}${item.nombre}`,
    detalle: { ...item },
  });
}
