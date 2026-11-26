/**
 * Lectura de las estadísticas de proveedores (26-nov-2026), solo servidor.
 *
 * Fuente principal: servicios_llamadas (cada llamada, con su tiempo). Para los
 * días anteriores a que existiera ese registro se usa lo que ya había: el
 * resultado final de cada consulta a Croma (verificaciones_externas, sin
 * tiempo) y cada respuesta del asistente (wa_agente_ejecuciones, con tiempo).
 * Así el periodo no queda vacío mientras el registro nuevo junta datos.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { esErrorDeDato } from "@/lib/estado-servicios";
import { sumarDias, type Rango } from "@/lib/comunicaciones/indicadores";
import { estadisticasProveedores, type FilaProveedor, type LlamadaStats } from "./estadisticas";

type Db = ReturnType<typeof createAdminClient>;

const LOTE = 1000;
const MAX_FILAS = 50_000;

/** Lee todas las filas de una consulta, de a 1000 (el tope de la base por consulta). */
async function todas<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>): Promise<{ filas: T[]; error: { code?: string; message: string } | null }> {
  const filas: T[] = [];
  for (let i = 0; i < MAX_FILAS; i += LOTE) {
    const { data, error } = await armar(i, i + LOTE - 1);
    if (error) return { filas, error };
    const lote = (data ?? []) as T[];
    filas.push(...lote);
    if (lote.length < LOTE) break;
  }
  return { filas, error: null };
}

/** Inicio (00:00 Bogotá) de un día y el fin del último, en ISO. */
function limites(r: Rango): { desde: string; hasta: string } {
  return { desde: `${r.desde}T00:00:00-05:00`, hasta: `${sumarDias(r.hasta, 1)}T00:00:00-05:00` };
}

function diasDe(r: Rango): string[] {
  const out: string[] = [];
  for (let d = r.desde; d <= r.hasta && out.length < 400; d = sumarDias(d, 1)) out.push(d);
  return out;
}

export interface EstadisticasProveedores {
  filas: FilaProveedor[];
  /** Desde cuándo hay registro de cada llamada (con tiempo); null si todavía no hay. */
  registroDesde: string | null;
  /** El registro nuevo no está (falta la migración): todo sale del histórico. */
  sinRegistro: boolean;
  /** Costo del periodo por proveedor, en dólares (seleccion_consumos). */
  costos: { proveedor: string; concepto: string; usd: number; llamadas: number }[];
  dias: string[];
}

async function leerRegistro(db: Db, l: { desde: string; hasta: string }) {
  return todas<{ servicio: string; proveedor: string; fuente: string; ok: boolean; duracion_ms: number | null; error: string | null; created_at: string }>((a, b) =>
    db
      .from("servicios_llamadas")
      .select("servicio, proveedor, fuente, ok, duracion_ms, error, created_at")
      .gte("created_at", l.desde)
      .lt("created_at", l.hasta)
      .order("created_at", { ascending: true })
      .range(a, b)
  );
}

export async function leerEstadisticasProveedores(rango: Rango, ahora: Date = new Date()): Promise<EstadisticasProveedores> {
  const db = createAdminClient();
  const l = limites(rango);
  const [registro, primera, croma, ia, consumos] = await Promise.all([
    leerRegistro(db, l),
    db.from("servicios_llamadas").select("servicio, created_at").order("created_at", { ascending: true }).limit(1),
    todas<{ fuente: string; estado: string; error: string | null; created_at: string }>((a, b) =>
      db
        .from("verificaciones_externas")
        .select("fuente, estado, error, created_at")
        .eq("proveedor", "croma")
        .in("estado", ["ok", "hallazgo", "error", "reiniciada"])
        .not("consultado_por", "ilike", "%reutilizada%")
        .gte("created_at", l.desde)
        .lt("created_at", l.hasta)
        .order("created_at", { ascending: true })
        .range(a, b)
    ),
    todas<{ proveedor: string | null; resultado: string; error: string | null; duracion_ms: number | null; created_at: string }>((a, b) =>
      db
        .from("wa_agente_ejecuciones")
        .select("proveedor, resultado, error, duracion_ms, created_at")
        .in("resultado", ["respondido", "transferido", "error"])
        .gte("created_at", l.desde)
        .lt("created_at", l.hasta)
        .order("created_at", { ascending: true })
        .range(a, b)
    ),
    todas<{ proveedor: string | null; concepto: string; costo_usd: number | string }>((a, b) =>
      db.from("seleccion_consumos").select("proveedor, concepto, costo_usd").gte("created_at", l.desde).lt("created_at", l.hasta).range(a, b)
    ),
  ]);

  const sinRegistro = Boolean(registro.error);
  const nuevas: LlamadaStats[] = registro.filas.map((f) => ({
    servicio: f.servicio,
    proveedor: f.proveedor,
    fuente: f.fuente,
    ok: f.ok,
    at: f.created_at,
    duracionMs: f.duracion_ms,
    error: f.error,
  }));
  // Desde cuándo hay registro nuevo (de cualquier servicio): antes de eso, el histórico.
  const registroDesde = !primera.error && primera.data?.[0] ? (primera.data[0].created_at as string) : null;
  const antes = (at: string) => !registroDesde || at < registroDesde;

  const historicoCroma: LlamadaStats[] = croma.filas
    .filter((f) => antes(f.created_at))
    .map((f) => ({
      servicio: "croma",
      proveedor: "croma",
      fuente: f.fuente,
      // «reiniciada» respondió (luego se reinició el candidato); un error de dato tampoco es caída.
      ok: f.estado !== "error" || esErrorDeDato(f.error),
      at: f.created_at,
      duracionMs: null,
      error: f.error,
    }));
  const historicoIa: LlamadaStats[] = ia.filas
    .filter((f) => antes(f.created_at))
    // «WhatsApp rechazó el envío» queda como error del asistente, pero es de WhatsApp.
    .filter((f) => !/WhatsApp rechaz/i.test(String(f.error ?? "")))
    .map((f) => ({
      servicio: "ia",
      proveedor: f.proveedor ?? "desconocido",
      fuente: "chat",
      ok: f.resultado !== "error",
      at: f.created_at,
      duracionMs: f.duracion_ms,
      error: f.error,
    }));

  const dias = diasDe(rango);
  const filas = estadisticasProveedores([...historicoCroma, ...historicoIa, ...nuevas], dias, ahora);

  const porCosto = new Map<string, { proveedor: string; concepto: string; usd: number; llamadas: number }>();
  for (const c of consumos.filas) {
    const clave = `${c.proveedor ?? "—"}|${c.concepto}`;
    const x = porCosto.get(clave) ?? { proveedor: c.proveedor ?? "—", concepto: c.concepto, usd: 0, llamadas: 0 };
    x.usd += Number(c.costo_usd) || 0;
    x.llamadas++;
    porCosto.set(clave, x);
  }
  const costos = [...porCosto.values()].sort((a, b) => b.usd - a.usd);

  return { filas, registroDesde, sinRegistro, costos, dias };
}
