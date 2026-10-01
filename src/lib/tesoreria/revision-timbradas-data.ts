import { createAdminClient } from "@/lib/supabase/admin";
import { sumarDias } from "./calendario-pago";
import {
  EVENTO_ENTRADA, EVENTO_SALIDA, procesarDia, RESULTADOS_REVISION,
  type EstadoTimbrada, type EventoGeocerca, type ResultadoDia, type ResultadoRevision,
  type TimbradaDescontada, type ViajeDespacho, type ViajeRecaudado,
} from "./revision-timbradas-reglas";

/**
 * Lectura de la revisión de timbradas de un día desde las tablas espejo de
 * GEMA, las mismas cuatro fuentes que Tesorería descargaba a mano:
 * historico_despacho, puntos_virtuales (solo geocerca del terminal),
 * viajes_recaudados y timbradas_descontadas.
 */

const PAGE = 1000;
type Db = ReturnType<typeof createAdminClient>;

/** Lee todas las páginas de una consulta (PostgREST recorta a 1.000 filas). */
async function todas<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await armar(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));
const txt = (v: unknown): string | null => (v == null ? null : String(v).trim() || null);

async function leerDespacho(db: Db, fecha: string): Promise<ViajeDespacho[]> {
  const rows = await todas<Record<string, unknown>>((a, b) =>
    db.from("historico_despacho")
      .select("numero, viaje, placa, codigo, conductor, conductor_cod, hora_despacho, hora_llegada, estado, timbradas, ruta_programada, ruta_reprogramada")
      .eq("fecha_viaje", fecha)
      .order("numero", { ascending: true })
      .range(a, b),
  );
  return rows.map((r) => ({
    numero: Number(r.numero),
    viaje: Number(r.viaje),
    placa: String(r.placa ?? "").trim(),
    codigo: txt(r.codigo),
    conductor: txt(r.conductor),
    conductorCod: txt(r.conductor_cod),
    horaDespacho: String(r.hora_despacho ?? "").trim(),
    // Sin llegada GEMA entrega 00:00:00; un nulo se trata igual.
    horaLlegada: String(r.hora_llegada ?? "").trim() || "00:00:00",
    estado: String(r.estado ?? "").trim(),
    timbradas: num(r.timbradas),
    rutaProgramada: txt(r.ruta_programada),
    rutaReprogramada: txt(r.ruta_reprogramada),
  }));
}

/** Eventos de entrada y salida de la geocerca base (Terminal La Carolina) de la fecha y el día siguiente. */
async function leerGeocercas(db: Db, fecha: string): Promise<EventoGeocerca[]> {
  const rows = await todas<Record<string, unknown>>((a, b) =>
    db.from("puntos_virtuales")
      .select("numero, fecha, hora, placa, descripcion, subidas, bajadas, registradora")
      .in("fecha", [fecha, sumarDias(fecha, 1)])
      .eq("is_base", true)
      .in("descripcion", [EVENTO_SALIDA, EVENTO_ENTRADA])
      .order("numero", { ascending: true })
      .range(a, b),
  );
  return rows.map((r) => ({
    fecha: String(r.fecha),
    hora: String(r.hora ?? "").trim(),
    placa: String(r.placa ?? "").trim(),
    descripcion: String(r.descripcion ?? "").trim(),
    subidas: Number(r.subidas ?? 0),
    bajadas: Number(r.bajadas ?? 0),
    registradora: Number(r.registradora ?? 0),
  }));
}

async function leerRecaudo(db: Db, fecha: string): Promise<ViajeRecaudado[]> {
  const rows = await todas<Record<string, unknown>>((a, b) =>
    db.from("viajes_recaudados")
      .select("numero, timbradas_real, descuento, inicial, final, codigo_vehiculo, viaje, codigo_conductor, conductor_nombre")
      .eq("fecha_viaje", fecha)
      .order("numero", { ascending: true })
      .range(a, b),
  );
  return rows.map((r) => ({
    numero: Number(r.numero),
    timbradasReal: Number(r.timbradas_real ?? 0),
    descuento: Number(r.descuento ?? 0),
    inicial: num(r.inicial),
    final: num(r.final),
    codigoVehiculo: txt(r.codigo_vehiculo),
    viaje: txt(r.viaje),
    codigoConductor: txt(r.codigo_conductor),
    conductorNombre: txt(r.conductor_nombre),
  }));
}

async function leerDescuentos(db: Db, fecha: string): Promise<TimbradaDescontada[]> {
  const rows = await todas<Record<string, unknown>>((a, b) =>
    db.from("timbradas_descontadas")
      .select("id, num_viaje, placa_vehiculo, tim_descuento, motivo_descuento")
      .eq("fecha_viaje", fecha)
      .order("id", { ascending: true })
      .range(a, b),
  );
  return rows
    .filter((r) => r.num_viaje != null)
    .map((r) => ({
      numViaje: Number(r.num_viaje),
      placa: String(r.placa_vehiculo ?? "").trim(),
      descuento: Number(r.tim_descuento ?? 0),
      motivo: String(r.motivo_descuento ?? ""),
    }));
}

export interface CoberturaRevision {
  /** Último día cargado por la sincronización de puntos virtuales. */
  marcadorPv: string | null;
  ultimaCorridaPv: string | null;
  avisos: string[];
  conteos: { despacho: number; eventos: number; recaudo: number; descuentos: number };
}

export interface RevisionDia extends ResultadoDia {
  cobertura: CoberturaRevision;
}

/** Calcula la revisión de timbradas de un día. */
export async function getRevisionTimbradas(fecha: string): Promise<RevisionDia> {
  const db = createAdminClient();
  const [despacho, eventos, recaudo, descuentos, sync] = await Promise.all([
    leerDespacho(db, fecha),
    leerGeocercas(db, fecha),
    leerRecaudo(db, fecha),
    leerDescuentos(db, fecha),
    db.from("gema_sync_state").select("dataset, last_synced_date, last_run_at").eq("dataset", "puntos_virtuales").maybeSingle(),
  ]);
  const resultado = procesarDia(fecha, despacho, eventos, recaudo, descuentos);

  const marcadorPv = (sync.data?.last_synced_date as string | null) ?? null;
  const avisos: string[] = [];
  if (despacho.length === 0) avisos.push("No hay viajes en el histórico de despacho para esta fecha.");
  // El día del marcador puede estar a medias; los viajes nocturnos buscan la
  // llegada en el día siguiente, así que ese día también tiene que existir.
  if (marcadorPv && marcadorPv < fecha) {
    avisos.push(`Los puntos virtuales solo están cargados hasta el ${marcadorPv}: los viajes de este día salen sin datos PV.`);
  } else if (marcadorPv === fecha) {
    avisos.push(
      `Los puntos virtuales de este día pueden estar a medias (es el último día sincronizado) y el día siguiente aún no está: ` +
        "algunos viajes, sobre todo los nocturnos, pueden salir sin datos PV hasta la próxima sincronización.",
    );
  }
  if (despacho.length > 0 && eventos.length === 0) avisos.push("No hay eventos de geocerca del terminal para esta fecha.");
  if (despacho.length > 0 && recaudo.length === 0) avisos.push("No hay viajes recaudados para esta fecha.");
  if (despacho.length > 0 && descuentos.length === 0) avisos.push("No hay timbradas descontadas registradas para esta fecha.");

  return {
    ...resultado,
    cobertura: {
      marcadorPv,
      ultimaCorridaPv: (sync.data?.last_run_at as string | null) ?? null,
      avisos,
      conteos: { despacho: despacho.length, eventos: eventos.length, recaudo: recaudo.length, descuentos: descuentos.length },
    },
  };
}

// ── Evidencia de revisión ───────────────────────────────────────────────────

export interface MarcaRevision {
  numero: number;
  /** Opcional: el check basta; el resultado se elige cuando hay algo que explicar. */
  resultado: ResultadoRevision | null;
  nota: string | null;
  estadoCalculado: EstadoTimbrada | null;
  revisadoPorEmail: string | null;
  revisadoAt: string;
}

export const MARCA_SELECT = "numero, resultado, nota, estado_calculado, revisado_por_email, revisado_at";

export function mapMarca(r: Record<string, unknown>): MarcaRevision {
  return {
    numero: Number(r.numero),
    resultado: r.resultado == null
      ? null
      : (RESULTADOS_REVISION as readonly string[]).includes(String(r.resultado))
        ? (r.resultado as ResultadoRevision)
        : "Otro (ver nota)",
    nota: txt(r.nota),
    estadoCalculado: (txt(r.estado_calculado) as EstadoTimbrada | null) ?? null,
    revisadoPorEmail: txt(r.revisado_por_email),
    revisadoAt: String(r.revisado_at),
  };
}

/**
 * Marcas de revisión del día. `disponible` es false si la tabla aún no existe
 * (migración sin aplicar): la pantalla calcula igual y avisa.
 */
export async function getMarcasRevision(fecha: string): Promise<{ disponible: boolean; marcas: MarcaRevision[]; error?: string }> {
  const db = createAdminClient();
  try {
    const rows = await todas<Record<string, unknown>>((a, b) =>
      db.from("tesoreria_revision_timbradas")
        .select(MARCA_SELECT)
        .eq("fecha_viaje", fecha)
        .order("numero", { ascending: true })
        .range(a, b),
    );
    return { disponible: true, marcas: rows.map(mapMarca) };
  } catch (e) {
    return { disponible: false, marcas: [], error: e instanceof Error ? e.message : String(e) };
  }
}
