"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import {
  BUCKET_PADRINO, cedulaDelUsuario, getPoliticaVigente, hoyBogota, referidoVigente, validar,
} from "./datos";
import { actualizarEstadoReferido, bitacora, bitacoraHito, evaluarHitos, sincronizarConProceso, sincronizarIncentivos } from "./servidor";
import { validarAprobacionHito, validarPago } from "./hitos";
import {
  ESTADOS_ABIERTOS, ESTADOS_CAMBIO_ESQUEMA, ESTADOS_DECISION, esquemaPara, padrinoPuedeRegistrar, validarDecision,
  type Validacion,
} from "./reglas";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const RUTA = "/candidatos/plan-padrino";
const CERT_MIMES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
const CERT_MAX = 8 * 1024 * 1024;

type Sub = "padrino_consulta" | "padrino_registro" | "padrino_aprobacion" | "padrino_pago";

/** Permiso de la sub-función, y la cédula del usuario para que no actúe sobre su propio registro. */
async function exigir(sub: Sub, opciones: { editar?: boolean } = {}) {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "candidatos", sub)) throw new Error("No tienes permiso para esta acción del Plan Padrino.");
  if (opciones.editar && !perms.puedeEditar && !perms.isAdmin) throw new Error("Tu rol es de solo lectura.");
  const cedula = await cedulaDelUsuario(perms.userId, perms.userEmail);
  return { perms, cedula };
}

/** Lee el referido y bloquea al padrino sobre su propio registro. */
async function leerReferido(id: string, cedulaUsuario: string | null) {
  const { data } = await createAdminClient().from("padrino_referidos").select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("El referido no existe.");
  if (cedulaUsuario && data.cedula_padrino === cedulaUsuario) throw new Error("No puedes gestionar un registro en el que eres el padrino.");
  return data as {
    id: string; estado: string; esquema: "A" | "B"; proceso_id: string | null; cedula_padrino: string; cedula_referido: string;
    validacion: Validacion; experiencia_certificada: boolean; certificado_ruta: string | null; certificado_validado_at: string | null;
    anulado_at: string | null; created_by: string | null;
  };
}

function ok(): { ok: true };
function ok<T extends object>(extra: T): { ok: true } & T;
function ok(extra?: object) {
  return { ok: true as const, ...(extra ?? {}) };
}
const falla = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Error inesperado." });

// ── Búsquedas para el registro ──────────────────────────────────────────────

export interface ProcesoOpcion { id: string; cedula: string; nombre: string; estado: string; fecha_creacion: string; vacante: string | null }
export interface PadrinoOpcion { cedula: string; nombre: string; tipo: "conductor" | "empleado"; detalle: string }

export async function buscarProcesos(q: string): Promise<ProcesoOpcion[]> {
  await exigir("padrino_registro");
  const t = q.replace(/[%,()]/g, " ").trim();
  if (t.length < 3) return [];
  const { data } = await createAdminClient()
    .from("procesos_contratacion")
    .select("id, cedula, nombre, estado, fecha_creacion, vacancies(title)")
    .or(`cedula.ilike.%${t}%,nombre.ilike.%${t}%`)
    .order("fecha_creacion", { ascending: false })
    .limit(15);
  return (data ?? []).map((p) => {
    const v = p.vacancies as { title: string } | { title: string }[] | null;
    return { id: p.id as string, cedula: p.cedula as string, nombre: p.nombre as string, estado: p.estado as string, fecha_creacion: p.fecha_creacion as string, vacante: (Array.isArray(v) ? v[0]?.title : v?.title) ?? null };
  });
}

/** Conductores activos y, de los empleados, solo los activos autorizados como padrinos. */
export async function buscarPadrinos(q: string): Promise<PadrinoOpcion[]> {
  const { cedula: propia } = await exigir("padrino_registro");
  const t = q.replace(/[%,()]/g, " ").trim();
  if (t.length < 3) return [];
  const admin = createAdminClient();
  const { data: aut } = await admin.from("padrino_empleados_autorizados").select("cedula").is("revocado_at", null);
  const autorizados = (aut ?? []).map((a) => a.cedula as string);
  const [cond, emp] = await Promise.all([
    admin.from("conductores").select("cedula, nombre, tipo_conductor, codigo").eq("estado", "ACTIVO").or(`cedula.ilike.%${t}%,nombre.ilike.%${t}%,codigo.ilike.%${t}%`).limit(12),
    autorizados.length
      ? admin.from("employees").select("document_number, full_name, position").in("status", ["activo", "periodo_prueba"]).in("document_number", autorizados).or(`document_number.ilike.%${t}%,full_name.ilike.%${t}%`).limit(8)
      : Promise.resolve({ data: [] as { document_number: string; full_name: string; position: string | null }[] }),
  ]);
  const out: PadrinoOpcion[] = [
    ...(cond.data ?? []).map((c) => ({ cedula: c.cedula as string, nombre: c.nombre as string, tipo: "conductor" as const, detalle: [c.codigo ? `Código ${c.codigo}` : null, c.tipo_conductor].filter(Boolean).join(" · ") })),
    ...(emp.data ?? []).filter((e) => e.document_number).map((e) => ({ cedula: e.document_number as string, nombre: e.full_name as string, tipo: "empleado" as const, detalle: (e.position as string | null) ?? "Empleado" })),
  ];
  return out.filter((p) => p.cedula !== propia);
}

// ── Registro (RQ-01, RQ-02) ─────────────────────────────────────────────────

export async function registrarReferido(input: { procesoId: string; cedulaPadrino: string }): Promise<Resultado<{ id: string }>> {
  try {
    const { perms, cedula: propia } = await exigir("padrino_registro", { editar: true });
    const cedulaPadrino = input.cedulaPadrino.trim();
    if (!input.procesoId || !cedulaPadrino) throw new Error("Elija el proceso del referido y el padrino.");
    if (propia && cedulaPadrino === propia) throw new Error("No puedes registrarte como padrino.");
    const admin = createAdminClient();

    const { validacion, padrino, referido } = await validar(input.procesoId, cedulaPadrino, admin);
    if (referido.cedula === cedulaPadrino) throw new Error("El padrino y el referido no pueden ser la misma persona.");
    if (propia && referido.cedula === propia) throw new Error("No puedes registrar un referido con tu propia cédula.");
    const bloqueo = padrinoPuedeRegistrar(validacion.padrino);
    if (bloqueo) throw new Error(bloqueo);

    const previo = await referidoVigente(referido.cedula, admin);
    if (previo) {
      const cuando = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium" }).format(new Date(previo.created_at));
      throw new Error(`Este referido ya está registrado con el padrino ${previo.nombre_padrino ?? previo.cedula_padrino}, por ${previo.created_by_email ?? "otro usuario"} el ${cuando}.`);
    }

    const politica = await getPoliticaVigente(hoyBogota(), admin);
    if (!politica) throw new Error("No hay una versión de la política vigente hoy.");

    const esConductor = padrino.conductor?.estado === "ACTIVO";
    const { data, error } = await admin
      .from("padrino_referidos")
      .insert({
        politica_id: politica.id,
        candidate_id: referido.candidateId,
        proceso_id: input.procesoId,
        cedula_referido: referido.cedula,
        nombre_referido: referido.nombre,
        cedula_padrino: cedulaPadrino,
        nombre_padrino: esConductor ? padrino.conductor!.nombre : padrino.empleado?.nombre ?? padrino.conductor?.nombre ?? null,
        padrino_tipo: esConductor ? "conductor" : "empleado",
        padrino_cargo: esConductor ? padrino.conductor!.tipo : padrino.empleado?.cargo ?? null,
        esquema: "B",
        estado: "en_validacion",
        validacion,
        validacion_at: new Date().toISOString(),
        created_by: perms.userId,
        created_by_email: perms.userEmail,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Este referido ya tiene un registro vigente.");
      throw new Error(error.message);
    }
    await bitacora(data.id as string, "registro", { proceso_id: input.procesoId, cedula_padrino: cedulaPadrino, politica: politica.version, validacion }, perms);
    revalidatePath(RUTA);
    return ok({ id: data.id as string });
  } catch (e) {
    return falla(e);
  }
}

/** Recalcula el semáforo con los datos de hoy (antes de decidir la elegibilidad). */
export async function revalidarReferido(id: string): Promise<Resultado> {
  try {
    const { perms, cedula } = await exigir("padrino_registro", { editar: true });
    const r = await leerReferido(id, cedula);
    if (r.anulado_at || !ESTADOS_DECISION.includes(r.estado)) throw new Error("Solo se revalida mientras se decide la elegibilidad.");
    if (!r.proceso_id) throw new Error("El referido no tiene proceso de contratación.");
    const { validacion } = await validar(r.proceso_id, r.cedula_padrino);
    const { error } = await createAdminClient().from("padrino_referidos").update({ validacion, validacion_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    await bitacora(id, "revalidacion", { antes: r.validacion, despues: validacion }, perms);
    revalidatePath(`${RUTA}/${id}`);
    return ok();
  } catch (e) {
    return falla(e);
  }
}

// ── Certificado y esquema (RQ-03) ───────────────────────────────────────────

export async function subirCertificado(form: FormData): Promise<Resultado> {
  try {
    const { perms, cedula } = await exigir("padrino_registro", { editar: true });
    const id = String(form.get("id") ?? "");
    const archivo = form.get("archivo");
    if (!(archivo instanceof File) || !archivo.size) throw new Error("Adjunte el certificado.");
    const ext = CERT_MIMES[archivo.type];
    if (!ext) throw new Error("El certificado debe ser PDF, JPG o PNG.");
    if (archivo.size > CERT_MAX) throw new Error("El certificado no puede pasar de 8 MB.");
    const r = await leerReferido(id, cedula);
    if (r.anulado_at || !ESTADOS_CAMBIO_ESQUEMA.includes(r.estado)) throw new Error("El esquema ya no se puede cambiar: el certificado no se puede reemplazar.");

    const admin = createAdminClient();
    const ruta = `${r.cedula_referido}/${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
    const { error: e1 } = await admin.storage.from(BUCKET_PADRINO).upload(ruta, Buffer.from(await archivo.arrayBuffer()), { contentType: archivo.type, upsert: false });
    if (e1) throw new Error(`No se pudo guardar el archivo: ${e1.message}`);
    // Un certificado nuevo vuelve a pedir validación: el esquema regresa a B hasta que la coordinadora lo valide.
    const { error } = await admin
      .from("padrino_referidos")
      .update({
        certificado_ruta: ruta,
        certificado_nombre: archivo.name.slice(0, 200),
        certificado_mime: archivo.type,
        certificado_subido_por_email: perms.userEmail,
        certificado_subido_at: new Date().toISOString(),
        certificado_validado_por_email: null,
        certificado_validado_at: null,
        experiencia_certificada: false,
        esquema: "B",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      await admin.storage.from(BUCKET_PADRINO).remove([ruta]).catch(() => undefined);
      throw new Error(error.message);
    }
    await bitacora(id, "certificado_subido", { archivo: archivo.name, reemplaza: r.certificado_ruta, esquema_antes: r.esquema }, perms);
    revalidatePath(`${RUTA}/${id}`);
    return ok();
  } catch (e) {
    return falla(e);
  }
}

/** La coordinadora valida (Esquema A) o rechaza (Esquema B) el certificado. */
export async function validarCertificado(id: string, valido: boolean, observacion: string): Promise<Resultado> {
  try {
    const { perms, cedula } = await exigir("padrino_aprobacion", { editar: true });
    const r = await leerReferido(id, cedula);
    if (r.anulado_at || !ESTADOS_CAMBIO_ESQUEMA.includes(r.estado)) throw new Error("El esquema solo cambia antes del primer hito.");
    if (!r.certificado_ruta) throw new Error("No hay certificado adjunto.");
    if (!valido && !observacion.trim()) throw new Error("Escriba por qué el certificado no es válido.");
    const esquema = esquemaPara(valido);
    const { error } = await createAdminClient()
      .from("padrino_referidos")
      .update({
        experiencia_certificada: valido,
        esquema,
        certificado_validado_por_email: perms.userEmail,
        certificado_validado_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    await bitacora(id, "cambio_esquema", { certificado_valido: valido, esquema_antes: r.esquema, esquema_despues: esquema, observacion: observacion.trim() || null }, perms);
    revalidatePath(`${RUTA}/${id}`);
    return ok();
  } catch (e) {
    return falla(e);
  }
}

// ── Elegibilidad y contratación (RQ-04) ─────────────────────────────────────

export async function decidirElegibilidad(input: { id: string; decision: "elegible" | "no_elegible"; observacion: string; excepcion: boolean }): Promise<Resultado> {
  try {
    const { perms, cedula } = await exigir("padrino_aprobacion", { editar: true });
    const r = await leerReferido(input.id, cedula);
    if (r.anulado_at || !ESTADOS_DECISION.includes(r.estado)) throw new Error("La elegibilidad de este referido ya se decidió.");
    // Con el proceso ya contratado, aprobar crea los hitos y congela el esquema:
    // un certificado adjunto sin validar dejaría al padrino en B ($200.000) sin remedio.
    if (input.decision === "elegible" && r.certificado_ruta && !r.certificado_validado_at) {
      throw new Error("Hay un certificado de experiencia sin validar. Valídelo o rechácelo antes de aprobar la elegibilidad: al contratar se crean los hitos y el esquema ya no cambia.");
    }
    const error = validarDecision(input.decision, r.validacion, input.excepcion, input.observacion);
    if (error) throw new Error(error);
    const excepcion = input.decision === "elegible" && input.excepcion;
    const { error: e } = await createAdminClient()
      .from("padrino_referidos")
      .update({
        estado: input.decision,
        elegibilidad_excepcion: excepcion,
        elegibilidad_observacion: input.observacion.trim() || null,
        elegibilidad_por_email: perms.userEmail,
        elegibilidad_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .in("estado", ESTADOS_DECISION);
    if (e) throw new Error(e.message);
    await bitacora(input.id, input.decision === "elegible" ? (excepcion ? "elegible_por_excepcion" : "elegible") : "no_elegible", { observacion: input.observacion.trim() || null }, perms);
    if (input.decision === "elegible" && r.proceso_id) await sincronizarConProceso(r.proceso_id, perms);
    revalidatePath(`${RUTA}/${input.id}`);
    revalidatePath(RUTA);
    return ok();
  } catch (e) {
    return falla(e);
  }
}

/** Cierra sin bonificación al referido cuyo proceso no terminó en contratación (historia 14). */
export async function cerrarNoContratado(id: string, observacion: string): Promise<Resultado> {
  try {
    const { perms, cedula } = await exigir("padrino_aprobacion", { editar: true });
    const r = await leerReferido(id, cedula);
    if (r.anulado_at || !["registrado", "en_validacion", "elegible"].includes(r.estado)) throw new Error("Solo se cierra como no contratado antes de la contratación.");
    if (!observacion.trim()) throw new Error("Escriba la observación del cierre.");
    const { error } = await createAdminClient().from("padrino_referidos").update({ estado: "no_contratado", cierre_observacion: observacion.trim(), updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    await bitacora(id, "no_contratado", { estado_antes: r.estado, observacion: observacion.trim() }, perms);
    revalidatePath(`${RUTA}/${id}`);
    revalidatePath(RUTA);
    return ok();
  } catch (e) {
    return falla(e);
  }
}

/** Nada se borra (RQ-08): se anula con motivo y libera la cédula para un registro nuevo. */
export async function anularReferido(id: string, motivo: string, cancelarAprobados = false): Promise<Resultado> {
  try {
    const { perms, cedula } = await exigir("padrino_aprobacion", { editar: true });
    const r = await leerReferido(id, cedula);
    if (r.anulado_at) throw new Error("El registro ya está anulado.");
    if (!ESTADOS_ABIERTOS.includes(r.estado) && r.estado !== "no_elegible") throw new Error("Un registro cerrado no se anula.");
    if (!motivo.trim()) throw new Error("Escriba el motivo de la anulación.");
    // Un hito aprobado puede estar ya exportado a nómina: cancelarlo exige confirmación expresa.
    const { data: aprobados } = await createAdminClient().from("padrino_hitos").select("id").eq("referido_id", id).eq("estado", "aprobado");
    if (aprobados?.length && !cancelarAprobados) {
      throw new Error(`Este referido tiene ${aprobados.length} hito(s) aprobado(s), posiblemente ya exportados a nómina. Confirme la anulación para cancelarlos también.`);
    }
    const { error } = await createAdminClient()
      .from("padrino_referidos")
      .update({ anulado_at: new Date().toISOString(), anulado_por_email: perms.userEmail, motivo_anulacion: motivo.trim(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("anulado_at", null);
    if (error) throw new Error(error.message);
    // Los hitos que no se han pagado se cancelan con el registro.
    await createAdminClient()
      .from("padrino_hitos")
      .update({ estado: "cancelado", motivo: `Registro anulado: ${motivo.trim()}`, updated_at: new Date().toISOString() })
      .eq("referido_id", id)
      .in("estado", ["pendiente", "por_aprobar", "aprobado"]);
    await bitacora(id, "anulacion", { estado: r.estado, motivo: motivo.trim(), hitos_aprobados_cancelados: aprobados?.length ?? 0 }, perms);
    revalidatePath(`${RUTA}/${id}`);
    revalidatePath(RUTA);
    return ok();
  } catch (e) {
    return falla(e);
  }
}

// ── Hitos (fase 2: RQ-05 y RQ-06) ───────────────────────────────────────────

/** Corre a mano el cálculo diario (el cron lo hace después del sync de GEMA). */
export async function evaluarHitosAhora(): Promise<Resultado<{ resumen: Awaited<ReturnType<typeof evaluarHitos>> }>> {
  try {
    const { perms } = await exigir("padrino_aprobacion", { editar: true });
    const resumen = await evaluarHitos(hoyBogota(), perms);
    revalidatePath(`${RUTA}/hitos`);
    return ok({ resumen });
  } catch (e) {
    return falla(e);
  }
}

/** Lee el hito con su referido y aplica las reglas de quién puede actuar. */
async function leerHito(id: string, cedulaUsuario: string | null) {
  const { data } = await createAdminClient()
    .from("padrino_hitos")
    .select("id, referido_id, numero, estado, requiere_desempeno, valor, padrino_referidos!inner(cedula_padrino, created_by, anulado_at)")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new Error("El hito no existe.");
  const ref = (Array.isArray(data.padrino_referidos) ? data.padrino_referidos[0] : data.padrino_referidos) as { cedula_padrino: string; created_by: string | null; anulado_at: string | null };
  if (ref.anulado_at) throw new Error("El registro del referido está anulado.");
  if (cedulaUsuario && ref.cedula_padrino === cedulaUsuario) throw new Error("No puedes gestionar los hitos en los que eres el padrino.");
  return { ...data, ref };
}

export async function decidirHito(input: { id: string; aprobar: boolean; observacion: string; desempenoSatisfactorio: boolean }): Promise<Resultado> {
  try {
    const { perms, cedula } = await exigir("padrino_aprobacion", { editar: true });
    const h = await leerHito(input.id, cedula);
    const error = validarAprobacionHito({
      estado: h.estado as string,
      aprobar: input.aprobar,
      observacion: input.observacion,
      requiereDesempeno: Boolean(h.requiere_desempeno),
      desempenoSatisfactorio: input.desempenoSatisfactorio,
      aprobadorId: perms.userId,
      registradoPorId: h.ref.created_by,
    });
    if (error) throw new Error(error);
    const ahora = new Date().toISOString();
    const { data: upd, error: e } = await createAdminClient()
      .from("padrino_hitos")
      .update({
        estado: input.aprobar ? "aprobado" : "rechazado",
        desempeno_satisfactorio: h.requiere_desempeno ? input.desempenoSatisfactorio : null,
        aprobado_por_email: perms.userEmail,
        aprobado_at: ahora,
        observacion_aprobacion: input.observacion.trim() || null,
        updated_at: ahora,
      })
      .eq("id", input.id)
      .eq("estado", "por_aprobar")
      .select("id");
    if (e) throw new Error(e.message);
    if (!upd?.length) throw new Error("Otro usuario ya decidió este hito.");
    await bitacoraHito(h.referido_id as string, input.id, input.aprobar ? "hito_aprobado" : "hito_rechazado", { numero: h.numero, observacion: input.observacion.trim() || null, desempeno_satisfactorio: h.requiere_desempeno ? input.desempenoSatisfactorio : undefined }, perms);
    await actualizarEstadoReferido(h.referido_id as string, perms);
    revalidatePath(`${RUTA}/hitos`);
    revalidatePath(`${RUTA}/${h.referido_id}`);
    return ok();
  } catch (e) {
    return falla(e);
  }
}

/** Nómina marca hitos aprobados como pagados (uno o varios con la misma fecha y referencia). */
export async function marcarPagados(input: { ids: string[]; fechaPago: string; referencia: string }): Promise<Resultado<{ pagados: number }>> {
  try {
    const { perms, cedula } = await exigir("padrino_pago", { editar: true });
    if (!input.ids.length) throw new Error("Elija al menos un hito.");
    if (input.ids.length > 500) throw new Error("Máximo 500 hitos por vez.");
    const hoy = hoyBogota();
    const admin = createAdminClient();
    // Primero se validan todos: si uno no procede, no se paga ninguno.
    const hitos = [];
    for (const id of [...new Set(input.ids)]) {
      const h = await leerHito(id, cedula);
      const error = validarPago(h.estado as string, input.fechaPago, input.referencia, hoy);
      if (error) throw new Error(`Hito ${h.numero}: ${error}`);
      hitos.push(h);
    }
    // Un solo UPDATE para todo el lote: o se marcan todos o ninguno.
    const ahora = new Date().toISOString();
    const { data: upd, error: e } = await admin
      .from("padrino_hitos")
      .update({ estado: "pagado", fecha_pago: input.fechaPago, referencia_pago: input.referencia.trim(), pagado_por_email: perms.userEmail, pagado_at: ahora, updated_at: ahora })
      .in("id", hitos.map((h) => h.id as string))
      .eq("estado", "aprobado")
      .select("id");
    if (e) throw new Error(e.message);
    const idsPagados = new Set((upd ?? []).map((x) => x.id as string));
    const pagados = idsPagados.size;
    for (const h of hitos) {
      if (!idsPagados.has(h.id as string)) continue;
      await bitacoraHito(h.referido_id as string, h.id as string, "hito_pagado", { numero: h.numero, valor: h.valor, fecha_pago: input.fechaPago, referencia: input.referencia.trim() }, perms);
    }
    for (const refId of new Set(hitos.filter((h) => idsPagados.has(h.id as string)).map((h) => h.referido_id as string))) {
      await actualizarEstadoReferido(refId, perms);
    }
    // RQ-12: cada pago queda en incentivos (concepto «PLAN PADRINO …»).
    await sincronizarIncentivos(perms);
    revalidatePath(`${RUTA}/hitos`);
    return ok({ pagados });
  } catch (e) {
    return falla(e);
  }
}
