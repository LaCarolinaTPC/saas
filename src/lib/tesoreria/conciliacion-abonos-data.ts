/** Tesorería · Conciliación de abonos — lectura (solo servidor). */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  conciliar, type AbonoRaw, type DespachoRaw, type FilaConciliacion, type RecaudoRaw,
} from "./conciliacion-abonos-reglas";

const PAGE = 1000;
// Los id de viaje van en la URL (in.(…)): lotes que no la desborden.
const LOTE_IDS = 200;
type Db = ReturnType<typeof createAdminClient>;

/** Lee todas las páginas: PostgREST recorta cada respuesta a 1.000 filas. */
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

async function porLotes<T>(ids: number[], leer: (lote: number[]) => Promise<T[]>): Promise<T[]> {
  const lotes: number[][] = [];
  for (let i = 0; i < ids.length; i += LOTE_IDS) lotes.push(ids.slice(i, i + LOTE_IDS));
  const out: T[] = [];
  // De a 4 lotes a la vez para no saturar la instancia.
  for (let i = 0; i < lotes.length; i += 4) {
    for (const r of await Promise.all(lotes.slice(i, i + 4).map(leer))) out.push(...r);
  }
  return out;
}

const ABONO_SELECT =
  "id_abono, id_viaje, valor_abono, fecha_abono, concepto_abono, estado, estado_texto, fecha_viaje, num_viaje, codigo_vehiculo, placa_vehiculo, usuario_generacion";

async function leerAbonos(db: Db, desde: string, hasta: string): Promise<AbonoRaw[]> {
  return todas<AbonoRaw>((a, b) =>
    db.from("abonos").select(ABONO_SELECT).gte("dia_abono", desde).lte("dia_abono", hasta).order("id_abono").range(a, b)
  );
}

async function completar(db: Db, abonos: AbonoRaw[], ahora: string): Promise<FilaConciliacion[]> {
  const ids = [...new Set(abonos.map((a) => a.id_viaje).filter((x): x is number => x != null).map(Number))];
  const recaudos = await porLotes(ids, async (lote) => {
    const { data, error } = await db
      .from("viajes_recaudados")
      .select("numero, neto, bruto, fecha_recaudo, cajero, conductor_nombre, cedula_conductor, ruta_reprogramada")
      .in("numero", lote);
    if (error) throw new Error(`Recaudos: ${error.message}`);
    return (data ?? []) as RecaudoRaw[];
  });
  // El despacho solo hace falta para los viajes sin recaudo (conductor, ruta y estado).
  const conRecaudo = new Set(recaudos.filter((r) => r.fecha_recaudo).map((r) => Number(r.numero)));
  const sinRecaudo = ids.filter((id) => !conRecaudo.has(id));
  const despachos = await porLotes(sinRecaudo, async (lote) => {
    const { data, error } = await db
      .from("historico_despacho")
      .select("numero, conductor, conductor_ced, ruta_reprogramada, estado, novedad")
      .in("numero", lote);
    if (error) throw new Error(`Despacho: ${error.message}`);
    return (data ?? []) as DespachoRaw[];
  });
  return conciliar(abonos, recaudos, despachos, ahora);
}

/** Hora local de Colombia "AAAA-MM-DDTHH:MM:SS", el mismo reloj de GEMA. */
export function ahoraBogota(): string {
  return aBogota(new Date());
}

/** Pasa un instante UTC a la hora local de Colombia "AAAA-MM-DDTHH:MM:SS". */
function aBogota(instante: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(instante).map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/**
 * Hasta cuándo está al día el recaudo en Gestivo (última sincronización de
 * viajes_recaudados), en hora local. Un abono posterior a este corte todavía
 * no puede tener recaudo aquí aunque ya lo tenga en GEMA, así que la espera
 * de los pendientes se mide hasta el corte y no hasta ahora.
 */
export async function getCorteRecaudo(): Promise<string> {
  const db = createAdminClient();
  const { data } = await db.from("gema_sync_state").select("last_run_at").eq("dataset", "viajes_recaudados").maybeSingle();
  return data?.last_run_at ? aBogota(new Date(data.last_run_at)) : ahoraBogota();
}

/** Conciliación de los abonos registrados en el rango (por día del abono). */
export async function getConciliacionAbonos(desde: string, hasta: string, corte: string): Promise<FilaConciliacion[]> {
  const db = createAdminClient();
  return completar(db, await leerAbonos(db, desde, hasta), corte);
}

/**
 * Abonos vigentes sin recaudo en la ventana [desde, hasta], aunque estén
 * fuera del periodo que se está mirando: son lo que Tesorería debe perseguir.
 */
export async function getAbonosPendientes(desde: string, hasta: string, corte: string): Promise<FilaConciliacion[]> {
  const db = createAdminClient();
  const abonos = (await leerAbonos(db, desde, hasta)).filter((a) => a.estado !== 2);
  const filas = await completar(db, abonos, corte);
  return filas.filter((f) => f.estado === "pendiente");
}

/** Primer y último día con abonos sincronizados. */
export async function getRangoAbonos(): Promise<{ desde: string | null; hasta: string | null }> {
  const db = createAdminClient();
  const [a, b] = await Promise.all([
    db.from("abonos").select("dia_abono").order("dia_abono", { ascending: true }).limit(1).maybeSingle(),
    db.from("abonos").select("dia_abono").order("dia_abono", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { desde: a.data?.dia_abono ?? null, hasta: b.data?.dia_abono ?? null };
}
