import { createAdminClient } from "@/lib/supabase/admin";
import {
  REINCIDENCIA_DIAS,
  REINCIDENCIA_MINIMO,
  type AusentismoRegistro,
} from "./constants";

/** Registros de un día (pantalla principal, como una página del Excel). */
export async function getRegistrosDia(fecha: string): Promise<AusentismoRegistro[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ausentismo_registros")
    .select("*")
    .eq("fecha", fecha)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AusentismoRegistro[];
}

/** Historial por rango, con filtros opcionales de tipo y búsqueda. */
export async function getHistorial(filtros: {
  desde: string;
  hasta: string;
  tipo?: string | null;
  q?: string | null;
}): Promise<AusentismoRegistro[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("ausentismo_registros")
    .select("*")
    .gte("fecha", filtros.desde)
    .lte("fecha", filtros.hasta)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  if (filtros.tipo) query = query.eq("tipo", filtros.tipo);
  if (filtros.q) {
    const q = filtros.q.trim();
    if (/^\d+$/.test(q)) {
      query = query.or(`cedula.like.${q}%,codigo.eq.${q}`);
    } else {
      query = query.ilike("nombre", `%${q}%`);
    }
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AusentismoRegistro[];
}

export interface Reincidente {
  cedula: string;
  codigo: string | null;
  nombre: string;
  telefono: string | null;
  total: number;
  noJustificadas: number;
  soportesPendientes: number;
  tipos: Record<string, number>;
  ultimaFecha: string;
}

/**
 * Reincidentes calculados del propio registro (reemplaza la hoja
 * "reincidentes" del Excel): conductores con REINCIDENCIA_MINIMO o más
 * ausencias en los últimos REINCIDENCIA_DIAS días, o con soportes pendientes.
 * Vacaciones y descanso no cuentan como reincidencia (son programadas).
 */
export async function getReincidentes(hasta: string): Promise<Reincidente[]> {
  const supabase = createAdminClient();
  const desdeMs =
    new Date(`${hasta}T12:00:00-05:00`).getTime() -
    (REINCIDENCIA_DIAS - 1) * 24 * 3600 * 1000;
  const desde = new Date(desdeMs).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("ausentismo_registros")
    .select("cedula, codigo, nombre, telefono, fecha, tipo, soporte")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .limit(5000);
  if (error) throw error;

  const NO_CUENTAN = new Set(["vacaciones", "descanso"]);
  const porConductor = new Map<string, Reincidente>();
  for (const r of data ?? []) {
    let acc = porConductor.get(r.cedula);
    if (!acc) {
      porConductor.set(
        r.cedula,
        (acc = {
          cedula: r.cedula,
          codigo: r.codigo,
          nombre: r.nombre,
          telefono: r.telefono,
          total: 0,
          noJustificadas: 0,
          soportesPendientes: 0,
          tipos: {},
          ultimaFecha: r.fecha,
        })
      );
    }
    if (!NO_CUENTAN.has(r.tipo)) {
      acc.total += 1;
      acc.tipos[r.tipo] = (acc.tipos[r.tipo] ?? 0) + 1;
    }
    if (r.tipo === "no_justificada") acc.noJustificadas += 1;
    if (r.soporte === "pendiente") acc.soportesPendientes += 1;
    if (r.fecha > acc.ultimaFecha) acc.ultimaFecha = r.fecha;
    if (r.codigo && !acc.codigo) acc.codigo = r.codigo;
  }

  return [...porConductor.values()]
    .filter((c) => c.total >= REINCIDENCIA_MINIMO || c.soportesPendientes > 0)
    .sort((a, b) => b.total - a.total || b.soportesPendientes - a.soportesPendientes);
}
