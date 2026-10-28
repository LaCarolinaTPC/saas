"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { SELECT_PROCESO, assertDisciplinarios, procesoDeFila, type FilaProceso } from "@/lib/disciplinarios/data";
import { validarProceso, type Proceso } from "@/lib/disciplinarios/reglas";

type Resultado = { success: boolean; error?: string; proceso?: Proceso };

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
  };
}

/** Registra un llamado de atención o una citación a descargos. */
export async function crearProceso(input: {
  cedula: string;
  codigo: string | null;
  nombre: string;
  datos: Record<string, unknown>;
}): Promise<Resultado> {
  try {
    const perms = await assertDisciplinarios("crear");
    const cedula = input.cedula.replace(/\D/g, "");
    if (!cedula) throw new Error("Falta la cédula del trabajador.");
    const nombre = input.nombre.trim();
    if (!nombre) throw new Error("Falta el nombre del trabajador.");
    const v = validarProceso(input.datos);
    if (!v.ok) throw new Error(v.error);
    const { data, error } = await createAdminClient()
      .from("procesos_disciplinarios")
      .insert({
        cedula,
        codigo: input.codigo?.trim() || null,
        nombre,
        ...columnas(v.datos),
        created_by: perms.userId,
        created_by_email: perms.userEmail,
      })
      .select(SELECT_PROCESO)
      .single();
    if (error) throw new Error(error.message);
    revalidatePath("/disciplinarios");
    return { success: true, proceso: procesoDeFila(data as unknown as FilaProceso) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Edita un proceso (p. ej. para registrar los descargos o la medida). */
export async function actualizarProceso(id: string, datos: Record<string, unknown>): Promise<Resultado> {
  try {
    const perms = await assertDisciplinarios("editar");
    const v = validarProceso(datos);
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
