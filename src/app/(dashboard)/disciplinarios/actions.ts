"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { SELECT_PROCESO, assertDisciplinarios, procesoDeFila, type FilaProceso } from "@/lib/disciplinarios/data";
import { MAX_PROCESOS_LOTE, validarProceso, type Proceso } from "@/lib/disciplinarios/reglas";

type Resultado = { success: boolean; error?: string; proceso?: Proceso };
type ResultadoLote = { success: boolean; error?: string; procesos?: Proceso[] };
type Persona = { cedula: string; codigo: string | null; nombre: string };

function columnas(d: Extract<ReturnType<typeof validarProceso>, { ok: true }>["datos"]) {
  return {
    tipo: d.tipo,
    fecha_hecho: d.fechaHecho,
    motivo: d.motivo,
    motivo_detalle: d.motivoDetalle,
    descripcion: d.descripcion,
    fecha_citacion: d.fechaCitacion,
    fecha_descargos: d.fechaDescargos,
    asistio: d.asistio,
    resumen_descargos: d.resumenDescargos,
    medida: d.medida,
    dias_suspension: d.diasSuspension,
    fecha_medida: d.fechaMedida,
    medida_detalle: d.medidaDetalle,
    responsable: d.responsable,
    norma_incumplida: d.normaIncumplida,
    cargo: d.cargo,
    area: d.area,
    realizado_por: d.realizadoPor,
  };
}

/** Registra un llamado de atención o una citación a descargos. */
export async function crearProceso(input: Persona & { datos: Record<string, unknown> }): Promise<Resultado> {
  const { datos, ...persona } = input;
  const r = await crearProcesos({ personas: [persona], datos });
  return r.success ? { success: true, proceso: r.procesos?.[0] } : { success: false, error: r.error };
}

/**
 * Registra el mismo asunto para varios trabajadores: un proceso independiente
 * por persona (cada uno con su N.º, y sus descargos y medida se editan por
 * separado). Un solo INSERT: se crean todos o ninguno.
 */
export async function crearProcesos(input: {
  personas: Persona[];
  datos: Record<string, unknown>;
}): Promise<ResultadoLote> {
  try {
    const perms = await assertDisciplinarios("crear");
    const personas: Persona[] = [];
    const vistas = new Set<string>();
    for (const p of input.personas ?? []) {
      const cedula = String(p.cedula ?? "").replace(/\D/g, "");
      const nombre = String(p.nombre ?? "").trim();
      if (!cedula) throw new Error(`Falta la cédula de ${nombre || "un trabajador"}.`);
      if (!nombre) throw new Error(`Falta el nombre del trabajador con CC ${cedula}.`);
      if (vistas.has(cedula)) continue;
      vistas.add(cedula);
      personas.push({ cedula, codigo: p.codigo?.trim() || null, nombre });
    }
    if (personas.length === 0) throw new Error("Elija al menos un trabajador.");
    if (personas.length > MAX_PROCESOS_LOTE) {
      throw new Error(`Se pueden registrar máximo ${MAX_PROCESOS_LOTE} trabajadores a la vez.`);
    }
    const v = validarProceso(input.datos);
    if (!v.ok) throw new Error(v.error);
    const comunes = { ...columnas(v.datos), created_by: perms.userId, created_by_email: perms.userEmail };
    const { data, error } = await createAdminClient()
      .from("procesos_disciplinarios")
      .insert(personas.map((p) => ({ ...p, ...comunes })))
      .select(SELECT_PROCESO);
    if (error) throw new Error(error.message);
    revalidatePath("/disciplinarios");
    const procesos = ((data ?? []) as unknown as FilaProceso[])
      .map(procesoDeFila)
      .sort((a, b) => a.consecutivo - b.consecutivo);
    return { success: true, procesos };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Edita un proceso (p. ej. para registrar los descargos o la medida). */
export async function actualizarProceso(id: string, datos: Record<string, unknown>): Promise<Resultado> {
  try {
    const perms = await assertDisciplinarios("editar");
    // Un histórico puede conservar la medida «no registrada» al editarse.
    const v = validarProceso({ ...datos, permitirNoRegistrada: true });
    if (!v.ok) throw new Error(v.error);
    const { data, error } = await createAdminClient()
      .from("procesos_disciplinarios")
      .update({ ...columnas(v.datos), updated_by_email: perms.userEmail, updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("anulado_en", null)
      .select(SELECT_PROCESO)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("El proceso no existe o está anulado.");
    revalidatePath("/disciplinarios");
    return { success: true, proceso: procesoDeFila(data as unknown as FilaProceso) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Anula un proceso con motivo; la fila se conserva como rastro. */
export async function anularProceso(id: string, motivo: string): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertDisciplinarios("anular");
    const m = motivo.trim();
    if (!m) throw new Error("Indique el motivo de la anulación.");
    if (m.length > 300) throw new Error("El motivo no puede pasar de 300 caracteres.");
    const { data, error } = await createAdminClient()
      .from("procesos_disciplinarios")
      .update({ anulado_en: new Date().toISOString(), anulado_por_email: perms.userEmail, motivo_anulacion: m })
      .eq("id", id)
      .is("anulado_en", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error("El proceso no existe o ya estaba anulado.");
    revalidatePath("/disciplinarios");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
