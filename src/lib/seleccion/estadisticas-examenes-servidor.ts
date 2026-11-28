/**
 * Candidatos › Indicadores › Exámenes médicos (27-nov-2026): el registro
 * histórico del Excel de Salud Ocupacional más lo registrado en Gestivo, por
 * fecha de la fase 1. La cuenta está en estadisticas-examenes.ts (PURO).
 */
import * as XLSX from "xlsx";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActorProceso } from "@/lib/contratacion/servidor";
import { leerLaboratorios } from "./laboratorios-servidor";
import {
  calcularEstadisticasExamenes,
  leerRegistroExamenes,
  unirFuentes,
  type EstadisticasExamenes,
  type FilaExamen,
  type ResultadoFase,
} from "./estadisticas-examenes";

const TABLA = "seleccion_examenes_historico";
const SIN_MIGRACION = "Falta aplicar la migración 20261128035646 (registro histórico de exámenes).";

export interface PantallaExamenes {
  estadisticas: EstadisticasExamenes;
  /** Años con datos, para el filtro. */
  anios: number[];
  historico: { filas: number; ultimaCarga: string | null; archivo: string | null } | null;
  error?: string;
}

/** El histórico cargado del Excel en ese rango de fechas de la fase 1. */
async function leerHistorico(desde: string, hasta: string): Promise<{ filas: FilaExamen[]; disponible: boolean }> {
  const db = createAdminClient();
  const filas: FilaExamen[] = [];
  for (let desdeFila = 0; ; desdeFila += 1000) {
    const { data, error } = await db
      .from(TABLA)
      .select("cedula, nombre, laboratorio, fecha_fase1, resultado_fase1, fecha_fase2, resultado_fase2, causa")
      .gte("fecha_fase1", desde)
      .lte("fecha_fase1", hasta)
      .order("fecha_fase1")
      .range(desdeFila, desdeFila + 999);
    if (error) return { filas: [], disponible: false };
    for (const r of data ?? []) {
      filas.push({
        cedula: String(r.cedula),
        nombre: (r.nombre as string | null) ?? null,
        laboratorio: (r.laboratorio as string | null) ?? null,
        fechaFase1: (r.fecha_fase1 as string | null) ?? null,
        resultadoFase1: r.resultado_fase1 as ResultadoFase,
        fechaFase2: (r.fecha_fase2 as string | null) ?? null,
        resultadoFase2: (r.resultado_fase2 as ResultadoFase | null) ?? null,
        causa: (r.causa as string | null) ?? null,
        fuente: "historico",
      });
    }
    if ((data ?? []).length < 1000) break;
  }
  return { filas, disponible: true };
}

/**
 * Lo de Gestivo: cada aspirante citado a la fase 1 (la cita) o con un resultado
 * de la fase 1, sin los del chat de prueba. La fecha es la de la cita o, sin
 * cita, la del resultado.
 */
async function leerGestivo(desde: string, hasta: string): Promise<FilaExamen[]> {
  const db = createAdminClient();
  const [citas, examenes] = await Promise.all([
    db.from("seleccion_citas").select("proceso_id, fecha").eq("tipo", "examen_f1").neq("estado", "cancelada").gte("fecha", desde).lte("fecha", hasta).limit(5000),
    db.from("seleccion_examenes").select("proceso_id, fase, fecha, resultado, causa, observacion").limit(10000),
  ]);
  const ex = (examenes.data ?? []) as { proceso_id: string; fase: number; fecha: string | null; resultado: string; causa?: string | null; observacion: string | null }[];
  // Sin la columna «causa» (migración sin aplicar) la consulta falla: se reintenta sin ella.
  let exs = ex;
  if (examenes.error) {
    const r = await db.from("seleccion_examenes").select("proceso_id, fase, fecha, resultado, observacion").limit(10000);
    exs = (r.data ?? []) as typeof ex;
  }
  const fechaF1 = new Map<string, string>();
  for (const c of citas.data ?? []) {
    const actual = fechaF1.get(c.proceso_id as string);
    // La primera cita del rango (si se reprogramó, cuenta una vez).
    if (!actual || (c.fecha as string) < actual) fechaF1.set(c.proceso_id as string, c.fecha as string);
  }
  const f1 = new Map(exs.filter((e) => e.fase === 1).map((e) => [e.proceso_id, e]));
  const f2 = new Map(exs.filter((e) => e.fase === 2).map((e) => [e.proceso_id, e]));
  for (const [id, e] of f1) if (!fechaF1.has(id) && e.fecha && e.fecha >= desde && e.fecha <= hasta) fechaF1.set(id, e.fecha);
  const ids = [...fechaF1.keys()];
  if (!ids.length) return [];
  const procesos = new Map<string, { cedula: string; nombre: string | null; laboratorio_id: string | null; origen: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("procesos_contratacion").select("id, cedula, nombre, laboratorio_id, origen").in("id", ids.slice(i, i + 200));
    for (const p of data ?? []) procesos.set(p.id as string, p as never);
  }
  const labs = new Map((await leerLaboratorios().catch(() => [])).map((l) => [l.id, l.nombre]));
  const res = (r: string | undefined): ResultadoFase => (r === "apto" || r === "no_apto" || r === "aplazado" || r === "desistio" ? r : "pendiente");
  const filas: FilaExamen[] = [];
  for (const id of ids) {
    const p = procesos.get(id);
    if (!p || p.origen === "chat_prueba") continue;
    const e1 = f1.get(id);
    const e2 = f2.get(id);
    const r1 = res(e1?.resultado);
    const r2 = r1 === "apto" ? res(e2?.resultado) : null;
    const causa = (r1 !== "apto" ? (e1?.causa ?? e1?.observacion) : r2 && r2 !== "apto" ? (e2?.causa ?? e2?.observacion) : null) ?? null;
    filas.push({
      cedula: String(p.cedula ?? "").replace(/\D/g, ""),
      nombre: p.nombre,
      laboratorio: (p.laboratorio_id ? labs.get(p.laboratorio_id) : null)?.toUpperCase() ?? null,
      fechaFase1: fechaF1.get(id) ?? null,
      resultadoFase1: r1,
      fechaFase2: e2?.fecha ?? null,
      resultadoFase2: r2,
      causa: r1 === "apto" && r2 === "apto" ? null : causa,
      fuente: "gestivo",
    });
  }
  return filas;
}

/** Las estadísticas del año (o de un rango) con las dos fuentes. */
export async function pantallaExamenes(anio: number): Promise<PantallaExamenes> {
  const desde = `${anio}-01-01`;
  const hasta = `${anio}-12-31`;
  const [hist, gestivo] = await Promise.all([leerHistorico(desde, hasta), leerGestivo(desde, hasta).catch(() => [] as FilaExamen[])]);
  const estadisticas = calcularEstadisticasExamenes(unirFuentes(hist.filas, gestivo));
  let historico: PantallaExamenes["historico"] = null;
  const anios = new Set<number>([new Date().getFullYear(), anio]);
  if (hist.disponible) {
    const db = createAdminClient();
    const [{ count }, ultima, extremos] = await Promise.all([
      db.from(TABLA).select("id", { count: "exact", head: true }),
      db.from(TABLA).select("cargado_at, archivo").order("cargado_at", { ascending: false }).limit(1).maybeSingle(),
      db.from(TABLA).select("fecha_fase1").not("fecha_fase1", "is", null).order("fecha_fase1").limit(1).maybeSingle(),
    ]);
    historico = { filas: count ?? 0, ultimaCarga: (ultima.data?.cargado_at as string | null) ?? null, archivo: (ultima.data?.archivo as string | null) ?? null };
    const primero = extremos.data?.fecha_fase1 as string | undefined;
    if (primero) for (let a = Number(primero.slice(0, 4)); a <= new Date().getFullYear(); a++) anios.add(a);
  }
  return { estadisticas, anios: [...anios].sort((a, b) => b - a), historico, ...(hist.disponible ? {} : { error: SIN_MIGRACION }) };
}

/**
 * Carga el Excel del registro de exámenes. Reemplaza lo que había entre la
 * primera y la última fecha de fase 1 del archivo (el Excel es acumulado: al
 * volver a cargarlo, se actualiza sin duplicar).
 */
export async function importarRegistroExamenes(
  archivo: { nombre: string; buffer: Buffer },
  actor: ActorProceso
): Promise<{ ok: true; cargadas: number; omitidas: number; desde: string | null; hasta: string | null } | { ok: false; error: string }> {
  let matriz: unknown[][];
  try {
    const wb = XLSX.read(archivo.buffer, { type: "buffer", cellDates: true });
    // La hoja con los encabezados del registro (la primera que los tenga).
    const hoja = wb.SheetNames.map((n) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false })).find((m) =>
      m.slice(0, 20).some((f) => f.some((c) => /resultado\s+fase\s+1/i.test(String(c ?? ""))))
    );
    if (!hoja) return { ok: false, error: "El archivo no tiene una hoja con «RESULTADO FASE 1»." };
    matriz = hoja;
  } catch (e) {
    return { ok: false, error: `No se pudo leer el Excel (${e instanceof Error ? e.message : String(e)}).` };
  }
  const r = leerRegistroExamenes(matriz);
  if (r.error) return { ok: false, error: r.error };
  if (!r.filas.length) return { ok: false, error: "El archivo no trae aspirantes con cédula y resultado de la fase 1." };
  // Una fila por cédula y fecha (si el Excel la repite, vale la última).
  const unicas = new Map<string, FilaExamen>();
  for (const f of r.filas) unicas.set(`${f.cedula}|${f.fechaFase1 ?? ""}`, f);
  const filas = [...unicas.values()];
  const fechas = filas.map((f) => f.fechaFase1).filter((f): f is string => !!f).sort();
  const desde = fechas[0] ?? null;
  const hasta = fechas.at(-1) ?? null;
  const db = createAdminClient();
  const borrar = desde && hasta ? db.from(TABLA).delete().gte("fecha_fase1", desde).lte("fecha_fase1", hasta) : null;
  if (borrar) {
    const { error } = await borrar;
    if (error) return { ok: false, error: /seleccion_examenes_historico/.test(error.message) ? SIN_MIGRACION : error.message };
  }
  const sinFecha = filas.filter((f) => !f.fechaFase1).map((f) => f.cedula);
  if (sinFecha.length) await db.from(TABLA).delete().is("fecha_fase1", null).in("cedula", sinFecha);
  const ahora = new Date().toISOString();
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await db.from(TABLA).insert(
      filas.slice(i, i + 500).map((f) => ({
        cedula: f.cedula,
        nombre: f.nombre,
        laboratorio: f.laboratorio,
        fecha_fase1: f.fechaFase1,
        resultado_fase1: f.resultadoFase1,
        fecha_fase2: f.fechaFase2,
        resultado_fase2: f.resultadoFase2,
        causa: f.causa,
        archivo: archivo.nombre.slice(0, 200),
        cargado_por: actor.userEmail ?? null,
        cargado_at: ahora,
      }))
    );
    if (error) return { ok: false, error: /seleccion_examenes_historico/.test(error.message) ? SIN_MIGRACION : error.message };
  }
  return { ok: true, cargadas: filas.length, omitidas: r.omitidas, desde, hasta };
}
