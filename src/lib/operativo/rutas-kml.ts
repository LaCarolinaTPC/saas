/**
 * Datos de Operativo › Rutas (KML). Solo servidor.
 *
 *  - La llave de la ruta es su NOMBRE exacto en GEMA: los viajes se
 *    reprograman a rutas que no están en la programación y solo traen nombre
 *    (migración 20261113211041_operativo_rutas_kml_por_nombre_de_ruta_y_catalogo.sql).
 *    GEMA distingue rutas que solo difieren en los guiones; aquí también.
 *  - Catálogo: función `operativo_rutas_catalogo(desde)` (programación +
 *    despacho) más las rutas que ya tengan KML.
 *  - KML: tabla `operativo_rutas_kml`, con versiones y una vigente por ruta.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyBogota } from "./constants";
import { sumarDias } from "./velocidad-reglas";
import type { Coord, ParadaKml, RutaProcesada } from "./rutas-kml-reglas";

const TABLA = "operativo_rutas_kml";
const DIAS_CATALOGO = 45;

/** Metadatos de una versión (sin la línea, para listas). */
export interface VersionKml {
  id: number;
  id_ruta: number | null;
  ruta: string;
  version: number;
  vigente: boolean;
  archivo_nombre: string;
  archivo_tamano: number | null;
  longitud_km: number;
  num_puntos: number;
  num_paradas: number;
  circular: boolean;
  tolerancia_m: number;
  observaciones: string | null;
  created_by_email: string | null;
  created_at: string;
}

/** Trazado para dibujar en el mapa y cruzar con el GPS. */
export interface GeometriaKml {
  id: number;
  ruta: string;
  version: number;
  linea: Coord[];
  paradas: ParadaKml[];
  bbox: [number, number, number, number];
  tolerancia_m: number;
}

export interface RutaCatalogo {
  ruta: string;
  id_ruta: number | null;
  /** Último día en que GEMA la usó (programación o despacho); null si solo tiene KML. */
  ultima_fecha: string | null;
  vigente: VersionKml | null;
  versiones: VersionKml[];
}

const COLS_VERSION =
  "id, id_ruta, ruta, version, vigente, archivo_nombre, archivo_tamano, longitud_km, num_puntos, paradas, circular, tolerancia_m, observaciones, created_by_email, created_at";
const COLS_GEOM = "id, ruta, version, linea, paradas, bbox, tolerancia_m";

type FilaVersion = Omit<VersionKml, "num_paradas" | "longitud_km"> & { paradas: unknown; longitud_km: number | string };

const aVersion = ({ paradas, ...r }: FilaVersion): VersionKml => ({
  ...r,
  longitud_km: Number(r.longitud_km),
  num_paradas: Array.isArray(paradas) ? paradas.length : 0,
});

interface RutaGema {
  ruta: string;
  id_ruta: number | null;
  ultima_fecha: string;
}

/** Rutas que GEMA usó desde hace DIAS_CATALOGO días (programación y despacho). */
export async function rutasDeGema(): Promise<RutaGema[]> {
  const { data, error } = await createAdminClient().rpc("operativo_rutas_catalogo", {
    p_desde: sumarDias(hoyBogota(), -DIAS_CATALOGO),
  });
  if (error) throw new Error(`operativo_rutas_catalogo: ${error.message}`);
  return (data ?? []) as RutaGema[];
}

export async function listarVersiones(): Promise<VersionKml[]> {
  const { data, error } = await createAdminClient()
    .from(TABLA)
    .select(COLS_VERSION)
    .order("ruta")
    .order("version", { ascending: false });
  if (error) throw new Error(`${TABLA}: ${error.message}`);
  return ((data ?? []) as FilaVersion[]).map(aVersion);
}

/** Catálogo de rutas con su KML vigente e historial, ordenado por nombre. */
export async function getCatalogoRutas(): Promise<RutaCatalogo[]> {
  const [gema, versiones] = await Promise.all([rutasDeGema(), listarVersiones()]);
  const porRuta = new Map<string, RutaCatalogo>();
  for (const g of gema) {
    porRuta.set(g.ruta, { ruta: g.ruta, id_ruta: g.id_ruta, ultima_fecha: g.ultima_fecha, vigente: null, versiones: [] });
  }
  for (const v of versiones) {
    let r = porRuta.get(v.ruta);
    if (!r) {
      r = { ruta: v.ruta, id_ruta: v.id_ruta, ultima_fecha: null, vigente: null, versiones: [] };
      porRuta.set(v.ruta, r);
    }
    r.versiones.push(v);
    if (v.vigente) r.vigente = v;
  }
  return [...porRuta.values()].sort((a, b) => a.ruta.localeCompare(b.ruta, "es", { numeric: true }));
}

/** Trazados vigentes (para el mapa y el cruce con el GPS). */
export async function getGeometriasVigentes(): Promise<GeometriaKml[]> {
  const { data, error } = await createAdminClient().from(TABLA).select(COLS_GEOM).eq("vigente", true);
  if (error) throw new Error(`${TABLA}: ${error.message}`);
  return (data ?? []) as GeometriaKml[];
}

export async function getGeometria(id: number): Promise<GeometriaKml | null> {
  const { data, error } = await createAdminClient().from(TABLA).select(COLS_GEOM).eq("id", id).maybeSingle();
  if (error) throw new Error(`${TABLA}: ${error.message}`);
  return (data as GeometriaKml | null) ?? null;
}

/** La ruta existe en GEMA o ya tiene KML. Devuelve su id_ruta (si lo hay). */
export async function buscarRuta(ruta: string): Promise<{ existe: boolean; id_ruta: number | null }> {
  const g = (await rutasDeGema()).find((r) => r.ruta === ruta);
  if (g) return { existe: true, id_ruta: g.id_ruta };
  const { data } = await createAdminClient().from(TABLA).select("id_ruta").eq("ruta", ruta).limit(1).maybeSingle();
  return { existe: Boolean(data), id_ruta: data?.id_ruta ?? null };
}

/**
 * Guarda una versión nueva y la deja vigente. Hereda la tolerancia de la
 * vigente anterior. Pasos (sin transacción en PostgREST):
 *   1. inserta la versión apagada,
 *   2. apaga la vigente anterior,
 *   3. prende la nueva; si falla, vuelve a prender la anterior.
 */
export async function insertarVersion(input: {
  ruta: string;
  idRuta: number | null;
  archivoRuta: string;
  archivoNombre: string;
  archivoTamano: number;
  procesada: RutaProcesada;
  observaciones: string | null;
  userId: string | null;
  userEmail: string | null;
}): Promise<VersionKml> {
  const db = createAdminClient();
  const { data: previas, error: errPrevias } = await db
    .from(TABLA)
    .select("id, version, vigente, tolerancia_m")
    .eq("ruta", input.ruta)
    .order("version", { ascending: false });
  if (errPrevias) throw new Error(errPrevias.message);
  const anterior = previas?.find((p) => p.vigente) ?? null;
  const version = (previas?.[0]?.version ?? 0) + 1;
  const p = input.procesada;

  const { data: nueva, error } = await db
    .from(TABLA)
    .insert({
      id_ruta: input.idRuta,
      ruta: input.ruta,
      version,
      vigente: false,
      archivo_ruta: input.archivoRuta,
      archivo_nombre: input.archivoNombre,
      archivo_tamano: input.archivoTamano,
      linea: p.linea,
      paradas: p.paradas,
      bbox: p.bbox,
      longitud_km: p.longitudKm,
      num_puntos: p.numPuntos,
      circular: p.circular,
      ...(anterior ? { tolerancia_m: anterior.tolerancia_m } : {}),
      observaciones: input.observaciones,
      created_by: input.userId,
      created_by_email: input.userEmail,
    })
    .select("id")
    .single();
  if (error || !nueva) throw new Error(error?.message ?? "No se pudo guardar la versión.");

  try {
    await activar(nueva.id, input.ruta, anterior?.id ?? null);
  } catch (e) {
    await db.from(TABLA).delete().eq("id", nueva.id);
    throw e;
  }
  const { data: fila, error: errFila } = await db.from(TABLA).select(COLS_VERSION).eq("id", nueva.id).single();
  if (errFila) throw new Error(errFila.message);
  return aVersion(fila as FilaVersion);
}

async function activar(id: number, ruta: string, anteriorId: number | null): Promise<void> {
  if (anteriorId === id) return;
  const db = createAdminClient();
  const { error: errApagar } = await db.from(TABLA).update({ vigente: false }).eq("ruta", ruta).eq("vigente", true);
  if (errApagar) throw new Error(errApagar.message);
  const { error } = await db.from(TABLA).update({ vigente: true }).eq("id", id);
  if (error) {
    if (anteriorId) await db.from(TABLA).update({ vigente: true }).eq("id", anteriorId);
    throw new Error(error.message);
  }
}

/** Deja vigente una versión del historial. */
export async function activarVersion(id: number): Promise<void> {
  const db = createAdminClient();
  const { data: v, error } = await db.from(TABLA).select("id, ruta").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!v) throw new Error("La versión no existe.");
  const { data: actual } = await db.from(TABLA).select("id").eq("ruta", v.ruta).eq("vigente", true).maybeSingle();
  await activar(v.id, v.ruta, actual?.id ?? null);
}

/** Borra una versión y devuelve la ruta del archivo para borrarlo de Storage. */
export async function eliminarVersion(id: number): Promise<{ archivo_ruta: string }> {
  const { data, error } = await createAdminClient()
    .from(TABLA)
    .delete()
    .eq("id", id)
    .select("archivo_ruta")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("La versión no existe.");
  return data;
}

/** Cambia la tolerancia de la versión vigente de la ruta. */
export async function cambiarTolerancia(ruta: string, toleranciaM: number): Promise<void> {
  const { data, error } = await createAdminClient()
    .from(TABLA)
    .update({ tolerancia_m: toleranciaM })
    .eq("ruta", ruta)
    .eq("vigente", true)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("La ruta no tiene un KML vigente.");
}

export async function archivoDeVersion(id: number): Promise<{ archivo_ruta: string; archivo_nombre: string } | null> {
  const { data, error } = await createAdminClient()
    .from(TABLA)
    .select("archivo_ruta, archivo_nombre")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
