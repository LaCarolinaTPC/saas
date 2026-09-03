import { createAdminClient } from "@/lib/supabase/admin";
import {
  CONCEPTO_NO_JUSTIFICADA,
  HISTORIAL_LIMITE,
  REINCIDENCIA_DIAS,
  REINCIDENCIA_MINIMO,
  nivelAlertaReincidente,
  type AusentismoRegistro,
  type NivelAlerta,
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
    .limit(HISTORIAL_LIMITE);
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

/** Una ausencia del conductor dentro de la ventana, para el detalle y las exportaciones. */
export interface AusenciaReincidente {
  id: string;
  fecha: string;
  tipo: string;
  soporte: string;
  justificacion: string | null;
  codigo_vehiculo: string | null;
  placa: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  /** El concepto cuenta para la reincidencia (no es programado). */
  cuenta: boolean;
  noJustificada: boolean;
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
  alerta: NivelAlerta | null;
  ausencias: AusenciaReincidente[];
}

const ORDEN_ALERTA: Record<string, number> = { critica: 0, alta: 1 };

/**
 * Reincidentes calculados del propio registro (reemplaza la hoja
 * "reincidentes" del Excel): conductores con `minimo` o más ausencias en los
 * `ventana` días anteriores al corte, o con soportes pendientes. Qué cuenta
 * como reincidencia lo dice el catálogo (`cuenta_reincidencia`); vacaciones y
 * descanso vienen marcados como programados. Cada uno lleva su nivel de
 * alerta de no justificado y el detalle de sus ausencias.
 */
export async function getReincidentes(
  hasta: string,
  conceptos: Concepto[],
  opts: { ventana?: number; minimo?: number } = {}
): Promise<Reincidente[]> {
  const ventana = opts.ventana ?? REINCIDENCIA_DIAS;
  const minimo = opts.minimo ?? REINCIDENCIA_MINIMO;
  const supabase = createAdminClient();
  const desdeMs =
    new Date(`${hasta}T12:00:00-05:00`).getTime() -
    (ventana - 1) * 24 * 3600 * 1000;
  const desde = new Date(desdeMs).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("ausentismo_registros")
    .select(
      "id, cedula, codigo, nombre, telefono, fecha, tipo, soporte, justificacion, " +
      "codigo_vehiculo, fecha_inicio, fecha_fin, vehiculos(placa)"
    )
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .limit(5000);
  if (error) throw error;

  const NO_CUENTAN = new Set(
    conceptos.filter((c) => !c.cuenta_reincidencia).map((c) => c.key)
  );
  type Fila = Omit<AusenciaReincidente, "placa" | "cuenta" | "noJustificada"> & {
    cedula: string; codigo: string | null; nombre: string; telefono: string | null;
    vehiculos?: { placa: string | null } | null;
  };
  const porConductor = new Map<string, Reincidente>();
  for (const r of (data ?? []) as unknown as Fila[]) {
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
          alerta: null,
          ausencias: [],
        })
      );
    }
    const cuenta = !NO_CUENTAN.has(r.tipo);
    const noJustificada = r.tipo === CONCEPTO_NO_JUSTIFICADA;
    if (cuenta) {
      acc.total += 1;
      acc.tipos[r.tipo] = (acc.tipos[r.tipo] ?? 0) + 1;
    }
    if (noJustificada) acc.noJustificadas += 1;
    if (r.soporte === "pendiente") acc.soportesPendientes += 1;
    if (r.fecha > acc.ultimaFecha) acc.ultimaFecha = r.fecha;
    if (r.codigo && !acc.codigo) acc.codigo = r.codigo;
    if (r.telefono && !acc.telefono) acc.telefono = r.telefono;
    acc.ausencias.push({
      id: r.id, fecha: r.fecha, tipo: r.tipo, soporte: r.soporte, justificacion: r.justificacion,
      codigo_vehiculo: r.codigo_vehiculo, placa: r.vehiculos?.placa ?? null,
      fecha_inicio: r.fecha_inicio, fecha_fin: r.fecha_fin, cuenta, noJustificada,
    });
  }

  return [...porConductor.values()]
    .filter((c) => c.total >= minimo || c.soportesPendientes > 0)
    .map((c) => ({ ...c, alerta: nivelAlertaReincidente(c) }))
    .sort((a, b) =>
      (ORDEN_ALERTA[a.alerta ?? ""] ?? 2) - (ORDEN_ALERTA[b.alerta ?? ""] ?? 2) ||
      b.noJustificadas - a.noJustificadas ||
      b.total - a.total ||
      b.soportesPendientes - a.soportesPendientes
    );
}
