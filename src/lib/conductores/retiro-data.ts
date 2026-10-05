/** Conductores · causa de retiro — lectura (solo servidor). */
import { createAdminClient } from "@/lib/supabase/admin";
import type { RetiroRegistrado } from "./retiro";

export const RETIRO_SELECT =
  "cedula, fecha_retiro, causa, nota, registrado_por_email, registrado_at, actualizado_por_email, actualizado_at";

export interface RetiroRow {
  cedula: string;
  fecha_retiro: string | null;
  causa: string;
  nota: string | null;
  registrado_por_email: string | null;
  registrado_at: string;
  actualizado_por_email: string | null;
  actualizado_at: string;
}

export function mapRetiro(r: RetiroRow): RetiroRegistrado {
  return {
    cedula: r.cedula,
    fechaRetiro: r.fecha_retiro,
    causa: r.causa,
    nota: r.nota,
    registradoPor: r.registrado_por_email,
    registradoAt: r.registrado_at,
    actualizadoPor: r.actualizado_por_email,
    actualizadoAt: r.actualizado_at,
  };
}

/**
 * Todos los retiros registrados, por cédula. Si la migración no está
 * aplicada devuelve `disponible: false` en vez de tumbar la pantalla.
 */
export async function getRetiros(): Promise<{ disponible: boolean; porCedula: Record<string, RetiroRegistrado[]> }> {
  const db = createAdminClient();
  const porCedula: Record<string, RetiroRegistrado[]> = {};
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("conductores_retiro")
      .select(RETIRO_SELECT)
      .order("cedula")
      .order("registrado_at")
      .range(from, from + PAGE - 1);
    if (error) return { disponible: false, porCedula: {} };
    const rows = (data ?? []) as RetiroRow[];
    for (const r of rows) (porCedula[r.cedula] ??= []).push(mapRetiro(r));
    if (rows.length < PAGE) break;
  }
  return { disponible: true, porCedula };
}

/** Retiros registrados de un conductor (para su ficha). */
export async function getRetirosDe(cedula: string): Promise<{ disponible: boolean; registros: RetiroRegistrado[] }> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("conductores_retiro")
    .select(RETIRO_SELECT)
    .eq("cedula", cedula)
    .order("registrado_at");
  if (error) return { disponible: false, registros: [] };
  return { disponible: true, registros: ((data ?? []) as RetiroRow[]).map(mapRetiro) };
}
