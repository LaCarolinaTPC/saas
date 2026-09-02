/**
 * Carga de la MATRIZ DE AUSENTISMO por lotes (estrategia `upsert_lote`).
 *
 * Antes la carga borraba la tabla `ausentismo` y la volvía a insertar. Desde
 * que la matriz también se captura en el formulario (migraciones
 * 20260902220946 y 20260902223110) la carga:
 *
 *   1. Hace upsert por la llave natural (cédula, fecha inicio, consecutivo).
 *   2. Respeta las filas con `origen_registro = 'formulario'`: si el Excel
 *      trae la misma incapacidad, gana la del formulario y se avisa.
 *   3. Estampa en cada fila el `lote_carga` de esta corrida y, al terminar sin
 *      errores, retira las filas de origen excel que no vinieron en el lote
 *      (las que RRHH borró del archivo), que es lo que antes hacía el
 *      delete_insert.
 *
 * Solo se usa en el servidor (service_role).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Fila = Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export function llaveAusentismo(r: {
  cedula: unknown;
  fecha_inicio: unknown;
  consecutivo_incapacidad?: unknown;
}): string {
  return `${r.cedula}|${r.fecha_inicio}|${r.consecutivo_incapacidad ?? ""}`;
}

/**
 * Separa del lote las incapacidades que ya existen capturadas en el
 * formulario. Esas no se tocan: lo digitado a mano manda sobre el Excel.
 */
export async function separarFilasDelFormulario(
  db: Db,
  records: Fila[]
): Promise<{ cargables: Fila[]; omitidas: string[] }> {
  const cedulas = [...new Set(records.map((r) => r.cedula).filter(Boolean))] as string[];
  if (cedulas.length === 0) return { cargables: records, omitidas: [] };

  const { data, error } = await db
    .from("ausentismo")
    .select("cedula, fecha_inicio, consecutivo_incapacidad, nombre")
    .eq("origen_registro", "formulario")
    .in("cedula", cedulas);
  if (error) throw new Error(`No se pudo consultar la matriz: ${error.message}`);

  const protegidas = new Map((data ?? []).map((r) => [llaveAusentismo(r), r]));
  if (protegidas.size === 0) return { cargables: records, omitidas: [] };

  const cargables: Fila[] = [];
  const omitidas: string[] = [];
  for (const r of records) {
    const p = protegidas.get(llaveAusentismo(r as { cedula: unknown; fecha_inicio: unknown; consecutivo_incapacidad?: unknown }));
    if (p) {
      omitidas.push(
        `${p.nombre ?? r.cedula} · ${r.fecha_inicio}: ya está capturada en el formulario, se conserva esa`
      );
    } else {
      cargables.push(r);
    }
  }
  return { cargables, omitidas };
}

/** Estampa el lote en cada fila y hace el upsert por la llave natural. */
export async function cargarLoteAusentismo(
  db: Db,
  records: Fila[],
  lote: string,
  onConflict: string
) {
  if (records.length === 0) return { error: null };
  const filas = records.map((r) => ({ ...r, lote_carga: lote }));
  const { error } = await db.from("ausentismo").upsert(filas, { onConflict });
  return { error };
}

/**
 * Retira las filas de origen excel que este lote no tocó: RRHH las borró del
 * archivo. Devuelve cuántas se retiraron. Llamar solo si la carga no tuvo
 * errores, o se perderían filas que simplemente fallaron al subir.
 */
export async function retirarExcelNoCargado(db: Db, lote: string): Promise<number> {
  const { data, error } = await db
    .from("ausentismo")
    .delete()
    .eq("origen_registro", "excel")
    .or(`lote_carga.is.null,lote_carga.neq.${lote}`)
    .select("id");
  if (error) throw new Error(`No se pudieron retirar las filas anteriores: ${error.message}`);
  return data?.length ?? 0;
}
