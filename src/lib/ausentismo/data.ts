import { createAdminClient } from "@/lib/supabase/admin";
import {
  CONCEPTO_NO_JUSTIFICADA,
  REINCIDENCIA_DIAS,
  REINCIDENCIA_MINIMO,
  type AusentismoRegistro,
  type Concepto,
  type VehiculoOpcion,
} from "./constants";

/** Columnas del registro más la placa del maestro (solo lectura). */
const SELECT_REGISTRO = "*, vehiculos(placa)";

/**
 * Catálogo completo de conceptos, activos e inactivos, en el orden del
 * catálogo. Los inactivos hacen falta para etiquetar registros históricos;
 * el selector filtra por `activo` en el cliente.
 */
export async function getConceptos(): Promise<Concepto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ausentismo_conceptos")
    .select("key, nombre, orden, activo, cuenta_reincidencia, exige_soporte")
    .order("orden")
    .order("nombre");
  if (error) throw error;
  return (data ?? []) as Concepto[];
}

/**
 * Vehículos activos del maestro GEMA para el selector del formulario.
 * `estado = 1` es el activo (misma regla que Mantenimiento); trae la cédula
 * del conductor para preseleccionar el vehículo al elegir al ausente.
 */
export async function getVehiculosActivos(): Promise<VehiculoOpcion[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("vehiculos")
    .select("codigo, placa, cedula_conductor")
    .eq("estado", 1)
    .order("codigo");
  if (error) throw error;
  return (data ?? []) as VehiculoOpcion[];
}

/** Registros de un día (pantalla principal, como una página del Excel). */
export async function getRegistrosDia(fecha: string): Promise<AusentismoRegistro[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ausentismo_registros")
    .select(SELECT_REGISTRO)
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
    .select(SELECT_REGISTRO)
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
 * Qué cuenta como reincidencia lo dice el catálogo (`cuenta_reincidencia`);
 * vacaciones y descanso vienen marcados como programados.
 */
export async function getReincidentes(
  hasta: string,
  conceptos: Concepto[]
): Promise<Reincidente[]> {
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

  const NO_CUENTAN = new Set(
    conceptos.filter((c) => !c.cuenta_reincidencia).map((c) => c.key)
  );
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
    if (r.tipo === CONCEPTO_NO_JUSTIFICADA) acc.noJustificadas += 1;
    if (r.soporte === "pendiente") acc.soportesPendientes += 1;
    if (r.fecha > acc.ultimaFecha) acc.ultimaFecha = r.fecha;
    if (r.codigo && !acc.codigo) acc.codigo = r.codigo;
  }

  return [...porConductor.values()]
    .filter((c) => c.total >= REINCIDENCIA_MINIMO || c.soportesPendientes > 0)
    .sort((a, b) => b.total - a.total || b.soportesPendientes - a.soportesPendientes);
}
