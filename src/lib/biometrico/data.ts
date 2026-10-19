/**
 * Lecturas de la pantalla de Marcaciones. Aquí se juntan las tres fuentes
 * (esperados, marcaciones del biométrico y novedades de ausentismo) y se le
 * pasan ya resueltas a `resumenDelDia`, que es la parte pura y probada.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getRegistrosDia } from "@/lib/ausentismo/data";
import type { Concepto } from "@/lib/ausentismo/constants";
import { diasEntreIso, resumenDelDia, type MarcacionDia, type ResumenDia } from "./dia";
import { esperadosDelDia, type EsperadosDelDia } from "./esperados";

/** Lotes para los `in (...)` sobre cédulas; el mismo tamaño que usa ausentismo. */
const LOTE_CEDULAS = 400;

export interface EstadoAgente {
  ultimoEnvioAt: string | null;
  ultimoId: number | null;
  ultimaMarcacionAt: string | null;
  /** Minutos desde el último envío, según el reloj del servidor. */
  atrasoMin: number | null;
  /** Error del último envío, si terminó mal. */
  ultimoError: string | null;
  /** Marcaciones guardadas en total; 0 = nunca llegó nada. */
  total: number;
}

/** Todas las marcaciones de un día, ya atribuidas. */
export async function getMarcacionesDia(fecha: string): Promise<MarcacionDia[]> {
  const db = createAdminClient();
  const salida: MarcacionDia[] = [];
  const paso = 1000;
  for (let desde = 0; ; desde += paso) {
    const { data, error } = await db
      .from("biometrico_marcaciones")
      .select("cedula, pin, momento")
      .eq("fecha", fecha)
      .order("momento", { ascending: true })
      .range(desde, desde + paso - 1);
    if (error) throw new Error(`marcaciones del dia: ${error.message}`);
    const lote = data ?? [];
    for (const m of lote) {
      salida.push({
        cedula: m.cedula ? String(m.cedula) : null,
        pin: String(m.pin),
        momento: String(m.momento),
      });
    }
    if (lote.length < paso) break;
  }
  return salida;
}

/** Última marcación conocida de cada cédula (para «lleva N días sin aparecer»). */
export async function getUltimaMarcacion(
  cedulas: string[]
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (!cedulas.length) return mapa;
  const db = createAdminClient();
  for (let i = 0; i < cedulas.length; i += LOTE_CEDULAS) {
    const trozo = cedulas.slice(i, i + LOTE_CEDULAS);
    const { data, error } = await db.rpc("biometrico_ultima_marcacion", {
      p_cedulas: trozo,
    });
    if (error) throw new Error(`ultima marcacion: ${error.message}`);
    for (const fila of (data ?? []) as { cedula: string; momento: string }[]) {
      if (fila.cedula && fila.momento) mapa.set(String(fila.cedula), String(fila.momento));
    }
  }
  return mapa;
}

/** Cómo va el agente del PC de ZKAccess. */
export async function getEstadoAgente(): Promise<EstadoAgente> {
  const db = createAdminClient();
  const [envio, marcacion, conteo] = await Promise.all([
    db
      .from("biometrico_envios")
      .select("recibido_at, error")
      .order("recibido_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("biometrico_marcaciones")
      .select("id_zk, momento")
      .order("id_zk", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("biometrico_marcaciones").select("id_zk", { count: "exact", head: true }),
  ]);
  if (marcacion.error) throw new Error(`estado del agente: ${marcacion.error.message}`);

  const ultimoEnvioAt = (envio.data?.recibido_at as string) ?? null;
  const atrasoMin = ultimoEnvioAt
    ? Math.max(0, Math.round((Date.now() - new Date(ultimoEnvioAt).getTime()) / 60_000))
    : null;

  return {
    ultimoEnvioAt,
    ultimoId: marcacion.data ? Number(marcacion.data.id_zk) : null,
    ultimaMarcacionAt: (marcacion.data?.momento as string) ?? null,
    atrasoMin,
    ultimoError: (envio.data?.error as string) ?? null,
    total: conteo.count ?? 0,
  };
}

export interface DatosMarcaciones {
  resumen: ResumenDia;
  /** Última marcación conocida por cédula, para los que no marcaron. */
  ultimaConocida: Record<string, { momento: string; dias: number }>;
  agente: EstadoAgente;
  esperados: Pick<
    EsperadosDelDia,
    "busesSinConductor" | "despachoSincronizadoHasta" | "conProgramacion"
  > & { total: number };
}

/**
 * Todo lo que pinta la pantalla de un día.
 *
 * Las novedades salen de `getRegistrosDia`, el mismo lector del Registro del
 * día: así los conceptos que cubren rango (vacaciones) tapan sus días sin
 * tener una fila por día, igual que en Ausentismo.
 */
export async function getDatosMarcaciones(
  fecha: string,
  conceptos: Concepto[]
): Promise<DatosMarcaciones> {
  const [marco, marcaciones, registros, agente] = await Promise.all([
    esperadosDelDia(fecha),
    getMarcacionesDia(fecha),
    getRegistrosDia(fecha, conceptos),
    getEstadoAgente(),
  ]);

  const novedades = new Set(registros.map((r) => String(r.cedula)));
  const resumen = resumenDelDia({
    esperados: marco.esperados,
    marcaciones,
    novedades,
    despachados: marco.despachados,
  });

  // Solo hace falta para quien no marcó: es la columna «lleva N días».
  const pendientes = [
    ...resumen.sinMarcacion.map((f) => f.cedula),
    ...resumen.trabajoSinMarcar.map((f) => f.cedula),
  ];
  const ultimas = await getUltimaMarcacion(pendientes);
  const ultimaConocida: DatosMarcaciones["ultimaConocida"] = {};
  for (const [cedula, momento] of ultimas) {
    const dia = momento.slice(0, 10);
    ultimaConocida[cedula] = { momento, dias: diasEntreIso(dia, fecha) };
  }

  return {
    resumen,
    ultimaConocida,
    agente,
    esperados: {
      busesSinConductor: marco.busesSinConductor,
      despachoSincronizadoHasta: marco.despachoSincronizadoHasta,
      conProgramacion: marco.conProgramacion,
      total: marco.esperados.size,
    },
  };
}
