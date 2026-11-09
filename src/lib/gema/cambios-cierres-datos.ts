/**
 * Lectura de `gema_cambios_cierres` (ver cambios-cierres.ts). Solo servidor:
 * lo llaman páginas que ya verificaron el permiso, así que no va en un módulo
 * "use server" (eso lo expondría como acción a cualquier sesión).
 *
 * Si la migración 20261109151810 no está aplicada, todo devuelve vacío con
 * `disponible: false` y las páginas siguen funcionando.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { CampoVigilado, TipoCambio } from "./cambios-cierres";

export type CambioGuardado = {
  id: number;
  corrida_id: number | null;
  detectado_at: string;
  fecha: string;
  cod_conductor: string;
  conductor_nombre: string | null;
  ruta: string;
  tipo: TipoCambio;
  cambios: Partial<Record<CampoVigilado, [number | null, number | null]>>;
  delta_neto: number;
  revisado_at: string | null;
  revisado_por: string | null;
};

export type CambiosCierres = {
  disponible: boolean;
  filas: CambioGuardado[];
  /** Total de pendientes (aunque `filas` venga recortado). */
  pendientes: number;
  /** Suma del delta neto de los pendientes. */
  deltaPendiente: number;
};

const COLUMNAS =
  "id, corrida_id, detectado_at, fecha, cod_conductor, conductor_nombre, ruta, tipo, cambios, delta_neto, revisado_at, revisado_por";

const normaliza = (r: CambioGuardado): CambioGuardado => ({ ...r, delta_neto: Number(r.delta_neto ?? 0) });

/**
 * Para Tesorería › Parámetros: pendientes primero (de la fecha más vieja a la
 * más nueva) y luego los últimos revisados.
 */
export async function getCambiosCierres(max = 500): Promise<CambiosCierres> {
  const db = createAdminClient();
  const pend = await db
    .from("gema_cambios_cierres")
    .select(COLUMNAS, { count: "exact" })
    .is("revisado_at", null)
    .order("fecha", { ascending: true })
    .order("cod_conductor", { ascending: true })
    .limit(max);
  if (pend.error) return { disponible: false, filas: [], pendientes: 0, deltaPendiente: 0 };

  const revisados = await db
    .from("gema_cambios_cierres")
    .select(COLUMNAS)
    .not("revisado_at", "is", null)
    .order("revisado_at", { ascending: false })
    .limit(100);

  // El delta total sale de todos los pendientes, no solo de los mostrados.
  let deltaPendiente = 0;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("gema_cambios_cierres")
      .select("delta_neto")
      .is("revisado_at", null)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) break;
    for (const r of data ?? []) deltaPendiente += Number(r.delta_neto ?? 0);
    if (!data || data.length < 1000) break;
  }

  return {
    disponible: true,
    filas: [...((pend.data ?? []) as CambioGuardado[]), ...((revisados.data ?? []) as CambioGuardado[])].map(normaliza),
    pendientes: pend.count ?? 0,
    deltaPendiente: Math.round(deltaPendiente),
  };
}

/** Cambios pendientes de un conductor en un rango (aviso de Liquidación). */
export async function getCambiosPendientesConductor(
  codigo: string,
  ini: string,
  fin: string
): Promise<CambioGuardado[]> {
  const { data, error } = await createAdminClient()
    .from("gema_cambios_cierres")
    .select(COLUMNAS)
    .eq("cod_conductor", codigo)
    .is("revisado_at", null)
    .gte("fecha", ini)
    .lte("fecha", fin)
    .order("fecha", { ascending: true })
    .limit(200);
  if (error) return [];
  return ((data ?? []) as CambioGuardado[]).map(normaliza);
}
