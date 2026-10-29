"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { SELECT_AT, accidenteDeFila, assertAccidentesTrabajo } from "@/lib/sst/data";
import { validarAccidenteTrabajo, type AccidenteTrabajo, type DatosAccidenteTrabajo } from "@/lib/sst/reglas";

type Resultado = { success: boolean; error?: string; accidente?: AccidenteTrabajo };
const RUTA = "/accidentes-trabajo";

const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

function columnas(d: DatosAccidenteTrabajo) {
  return {
    fecha_at: d.fechaAt,
    hora: d.hora,
    fecha_notificacion: d.fechaNotificacion,
    cedula: d.cedula,
    nombre: d.nombre,
    cargo: d.cargo,
    empresa_usuaria: d.empresaUsuaria,
    ciudad: d.ciudad,
    sexo: d.sexo,
    tipo_lesion: d.tipoLesion,
    parte_cuerpo: d.parteCuerpo,
    parte_cuerpo_grupo: d.parteCuerpoGrupo,
    mecanismo: d.mecanismo,
    agente: d.agente,
    descripcion: d.descripcion,
    accidente_transito: d.accidenteTransito,
    dias_incapacidad: d.diasIncapacidad,
    estado_investigacion: d.estadoInvestigacion,
    cierre_administrativo_arl: d.cierreAdministrativoArl,
    observaciones: d.observaciones,
  };
}

/** Siguiente «CASO No» del año (incluye los anulados: un número no se reutiliza). */
async function siguienteCaso(db: ReturnType<typeof createAdminClient>, anio: number): Promise<number> {
  const { data } = await db.from("sst_accidentes_trabajo").select("caso").eq("anio", anio).order("caso", { ascending: false }).limit(1).maybeSingle();
  return Number(data?.caso ?? 0) + 1;
}

/** Registra un accidente de trabajo con el siguiente número de caso del año. */
export async function crearAccidenteTrabajo(datos: Record<string, unknown>): Promise<Resultado> {
  try {
    const perms = await assertAccidentesTrabajo("crear");
    const v = validarAccidenteTrabajo(datos, hoyBogota());
    if (!v.ok) throw new Error(v.error);
    const db = createAdminClient();
    const anio = Number(v.datos.fechaAt.slice(0, 4));
    // Dos registros a la vez pueden tomar el mismo número: el índice único lo
    // rechaza y se reintenta con el siguiente.
    for (let intento = 0; intento < 3; intento++) {
      const caso = await siguienteCaso(db, anio);
      const { data, error } = await db
        .from("sst_accidentes_trabajo")
        .insert({ anio, caso, ...columnas(v.datos), created_by: perms.userId, created_by_email: perms.userEmail })
        .select(SELECT_AT)
        .single();
      if (!error) {
        revalidatePath(RUTA);
        return { success: true, accidente: accidenteDeFila(data as unknown as Record<string, unknown>) };
      }
      if (!/uq_sst_at_caso|duplicate key/i.test(error.message)) throw new Error(error.message);
    }
    throw new Error("No se pudo asignar el número de caso; intente de nuevo.");
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Edita un accidente (p. ej. para registrar la investigación o el cierre ARL). */
export async function actualizarAccidenteTrabajo(id: string, datos: Record<string, unknown>): Promise<Resultado> {
  try {
    const perms = await assertAccidentesTrabajo("editar");
    const v = validarAccidenteTrabajo(datos, hoyBogota());
    if (!v.ok) throw new Error(v.error);
    const { data, error } = await createAdminClient()
      .from("sst_accidentes_trabajo")
      .update({ ...columnas(v.datos), updated_by_email: perms.userEmail, updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("anulado_en", null)
      .select(SELECT_AT)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("El accidente no existe o está anulado.");
    revalidatePath(RUTA);
    return { success: true, accidente: accidenteDeFila(data as unknown as Record<string, unknown>) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Anula con motivo: no se borra, deja de contar en la caracterización. */
export async function anularAccidenteTrabajo(id: string, motivo: string): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertAccidentesTrabajo("anular");
    const m = motivo.trim();
    if (m.length < 5) throw new Error("Escriba el motivo de la anulación (al menos 5 caracteres).");
    const { data, error } = await createAdminClient()
      .from("sst_accidentes_trabajo")
      .update({ anulado_en: new Date().toISOString(), anulado_por_email: perms.userEmail, motivo_anulacion: m.slice(0, 500) })
      .eq("id", id)
      .is("anulado_en", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("El accidente no existe o ya estaba anulado.");
    revalidatePath(RUTA);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
