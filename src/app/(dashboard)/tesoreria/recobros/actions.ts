"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { hoyBogota } from "@/lib/operativo/constants";
import { getEventosSolicitud, type EventoSolicitud } from "@/lib/tesoreria/recobros-camaras-data";
import { rolRecobros } from "@/lib/tesoreria/recobros-acceso";
import { refrescarRecobrosDelDia, type RefrescoRecobros } from "@/lib/gema/recobros-al-dia";
import {
  aplicarCorreccion, CONCEPTOS_LIQUIDACION, estadoRecobro, fechaBogota, motivoNoPermitido, saldoRecobro,
  validarCierreLiquidacion, validarCorreccion, validarDecisionSubgerencia, validarGestion, validarRegistroIncobrable,
  valorDeDiferencia, valorRecibidoTotal,
  type AccionRecobro, type CorreccionInput, type CorreccionValorRecibido, type GestionInput,
} from "@/lib/tesoreria/recobros";
import {
  getCatalogoResultados, getTarifas, mapCorreccion, mapGestionV2, mapRecobroV2,
  SELECT_CORRECCION, SELECT_GESTION_V2, SELECT_RECOBRO_V2, type Recobro,
} from "@/lib/tesoreria/recobros-data";

/**
 * Acciones de la página de Recobros (fase 5). Todas validan con las reglas
 * puras de `recobros.ts` sobre el estado que se lee aquí mismo (nunca con lo
 * que manda el navegador), actualizan con guarda para que dos personas no
 * decidan a la vez, dejan un evento en la línea de tiempo y un registro en la
 * auditoría, y devuelven `{ ok, error }`: en producción un error lanzado se
 * vería como «error #441» sin mensaje.
 */

type Resultado = { ok: boolean; error?: string; mensaje?: string };
const RUTA = "/tesoreria/recobros";

function revalidar() {
  revalidatePath(RUTA);
  revalidatePath("/tesoreria/revision-cartulina");
  revalidatePath("/tesoreria/devengados");
}

const falla = (e: unknown): Resultado => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

/** Lee el recobro, sus gestiones y correcciones, y calcula su estado de hoy. */
async function contexto(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Recobro no válido.");
  const db = createAdminClient();
  const [rs, gs, cs] = await Promise.all([
    db.from("tesoreria_camaras_solicitudes").select(SELECT_RECOBRO_V2).eq("id", id).maybeSingle(),
    db.from("tesoreria_camaras_recobro_gestiones").select(SELECT_GESTION_V2).eq("solicitud_id", id).order("fecha").order("created_at"),
    db.from("tesoreria_recobro_correcciones").select(SELECT_CORRECCION).eq("solicitud_id", id).order("solicitado_at"),
  ]);
  for (const r of [rs, gs, cs]) if (r.error) throw new Error(r.error.message);
  if (!rs.data) throw new Error("El recobro no existe.");
  const sol = mapRecobroV2(rs.data as unknown as Record<string, unknown>);
  const gestiones = ((gs.data ?? []) as unknown as Record<string, unknown>[]).map(mapGestionV2);
  const correcciones = ((cs.data ?? []) as unknown as Record<string, unknown>[]).map(mapCorreccion);
  const aprobadas: CorreccionValorRecibido[] = correcciones
    .filter((c) => c.decision === "aprobada" && c.campo === "valor_recibido" && c.gestionId)
    .map((c) => ({ gestionId: c.gestionId!, valorNuevo: Number(c.valorNuevo) }));
  const hoy = hoyBogota();
  const estado = estadoRecobro(sol, gestiones, hoy, aprobadas);
  const recibido = valorRecibidoTotal(gestiones, aprobadas);
  return {
    db, sol, gestiones, correcciones, aprobadas, hoy, estado, recibido,
    saldo: saldoRecobro(sol.valorRecobro, gestiones, aprobadas),
  };
}

/** Permisos de quien actúa, y el porqué si la regla no le deja. */
async function exigirRol(accion: AccionRecobro, ctx: Awaited<ReturnType<typeof contexto>>) {
  const perms = await getCurrentPermissions();
  const rol = rolRecobros(perms);
  if (!rol.ve) throw new Error("No tienes acceso a los recobros.");
  const no = motivoNoPermitido(accion, ctx.estado, rol.acciones, ctx.sol.tipo);
  if (no) throw new Error(no);
  return perms;
}

/** Actualiza la solicitud solo si sigue como se leyó; sin fila devuelta, otro llegó antes. */
async function actualizar(
  ctx: Awaited<ReturnType<typeof contexto>>,
  cambios: Record<string, unknown>,
  guarda: { nulas?: string[]; iguales?: Record<string, string | number> } = {},
) {
  let q = ctx.db.from("tesoreria_camaras_solicitudes").update(cambios).eq("id", ctx.sol.id);
  for (const c of guarda.nulas ?? []) q = q.is(c, null);
  for (const [c, v] of Object.entries(guarda.iguales ?? {})) q = q.eq(c, v);
  const { data, error } = await q.select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("El recobro cambió mientras tanto. Recargue la página y revise su estado.");
}

async function evento(ctx: Awaited<ReturnType<typeof contexto>>, accion: string, antes: unknown, despues: unknown, email: string | null) {
  const { error } = await ctx.db.from("tesoreria_camaras_solicitudes_eventos").insert({
    solicitud_id: ctx.sol.id, accion, antes, despues, usuario_email: email,
  });
  if (error) console.warn(`[recobros] evento ${accion} sin guardar: ${error.message}`);
}

const conductor = (s: Recobro) => ({ cedulaConductor: s.conductorCedula, conductorNombre: s.conductorNombre });
const detalle = (s: Recobro, extra: Record<string, unknown> = {}) => ({ solicitud_id: s.id, fecha: s.fechaViaje, numero: s.numero, ...extra });
const textoLibre = (t: string | null | undefined, falta: string) => {
  const v = (t ?? "").trim();
  if (!v) throw new Error(falta);
  if (v.length > 500) throw new Error("El texto no puede pasar de 500 caracteres.");
  return v;
};

// ── Lectura y GEMA ───────────────────────────────────────────────────────────

/** Eventos de la línea de tiempo de un recobro (toma, resolución, cobros, correcciones…). */
export async function obtenerEventosRecobro(id: string): Promise<{ ok: boolean; error?: string; eventos?: EventoSolicitud[] }> {
  try {
    const perms = await getCurrentPermissions();
    if (!rolRecobros(perms).ve) return { ok: false, error: "No tienes acceso a los recobros." };
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Recobro no válido." };
    return { ok: true, eventos: await getEventosSolicitud(id) };
  } catch (e) {
    return falla(e);
  }
}

/** «Actualizar desde GEMA» de la página: abonos, despacho y recaudo del día. */
export async function actualizarRecobrosPagina(): Promise<{ ok: boolean; error?: string; refresco?: RefrescoRecobros }> {
  const perms = await getCurrentPermissions();
  if (!rolRecobros(perms).ve) return { ok: false, error: "No tienes acceso a los recobros." };
  const refresco = await refrescarRecobrosDelDia({ forzar: true });
  revalidatePath(RUTA);
  return { ok: !refresco.error, error: refresco.error, refresco };
}

// ── Gestión diaria de caja (y la instrucción de Operativo) ───────────────────

/**
 * Registra la gestión de hoy. Las que traen dinero bloquean primero el valor
 * recibido de la solicitud (guarda con el valor leído) para que dos cajeros no
 * cobren lo mismo a la vez. «Pagó completo» exige el cargue en GEMA y cierra
 * el recobro como cobrado.
 */
export async function registrarGestionRecobro(id: string, input: GestionInput): Promise<Resultado> {
  try {
    const ctx = await contexto(id);
    const catalogo = await getCatalogoResultados(true);
    const def = catalogo.find((c) => c.clave === input.resultado);
    const perms = await exigirRol(def?.registra === "operativo" ? "instruccion_operativo" : "gestionar", ctx);
    const v = validarGestion(input, { catalogo, estado: ctx.estado, saldo: ctx.saldo, hoy: ctx.hoy });
    if (!v.ok) throw new Error(v.error);
    const g = v.gestion;
    const valor = g.valorRecibido ?? 0;
    const ahora = new Date().toISOString();

    // Bloqueo del dinero: el valor recibido de la solicitud debe seguir como se leyó.
    const recibidoNuevo = ctx.recibido + valor;
    if (valor > 0) {
      await actualizar(ctx, { valor_recibido: recibidoNuevo }, { iguales: { valor_recibido: ctx.sol.valorRecibido } });
    }

    const { data: ins, error: eIns } = await ctx.db
      .from("tesoreria_camaras_recobro_gestiones")
      .insert({
        solicitud_id: id,
        fecha: ctx.hoy,
        gestion: (g.observacion ?? def!.nombre).slice(0, 500),
        resultado: g.resultado,
        compromiso_fecha: g.compromisoFecha,
        valor_recibido: g.valorRecibido,
        autorizado_por: g.autorizadoPor,
        observacion: g.observacion,
        rol: def!.registra === "operativo" ? "operativo" : "caja",
        gema_cargue_confirmado: g.gemaCargueConfirmado,
        usuario_email: perms.userEmail,
        origen: "caja",
      })
      .select("id")
      .single();
    if (eIns) {
      if (valor > 0) await ctx.db.from("tesoreria_camaras_solicitudes").update({ valor_recibido: ctx.sol.valorRecibido }).eq("id", id);
      throw new Error(eIns.message);
    }

    // Resumen que leen la alarma y la pestaña anterior, y el cierre si pagó todo.
    const cambios: Record<string, unknown> = {
      gestiones_n: ctx.gestiones.length + 1,
      gestion_ultima_fecha: ctx.hoy,
      gestion_proxima_fecha: g.compromisoFecha,
    };
    if (def!.cierra) {
      Object.assign(cambios, {
        cobro_estado: "cobrado",
        cobro_valor: recibidoNuevo,
        cobro_fecha: ctx.hoy,
        cobro_soporte: "Pagó completo en Gestivo · cargue GEMA confirmado",
        cobro_nota: g.observacion,
        cobro_por_email: perms.userEmail,
        cobro_at: ahora,
        gema_cargue_confirmado_por_email: perms.userEmail,
        gema_cargue_confirmado_at: ahora,
        incobrable_motivo: null, incobrable_solicitado_por_email: null, incobrable_solicitado_at: null,
      });
    }
    const { error: eRes } = await ctx.db.from("tesoreria_camaras_solicitudes").update(cambios).eq("id", id);
    if (eRes) throw new Error(`La gestión quedó guardada, pero el resumen no: ${eRes.message}`);

    if (def!.cierra) await evento(ctx, "pago_registrado", null, { valor: recibidoNuevo, gestion_id: ins.id, gema_cargue: true }, perms.userEmail);
    await logTesoreriaAudit({
      accion: def!.cierra ? "recobro_camaras_cobro" : "recobro_camaras_gestion",
      modulo: "tesoreria",
      rol: perms.userType,
      ...conductor(ctx.sol),
      valor: valor || null,
      valorNuevo: `${def!.nombre}${g.compromisoFecha ? ` · compromiso ${g.compromisoFecha}` : ""}${valor ? ` · recibido ${valor}` : ""}`,
      detalle: detalle(ctx.sol, { gestion_id: ins.id, resultado: g.resultado, observacion: g.observacion, autorizado_por: g.autorizadoPor }),
    });
    revalidar();
    return { ok: true, mensaje: def!.cierra ? "Pago registrado: el recobro quedó cerrado." : "Gestión registrada." };
  } catch (e) {
    return falla(e);
  }
}

// ── Subgerencia ──────────────────────────────────────────────────────────────

/**
 * Subgerencia decide un recobro sin conteo de cámara. Para cobrar fija las
 * timbradas; el valor sale con el pasaje del viaje (o la tarifa).
 */
export async function decidirSubgerenciaRecobro(
  id: string,
  input: { decision?: string | null; timbradas?: number | null; nota?: string | null },
): Promise<Resultado> {
  try {
    const ctx = await contexto(id);
    const perms = await exigirRol("decidir_subgerencia", ctx);
    const v = validarDecisionSubgerencia(input);
    if (!v.ok) throw new Error(v.error);
    const ahora = new Date().toISOString();
    const cambios: Record<string, unknown> = {
      subgerencia_decision: v.decision, subgerencia_nota: v.nota, subgerencia_por_email: perms.userEmail, subgerencia_at: ahora,
    };
    if (v.decision === "cobrar") {
      const val = valorDeDiferencia(v.timbradas!, ctx.sol.pasaje, ctx.sol.fechaViaje, await getTarifas());
      Object.assign(cambios, { diferencia: v.timbradas, pasaje: val.pasaje, pasaje_fuente: ctx.sol.pasajeFuente ?? val.pasajeFuente, valor_recobro: val.valor });
    }
    await actualizar(ctx, cambios, { nulas: ["subgerencia_decision"], iguales: { resultado: "sin_conteo" } });
    await evento(ctx, "subgerencia_decidio", null, { decision: v.decision, timbradas: v.timbradas, nota: v.nota, valor: cambios.valor_recobro ?? null }, perms.userEmail);
    await logTesoreriaAudit({
      accion: "recobro_subgerencia",
      modulo: "tesoreria",
      rol: perms.userType,
      ...conductor(ctx.sol),
      valor: (cambios.valor_recobro as number | undefined) ?? null,
      valorNuevo: v.decision === "cobrar" ? `Cobrar ${v.timbradas} timbradas · ${v.nota}` : `No cobrar · ${v.nota}`,
      detalle: detalle(ctx.sol, { decision: v.decision, timbradas: v.timbradas }),
    });
    revalidar();
    return { ok: true, mensaje: v.decision === "cobrar" ? "Decisión guardada: el recobro pasa a caja." : "Decisión guardada: no se cobra." };
  } catch (e) {
    return falla(e);
  }
}

// ── Correcciones (las valida el director de Mantenimiento) ───────────────────

export async function solicitarCorreccionRecobro(id: string, input: CorreccionInput): Promise<Resultado> {
  try {
    const ctx = await contexto(id);
    const perms = await getCurrentPermissions();
    const rol = rolRecobros(perms);
    if (!rol.ve) throw new Error("No tienes acceso a los recobros.");
    const no = motivoNoPermitido("solicitar_correccion", ctx.estado, rol.acciones, ctx.sol.tipo);
    if (no) throw new Error(no);
    const corregido = new Map(ctx.aprobadas.map((c) => [c.gestionId, c.valorNuevo]));
    const valores = new Map(ctx.gestiones.filter((g) => (g.valorRecibido ?? 0) > 0)
      .map((g) => [g.id, corregido.get(g.id) ?? g.valorRecibido!]));
    const v = validarCorreccion(input, {
      tipo: ctx.sol.tipo, estado: ctx.estado, conteoActual: ctx.sol.conteoCamara, diferenciaActual: ctx.sol.diferencia,
      resultadoActual: ctx.sol.resultado, valoresRecibidos: valores, valorRecobro: ctx.sol.valorRecobro ?? 0, totalRecibido: ctx.recibido,
    });
    if (!v.ok) throw new Error(v.error);
    const { data, error } = await ctx.db
      .from("tesoreria_recobro_correcciones")
      .insert({
        solicitud_id: id, campo: v.campo, gestion_id: v.gestionId, valor_anterior: v.valorAnterior, valor_nuevo: v.valorNuevo,
        motivo: v.motivo, solicitado_por_email: perms.userEmail ?? "—",
      })
      .select("id")
      .single();
    if (error) {
      throw new Error(error.code === "23505" ? "Ya hay una corrección pendiente de ese dato: espere a que el director la decida." : error.message);
    }
    await evento(ctx, "correccion_solicitada", { [v.campo]: v.valorAnterior }, { [v.campo]: v.valorNuevo, motivo: v.motivo, correccion_id: data.id }, perms.userEmail);
    await logTesoreriaAudit({
      accion: "recobro_correccion", modulo: "tesoreria", rol: perms.userType, ...conductor(ctx.sol),
      valorAnterior: `${v.campo}: ${v.valorAnterior ?? "—"}`, valorNuevo: `${v.campo}: ${v.valorNuevo} (pedida) · ${v.motivo}`,
      detalle: detalle(ctx.sol, { correccion_id: data.id, campo: v.campo, gestion_id: v.gestionId }),
    });
    revalidar();
    return { ok: true, mensaje: "Corrección enviada al director de Mantenimiento." };
  } catch (e) {
    return falla(e);
  }
}

export async function decidirCorreccionRecobro(correccionId: string, aprobar: boolean, nota: string | null): Promise<Resultado> {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(correccionId)) throw new Error("Corrección no válida.");
    const db = createAdminClient();
    const { data: c0, error: e0 } = await db.from("tesoreria_recobro_correcciones").select(SELECT_CORRECCION).eq("id", correccionId).maybeSingle();
    if (e0) throw new Error(e0.message);
    if (!c0) throw new Error("La corrección no existe.");
    const c = mapCorreccion(c0 as unknown as Record<string, unknown>);
    if (c.decision) throw new Error("Esa corrección ya fue decidida.");
    const ctx = await contexto(c.solicitudId);
    const perms = await exigirRol("validar_correccion", ctx);
    const notaLimpia = nota?.trim() || null;
    if (!aprobar && !notaLimpia) throw new Error("Indique por qué rechaza la corrección.");
    if (notaLimpia && notaLimpia.length > 500) throw new Error("La nota no puede pasar de 500 caracteres.");

    // Lo que cambia en la solicitud, calculado antes de cerrar la corrección.
    let cambios: Record<string, unknown> | null = null;
    if (aprobar) {
      if (c.campo === "valor_recibido") {
        const otras = ctx.aprobadas.filter((a) => a.gestionId !== c.gestionId);
        const total = valorRecibidoTotal(ctx.gestiones, [...otras, { gestionId: c.gestionId!, valorNuevo: Number(c.valorNuevo) }]);
        if (total > (ctx.sol.valorRecobro ?? 0)) throw new Error("Con ese valor lo recibido pasaría del valor del recobro.");
        cambios = { valor_recibido: total };
      } else {
        cambios = aplicarCorreccion({
          tipo: ctx.sol.tipo, fechaViaje: ctx.sol.fechaViaje, resultado: ctx.sol.resultado, conteo: ctx.sol.conteoCamara,
          timbradas: ctx.sol.timbradasRegistradora, diferencia: ctx.sol.diferencia, pasaje: ctx.sol.pasaje,
        }, c.campo, c.valorNuevo, await getTarifas());
        if (c.campo === "resultado" && c.valorNuevo !== "sin_conteo") {
          Object.assign(cambios, { subgerencia_decision: null, subgerencia_nota: null, subgerencia_por_email: null, subgerencia_at: null });
        }
      }
    }

    const { data: dec, error: eDec } = await db
      .from("tesoreria_recobro_correcciones")
      .update({ decision: aprobar ? "aprobada" : "rechazada", decision_nota: notaLimpia, decidido_por_email: perms.userEmail, decidido_at: new Date().toISOString() })
      .eq("id", correccionId)
      .is("decision", null)
      .select("id");
    if (eDec) throw new Error(eDec.message);
    if (!dec?.length) throw new Error("Otra persona decidió esta corrección mientras tanto.");
    if (cambios) {
      const { error } = await db.from("tesoreria_camaras_solicitudes").update(cambios).eq("id", ctx.sol.id);
      if (error) throw new Error(`La corrección quedó aprobada, pero el recobro no se actualizó: ${error.message}`);
    }
    await evento(ctx, aprobar ? "correccion_aprobada" : "correccion_rechazada",
      { [c.campo]: c.valorAnterior }, { [c.campo]: c.valorNuevo, nota: notaLimpia, correccion_id: c.id, ...(cambios ?? {}) }, perms.userEmail);
    await logTesoreriaAudit({
      accion: "recobro_correccion", modulo: "tesoreria", rol: perms.userType, ...conductor(ctx.sol),
      valorAnterior: `${c.campo}: ${c.valorAnterior ?? "—"}`,
      valorNuevo: `${c.campo}: ${c.valorNuevo} · ${aprobar ? "aprobada" : `rechazada · ${notaLimpia}`}`,
      detalle: detalle(ctx.sol, { correccion_id: c.id, campo: c.campo, cambios }),
    });
    revalidar();
    return { ok: true, mensaje: aprobar ? "Corrección aprobada: el recobro se recalculó." : "Corrección rechazada." };
  } catch (e) {
    return falla(e);
  }
}

// ── Incobrable (lo autoriza subgerencia; lo registra la directora) ───────────

export async function solicitarIncobrableRecobro(id: string, motivo: string): Promise<Resultado> {
  try {
    const ctx = await contexto(id);
    const perms = await exigirRol("solicitar_incobrable", ctx);
    const m = textoLibre(motivo, "Indique por qué no se puede cobrar.");
    await actualizar(ctx, {
      incobrable_motivo: m, incobrable_solicitado_por_email: perms.userEmail, incobrable_solicitado_at: new Date().toISOString(),
      incobrable_rechazo_nota: null, incobrable_rechazado_por_email: null, incobrable_rechazado_at: null,
    }, { nulas: ["cobro_estado", "incobrable_solicitado_at"] });
    await evento(ctx, "incobrable_solicitado", null, { motivo: m }, perms.userEmail);
    await logTesoreriaAudit({
      accion: "recobro_camaras_incobrable", modulo: "tesoreria", rol: perms.userType, ...conductor(ctx.sol),
      valorNuevo: `Incobrable solicitado · ${m}`, detalle: detalle(ctx.sol),
    });
    revalidar();
    return { ok: true, mensaje: "Incobrable solicitado: la directora registra la autorización de subgerencia." };
  } catch (e) {
    return falla(e);
  }
}

export async function decidirIncobrableRecobro(
  id: string,
  input: { autorizar: boolean; nombre?: string | null; fecha?: string | null; soporte?: string | null; nota?: string | null },
): Promise<Resultado> {
  try {
    const ctx = await contexto(id);
    const perms = await exigirRol("registrar_incobrable", ctx);
    const ahora = new Date().toISOString();
    if (input.autorizar) {
      const v = validarRegistroIncobrable(input, {
        hoy: ctx.hoy, solicitadoEn: ctx.sol.incobrableSolicitadoAt ? fechaBogota(ctx.sol.incobrableSolicitadoAt) : null,
      });
      if (!v.ok) throw new Error(v.error);
      await actualizar(ctx, {
        cobro_estado: "incobrable", cobro_at: ahora,
        incobrable_autorizado_por_email: perms.userEmail, incobrable_autorizado_at: ahora,
        incobrable_autoriza_nombre: v.nombre, incobrable_autoriza_fecha: v.fecha, incobrable_soporte: v.soporte,
      }, { nulas: ["cobro_estado"] });
      await evento(ctx, "incobrable_autorizado", { motivo: ctx.sol.incobrableMotivo },
        { autorizo: v.nombre, fecha: v.fecha, soporte: v.soporte }, perms.userEmail);
      await logTesoreriaAudit({
        accion: "recobro_camaras_incobrable", modulo: "tesoreria", rol: perms.userType, ...conductor(ctx.sol),
        valor: ctx.saldo, valorAnterior: `Solicitado · ${ctx.sol.incobrableMotivo ?? ""}`,
        valorNuevo: `Incobrable autorizado por ${v.nombre} (${v.fecha}) · soporte ${v.soporte}`,
        detalle: detalle(ctx.sol, { autorizo: v.nombre, fecha: v.fecha, soporte: v.soporte }),
      });
    } else {
      const nota = textoLibre(input.nota, "Indique por qué se rechaza el incobrable.");
      await actualizar(ctx, {
        incobrable_motivo: null, incobrable_solicitado_por_email: null, incobrable_solicitado_at: null,
        incobrable_rechazo_nota: nota, incobrable_rechazado_por_email: perms.userEmail, incobrable_rechazado_at: ahora,
      }, { nulas: ["cobro_estado"] });
      await evento(ctx, "incobrable_rechazado", { motivo: ctx.sol.incobrableMotivo }, { nota }, perms.userEmail);
      await logTesoreriaAudit({
        accion: "recobro_camaras_incobrable", modulo: "tesoreria", rol: perms.userType, ...conductor(ctx.sol),
        valorAnterior: `Solicitado · ${ctx.sol.incobrableMotivo ?? ""}`, valorNuevo: `Incobrable rechazado · ${nota}`, detalle: detalle(ctx.sol),
      });
    }
    revalidar();
    return { ok: true, mensaje: input.autorizar ? "Incobrable registrado: el recobro quedó cerrado sin cobro." : "Incobrable rechazado: el recobro sigue en caja." };
  } catch (e) {
    return falla(e);
  }
}

export async function reabrirIncobrableRecobro(id: string, nota: string): Promise<Resultado> {
  try {
    const ctx = await contexto(id);
    const perms = await exigirRol("reabrir_incobrable", ctx);
    const n = textoLibre(nota, "Indique por qué se reabre el recobro.");
    await actualizar(ctx, {
      cobro_estado: null, cobro_at: null,
      incobrable_motivo: null, incobrable_solicitado_por_email: null, incobrable_solicitado_at: null,
      incobrable_autorizado_por_email: null, incobrable_autorizado_at: null,
      incobrable_autoriza_nombre: null, incobrable_autoriza_fecha: null, incobrable_soporte: null,
    }, { iguales: { cobro_estado: "incobrable" } });
    await evento(ctx, "incobrable_reabierto", { motivo: ctx.sol.incobrableMotivo, autorizo: ctx.sol.incobrableAutorizaNombre }, { nota: n }, perms.userEmail);
    await logTesoreriaAudit({
      accion: "recobro_camaras_incobrable", modulo: "tesoreria", rol: perms.userType, ...conductor(ctx.sol),
      valorAnterior: "Incobrable", valorNuevo: `Reabierto · ${n}`, detalle: detalle(ctx.sol),
    });
    revalidar();
    return { ok: true, mensaje: "Recobro reabierto: vuelve a caja." };
  } catch (e) {
    return falla(e);
  }
}

// ── Liquidación definitiva (conductor retirado) ──────────────────────────────

export async function marcarLiquidacionRecobro(id: string, nota: string | null): Promise<Resultado> {
  try {
    const ctx = await contexto(id);
    const perms = await exigirRol("marcar_liquidacion", ctx);
    const n = nota?.trim() || null;
    await actualizar(ctx, {
      liquidacion_marcada_at: new Date().toISOString(), liquidacion_marcada_por_email: perms.userEmail, liquidacion_nota: n,
    }, { nulas: ["cobro_estado", "liquidacion_marcada_at"] });
    await evento(ctx, "liquidacion_marcada", null, { saldo: ctx.saldo, nota: n }, perms.userEmail);
    await logTesoreriaAudit({
      accion: "recobro_liquidacion", modulo: "tesoreria", rol: perms.userType, ...conductor(ctx.sol),
      valor: ctx.saldo, valorNuevo: `Para liquidación definitiva${n ? ` · ${n}` : ""}`, detalle: detalle(ctx.sol),
    });
    revalidar();
    return { ok: true, mensaje: "El saldo quedó para la liquidación definitiva del conductor." };
  } catch (e) {
    return falla(e);
  }
}

export async function cerrarLiquidacionRecobro(
  id: string,
  input: { concepto?: string | null; valorDescontado?: number | null; soporte?: string | null; nota?: string | null },
): Promise<Resultado> {
  try {
    const ctx = await contexto(id);
    const perms = await exigirRol("cerrar_liquidacion", ctx);
    const v = validarCierreLiquidacion(input, ctx.saldo);
    if (!v.ok) throw new Error(v.error);
    const ahora = new Date().toISOString();
    await actualizar(ctx, {
      cobro_estado: "liquidacion_definitiva", cobro_at: ahora,
      liquidacion_concepto: v.concepto, liquidacion_valor_descontado: v.valorDescontado, liquidacion_soporte: v.soporte,
      liquidacion_nota: v.nota ?? ctx.sol.liquidacionNota, liquidacion_por_email: perms.userEmail, liquidacion_at: ahora,
    }, { nulas: ["cobro_estado"] });
    await evento(ctx, "liquidacion_cerrada", { saldo: ctx.saldo },
      { concepto: CONCEPTOS_LIQUIDACION[v.concepto], valor: v.valorDescontado, soporte: v.soporte, nota: v.nota }, perms.userEmail);
    await logTesoreriaAudit({
      accion: "recobro_liquidacion", modulo: "tesoreria", rol: perms.userType, ...conductor(ctx.sol),
      valor: v.valorDescontado, valorAnterior: `Saldo ${ctx.saldo}`,
      valorNuevo: `${CONCEPTOS_LIQUIDACION[v.concepto]} · soporte ${v.soporte}`, detalle: detalle(ctx.sol, { concepto: v.concepto }),
    });
    revalidar();
    return { ok: true, mensaje: "Recobro cerrado por liquidación definitiva." };
  } catch (e) {
    return falla(e);
  }
}
