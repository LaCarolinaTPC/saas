"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessSub, getCurrentPermissions, tienePermiso } from "@/lib/permissions";
import {
  BUCKET_PADRINO, cedulaDelUsuario, getPoliticaPorId, getPoliticas, getPoliticaVigente, hoyBogota, referidoVigente, validar,
} from "./datos";
import { totalesEsquema, validarPublicacion } from "./politica";
import { actualizarEstadoReferido, bitacora, bitacoraHito, evaluarHitos, sincronizarConProceso, sincronizarIncentivos } from "./servidor";
import { CERT_MAX, CERT_MIMES, firmaCoincide } from "./archivos";
import { validarAprobacionHito, validarPago } from "./hitos";
import {
  ESTADOS_ABIERTOS, ESTADOS_CAMBIO_ESQUEMA, ESTADOS_DECISION, hitosPorBeneficiario, padrinoPuedeRegistrar, resumenDecision, validarDecision,
  type DecisionEsquema, type HitoBeneficiario, type Validacion,
} from "./reglas";

/** Columnas del esquema que se guardan con la decisión (desde la v3). */
const columnasEsquema = (e: DecisionEsquema) => ({
  esquema: e.esquema,
  tipo_ingreso: e.tipoIngreso,
  meses_fuera: e.mesesFuera,
  sin_bonificacion_motivo: e.sinBonificacion,
});

/** Sin la migración de la v3 esas columnas no existen (PostgREST: PGRST204): se guarda sin ellas. */
const faltaColumna = (e: { code?: string; message?: string } | null) => Boolean(e && (e.code === "PGRST204" || /column/i.test(e.message ?? "")));

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const RUTA = "/candidatos/plan-padrino";

type Sub = "padrino_consulta" | "padrino_registro" | "padrino_aprobacion" | "padrino_pago";

/** Permiso de la sub-función, y la cédula del usuario para que no actúe sobre su propio registro. */
async function exigir(sub: Sub, opciones: { editar?: boolean } = {}) {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "candidatos", sub)) throw new Error("No tienes permiso para esta acción del Plan Padrino.");
  if (opciones.editar && !tienePermiso(perms, `candidatos.${sub}.editar`)) throw new Error("Tu rol es de solo lectura.");
  const cedula = await cedulaDelUsuario(perms.userId, perms.userEmail);
  return { perms, cedula };
}

/** Lee el referido y bloquea al padrino sobre su propio registro. */
async function leerReferido(id: string, cedulaUsuario: string | null) {
  const { data } = await createAdminClient().from("padrino_referidos").select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("El referido no existe.");
  if (cedulaUsuario && data.cedula_padrino === cedulaUsuario) throw new Error("No puedes gestionar un registro en el que eres el padrino.");
  return data as {
    id: string; estado: string; esquema: "A" | "B" | "C"; proceso_id: string | null; cedula_padrino: string; cedula_referido: string;
    politica_id: string; fecha_ingreso: string | null;
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

export async function buscarProcesos(q: string, opciones: { simulador?: boolean } = {}): Promise<ProcesoOpcion[]> {
  if (opciones.simulador) await exigirSimulador();
  else await exigir("padrino_registro", { editar: true });
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

/**
 * Conductores activos y empleados activos. En la v2 (lista blanca), de los
 * empleados solo los autorizados; desde la v3 cualquiera: si su área o cargo
 * está excluido, lo dice la validación (P2) al registrar.
 */
export async function buscarPadrinos(q: string, opciones: { todosLosEmpleados?: boolean } = {}): Promise<PadrinoOpcion[]> {
  // El simulador busca entre todos los empleados (la v3 no usa lista blanca);
  // el registro, con la regla de la versión vigente.
  const { cedula: propia } = opciones.todosLosEmpleados ? await exigirSimulador() : await exigir("padrino_registro", { editar: true });
  const t = q.replace(/[%,()]/g, " ").trim();
  if (t.length < 3) return [];
  const admin = createAdminClient();
  const vigente = await getPoliticaVigente(hoyBogota(), admin);
  const listaBlanca = !opciones.todosLosEmpleados && (vigente?.parametros.padrino.modo_empleados ?? "lista_blanca") === "lista_blanca";
  const { data: aut } = await admin.from("padrino_empleados_autorizados").select("cedula").is("revocado_at", null);
  const autorizados = (aut ?? []).map((a) => a.cedula as string);
  const empleados = () => {
    const base = admin.from("employees").select("document_number, full_name, position").in("status", ["activo", "periodo_prueba"]);
    return (listaBlanca ? base.in("document_number", autorizados) : base).or(`document_number.ilike.%${t}%,full_name.ilike.%${t}%`).limit(8);
  };
  const [cond, emp] = await Promise.all([
    admin.from("conductores").select("cedula, nombre, tipo_conductor, codigo").eq("estado", "ACTIVO").or(`cedula.ilike.%${t}%,nombre.ilike.%${t}%,codigo.ilike.%${t}%`).limit(12),
    !listaBlanca || autorizados.length
      ? empleados()
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

    // Con la versión vigente hoy. Al contratar se reasigna la vigente en la
    // fecha de ingreso (servidor.ts, ajustarAlContratar).
    const { validacion, padrino, referido, politica, esquema } = await validar(input.procesoId, cedulaPadrino, admin);
    if (referido.cedula === cedulaPadrino) throw new Error("El padrino y el referido no pueden ser la misma persona.");
    if (propia && referido.cedula === propia) throw new Error("No puedes registrar un referido con tu propia cédula.");
    const bloqueo = padrinoPuedeRegistrar(validacion.padrino);
    if (bloqueo) throw new Error(bloqueo);

    const previo = await referidoVigente(referido.cedula, admin);
    if (previo) {
      const cuando = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium" }).format(new Date(previo.created_at));
      throw new Error(`Este referido ya está registrado con el padrino ${previo.nombre_padrino ?? previo.cedula_padrino}, por ${previo.created_by_email ?? "otro usuario"} el ${cuando}.`);
    }

    if (!politica) throw new Error("No hay una versión de la política vigente hoy.");

    const esConductor = padrino.conductor?.estado === "ACTIVO";
    const fila = {
        politica_id: politica.id,
        candidate_id: referido.candidateId,
        proceso_id: input.procesoId,
        cedula_referido: referido.cedula,
        nombre_referido: referido.nombre,
        cedula_padrino: cedulaPadrino,
        nombre_padrino: esConductor ? padrino.conductor!.nombre : padrino.empleado?.nombre ?? padrino.conductor?.nombre ?? null,
        padrino_tipo: esConductor ? "conductor" : "empleado",
        padrino_cargo: esConductor ? padrino.conductor!.tipo : padrino.empleado?.cargo ?? null,
        estado: "en_validacion",
        validacion,
        validacion_at: new Date().toISOString(),
        created_by: perms.userId,
        created_by_email: perms.userEmail,
    };
    // El esquema según el tipo de referido (sin certificado validado todavía: B, o C si es reintegro).
    let { data, error } = await admin.from("padrino_referidos").insert({ ...fila, ...columnasEsquema(esquema) }).select("id").single();
    if (faltaColumna(error)) ({ data, error } = await admin.from("padrino_referidos").insert({ ...fila, esquema: esquema.esquema === "C" ? "B" : esquema.esquema }).select("id").single());
    if (error || !data) {
      if (error?.code === "23505") throw new Error("Este referido ya tiene un registro vigente.");
      throw new Error(error?.message ?? "No se pudo registrar el referido.");
    }
    await bitacora(data.id as string, "registro", { proceso_id: input.procesoId, cedula_padrino: cedulaPadrino, politica: politica.version, validacion, esquema: esquema.esquema, tipo_ingreso: esquema.tipoIngreso, sin_bonificacion: esquema.sinBonificacion }, perms);
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
    const admin = createAdminClient();
    const politica = await getPoliticaPorId(r.politica_id, admin);
    const { validacion, esquema } = await validar(r.proceso_id, r.cedula_padrino, admin, {
      politica,
      referidoId: id,
      experienciaCertificada: r.certificado_validado_at ? r.experiencia_certificada : null,
    });
    const base = { validacion, validacion_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    let { error } = await admin.from("padrino_referidos").update({ ...base, ...columnasEsquema(esquema) }).eq("id", id);
    if (faltaColumna(error)) ({ error } = await admin.from("padrino_referidos").update(base).eq("id", id));
    if (error) throw new Error(error.message);
    await bitacora(id, "revalidacion", { antes: r.validacion, despues: validacion, esquema: esquema.esquema, sin_bonificacion: esquema.sinBonificacion }, perms);
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

    // El MIME lo declara el navegador: la firma binaria confirma el contenido real.
    const contenido = Buffer.from(await archivo.arrayBuffer());
    if (!firmaCoincide(archivo.type, new Uint8Array(contenido.subarray(0, 16)))) {
      throw new Error("El contenido del archivo no corresponde al tipo declarado: adjunte un PDF, JPG o PNG real.");
    }

    const admin = createAdminClient();
    const ruta = `${r.cedula_referido}/${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
    const { error: e1 } = await admin.storage.from(BUCKET_PADRINO).upload(ruta, contenido, { contentType: archivo.type, upsert: false });
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
    // El esquema lo decide la versión de la política con el certificado y el
    // tipo de referido: un reintegro nunca va por el A (v3), aunque certifique.
    const admin = createAdminClient();
    const politica = await getPoliticaPorId(r.politica_id, admin);
    const decision = r.proceso_id
      ? (await validar(r.proceso_id, r.cedula_padrino, admin, { politica, referidoId: id, experienciaCertificada: valido, fechaIngreso: r.fecha_ingreso })).esquema
      : null;
    const esquema = decision?.esquema ?? (valido ? "A" : "B");
    const base = {
      experiencia_certificada: valido,
      esquema,
      certificado_validado_por_email: perms.userEmail,
      certificado_validado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    let { error } = await admin.from("padrino_referidos").update(decision ? { ...base, ...columnasEsquema(decision) } : base).eq("id", id);
    if (faltaColumna(error)) ({ error } = await admin.from("padrino_referidos").update({ ...base, esquema: esquema === "C" ? "B" : esquema }).eq("id", id));
    if (error) throw new Error(error.message);
    await bitacora(id, "cambio_esquema", { certificado_valido: valido, esquema_antes: r.esquema, esquema_despues: esquema, motivo: decision?.dato ?? null, observacion: observacion.trim() || null }, perms);
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
    .select("*, padrino_referidos!inner(cedula_padrino, cedula_referido, created_by, anulado_at)")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new Error("El hito no existe.");
  const ref = (Array.isArray(data.padrino_referidos) ? data.padrino_referidos[0] : data.padrino_referidos) as { cedula_padrino: string; cedula_referido: string; created_by: string | null; anulado_at: string | null };
  if (ref.anulado_at) throw new Error("El registro del referido está anulado.");
  if (cedulaUsuario && ref.cedula_padrino === cedulaUsuario) throw new Error("No puedes gestionar los hitos en los que eres el padrino.");
  // Desde la v3 también se le paga al referido: quien cobra un hito no lo gestiona (RQ-07).
  if (cedulaUsuario && (data.cedula_beneficiario === cedulaUsuario || (data.beneficiario === "referido" && ref.cedula_referido === cedulaUsuario))) {
    throw new Error("No puedes gestionar un hito que te pagan a ti.");
  }
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
      await bitacoraHito(h.referido_id as string, h.id as string, "hito_pagado", { numero: h.numero, beneficiario: h.beneficiario ?? "padrino", valor: h.valor, fecha_pago: input.fechaPago, referencia: input.referencia.trim() }, perms);
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

// ── Simulador de versiones y publicación (fase 5, mínima) ───────────────────

/** El simulador solo lee: lo usan quienes aprueban en Plan Padrino y los administradores. */
async function exigirSimulador() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccessSub(perms, "candidatos", "padrino_aprobacion")) {
    throw new Error("El simulador de la política es para quienes aprueban en Plan Padrino o administran Gestivo.");
  }
  const cedula = await cedulaDelUsuario(perms.userId, perms.userEmail);
  return { perms, cedula };
}

export interface LadoSimulacion {
  politicaId: string;
  version: string;
  estado: "borrador" | "publicada";
  vigenteDesde: string | null;
  validacion: Validacion;
  esquema: DecisionEsquema;
  nombreEsquema: string | null;
  /** Lo que pesa al decidir la elegibilidad (bloqueantes y observaciones). */
  decision: { bloqueantes: number; observar: number };
  /** Si el padrino ni siquiera podría registrar con esta versión, por qué. */
  bloqueoRegistro: string | null;
  hitos: HitoBeneficiario[];
  totales: { padrino: number; referido: number; total: number };
}

export interface ResultadoSimulacion {
  referido: { nombre: string; cedula: string };
  padrino: { nombre: string | null; cedula: string };
  fechaIngreso: string;
  fuenteIngreso: string;
  lados: LadoSimulacion[];
}

/** La versión publicada que rige en una fecha. */
function vigenteEn<T extends { vigente_desde: string | null; vigente_hasta: string | null }>(ps: T[], fecha: string): T | null {
  return (
    ps
      .filter((p) => p.vigente_desde && p.vigente_desde <= fecha && (!p.vigente_hasta || p.vigente_hasta >= fecha))
      .sort((a, b) => (b.vigente_desde ?? "").localeCompare(a.vigente_desde ?? ""))[0] ?? null
  );
}

/**
 * Evalúa a las mismas personas con la versión vigente y con las que están en
 * borrador, lado a lado: requisitos, esquema y pagos a cada beneficiario. No
 * guarda nada. `referidoId`: un referido ya registrado (toma su certificado y
 * su fecha de ingreso); si no, el proceso y el padrino elegidos.
 */
export async function simularVersiones(input: {
  procesoId: string;
  cedulaPadrino: string;
  referidoId?: string | null;
  /** Suponer el certificado de experiencia validado (sin dato: el del referido, o sin validar). */
  experienciaCertificada?: boolean | null;
}): Promise<Resultado<{ simulacion: ResultadoSimulacion }>> {
  try {
    await exigirSimulador();
    const admin = createAdminClient();
    const hoy = hoyBogota();
    if (!input.procesoId || !input.cedulaPadrino.trim()) throw new Error("Elija el referido y el padrino.");

    const [todas, ref, proc] = await Promise.all([
      getPoliticas(admin, { borradores: true }),
      input.referidoId ? admin.from("padrino_referidos").select("*").eq("id", input.referidoId).maybeSingle() : Promise.resolve({ data: null }),
      admin.from("procesos_contratacion").select("fecha_contrato").eq("id", input.procesoId).maybeSingle(),
    ]);
    const r = ref.data as { id: string; fecha_ingreso: string | null; experiencia_certificada: boolean; certificado_validado_at: string | null } | null;
    const vigente = vigenteEn(todas.filter((p) => p.estado === "publicada"), hoy);
    const versiones = [...(vigente ? [vigente] : []), ...todas.filter((p) => p.estado === "borrador")];
    if (!versiones.length) throw new Error("No hay versiones de la política para comparar.");

    // La fecha de ingreso: la del referido si ya se contrató; si no, la de contrato del proceso; si no, hoy.
    const fechaIngreso = r?.fecha_ingreso ?? (proc.data?.fecha_contrato as string | null) ?? hoy;
    const fuenteIngreso = r?.fecha_ingreso ? "fecha de ingreso del referido" : proc.data?.fecha_contrato ? "fecha de contrato del proceso" : "hoy (todavía no se contrata)";
    const experienciaCertificada =
      input.experienciaCertificada !== undefined && input.experienciaCertificada !== null
        ? input.experienciaCertificada
        : r?.certificado_validado_at
          ? r.experiencia_certificada
          : null;

    const lados: LadoSimulacion[] = [];
    let personas: Omit<ResultadoSimulacion, "lados"> | null = null;
    for (const politica of versiones) {
      const v = await validar(input.procesoId, input.cedulaPadrino.trim(), admin, {
        politica,
        referidoId: r?.id ?? null,
        experienciaCertificada,
        fechaIngreso,
      });
      const p = politica.parametros;
      const sin = Boolean(v.esquema.sinBonificacion);
      lados.push({
        politicaId: politica.id,
        version: politica.version,
        estado: politica.estado,
        vigenteDesde: politica.vigente_desde,
        validacion: v.validacion,
        esquema: v.esquema,
        nombreEsquema: p.esquemas[v.esquema.esquema]?.nombre ?? null,
        decision: resumenDecision(v.validacion),
        bloqueoRegistro: padrinoPuedeRegistrar(v.validacion.padrino),
        hitos: sin ? [] : hitosPorBeneficiario(p, v.esquema.esquema, fechaIngreso),
        totales: sin ? { padrino: 0, referido: 0, total: 0 } : totalesEsquema(p.esquemas[v.esquema.esquema]),
      });
      personas ??= {
        referido: { nombre: v.referido.nombre, cedula: v.referido.cedula },
        padrino: { nombre: v.padrino.conductor?.nombre ?? v.padrino.empleado?.nombre ?? null, cedula: input.cedulaPadrino.trim() },
        fechaIngreso,
        fuenteIngreso,
      };
    }
    return ok({ simulacion: { ...personas!, lados } });
  } catch (e) {
    return falla(e);
  }
}

/**
 * Publica un borrador de la política: desde `vigenteDesde` rige para los
 * registros nuevos y para los referidos que ingresen desde ese día; la
 * versión abierta se cierra el día anterior. Solo un administrador, con quién
 * aprobó y el soporte. Después la versión no se puede editar (trigger).
 */
export async function publicarPolitica(input: { id: string; vigenteDesde: string; aprobadaPor: string; soporte: string }): Promise<Resultado<{ version: string }>> {
  try {
    const perms = await getCurrentPermissions();
    if (!perms.isAdmin) throw new Error("Solo un administrador puede publicar una versión de la política.");
    const admin = createAdminClient();
    const todas = await getPoliticas(admin, { borradores: true });
    const borrador = todas.find((p) => p.id === input.id);
    if (!borrador || borrador.estado !== "borrador") throw new Error("Esa versión no está en borrador.");
    const { data: fila } = await admin.from("padrino_politicas").select("parametros").eq("id", input.id).maybeSingle();
    const v = validarPublicacion({
      parametros: fila?.parametros,
      publicadas: todas.filter((p) => p.estado === "publicada"),
      vigenteDesde: input.vigenteDesde,
      hoy: hoyBogota(),
      aprobadaPor: input.aprobadaPor,
      soporte: input.soporte,
    });
    if (!v.ok) throw new Error(v.error);

    // Primero se publica la nueva: aunque cerrar la anterior fallara, la
    // vigente es la de inicio más reciente (politicaVigente) y no hay hueco.
    const { data: pub, error } = await admin
      .from("padrino_politicas")
      .update({
        estado: "publicada",
        vigente_desde: input.vigenteDesde,
        aprobada_por: input.aprobadaPor.trim(),
        soporte: input.soporte.trim(),
        publicada_por_email: perms.userEmail,
        publicada_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("estado", "borrador")
      .select("id");
    if (error) throw new Error(error.message);
    if (!pub?.length) throw new Error("Otra persona ya publicó esta versión.");
    for (const c of v.cerrar) {
      const { error: e } = await admin.from("padrino_politicas").update({ vigente_hasta: c.hasta }).eq("id", c.id).is("vigente_hasta", null);
      if (e) console.error(`[padrino] no se pudo cerrar la versión ${c.version}:`, e.message);
    }
    console.info(`[padrino] ${perms.userEmail} publicó la política ${borrador.version} desde ${input.vigenteDesde}.`);
    revalidatePath(RUTA);
    return ok({ version: borrador.version });
  } catch (e) {
    return falla(e);
  }
}
