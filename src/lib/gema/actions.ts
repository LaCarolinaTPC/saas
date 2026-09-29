"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { runSync, syncIngresoTercero, type SyncResult } from "./sync";

// Misma política del cron (/api/cron/sync-gema): re-sincronizar siempre una
// ventana hacia atrás porque GEMA modifica recaudos y cierres después de
// creados. Los upserts hacen el reproceso idempotente.
const BACKFILL_DESDE = "2026-01-01";
const LOOKBACK_DIAS = Number(process.env.GEMA_SYNC_LOOKBACK_DIAS ?? 45);

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoHaceDias(dias: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

export interface SincronizacionGema {
  ok: boolean;
  rango?: { from: string; to: string };
  results?: SyncResult[];
  error?: string;
}

/**
 * Sincronización manual de GEMA desde la interfaz (mismo trabajo que el
 * cron diario). Solo administradores: mueve datos de toda la aplicación.
 */
export async function sincronizarGema(): Promise<SincronizacionGema> {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) {
    return { ok: false, error: "Solo un administrador puede sincronizar con GEMA." };
  }

  const to = hoyISO();
  const db = createAdminClient();
  const { data } = await db
    .from("gema_sync_state")
    .select("last_synced_date")
    .eq("dataset", "cierres")
    .maybeSingle();
  const marcador = (data?.last_synced_date as string | null) ?? BACKFILL_DESDE;
  const lookback = isoHaceDias(LOOKBACK_DIAS);
  let from = marcador < lookback ? marcador : lookback;
  if (from < BACKFILL_DESDE) from = BACKFILL_DESDE;

  try {
    const results = await runSync(from, to);
    const errores = results.filter((r) => r.error);
    await logTesoreriaAudit({
      accion: "sincronizacion_gema",
      modulo: "sincronizacion",
      resultado: errores.length ? "fallido" : "exitoso",
      rol: perms.userType,
      detalle: {
        rango: { from, to },
        filas: results.map((r) => ({ dataset: r.dataset, rows: r.rows, error: r.error ?? null })),
      },
    });
    revalidatePath("/tesoreria/devengados");
    revalidatePath("/tesoreria/devengados/analisis");
    revalidatePath("/tesoreria/devengados/entregas");
    revalidatePath("/tesoreria/devengados/parametros");
    return { ok: errores.length === 0, rango: { from, to }, results };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logTesoreriaAudit({
      accion: "sincronizacion_gema",
      modulo: "sincronizacion",
      resultado: "fallido",
      rol: perms.userType,
      detalle: { error: msg },
    });
    return { ok: false, error: msg };
  }
}

export interface RecargaMes {
  ok: boolean;
  mes: string;
  /** Filas que entregó GEMA para el mes. */
  filas?: number;
  /** Filas del mes en la base y cuántas quedaron con pago de obligaciones. */
  enBase?: number;
  conObligaciones?: number;
  error?: string;
}

/** Primer y último día (AAAA-MM-DD) de un mes AAAA-MM. */
function limitesMes(mes: string): { ini: string; fin: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return null;
  const anio = Number(m[1]);
  const num = Number(m[2]);
  if (num < 1 || num > 12) return null;
  const ultimo = new Date(Date.UTC(anio, num, 0)).getUTCDate();
  return { ini: `${mes}-01`, fin: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

/**
 * Recarga de ingreso tercero para un mes completo (la usa Parámetros para
 * llenar el pago de obligaciones del histórico: GEMA lo entrega desde que GMAS
 * lo agregó, pero la corrida diaria solo repasa 45 días). Un mes por llamada
 * para no pasar el tiempo máximo de la función; el upsert la hace repetible.
 * No mueve el marcador de gema_sync_state. Solo administradores.
 */
export async function recargarIngresoTerceroMes(mes: string): Promise<RecargaMes> {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) {
    return { ok: false, mes, error: "Solo un administrador puede recargar datos de GEMA." };
  }
  const lim = limitesMes(mes);
  if (!lim || lim.ini < BACKFILL_DESDE || lim.ini > hoyISO()) {
    return { ok: false, mes, error: `Mes fuera de rango (desde ${BACKFILL_DESDE.slice(0, 7)} hasta el actual).` };
  }
  const fin = lim.fin > hoyISO() ? hoyISO() : lim.fin;
  const db = createAdminClient();
  try {
    const r = await syncIngresoTercero(db, lim.ini, fin, { actualizarEstado: false });
    const base = () =>
      db.from("ingreso_tercero").select("id", { count: "exact", head: true })
        .gte("fecha", lim.ini).lte("fecha", fin);
    const [{ count: enBase }, { count: conObligaciones }] = await Promise.all([
      base(),
      base().not("descuentos_otros", "is", null),
    ]);
    const res = { ok: true, mes, filas: r.rows, enBase: enBase ?? 0, conObligaciones: conObligaciones ?? 0 };
    await logTesoreriaAudit({
      accion: "sincronizacion_gema",
      modulo: "sincronizacion",
      resultado: "exitoso",
      rol: perms.userType,
      detalle: { tipo: "recarga_ingreso_tercero", rango: { from: lim.ini, to: fin }, ...res },
    });
    revalidatePath("/tesoreria/liquidacion-afiliados");
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logTesoreriaAudit({
      accion: "sincronizacion_gema",
      modulo: "sincronizacion",
      resultado: "fallido",
      rol: perms.userType,
      detalle: { tipo: "recarga_ingreso_tercero", mes, error: msg },
    });
    return { ok: false, mes, error: msg };
  }
}

export interface EstadoSyncGema {
  dataset: string;
  last_synced_date: string | null;
  last_run_at: string | null;
  rows_synced: number | null;
  status: string | null;
  error: string | null;
}

/** Estado de la última sincronización por dataset (pantalla de parámetros). */
export async function getEstadoSyncGema(): Promise<EstadoSyncGema[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("gema_sync_state")
    .select("dataset, last_synced_date, last_run_at, rows_synced, status, error")
    .order("dataset");
  if (error) return [];
  return (data ?? []) as EstadoSyncGema[];
}
