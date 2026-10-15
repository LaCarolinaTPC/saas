/**
 * Operaciones internas del Plan Padrino (solo servidor, sin "use server": no
 * se exponen como acciones). Quien las llama ya verificó los permisos.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyBogota } from "./datos";
import { hitosProyectados, type EsquemasPolitica } from "./reglas";
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
        await crearHitos(r.id as string, actor);
      }
    }
    revalidatePath("/candidatos/plan-padrino");
  } catch (e) {
    console.error("[padrino] no se pudo sincronizar con el proceso:", e);
  }
}

// ── Hitos (fase 2) ──────────────────────────────────────────────────────────

/**
 * Crea los hitos del esquema del referido contratado (fecha de ingreso + N
 * meses calendario) y lo pasa a En seguimiento. Idempotente: no duplica
 * hitos que ya existan. Desde aquí el esquema ya no cambia.
 */
export async function crearHitos(referidoId: string, actor: Actor) {
  const admin = createAdminClient();
  const { data: r } = await admin
    .from("padrino_referidos")
    .select("id, estado, esquema, fecha_ingreso, politica_id, anulado_at")
    .eq("id", referidoId)
    .maybeSingle();
  if (!r || r.anulado_at || r.estado !== "contratado" || !r.fecha_ingreso) return;
  const { data: pol } = await admin.from("padrino_politicas").select("esquemas").eq("id", r.politica_id).maybeSingle();
  const esquemas = pol?.esquemas as EsquemasPolitica | undefined;
  if (!esquemas) return;
  const hitos = hitosProyectados(esquemas, r.esquema as "A" | "B", r.fecha_ingreso as string);
  const { error } = await admin.from("padrino_hitos").upsert(
    hitos.map((h) => ({
      referido_id: referidoId,
      numero: h.numero,
      descripcion: h.descripcion,
      meses: h.meses,
      valor: h.valor,
      requiere_desempeno: Boolean(h.requiere_desempeno),
      fecha_causacion: h.fechaCausacion!,
    })),
    { onConflict: "referido_id,numero", ignoreDuplicates: true }
  );
  if (error) {
    console.error("[padrino] no se pudieron crear los hitos:", error.message);
    return;
  }
  await admin.from("padrino_referidos").update({ estado: "en_seguimiento", updated_at: new Date().toISOString() }).eq("id", referidoId).eq("estado", "contratado");
  await bitacora(referidoId, "hitos_creados", { esquema: r.esquema, hitos: hitos.map((h) => ({ numero: h.numero, valor: h.valor, fecha: h.fechaCausacion })) }, actor);
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
    .select("id, referido_id, numero, fecha_causacion, motivo, padrino_referidos!inner(cedula_referido, cedula_padrino, padrino_tipo, fecha_ingreso, anulado_at)")
    .eq("estado", "pendiente")
    .lte("fecha_causacion", hoy)
    .is("padrino_referidos.anulado_at", null)
    .order("fecha_causacion")
    .order("numero");
  if (error) throw new Error(`Plan Padrino: ${error.message}`);
  type Ref = { cedula_referido: string; cedula_padrino: string; padrino_tipo: string; fecha_ingreso: string };
  const filas = (pendientes ?? []).map((h) => ({ ...h, ref: (Array.isArray(h.padrino_referidos) ? h.padrino_referidos[0] : h.padrino_referidos) as Ref }));
  if (!filas.length) return resumen;

  const cedConductores = [...new Set(filas.flatMap((f) => [f.ref.cedula_referido, ...(f.ref.padrino_tipo === "conductor" ? [f.ref.cedula_padrino] : [])]))];
  const cedEmpleados = [...new Set(filas.filter((f) => f.ref.padrino_tipo === "empleado").map((f) => f.ref.cedula_padrino))];
  const conductores = new Map<string, { estado: string; fecha_retiro: string | null }>();
  for (const lote of enLotes(cedConductores)) {
    const { data } = await admin.from("conductores").select("cedula, estado, fecha_retiro").in("cedula", lote);
    for (const c of data ?? []) conductores.set(c.cedula as string, { estado: c.estado as string, fecha_retiro: (c.fecha_retiro as string | null) ?? null });
  }
  const empleados = new Map<string, { status: string; end_date: string | null }>();
  const autorizados = new Set<string>();
  if (cedEmpleados.length) {
    const [{ data: emps }, { data: auts }] = await Promise.all([
      admin.from("employees").select("document_number, status, end_date").in("document_number", cedEmpleados),
      admin.from("padrino_empleados_autorizados").select("cedula").in("cedula", cedEmpleados).is("revocado_at", null),
    ]);
    for (const e of emps ?? []) empleados.set(e.document_number as string, { status: e.status as string, end_date: (e.end_date as string | null) ?? null });
    for (const a of auts ?? []) autorizados.add(a.cedula as string);
  }

  const cancelados = new Set<string>();
  const tocados = new Set<string>();
  for (const f of filas) {
    if (cancelados.has(f.referido_id as string)) continue;
    const ref = conductores.get(f.ref.cedula_referido);
    const pad =
      f.ref.padrino_tipo === "conductor"
        ? (() => {
            const c = conductores.get(f.ref.cedula_padrino);
            return c ? { tipo: "conductor" as const, estado: c.estado, fechaRetiro: c.fecha_retiro } : null;
          })()
        : (() => {
            const e = empleados.get(f.ref.cedula_padrino);
            return e ? { tipo: "empleado" as const, status: e.status, fechaRetiro: e.end_date, autorizado: autorizados.has(f.ref.cedula_padrino) } : null;
          })();
    const hechos: HechosPermanencia = { referido: ref ? { estado: ref.estado, fechaRetiro: ref.fecha_retiro } : null, padrino: pad };
    const res = evaluarHito(f.fecha_causacion as string, f.ref.fecha_ingreso, hoy, hechos);
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
      await bitacoraHito(f.referido_id as string, f.id as string, "hito_por_aprobar", { numero: f.numero }, actor);
    } else {
      resumen.noCausados++;
      await bitacoraHito(f.referido_id as string, f.id as string, "hito_no_causado", { numero: f.numero, motivo: res.motivo }, actor);
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
        cancelados.add(f.referido_id as string);
      }
    }
  }
  for (const id of tocados) await actualizarEstadoReferido(id, actor);
  revalidatePath("/candidatos/plan-padrino");
  return resumen;
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
    .select("id, referido_id, numero, valor, fecha_pago, padrino_referidos!inner(esquema, cedula_padrino, nombre_padrino, cedula_referido)")
    .eq("estado", "pagado")
    .is("incentivo_id", null)
    .not("fecha_pago", "is", null);
  if (error || !data?.length) return 0;
  let n = 0;
  for (const h of data) {
    const ref = (Array.isArray(h.padrino_referidos) ? h.padrino_referidos[0] : h.padrino_referidos) as { esquema: string; cedula_padrino: string; nombre_padrino: string | null; cedula_referido: string };
    const fila = filaIncentivo({
      fechaPago: h.fecha_pago as string,
      valor: Number(h.valor),
      esquema: ref.esquema,
      numero: h.numero as number,
      cedulaPadrino: ref.cedula_padrino,
      nombrePadrino: ref.nombre_padrino,
      cedulaReferido: ref.cedula_referido,
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
