"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { SELECT_EXAMEN, SELECT_PERSONA, assertExamenes, examenDeFila, personaDeFila } from "@/lib/sst/examenes-data";
import { validarExamen, validarPersona, type DatosExamen, type ExamenPeriodico, type PersonaExamen } from "@/lib/sst/examenes";

type Resultado<T> = { success: true; dato: T } | { success: false; error: string };
const RUTA = "/examenes-periodicos";

const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
const duplicado = (m: string) => /uq_sst_examenes_cedula_fecha|duplicate key/i.test(m);

function columnasExamen(d: DatosExamen) {
  return {
    nombre: d.nombre,
    cargo: d.cargo,
    fecha_atencion: d.fechaAtencion,
    fecha_entrega: d.fechaEntrega,
    periodicidad_meses: d.periodicidadMeses,
    proximo_examen: d.proximoExamen,
    recomendaciones: d.recomendaciones,
    observaciones: d.observaciones,
  };
}

/**
 * Registra un examen. Si la persona todavía no está en el control, entra con
 * el grupo elegido; si ya está, se le actualizan el nombre y el cargo.
 */
export async function registrarExamen(datos: Record<string, unknown>): Promise<Resultado<ExamenPeriodico>> {
  try {
    const perms = await assertExamenes("crear");
    const v = validarExamen(datos, hoyBogota());
    if (!v.ok) throw new Error(v.error);
    const d = v.datos;
    const db = createAdminClient();
    const { data: existe, error: e1 } = await db.from("sst_examenes_personas").select("cedula, activo, inactivo_desde").eq("cedula", d.cedula).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!existe) {
      const { error } = await db.from("sst_examenes_personas").insert({
        cedula: d.cedula, nombre: d.nombre, cargo: d.cargo, grupo: d.grupo, periodicidad_meses: d.periodicidadMeses,
        created_by: perms.userId, created_by_email: perms.userEmail,
      });
      if (error && !duplicado(error.message)) throw new Error(error.message);
    } else {
      // Quien se examina después de haber salido del control vuelve a él; un
      // examen viejo de alguien que ya salió no lo reactiva.
      const salio = existe.inactivo_desde as string | null;
      const reactivar = existe.activo === false && (!salio || d.fechaAtencion >= salio);
      const { error } = await db
        .from("sst_examenes_personas")
        .update({
          nombre: d.nombre, cargo: d.cargo, updated_by_email: perms.userEmail, updated_at: new Date().toISOString(),
          ...(reactivar ? { activo: true, motivo_inactivo: null, inactivo_desde: null } : {}),
        })
        .eq("cedula", d.cedula);
      if (error) throw new Error(error.message);
    }
    const { data, error } = await db
      .from("sst_examenes_periodicos")
      .insert({ cedula: d.cedula, ...columnasExamen(d), created_by: perms.userId, created_by_email: perms.userEmail })
      .select(SELECT_EXAMEN)
      .single();
    if (error) throw new Error(duplicado(error.message) ? "Esa persona ya tiene un examen registrado en esa fecha." : error.message);
    revalidatePath(RUTA);
    return { success: true, dato: examenDeFila(data as unknown as Record<string, unknown>) };
  } catch (e) {
    return { success: false, error: mensaje(e) };
  }
}

/** Edita un examen (p. ej. para anotar la entrega de resultados y las recomendaciones). La cédula no cambia. */
export async function actualizarExamen(id: string, datos: Record<string, unknown>): Promise<Resultado<ExamenPeriodico>> {
  try {
    const perms = await assertExamenes("editar");
    const v = validarExamen(datos, hoyBogota());
    if (!v.ok) throw new Error(v.error);
    const { data, error } = await createAdminClient()
      .from("sst_examenes_periodicos")
      .update({ ...columnasExamen(v.datos), updated_by_email: perms.userEmail, updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("anulado_en", null)
      .select(SELECT_EXAMEN)
      .maybeSingle();
    if (error) throw new Error(duplicado(error.message) ? "Esa persona ya tiene otro examen registrado en esa fecha." : error.message);
    if (!data) throw new Error("El examen no existe o está anulado.");
    revalidatePath(RUTA);
    return { success: true, dato: examenDeFila(data as unknown as Record<string, unknown>) };
  } catch (e) {
    return { success: false, error: mensaje(e) };
  }
}

/** Anula con motivo: no se borra; deja de contar para el próximo examen. */
export async function anularExamen(id: string, motivo: string): Promise<Resultado<null>> {
  try {
    const perms = await assertExamenes("anular");
    const m = motivo.trim();
    if (m.length < 5) throw new Error("Escriba el motivo de la anulación (al menos 5 caracteres).");
    const { data, error } = await createAdminClient()
      .from("sst_examenes_periodicos")
      .update({ anulado_en: new Date().toISOString(), anulado_por_email: perms.userEmail, motivo_anulacion: m.slice(0, 500) })
      .eq("id", id)
      .is("anulado_en", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("El examen no existe o ya estaba anulado.");
    revalidatePath(RUTA);
    return { success: true, dato: null };
  } catch (e) {
    return { success: false, error: mensaje(e) };
  }
}

/**
 * Agrega una persona al control (`nueva`) o edita la que ya está: grupo, cargo,
 * fecha de ingreso y si sigue en control (una persona retirada sale de los
 * vencimientos, pero su historial se conserva).
 */
export async function guardarPersona(datos: Record<string, unknown>, nueva: boolean): Promise<Resultado<PersonaExamen>> {
  try {
    const perms = await assertExamenes(nueva ? "crear" : "editar");
    const v = validarPersona(datos, hoyBogota());
    if (!v.ok) throw new Error(v.error);
    const d = v.datos;
    const columnas = {
      nombre: d.nombre,
      cargo: d.cargo,
      grupo: d.grupo,
      fecha_ingreso: d.fechaIngreso,
      periodicidad_meses: d.periodicidadMeses,
      activo: d.activo,
      motivo_inactivo: d.motivoInactivo,
      inactivo_desde: d.inactivoDesde,
      observaciones: d.observaciones,
    };
    const db = createAdminClient();
    const { data, error } = nueva
      ? await db
          .from("sst_examenes_personas")
          .insert({ cedula: d.cedula, ...columnas, created_by: perms.userId, created_by_email: perms.userEmail })
          .select(SELECT_PERSONA)
          .single()
      : await db
          .from("sst_examenes_personas")
          .update({ ...columnas, updated_by_email: perms.userEmail, updated_at: new Date().toISOString() })
          .eq("cedula", d.cedula)
          .select(SELECT_PERSONA)
          .maybeSingle();
    if (error) throw new Error(/duplicate key|sst_examenes_personas_pkey/i.test(error.message) ? "Esa cédula ya está en el control." : error.message);
    if (!data) throw new Error("La persona no está en el control.");
    revalidatePath(RUTA);
    return { success: true, dato: personaDeFila(data as unknown as Record<string, unknown>) };
  } catch (e) {
    return { success: false, error: mensaje(e) };
  }
}
