/**
 * Guarda y lee las corridas del análisis de riesgo.
 *
 * Las corridas se conservan todas, no solo la última: es lo que permite volver
 * a un corte anterior y, con el tiempo, comprobar si el modelo acertó. La
 * pantalla nunca calcula: siempre lee de aquí.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConductorPuntuado, MetricasModelo, ResultadoCorrida, TablaTramos } from "./corrida";

export type OrigenCorrida = "cron" | "manual";

const LOTE = 200;

/** Inserta una corrida completa y devuelve su id. */
export async function guardarCorrida(
  resultado: ResultadoCorrida,
  meta: { origen: OrigenCorrida; ejecutadaPorEmail: string | null }
): Promise<string> {
  const db = createAdminClient();

  const { data, error } = await db
    .from("riesgo_corridas")
    .insert({
      corte: resultado.corte,
      ejecutada_por_email: meta.ejecutadaPorEmail,
      origen: meta.origen,
      estado: "ok",
      observaciones: resultado.observaciones,
      conductores_puntuados: resultado.puntuados.length,
      cortes: resultado.cortes,
      modelos: resultado.modelos,
      descriptivos: resultado.descriptivos,
      retiros_mes: resultado.retirosMes,
      conteos: { ...resultado.conteos, cierres_sin_cedula: resultado.cierresSinCedula },
      duracion_ms: resultado.duracionMs,
    })
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo guardar la corrida: ${error.message}`);
  const corridaId = (data as { id: string }).id;

  for (let i = 0; i < resultado.puntuados.length; i += LOTE) {
    const filas = resultado.puntuados.slice(i, i + LOTE).map((p) => ({
      corrida_id: corridaId,
      cedula: p.cedula,
      codigo: p.codigo,
      nombre: p.nombre,
      tipo_conductor: p.tipoConductor,
      prob_retiro: p.probRetiro,
      nivel_retiro: p.nivelRetiro,
      factores_retiro: p.factoresRetiro,
      prob_novedad: p.probNovedad,
      nivel_novedad: p.nivelNovedad,
      factores_novedad: p.factoresNovedad,
      variables: p.variables,
    }));
    const { error: e } = await db.from("riesgo_conductores").insert(filas);
    if (e) {
      // La corrida ya está insertada: se marca en error para que la pantalla no
      // la tome por buena y se borre en cascada lo que sí entró.
      await db.from("riesgo_corridas").delete().eq("id", corridaId);
      throw new Error(`No se pudieron guardar los puntajes: ${e.message}`);
    }
  }

  return corridaId;
}

/** Deja constancia de una corrida que falló, para que el fallo no sea silencioso. */
export async function guardarCorridaFallida(
  corte: string,
  mensaje: string,
  meta: { origen: OrigenCorrida; ejecutadaPorEmail: string | null }
): Promise<void> {
  try {
    const db = createAdminClient();
    await db.from("riesgo_corridas").insert({
      corte,
      ejecutada_por_email: meta.ejecutadaPorEmail,
      origen: meta.origen,
      estado: "error",
      error: mensaje.slice(0, 2000),
    });
  } catch (e) {
    console.error("[riesgo] no se pudo registrar la corrida fallida:", e);
  }
}

// ── Lectura ──────────────────────────────────────────────────────────────────

export interface CorridaResumen {
  id: string;
  corte: string;
  ejecutadaAt: string;
  origen: OrigenCorrida;
  estado: "ok" | "error";
}

export interface CorridaGuardada extends CorridaResumen {
  ejecutadaPorEmail: string | null;
  observaciones: number | null;
  conductoresPuntuados: number | null;
  cortes: string[];
  modelos: { retiro: MetricasModelo; novedad: MetricasModelo } | null;
  descriptivos: TablaTramos[];
  retirosMes: { mes: string; plantilla: number; retiros: number; tasa: number }[];
  conteos: Record<string, number>;
  duracionMs: number | null;
  error: string | null;
}

const SEL_RESUMEN = "id, corte, ejecutada_at, origen, estado";
const SEL_COMPLETA =
  "id, corte, ejecutada_at, origen, estado, error, ejecutada_por_email, observaciones, " +
  "conductores_puntuados, cortes, modelos, descriptivos, retiros_mes, conteos, duracion_ms";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function aResumen(r: any): CorridaResumen {
  return {
    id: r.id,
    corte: r.corte,
    ejecutadaAt: r.ejecutada_at,
    origen: r.origen,
    estado: r.estado,
  };
}

/** Las últimas corridas, para el selector de corte. */
export async function listarCorridas(limite = 24): Promise<CorridaResumen[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("riesgo_corridas")
    .select(SEL_RESUMEN)
    .order("ejecutada_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`No se pudieron leer las corridas: ${error.message}`);
  return (data ?? []).map(aResumen);
}

/**
 * Una corrida por id, o la última buena si no se pide ninguna. `null` cuando
 * todavía no hay ninguna (recién aplicada la migración, antes del primer cron).
 */
export async function leerCorrida(id?: string | null): Promise<CorridaGuardada | null> {
  const db = createAdminClient();
  let q = db.from("riesgo_corridas").select(SEL_COMPLETA);
  q = id ? q.eq("id", id) : q.eq("estado", "ok").order("ejecutada_at", { ascending: false });
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw new Error(`No se pudo leer la corrida: ${error.message}`);
  if (!data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any;
  return {
    ...aResumen(r),
    ejecutadaPorEmail: r.ejecutada_por_email ?? null,
    observaciones: r.observaciones ?? null,
    conductoresPuntuados: r.conductores_puntuados ?? null,
    cortes: Array.isArray(r.cortes) ? r.cortes : [],
    modelos: r.modelos && r.modelos.retiro ? r.modelos : null,
    descriptivos: Array.isArray(r.descriptivos) ? r.descriptivos : [],
    retirosMes: Array.isArray(r.retiros_mes) ? r.retiros_mes : [],
    conteos: r.conteos ?? {},
    duracionMs: r.duracion_ms ?? null,
    error: r.error ?? null,
  };
}

export interface NivelesCorrida {
  plantilla: number;
  retiroAlto: number;
  retiroMedio: number;
  novedadAlto: number;
  novedadMedio: number;
}

/**
 * Cuenta los niveles de una corrida sin traerse los 191 conductores: la
 * pantalla de indicadores no necesita ni un nombre.
 */
export async function contarNiveles(corridaId: string): Promise<NivelesCorrida> {
  const db = createAdminClient();
  const cuenta = async (campo: "nivel_retiro" | "nivel_novedad", nivel: string) => {
    const { count, error } = await db
      .from("riesgo_conductores")
      .select("cedula", { count: "exact", head: true })
      .eq("corrida_id", corridaId)
      .eq(campo, nivel);
    if (error) throw new Error(`No se pudieron contar los niveles: ${error.message}`);
    return count ?? 0;
  };
  const { count: plantilla, error } = await db
    .from("riesgo_conductores")
    .select("cedula", { count: "exact", head: true })
    .eq("corrida_id", corridaId);
  if (error) throw new Error(`No se pudieron contar los conductores: ${error.message}`);

  const [retiroAlto, retiroMedio, novedadAlto, novedadMedio] = await Promise.all([
    cuenta("nivel_retiro", "Alto"),
    cuenta("nivel_retiro", "Medio"),
    cuenta("nivel_novedad", "Alto"),
    cuenta("nivel_novedad", "Medio"),
  ]);

  return { plantilla: plantilla ?? 0, retiroAlto, retiroMedio, novedadAlto, novedadMedio };
}

export type { ConductorPuntuado };
