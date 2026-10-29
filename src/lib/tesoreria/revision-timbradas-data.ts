import { createAdminClient } from "@/lib/supabase/admin";
import { sumarDias } from "./calendario-pago";
import {
  EVENTO_ENTRADA, EVENTO_SALIDA, procesarDia, RESULTADOS_REVISION,
  type EstadoTimbrada, type EventoGeocerca, type ResultadoDia,
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
  /**
   * Opcional: el check basta; el resultado se elige cuando hay algo que
   * explicar. Antes era un enum fijo; ahora es el NOMBRE de una novedad del
   * cat\u00e1logo editable `tesoreria_revision_novedades`, por eso es `string`.
   */
  resultado: string | null;
  nota: string | null;
  estadoCalculado: EstadoTimbrada | null;
  revisadoPorEmail: string | null;
  revisadoAt: string;
}

export const MARCA_SELECT = "numero, resultado, nota, estado_calculado, revisado_por_email, revisado_at";

export function mapMarca(r: Record<string, unknown>): MarcaRevision {
  return {
    numero: Number(r.numero),
    resultado: txt(r.resultado),
    nota: txt(r.nota),
    estadoCalculado: (txt(r.estado_calculado) as EstadoTimbrada | null) ?? null,
    revisadoPorEmail: txt(r.revisado_por_email),
    revisadoAt: String(r.revisado_at),
  };
}

// \u2500\u2500 Cat\u00e1logo editable del campo \"Revisi\u00f3n\" \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export interface NovedadRevision {
  clave: string;
  nombre: string;
  activo: boolean;
  orden: number;
  enviaACamaras: boolean;
  esSistema: boolean;
}

export const NOVEDAD_SELECT = "clave, nombre, activo, orden, envia_a_camaras, es_sistema";

export function mapNovedad(r: Record<string, unknown>): NovedadRevision {
  return {
    clave: String(r.clave),
    nombre: String(r.nombre),
    activo: r.activo !== false,
    orden: Number(r.orden ?? 0),
    enviaACamaras: r.envia_a_camaras === true,
    esSistema: r.es_sistema === true,
  };
}

/**
 * Novedades del campo \"Revisi\u00f3n\" (cat\u00e1logo editable). `disponible` es false si
 * la tabla a\u00fan no existe (migraci\u00f3n sin aplicar): la pantalla cae a la lista
 * fija hist\u00f3rica.
 */
export async function getNovedadesRevision(
  soloActivas = true,
): Promise<{ disponible: boolean; novedades: NovedadRevision[] }> {
  const db = createAdminClient();
  try {
    let q = db.from("tesoreria_revision_novedades").select(NOVEDAD_SELECT).order("orden");
    if (soloActivas) q = q.eq("activo", true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { disponible: true, novedades: (data ?? []).map((x) => mapNovedad(x as Record<string, unknown>)) };
  } catch {
    const fija = (RESULTADOS_REVISION as readonly string[]).map((nombre, i) => ({
      clave: `fija_${i}`, nombre, activo: true, orden: (i + 1) * 10, enviaACamaras: false, esSistema: true,
    }));
    return { disponible: false, novedades: fija };
  }
}

// \u2500\u2500 Solicitudes a c\u00e1maras (puente Cartulina \u2194 C\u00e1maras) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export type ResultadoCamaras = "recobro" | "normalidad_timbradas" | "sin_conteo";

export interface SolicitudCamaras {
  id: string;
  numero: number;
  estado: "pendiente" | "resuelto";
  solicitadoPorEmail: string | null;
  solicitadoAt: string;
  notaSolicitud: string | null;
  resultado: ResultadoCamaras | null;
  notaCamaras: string | null;
  resueltoPorEmail: string | null;
  resueltoAt: string | null;
}

export const SOLICITUD_SELECT =
  "id, numero, estado, solicitado_por_email, solicitado_at, nota_solicitud, resultado, nota_camaras, resuelto_por_email, resuelto_at";

export function mapSolicitud(r: Record<string, unknown>): SolicitudCamaras {
  const res = txt(r.resultado);
  return {
    id: String(r.id),
    numero: Number(r.numero),
    estado: r.estado === "resuelto" ? "resuelto" : "pendiente",
    solicitadoPorEmail: txt(r.solicitado_por_email),
    solicitadoAt: String(r.solicitado_at),
    notaSolicitud: txt(r.nota_solicitud),
    resultado: res === "recobro" || res === "normalidad_timbradas" || res === "sin_conteo" ? (res as ResultadoCamaras) : null,
    notaCamaras: txt(r.nota_camaras),
    resueltoPorEmail: txt(r.resuelto_por_email),
    resueltoAt: txt(r.resuelto_at),
  };
}

/** Etiqueta legible del resultado de c\u00e1maras. */
export const RESULTADO_CAMARAS_LABEL: Record<ResultadoCamaras, string> = {
  recobro: "Recobro",
  normalidad_timbradas: "Normalidad de timbradas",
  sin_conteo: "Sin conteo · decide subgerencia",
};

/**
 * Solicitudes a c\u00e1maras de un d\u00eda, por n\u00famero de despacho. `disponible` es
 * false si la tabla a\u00fan no existe (migraci\u00f3n sin aplicar).
 */
export async function getSolicitudesCamarasDia(
  fecha: string,
): Promise<{ disponible: boolean; solicitudes: SolicitudCamaras[] }> {
  const db = createAdminClient();
  try {
    const rows = await todas<Record<string, unknown>>((a, b) =>
      db.from("tesoreria_camaras_solicitudes").select(SOLICITUD_SELECT).eq("fecha_viaje", fecha).range(a, b),
    );
    return { disponible: true, solicitudes: rows.map(mapSolicitud) };
  } catch {
    return { disponible: false, solicitudes: [] };
  }
}

// ── Maestro de vehículos ─────────────────────────────────────────────────────

export interface VehiculoActivo {
  codigo: string;
  placa: string | null;
}

/**
 * Vehículos activos del maestro GEMA (`vehiculos.estado = 1`, misma regla que
 * Ausentismo y Mantenimiento). Sirve para cruzar contra los que operaron en el
 * día y ver cuántos de la flota no trabajaron. El cruce se hace por `codigo`
 * (número de vehículo), no por placa.
 */
export async function getVehiculosActivos(): Promise<VehiculoActivo[]> {
  const db = createAdminClient();
  const rows = await todas<Record<string, unknown>>((a, b) =>
    db.from("vehiculos")
      .select("codigo, placa")
      .eq("estado", 1)
      .order("codigo", { ascending: true })
      .range(a, b),
  );
  return rows
    .map((r) => ({ codigo: txt(r.codigo), placa: txt(r.placa) }))
    .filter((v): v is VehiculoActivo => v.codigo != null);
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
