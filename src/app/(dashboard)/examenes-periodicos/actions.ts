"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { SELECT_EXAMEN, SELECT_PERSONA, assertExamenes, examenDeFila, personaDeFila } from "@/lib/sst/examenes-data";
import { PERIODICIDAD_MAX, PERIODICIDAD_MIN, validarExamen, validarPersona, type DatosExamen, type ExamenPeriodico, type PersonaExamen } from "@/lib/sst/examenes";
import { leerProfesiograma, sincronizarControlExamenes, type ResultadoSincronizacionExamenes } from "@/lib/sst/examenes-sincronizar";
import { EMPRESAS_PROFESIOGRAMA, compararProfesiogramas, normalizarCargo, validarTablaProfesiograma, type CambioCargo } from "@/lib/sst/profesiograma";

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
 * Guarda una versión nueva del profesiograma (subida del Excel o edición a
 * mano): reemplaza la tabla completa en una transacción y anota la carga.
 * Devuelve el id de la carga y los cambios respecto a la versión anterior.
 */
export async function guardarProfesiograma(
  tablaNueva: unknown,
  meta: { origen: "archivo" | "edicion"; archivo?: string | null; fechaDocumento?: string | null }
): Promise<Resultado<{ cargaId: number; cambios: CambioCargo[] }>> {
  try {
    const perms = await assertExamenes("editar");
    const v = validarTablaProfesiograma(tablaNueva);
    if (!v.ok) throw new Error(v.error);
    const db = createAdminClient();
    const actual = await leerProfesiograma(db);
    if (!actual.deTabla) throw new Error("Falta aplicar la migración 20261109213335 (profesiograma editable).");
    const cambios = compararProfesiogramas(actual.tabla, v.tabla);
    if (cambios.length === 0) throw new Error("No hay cambios respecto al profesiograma vigente.");
    const filas = EMPRESAS_PROFESIOGRAMA.flatMap(({ key }) =>
      v.tabla[key].map((c, i) => ({ empresa: key, cargo: c.cargo, clave: normalizarCargo(c.cargo), meses: c.meses, tipo: c.tipo, orden: i + 1 }))
    );
    const fecha = meta.fechaDocumento && /^\d{4}-\d{2}-\d{2}$/.test(meta.fechaDocumento) ? meta.fechaDocumento : null;
    const { data, error } = await db.rpc("sst_reemplazar_profesiograma", {
      p_filas: filas,
      p_origen: meta.origen === "archivo" ? "archivo" : "edicion",
      p_archivo: meta.archivo?.slice(0, 250) ?? null,
      p_fecha: fecha,
      p_cambios: cambios,
      p_usuario: perms.userEmail,
    });
    if (error) throw new Error(error.message);
    revalidatePath(RUTA);
    return { success: true, dato: { cargaId: Number(data), cambios } };
  } catch (e) {
    return { success: false, error: mensaje(e) };
  }
}

/**
 * Aplica a las personas elegidas la periodicidad del profesiograma nuevo. Los
 * exámenes ya registrados no cambian: afecta el vencimiento de quien aún no
 * tiene exámenes y la periodicidad que se propone en su próximo examen.
 */
export async function aplicarPeriodicidades(cambios: { cedula: string; meses: number }[], cargaId: number | null): Promise<Resultado<number>> {
  try {
    const perms = await assertExamenes("editar");
    const validos = (cambios ?? []).filter(
      (c) => /^\d{5,12}$/.test(String(c.cedula)) && Number.isInteger(c.meses) && c.meses >= PERIODICIDAD_MIN && c.meses <= PERIODICIDAD_MAX
    );
    if (validos.length === 0) throw new Error("No eligió a nadie.");
    const db = createAdminClient();
    const ahora = new Date().toISOString();
    const porMeses = new Map<number, string[]>();
    for (const c of validos) porMeses.set(c.meses, [...(porMeses.get(c.meses) ?? []), String(c.cedula)]);
    let total = 0;
    for (const [meses, cedulas] of porMeses) {
      for (let i = 0; i < cedulas.length; i += 300) {
        const { data, error } = await db
          .from("sst_examenes_personas")
          .update({ periodicidad_meses: meses, updated_by_email: perms.userEmail, updated_at: ahora })
          .in("cedula", cedulas.slice(i, i + 300))
          .select("cedula");
        if (error) throw new Error(error.message);
        total += data?.length ?? 0;
      }
    }
    if (cargaId) await db.from("sst_profesiograma_cargas").update({ personas_aplicadas: total }).eq("id", cargaId);
    revalidatePath(RUTA);
    return { success: true, dato: total };
  } catch (e) {
    return { success: false, error: mensaje(e) };
  }
}

/**
 * «Sincronizar ahora»: lo mismo que hace el cron de GEMA cada noche (ingresos,
 * retiros y reingresos del maestro de GEMA al control).
 */
export async function sincronizarConGema(): Promise<Resultado<ResultadoSincronizacionExamenes>> {
  try {
    const perms = await assertExamenes("crear");
    const r = await sincronizarControlExamenes(createAdminClient(), { origen: "manual", usuarioEmail: perms.userEmail });
    if (r.omitida) throw new Error(`No se sincronizó: ${r.omitida}.`);
    revalidatePath(RUTA);
    // El detalle del plan no viaja al navegador.
    return { success: true, dato: { ...r, plan: undefined } };
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
