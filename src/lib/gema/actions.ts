"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { runSync, type SyncResult } from "./sync";

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
