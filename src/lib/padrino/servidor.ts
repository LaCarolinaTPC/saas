/**
 * Operaciones internas del Plan Padrino (solo servidor, sin "use server": no
 * se exponen como acciones). Quien las llama ya verificó los permisos.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPoliticas, hoyBogota, validar } from "./datos";
import { bloqueantesNoCumplidos, hitosPorBeneficiario, politicaVigente } from "./reglas";
import type { LetraEsquema } from "./politica";
import { estadoReferidoPorHitos, evaluarHito, filaIncentivo, type HechosPermanencia } from "./hitos";

type Actor = { userId: string | null; userEmail: string | null };

export async function bitacora(referidoId: string, accion: string, detalle: Record<string, unknown>, actor: Actor) {
  const { error } = await createAdminClient().from("padrino_eventos").insert({
    referido_id: referidoId,
    accion,
    detalle,
    user_id: actor.userId,
    usuario_email: actor.userEmail,
  });
  if (error) console.error("[padrino] no se pudo escribir la bitácora:", error.message);
}

/**
 * Si el proceso del referido elegible ya está en "contratado", lo pasa a
 * Contratado con la fecha de ingreso: la de contrato del proceso; si no la
 * tiene, la de (re)ingreso del conductor; si tampoco, hoy. La llaman la
 * decisión de elegibilidad y Procesos de contratación al guardar. Nunca
 * lanza: un fallo aquí no debe impedir guardar el proceso.
 */
export async function sincronizarConProceso(procesoId: string | null, actor: Actor) {
  if (!procesoId) return;
  try {
    const admin = createAdminClient();
    const { data: refs, error } = await admin
      .from("padrino_referidos")
      .select("id, cedula_referido")
      .eq("proceso_id", procesoId)
      .eq("estado", "elegible")
      .is("anulado_at", null);
    // Sin la migración aplicada la tabla no existe: no hay nada que sincronizar.
    if (error || !refs?.length) return;
    const { data: p } = await admin.from("procesos_contratacion").select("estado, fecha_contrato").eq("id", procesoId).maybeSingle();
    if (p?.estado !== "contratado") return;
    for (const r of refs) {
      const { data: c } = await admin.from("conductores").select("fecha_ingreso, fecha_reingreso").eq("cedula", r.cedula_referido).maybeSingle();
      const fecha = (p.fecha_contrato as string | null) ?? (c?.fecha_reingreso as string | null) ?? (c?.fecha_ingreso as string | null) ?? hoyBogota();
      const fuente = p.fecha_contrato ? "fecha de contrato del proceso" : c?.fecha_reingreso || c?.fecha_ingreso ? "ingreso del conductor" : "fecha de hoy";
      const { error: e } = await admin
        .from("padrino_referidos")
        .update({ estado: "contratado", fecha_ingreso: fecha, updated_at: new Date().toISOString() })
        .eq("id", r.id)
        .eq("estado", "elegible");
      if (!e) {
        await bitacora(r.id as string, "contratado", { fecha_ingreso: fecha, fuente }, actor);
        await ajustarAlContratar(r.id as string, actor);
        await crearHitos(r.id as string, actor);
      }
    }
    revalidatePath("/candidatos/plan-padrino");
  } catch (e) {
    console.error("[padrino] no se pudo sincronizar con el proceso:", e);
  }
}

/**
 * Al contratar, antes de crear los hitos:
 *  1. La versión de la política que manda es la vigente en la FECHA DE
 *     INGRESO (alcance de la política: «referidos que ingresen a partir de la
 *     fecha de vigencia»). Al registrar se le asignó la vigente ese día; si
 *     cambió, se reasigna y queda en la bitácora.
 *  2. Se recalcula el esquema con esa versión (p. ej. un reintegro pasa a C,
 *     o queda sin bonificación).
 *  3. Se evalúan otra vez todos los requisitos, incluidos los que se
 *     verifican al contratar (licencia, antecedentes, exámenes, PESV). Si uno
 *     que bloquea no se cumple, no se crean hitos y queda el motivo.
 * Nunca lanza: lo que falle queda en la consola y los hitos se crean igual
 * con lo que ya tenía el registro.
 */
export async function ajustarAlContratar(referidoId: string, actor: Actor) {
  try {
    const admin = createAdminClient();
    const { data: r } = await admin.from("padrino_referidos").select("*").eq("id", referidoId).maybeSingle();
    if (!r || r.anulado_at || r.estado !== "contratado" || !r.fecha_ingreso || !r.proceso_id) return;
    const politicas = await getPoliticas(admin);
    const vigente = politicaVigente(politicas, r.fecha_ingreso as string);
    const actual = politicas.find((x) => x.id === r.politica_id) ?? null;
    const politica = vigente ?? actual;
    if (!politica) return;

    const { validacion, esquema } = await validar(r.proceso_id as string, r.cedula_padrino as string, admin, {
      politica,
      referidoId,
      experienciaCertificada: r.certificado_validado_at ? Boolean(r.experiencia_certificada) : null,
      fechaIngreso: r.fecha_ingreso as string,
    });
    const bloqueantes = bloqueantesNoCumplidos([...validacion.padrino, ...validacion.referido].filter((x) => x.momento === "contratacion"));
    const cambios: Record<string, unknown> = {
      politica_id: politica.id,
      esquema: esquema.esquema,
      tipo_ingreso: esquema.tipoIngreso,
      meses_fuera: esquema.mesesFuera,
      sin_bonificacion_motivo: esquema.sinBonificacion,
      validacion_contratacion: validacion,
      hitos_bloqueados_motivo: bloqueantes.length ? `Al contratar no se cumple: ${bloqueantes.map((b) => `${b.codigo} ${b.titulo} (${b.dato})`).join("; ")}` : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await admin.from("padrino_referidos").update(cambios).eq("id", referidoId).eq("estado", "contratado");
    if (error) {
      // Sin la migración de la v3 no existen las columnas nuevas: se deja como estaba.
      console.error("[padrino] no se pudo ajustar el referido al contratar:", error.message);
      return;
    }
    if (actual?.id !== politica.id) {
      await bitacora(referidoId, "version_ajustada", { antes: actual?.version ?? null, despues: politica.version, fecha_ingreso: r.fecha_ingreso }, actor);
    }
    if (r.esquema !== esquema.esquema || esquema.sinBonificacion) {
      await bitacora(referidoId, "cambio_esquema", { esquema_antes: r.esquema, esquema_despues: esquema.esquema, motivo: esquema.dato, sin_bonificacion: esquema.sinBonificacion }, actor);
    }
    await bitacora(referidoId, "validacion_contratacion", { politica: politica.version, validacion, bloqueantes: bloqueantes.map((b) => b.codigo) }, actor);
  } catch (e) {
    console.error("[padrino] no se pudo ajustar el referido al contratar:", e);
  }
}

// ── Hitos (fase 2) ──────────────────────────────────────────────────────────

/**
 * Crea los hitos del esquema del referido contratado (fecha de ingreso + N
 * meses calendario), uno por beneficiario con pago mayor que cero, y lo pasa
 * a En seguimiento. Idempotente: no duplica hitos que ya existan. Desde aquí
 * el esquema ya no cambia.
 *
 * No crea nada si el ingreso no da derecho a bonificación
 * (`sin_bonificacion_motivo`) o si al contratar falló un requisito que
 * bloquea (`hitos_bloqueados_motivo`): el referido se queda en Contratado con
 * el motivo a la vista, para que lo resuelvan (anular o revalidar).
 */
export async function crearHitos(referidoId: string, actor: Actor) {
  const admin = createAdminClient();
  const { data: r } = await admin.from("padrino_referidos").select("*").eq("id", referidoId).maybeSingle();
  if (!r || r.anulado_at || r.estado !== "contratado" || !r.fecha_ingreso) return;
  if (r.sin_bonificacion_motivo || r.hitos_bloqueados_motivo) return;
  const politicas = await getPoliticas(admin, { borradores: true });
  const politica = politicas.find((x) => x.id === r.politica_id);
  if (!politica) return;
  const esquema = r.esquema as LetraEsquema;
  const hitos = hitosPorBeneficiario(politica.parametros, esquema, r.fecha_ingreso as string);
  if (!hitos.length) return;
  const filas = hitos.map((h) => ({
    referido_id: referidoId,
    numero: h.numero,
    descripcion: h.descripcion,
    meses: h.meses,
    valor: h.valor,
    requiere_desempeno: h.requiere_desempeno,
    fecha_causacion: h.fechaCausacion!,
    beneficiario: h.beneficiario,
    cedula_beneficiario: h.beneficiario === "padrino" ? r.cedula_padrino : r.cedula_referido,
    nombre_beneficiario: h.beneficiario === "padrino" ? r.nombre_padrino : r.nombre_referido,
  }));
  const { error } = await admin.from("padrino_hitos").upsert(filas, { onConflict: "referido_id,numero,beneficiario", ignoreDuplicates: true });
  if (error) {
    console.error("[padrino] no se pudieron crear los hitos:", error.message);
    return;
  }
  await admin.from("padrino_referidos").update({ estado: "en_seguimiento", updated_at: new Date().toISOString() }).eq("id", referidoId).eq("estado", "contratado");
  await bitacora(referidoId, "hitos_creados", { esquema, politica: politica.version, hitos: hitos.map((h) => ({ numero: h.numero, beneficiario: h.beneficiario, valor: h.valor, fecha: h.fechaCausacion })) }, actor);
}

/** Recalcula el estado del referido en seguimiento a partir de sus hitos. */
export async function actualizarEstadoReferido(referidoId: string, actor: Actor) {
  const admin = createAdminClient();
  const [{ data: r }, { data: hitos }] = await Promise.all([
    admin.from("padrino_referidos").select("estado, anulado_at").eq("id", referidoId).maybeSingle(),
    admin.from("padrino_hitos").select("estado").eq("referido_id", referidoId),
  ]);
  if (!r || r.anulado_at || r.estado !== "en_seguimiento") return;
  const nuevo = estadoReferidoPorHitos(hitos ?? []);
  if (nuevo === "en_seguimiento") return;
  await admin.from("padrino_referidos").update({ estado: nuevo, updated_at: new Date().toISOString() }).eq("id", referidoId);
  await bitacora(referidoId, nuevo, {}, actor);
}

const enLotes = <T,>(xs: T[], n = 200) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const fechaBogota = (ts: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(ts));

/**
 * Cálculo diario (spec RQ-05): crea los hitos que falten y reevalúa los
 * pendientes cuya fecha ya llegó. Corre después del sync de GEMA (cron de
 * las 3:00 a. m.) y a mano desde la bandeja. Devuelve un resumen.
 */
export async function evaluarHitos(hoy: string, actor: Actor) {
  const admin = createAdminClient();
  const resumen = { hitosCreados: 0, evaluados: 0, porAprobar: 0, noCausados: 0, cancelados: 0, enEspera: 0, incentivos: 0 };
  // Pagos que quedaron sin su fila de incentivos (p. ej. si falló al marcarlos).
  resumen.incentivos = await sincronizarIncentivos(actor);

  // 1. Contratados que todavía no tienen hitos (p. ej. si falló la creación).
  const { data: sinHitos, error: e0 } = await admin.from("padrino_referidos").select("id").eq("estado", "contratado").is("anulado_at", null);
  if (e0) throw new Error(`Plan Padrino: ${e0.message}`);
  for (const r of sinHitos ?? []) {
    await crearHitos(r.id as string, actor);
    resumen.hitosCreados++;
  }

  // 2. Pendientes ya vencidos de referidos vigentes.
  const { data: pendientes, error } = await admin
    .from("padrino_hitos")
    .select("*, padrino_referidos!inner(cedula_referido, cedula_padrino, fecha_ingreso, politica_id, anulado_at)")
    .eq("estado", "pendiente")
    .lte("fecha_causacion", hoy)
    .is("padrino_referidos.anulado_at", null)
    .order("fecha_causacion")
    .order("numero");
  if (error) throw new Error(`Plan Padrino: ${error.message}`);
  type Ref = { cedula_referido: string; cedula_padrino: string; fecha_ingreso: string; politica_id: string };
  const filas = (pendientes ?? []).map((h) => ({ ...h, ref: (Array.isArray(h.padrino_referidos) ? h.padrino_referidos[0] : h.padrino_referidos) as Ref }));
  if (!filas.length) return resumen;
  // Parámetros de la versión de cada referido: modo de empleados y si el padrino debe seguir activo.
  const politicas = new Map((await getPoliticas(admin, { borradores: true })).map((p) => [p.id, p.parametros]));

  // El padrino se busca en ambos vínculos (conductores y empleados), sin
  // depender del tipo congelado al registrar: un conductor que pasó a empleado
  // autorizado (o al revés) conserva el contrato vigente.
  const cedPadrinos = [...new Set(filas.map((f) => f.ref.cedula_padrino))];
  const cedConductores = [...new Set([...filas.map((f) => f.ref.cedula_referido), ...cedPadrinos])];
  const conductores = new Map<string, { estado: string; fecha_retiro: string | null }>();
  for (const lote of enLotes(cedConductores)) {
    const { data } = await admin.from("conductores").select("cedula, estado, fecha_retiro").in("cedula", lote);
    for (const c of data ?? []) conductores.set(c.cedula as string, { estado: c.estado as string, fecha_retiro: (c.fecha_retiro as string | null) ?? null });
  }
  const empleados = new Map<string, { status: string; end_date: string | null }>();
  const autorizaciones = new Map<string, { revocadoEl: string | null }>();
  for (const lote of enLotes(cedPadrinos)) {
    const [{ data: emps }, { data: auts }] = await Promise.all([
      admin.from("employees").select("document_number, status, end_date").in("document_number", lote),
      // Con revocado_at incluido: la autorización se evalúa a la fecha de causación, no a la de hoy.
      admin.from("padrino_empleados_autorizados").select("cedula, revocado_at").in("cedula", lote),
    ]);
    for (const e of emps ?? []) empleados.set(e.document_number as string, { status: e.status as string, end_date: (e.end_date as string | null) ?? null });
    for (const a of auts ?? []) autorizaciones.set(a.cedula as string, { revocadoEl: a.revocado_at ? fechaBogota(a.revocado_at as string) : null });
  }

  const cancelados = new Map<string, number>();
  const tocados = new Set<string>();
  for (const f of filas) {
    // Ya cancelados: los hitos siguientes de este referido (la fila hermana del mismo número sí se evalúa).
    const corte = cancelados.get(f.referido_id as string);
    if (corte !== undefined && (f.numero as number) > corte) continue;
    const ref = conductores.get(f.ref.cedula_referido);
    const pc = conductores.get(f.ref.cedula_padrino);
    const pe = empleados.get(f.ref.cedula_padrino);
    const hechos: HechosPermanencia = {
      referido: ref ? { estado: ref.estado, fechaRetiro: ref.fecha_retiro } : null,
      padrinoConductor: pc ? { estado: pc.estado, fechaRetiro: pc.fecha_retiro } : null,
      padrinoEmpleado: pe ? { status: pe.status, fechaRetiro: pe.end_date } : null,
      autorizacionEmpleado: autorizaciones.get(f.ref.cedula_padrino) ?? null,
    };
    const params = politicas.get(f.ref.politica_id);
    const beneficiario = f.beneficiario === "referido" ? "referido" : "padrino";
    const res = evaluarHito(f.fecha_causacion as string, f.ref.fecha_ingreso, hoy, hechos, {
      beneficiario,
      modoEmpleados: params?.padrino.modo_empleados ?? "lista_blanca",
      padrinoDebeSeguirActivo: params?.padrino.debe_seguir_activo_para_cobrar ?? true,
    });
    resumen.evaluados++;
    const ahora = new Date().toISOString();

    if (res.estado === "pendiente") {
      resumen.enEspera++;
      if (res.motivo !== f.motivo) await admin.from("padrino_hitos").update({ motivo: res.motivo, evaluacion: hechos, evaluado_at: ahora }).eq("id", f.id);
      continue;
    }
    const { error: eu } = await admin
      .from("padrino_hitos")
      .update({ estado: res.estado, motivo: res.motivo, evaluacion: hechos, evaluado_at: ahora, updated_at: ahora })
      .eq("id", f.id)
      .eq("estado", "pendiente");
    if (eu) continue;
    tocados.add(f.referido_id as string);
    if (res.estado === "por_aprobar") {
      resumen.porAprobar++;
      await bitacoraHito(f.referido_id as string, f.id as string, "hito_por_aprobar", { numero: f.numero, beneficiario }, actor);
    } else {
      resumen.noCausados++;
      await bitacoraHito(f.referido_id as string, f.id as string, "hito_no_causado", { numero: f.numero, beneficiario, motivo: res.motivo }, actor);
      if (res.cancelaSiguientes) {
        const { data: cs } = await admin
          .from("padrino_hitos")
          .update({ estado: "cancelado", motivo: `Cancelado: ${res.motivo}`, evaluado_at: ahora, updated_at: ahora })
          .eq("referido_id", f.referido_id)
          .eq("estado", "pendiente")
          .gt("numero", f.numero)
          .select("id");
        resumen.cancelados += cs?.length ?? 0;
        if (cs?.length) await bitacora(f.referido_id as string, "hitos_cancelados", { desde_hito: f.numero + 1, cantidad: cs.length, motivo: res.motivo }, actor);
        cancelados.set(f.referido_id as string, f.numero as number);
      }
    }
  }
  for (const id of tocados) await actualizarEstadoReferido(id, actor);
  revalidatePath("/candidatos/plan-padrino");
  return resumen;
}

/** Varios eventos de hito en una sola inserción (p. ej. la exportación a Excel). */
export async function bitacoraHitosLote(hitos: { referidoId: string; hitoId: string }[], accion: string, detalle: Record<string, unknown>, actor: Actor) {
  const admin = createAdminClient();
  for (const lote of enLotes(hitos, 500)) {
    const { error } = await admin.from("padrino_eventos").insert(
      lote.map((h) => ({ referido_id: h.referidoId, hito_id: h.hitoId, accion, detalle, user_id: actor.userId, usuario_email: actor.userEmail }))
    );
    if (error) console.error("[padrino] no se pudo escribir la bitácora del lote:", error.message);
  }
}

export async function bitacoraHito(referidoId: string, hitoId: string, accion: string, detalle: Record<string, unknown>, actor: Actor) {
  const { error } = await createAdminClient().from("padrino_eventos").insert({
    referido_id: referidoId,
    hito_id: hitoId,
    accion,
    detalle,
    user_id: actor.userId,
    usuario_email: actor.userEmail,
  });
  if (error) console.error("[padrino] no se pudo escribir la bitácora:", error.message);
}

// ── Incentivos (fase 3, RQ-12) ──────────────────────────────────────────────

/**
 * Registra en `incentivos` cada hito pagado que todavía no tenga su fila
 * (padrino_hitos.incentivo_id). Idempotente: se llama al marcar pagados y en
 * la evaluación diaria. Sin la migración 20261015201232 no hace nada.
 */
export async function sincronizarIncentivos(actor: Actor): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("padrino_hitos")
    .select("*, padrino_referidos!inner(esquema, cedula_padrino, nombre_padrino, cedula_referido, nombre_referido)")
    .eq("estado", "pagado")
    .is("incentivo_id", null)
    .not("fecha_pago", "is", null);
  if (error || !data?.length) return 0;
  let n = 0;
  for (const h of data) {
    const ref = (Array.isArray(h.padrino_referidos) ? h.padrino_referidos[0] : h.padrino_referidos) as { esquema: string; cedula_padrino: string; nombre_padrino: string | null; cedula_referido: string; nombre_referido: string | null };
    const fila = filaIncentivo({
      fechaPago: h.fecha_pago as string,
      valor: Number(h.valor),
      esquema: ref.esquema,
      numero: h.numero as number,
      cedulaPadrino: ref.cedula_padrino,
      nombrePadrino: ref.nombre_padrino,
      cedulaReferido: ref.cedula_referido,
      beneficiario: h.beneficiario === "referido" ? "referido" : "padrino",
      nombreReferido: ref.nombre_referido,
    });
    const { data: inc, error: e1 } = await admin.from("incentivos").insert(fila).select("id").single();
    if (e1 || !inc) {
      console.error("[padrino] no se pudo registrar el incentivo:", e1?.message);
      continue;
    }
    // Si otro proceso ya enlazó el hito, se deshace la fila duplicada.
    const { data: enlazado } = await admin.from("padrino_hitos").update({ incentivo_id: inc.id }).eq("id", h.id).is("incentivo_id", null).select("id");
    if (!enlazado?.length) {
      await admin.from("incentivos").delete().eq("id", inc.id);
      continue;
    }
    n++;
    await bitacoraHito(h.referido_id as string, h.id as string, "hito_en_incentivos", { mes_entrega: fila.mes_entrega, concepto: fila.concepto, valor: fila.valor }, actor);
  }
  return n;
}
