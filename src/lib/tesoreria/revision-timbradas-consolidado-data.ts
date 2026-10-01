import { createAdminClient } from "@/lib/supabase/admin";
import type { EstadoTimbrada, ResultadoDia } from "./revision-timbradas-reglas";
import {
  consolidar, fechasDelRango, fotoDesdeResultado,
  type CheckRevision, type CierreDia, type Consolidado, type FotoDia,
} from "./revision-timbradas-consolidado";

/**
 * Persistencia del consolidado de la revisión de timbradas: foto diaria del
 * cálculo, checks y cierres del día. Si las tablas no existen aún (migración
 * sin aplicar), las lecturas devuelven `disponible: false` y la foto no se
 * guarda, sin tumbar la pantalla.
 */

const PAGE = 1000;
type Db = ReturnType<typeof createAdminClient>;

async function todas<T>(armar: (a: number, b: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
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

/** Guarda (reemplaza) la foto del cálculo del día. Nunca lanza: devuelve el error. */
export async function guardarFotoDia(rev: Pick<ResultadoDia, "fecha" | "filas">, db: Db = createAdminClient()): Promise<string | null> {
  const f = fotoDesdeResultado(rev);
  const { error } = await db.from("tesoreria_revision_timbradas_dias").upsert(
    {
      fecha_viaje: f.fecha,
      total_viajes: f.totalViajes,
      por_revisar: f.porRevisar,
      alertas: f.alertas,
      conteo_estados: f.conteoEstados,
      viajes_por_revisar: f.viajes.map((v) => ({ n: v.numero, e: v.estado, p: v.placa, v: v.viaje })),
      calculado_at: f.calculadoAt,
    },
    { onConflict: "fecha_viaje" },
  );
  return error ? error.message : null;
}

function mapFoto(r: Record<string, unknown>): FotoDia {
  const viajes = Array.isArray(r.viajes_por_revisar) ? (r.viajes_por_revisar as Record<string, unknown>[]) : [];
  return {
    fecha: String(r.fecha_viaje),
    totalViajes: Number(r.total_viajes ?? 0),
    porRevisar: Number(r.por_revisar ?? 0),
    alertas: Number(r.alertas ?? 0),
    conteoEstados: (r.conteo_estados ?? {}) as Partial<Record<EstadoTimbrada, number>>,
    viajes: viajes.map((v) => ({ numero: Number(v.n), estado: v.e as EstadoTimbrada, placa: String(v.p ?? ""), viaje: Number(v.v ?? 0) })),
    calculadoAt: String(r.calculado_at),
  };
}

export const CIERRE_SELECT = "fecha_viaje, por_revisar, revisados, numeros, cerrado_por_email, cerrado_at";

export function mapCierre(r: Record<string, unknown>): CierreDia {
  return {
    fecha: String(r.fecha_viaje),
    cerradoAt: String(r.cerrado_at),
    cerradoPorEmail: (r.cerrado_por_email as string | null) ?? null,
    porRevisar: Number(r.por_revisar ?? 0),
    revisados: Number(r.revisados ?? 0),
    numeros: Array.isArray(r.numeros) ? (r.numeros as unknown[]).map(Number) : [],
  };
}

async function leerChecks(db: Db, desde: string, hasta: string): Promise<CheckRevision[]> {
  const rows = await todas<Record<string, unknown>>((a, b) =>
    db.from("tesoreria_revision_timbradas")
      .select("fecha_viaje, numero, revisado_por_email, revisado_at")
      .gte("fecha_viaje", desde).lte("fecha_viaje", hasta)
      .order("fecha_viaje", { ascending: true }).order("numero", { ascending: true })
      .range(a, b),
  );
  return rows.map((r) => ({
    fecha: String(r.fecha_viaje), numero: Number(r.numero),
    revisadoPorEmail: (r.revisado_por_email as string | null) ?? null, revisadoAt: String(r.revisado_at),
  }));
}

/** Cierres de un rango (todo el historial, el consolidado toma el último de cada día). */
async function leerCierres(db: Db, desde: string, hasta: string): Promise<CierreDia[]> {
  const rows = await todas<Record<string, unknown>>((a, b) =>
    db.from("tesoreria_revision_timbradas_cierres")
      .select(CIERRE_SELECT)
      .gte("fecha_viaje", desde).lte("fecha_viaje", hasta)
      .order("cerrado_at", { ascending: true })
      .range(a, b),
  );
  return rows.map(mapCierre);
}

export async function getConsolidadoTimbradas(
  desde: string, hasta: string,
): Promise<{ disponible: boolean; consolidado: Consolidado; error?: string }> {
  const fechas = fechasDelRango(desde, hasta);
  const vacio = consolidar(fechas, [], [], []);
  if (!fechas.length) return { disponible: true, consolidado: vacio };
  const db = createAdminClient();
  const ini = fechas[0], fin = fechas[fechas.length - 1];
  try {
    const [fotos, checks, cierres] = await Promise.all([
      todas<Record<string, unknown>>((a, b) =>
        db.from("tesoreria_revision_timbradas_dias").select("*")
          .gte("fecha_viaje", ini).lte("fecha_viaje", fin)
          .order("fecha_viaje", { ascending: true }).range(a, b),
      ).then((r) => r.map(mapFoto)),
      leerChecks(db, ini, fin),
      leerCierres(db, ini, fin),
    ]);
    return { disponible: true, consolidado: consolidar(fechas, fotos, checks, cierres) };
  } catch (e) {
    return { disponible: false, consolidado: vacio, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Historial de cierres de un día (más reciente primero); vacío si la tabla no existe. */
export async function getCierresDia(fecha: string): Promise<CierreDia[]> {
  try {
    const r = await leerCierres(createAdminClient(), fecha, fecha);
    return r.reverse();
  } catch {
    return [];
  }
}
