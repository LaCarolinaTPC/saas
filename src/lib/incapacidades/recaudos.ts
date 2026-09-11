/**
 * Recaudos, aplicaciones, ajustes monetarios y cierre (fase 5), lado servidor.
 * Las reglas puras están en recaudo-reglas.ts. El saldo nunca se escribe: lo
 * calcula la vista y aquí solo se mueve el estado del expediente según él.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { todo, type ExpedienteVista } from "./expedientes";
import { ConflictoVersion, type Actor } from "./liquidacion";
import {
  calcularSaldo,
  dinero,
  esMedio,
  estadoExpedienteSegunSaldo,
  validarAjuste,
  validarAplicacion,
  validarCierre,
  type Saldo,
} from "./recaudo-reglas";

export interface RecaudoVista {
  id: string;
  entidad_catalogo_id: string;
  entidad_nombre: string;
  entidad_clase: string | null;
  fecha_giro: string;
  valor: number;
  referencia: string | null;
  medio: string | null;
  observaciones: string | null;
  registrado_por_email: string | null;
  created_at: string;
  anulado_at: string | null;
  motivo_anulacion: string | null;
  aplicado: number;
  sin_aplicar: number;
  aplicaciones: number;
}

export interface AplicacionFila {
  id: string;
  recaudo_id: string;
  expediente_id: string;
  radicacion_id: string | null;
  valor_aplicado: number;
  aplicado_por_email: string | null;
  created_at: string;
  anulada_at: string | null;
  motivo_anulacion: string | null;
  /** Del recaudo, para mostrar. */
  fecha_giro?: string;
  referencia?: string | null;
  entidad_nombre?: string;
  /** Del expediente, para la pantalla de recaudos. */
  expediente_nombre?: string | null;
  expediente_cedula?: string;
}

export interface AjusteMonetarioFila {
  id: string;
  expediente_id: string;
  tipo: string;
  valor: number;
  extingue_saldo: boolean;
  motivo: string;
  autorizado_por_email: string | null;
  created_at: string;
  anulado_at: string | null;
  motivo_anulacion: string | null;
}

// ── Lecturas ─────────────────────────────────────────────────────────────────

export async function leerTolerancia(): Promise<number> {
  const { data, error } = await createAdminClient()
    .from("incapacidad_parametros")
    .select("valor")
    .eq("clave", "tolerancia_conciliacion")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const v = (data as { valor: unknown } | null)?.valor;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function guardarTolerancia(valor: number, email: string | null): Promise<void> {
  const { error } = await createAdminClient()
    .from("incapacidad_parametros")
    .update({ valor, actualizado_por_email: email, updated_at: new Date().toISOString() })
    .eq("clave", "tolerancia_conciliacion");
  if (error) throw new Error(error.message);
}

export async function listarRecaudos(f: { entidad?: string | null; soloConSaldo?: boolean; incluirAnulados?: boolean } = {}): Promise<RecaudoVista[]> {
  const db = createAdminClient();
  return todo<RecaudoVista>((desde, hasta) => {
    let q = db
      .from("vw_incapacidad_recaudos")
      .select("*")
      .order("fecha_giro", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(desde, hasta);
    if (f.entidad) q = q.eq("entidad_catalogo_id", f.entidad);
    if (!f.incluirAnulados) q = q.is("anulado_at", null);
    if (f.soloConSaldo) q = q.gt("sin_aplicar", 0);
    return q;
  });
}

export async function leerRecaudo(id: string): Promise<RecaudoVista | null> {
  const { data, error } = await createAdminClient().from("vw_incapacidad_recaudos").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RecaudoVista | null) ?? null;
}

/** Aplicaciones de un recaudo, con el trabajador de cada expediente. */
export async function aplicacionesDeRecaudo(recaudoId: string): Promise<AplicacionFila[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("incapacidad_recaudo_aplicaciones")
    .select("*")
    .eq("recaudo_id", recaudoId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as AplicacionFila[];
  if (filas.length === 0) return filas;
  const { data: exps, error: e2 } = await db
    .from("vw_incapacidad_expedientes")
    .select("id, nombre, cedula")
    .in("id", [...new Set(filas.map((a) => a.expediente_id))]);
  if (e2) throw new Error(e2.message);
  const m = new Map((exps ?? []).map((x) => [(x as { id: string }).id, x as { nombre: string | null; cedula: string }]));
  return filas.map((a) => ({ ...a, expediente_nombre: m.get(a.expediente_id)?.nombre ?? null, expediente_cedula: m.get(a.expediente_id)?.cedula }));
}

/** Aplicaciones y ajustes de un expediente, para su panel de saldo. */
export async function movimientosDeExpediente(expedienteId: string): Promise<{ aplicaciones: AplicacionFila[]; ajustes: AjusteMonetarioFila[] }> {
  const db = createAdminClient();
  const [ap, aj] = await Promise.all([
    db.from("incapacidad_recaudo_aplicaciones").select("*").eq("expediente_id", expedienteId).order("created_at", { ascending: false }),
    db.from("incapacidad_ajustes").select("*").eq("expediente_id", expedienteId).order("created_at", { ascending: false }),
  ]);
  if (ap.error) throw new Error(ap.error.message);
  if (aj.error) throw new Error(aj.error.message);
  const aplicaciones = (ap.data ?? []) as AplicacionFila[];
  if (aplicaciones.length > 0) {
    const { data: recs, error } = await db
      .from("vw_incapacidad_recaudos")
      .select("id, fecha_giro, referencia, entidad_nombre")
      .in("id", [...new Set(aplicaciones.map((a) => a.recaudo_id))]);
    if (error) throw new Error(error.message);
    const m = new Map((recs ?? []).map((r) => [(r as { id: string }).id, r as { fecha_giro: string; referencia: string | null; entidad_nombre: string }]));
    for (const a of aplicaciones) {
      const r = m.get(a.recaudo_id);
      if (r) { a.fecha_giro = r.fecha_giro; a.referencia = r.referencia; a.entidad_nombre = r.entidad_nombre; }
    }
  }
  return { aplicaciones, ajustes: (aj.data ?? []) as AjusteMonetarioFila[] };
}

/** Expedientes radicados ante una entidad a los que se puede aplicar un recaudo. */
export async function expedientesAplicables(entidadId: string): Promise<ExpedienteVista[]> {
  const db = createAdminClient();
  return todo<ExpedienteVista>((desde, hasta) =>
    db
      .from("vw_incapacidad_expedientes")
      .select("*")
      .eq("entidad_catalogo_id", entidadId)
      .eq("radicacion_estado", "radicada")
      .in("estado", ["radicado", "con_recaudo"])
      .order("radicacion_fecha", { ascending: true })
      .order("id", { ascending: true })
      .range(desde, hasta)
  );
}

async function leerVista(id: string): Promise<ExpedienteVista> {
  const { data, error } = await createAdminClient().from("vw_incapacidad_expedientes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("El expediente no existe.");
  return data as ExpedienteVista;
}

export function saldoDe(v: Pick<ExpedienteVista, "valor_reclamado" | "abonos_aplicados" | "ajustes_saldo">, tolerancia: number): Saldo {
  return calcularSaldo({ valorReclamado: v.valor_reclamado, abonos: Number(v.abonos_aplicados ?? 0), ajustes: Number(v.ajustes_saldo ?? 0) }, tolerancia);
}

// ── Escrituras de apoyo ──────────────────────────────────────────────────────

async function bitacora(expedienteId: string, accion: string, antes: unknown, despues: unknown, email: string | null) {
  try {
    await createAdminClient().from("ausentismo_log").insert({ registro_id: expedienteId, accion, datos_anteriores: antes ?? null, datos_nuevos: despues ?? null, user_email: email });
  } catch (e) {
    console.error("[incapacidades] no se pudo escribir la bitácora:", e);
  }
}

/** Recalcula el estado del expediente a partir del saldo de la vista. */
async function sincronizarEstado(expedienteId: string, actor: Actor): Promise<void> {
  const v = await leerVista(expedienteId);
  const tol = await leerTolerancia();
  const s = saldoDe(v, tol);
  const nuevo = estadoExpedienteSegunSaldo(v.estado, s, { valorReclamado: v.valor_reclamado, abonos: Number(v.abonos_aplicados ?? 0), ajustes: Number(v.ajustes_saldo ?? 0) });
  if (!nuevo || nuevo === v.estado) return;
  const { data, error } = await createAdminClient()
    .from("incapacidad_expedientes")
    .update({ estado: nuevo })
    .eq("id", expedienteId)
    .eq("version", v.version)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new ConflictoVersion();
  await bitacora(expedienteId, "expediente_estado", { estado: v.estado }, { estado: nuevo, saldo: s.saldo, conciliacion: s.estado }, actor.email);
}

function traducir(e: { code?: string; message: string }): Error {
  if (e.code === "23505" && e.message.includes("ux_incapacidad_recaudos_referencia")) {
    return new Error("Ya hay un recaudo con esa referencia para esta entidad.");
  }
  return new Error(e.message);
}

// ── Recaudos ─────────────────────────────────────────────────────────────────

export interface DatosRecaudo {
  entidad_catalogo_id: string;
  fecha_giro: string;
  valor: number;
  referencia: string | null;
  medio: string | null;
  observaciones: string | null;
}

export async function registrarRecaudo(d: DatosRecaudo, actor: Actor): Promise<RecaudoVista> {
  if (!Number.isFinite(d.valor) || d.valor <= 0) throw new Error("El valor del recaudo debe ser mayor que cero.");
  if (d.medio != null && !esMedio(d.medio)) throw new Error("Medio de pago no válido.");
  const db = createAdminClient();
  const { data: ent, error: e0 } = await db.from("ausentismo_catalogos").select("id, nombre, activo").eq("id", d.entidad_catalogo_id).in("tipo", ["EPS", "ARL"]).maybeSingle();
  if (e0) throw new Error(e0.message);
  if (!ent) throw new Error("La entidad no existe en el catálogo.");
  const { data, error } = await db
    .from("incapacidad_recaudos")
    .insert({ ...d, valor: dinero(d.valor), referencia: d.referencia?.trim() || null, registrado_por_email: actor.email })
    .select("id")
    .single();
  if (error) throw traducir(error);
  const r = await leerRecaudo((data as { id: string }).id);
  if (!r) throw new Error("No se pudo leer el recaudo recién creado.");
  return r;
}

export async function anularRecaudo(id: string, motivo: string | null, actor: Actor): Promise<RecaudoVista> {
  const r = await leerRecaudo(id);
  if (!r) throw new Error("El recaudo no existe.");
  if (r.anulado_at) throw new Error("El recaudo ya está anulado.");
  if (r.aplicaciones > 0) throw new Error("El recaudo tiene aplicaciones vigentes: anúlalas primero.");
  if (!motivo || motivo.trim().length < 5) throw new Error("Escribe el motivo de la anulación (mínimo 5 caracteres).");
  const { error } = await createAdminClient()
    .from("incapacidad_recaudos")
    .update({ anulado_at: new Date().toISOString(), anulado_por_email: actor.email, motivo_anulacion: motivo.trim() })
    .eq("id", id)
    .is("anulado_at", null);
  if (error) throw new Error(error.message);
  return (await leerRecaudo(id))!;
}

// ── Aplicaciones ─────────────────────────────────────────────────────────────

export async function aplicarRecaudo(recaudoId: string, expedienteId: string, valor: number, actor: Actor): Promise<AplicacionFila> {
  const [r, v, tol] = await Promise.all([leerRecaudo(recaudoId), leerVista(expedienteId), leerTolerancia()]);
  if (!r) throw new Error("El recaudo no existe.");
  const s = saldoDe(v, tol);
  validarAplicacion(
    { valor: Number(r.valor), aplicado: Number(r.aplicado), anulado: !!r.anulado_at, entidad_catalogo_id: r.entidad_catalogo_id },
    { estado: v.estado, entidad_catalogo_id: v.entidad_catalogo_id, radicacion_estado: v.radicacion_estado, valor_reclamado: v.valor_reclamado, saldo: s.saldo },
    valor
  );
  const { data, error } = await createAdminClient()
    .from("incapacidad_recaudo_aplicaciones")
    .insert({ recaudo_id: recaudoId, expediente_id: expedienteId, radicacion_id: v.radicacion_id, valor_aplicado: dinero(valor), aplicado_por_email: actor.email })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await bitacora(expedienteId, "recaudo_aplicado", { saldo: s.saldo }, { aplicacion_id: (data as { id: string }).id, recaudo_id: recaudoId, valor: dinero(valor), referencia: r.referencia, fecha_giro: r.fecha_giro }, actor.email);
  await sincronizarEstado(expedienteId, actor);
  return data as AplicacionFila;
}

export async function anularAplicacion(aplicacionId: string, motivo: string | null, actor: Actor): Promise<AplicacionFila> {
  if (!motivo || motivo.trim().length < 5) throw new Error("Escribe el motivo de la anulación (mínimo 5 caracteres).");
  const db = createAdminClient();
  const { data: ap, error: e0 } = await db.from("incapacidad_recaudo_aplicaciones").select("*").eq("id", aplicacionId).maybeSingle();
  if (e0) throw new Error(e0.message);
  const a = ap as AplicacionFila | null;
  if (!a) throw new Error("La aplicación no existe.");
  if (a.anulada_at) throw new Error("La aplicación ya está anulada.");
  const v = await leerVista(a.expediente_id);
  if (v.estado === "cerrado") throw new Error("El expediente está cerrado; reábrelo antes de anular aplicaciones.");
  const { data, error } = await db
    .from("incapacidad_recaudo_aplicaciones")
    .update({ anulada_at: new Date().toISOString(), anulada_por_email: actor.email, motivo_anulacion: motivo.trim() })
    .eq("id", aplicacionId)
    .is("anulada_at", null)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await bitacora(a.expediente_id, "aplicacion_anulada", { valor: a.valor_aplicado }, { aplicacion_id: aplicacionId, motivo }, actor.email);
  await sincronizarEstado(a.expediente_id, actor);
  return data as AplicacionFila;
}

// ── Ajustes monetarios ───────────────────────────────────────────────────────

export interface DatosAjuste {
  tipo: string | null;
  valor: number | null;
  extingue_saldo: boolean;
  motivo: string | null;
}

export async function registrarAjuste(expedienteId: string, version: number, d: DatosAjuste, actor: Actor): Promise<AjusteMonetarioFila> {
  validarAjuste(d);
  const v = await leerVista(expedienteId);
  if (v.version !== version) throw new ConflictoVersion();
  if (!["radicado", "con_recaudo", "conciliado"].includes(v.estado)) {
    throw new Error(`El expediente está «${v.estado}»: los ajustes monetarios se registran después de radicar.`);
  }
  const { data, error } = await createAdminClient()
    .from("incapacidad_ajustes")
    .insert({ expediente_id: expedienteId, tipo: d.tipo, valor: dinero(d.valor!), extingue_saldo: d.extingue_saldo, motivo: d.motivo!.replace(/\s+/g, " ").trim(), autorizado_por_email: actor.email })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await bitacora(expedienteId, "ajuste_monetario", null, { ajuste_id: (data as { id: string }).id, tipo: d.tipo, valor: dinero(d.valor!), extingue_saldo: d.extingue_saldo, motivo: d.motivo }, actor.email);
  await sincronizarEstado(expedienteId, actor);
  return data as AjusteMonetarioFila;
}

export async function anularAjuste(ajusteId: string, motivo: string | null, actor: Actor): Promise<void> {
  if (!motivo || motivo.trim().length < 5) throw new Error("Escribe el motivo de la anulación (mínimo 5 caracteres).");
  const db = createAdminClient();
  const { data: aj, error: e0 } = await db.from("incapacidad_ajustes").select("*").eq("id", ajusteId).maybeSingle();
  if (e0) throw new Error(e0.message);
  const a = aj as AjusteMonetarioFila | null;
  if (!a) throw new Error("El ajuste no existe.");
  if (a.anulado_at) throw new Error("El ajuste ya está anulado.");
  const v = await leerVista(a.expediente_id);
  if (v.estado === "cerrado") throw new Error("El expediente está cerrado; reábrelo antes de anular ajustes.");
  const { error } = await db
    .from("incapacidad_ajustes")
    .update({ anulado_at: new Date().toISOString(), anulado_por_email: actor.email, motivo_anulacion: motivo.trim() })
    .eq("id", ajusteId)
    .is("anulado_at", null);
  if (error) throw new Error(error.message);
  await bitacora(a.expediente_id, "ajuste_monetario_anulado", { tipo: a.tipo, valor: a.valor }, { ajuste_id: ajusteId, motivo }, actor.email);
  await sincronizarEstado(a.expediente_id, actor);
}

// ── Cierre ───────────────────────────────────────────────────────────────────

export async function cerrarExpediente(expedienteId: string, version: number, motivo: string | null, actor: Actor): Promise<{ porExcepcion: boolean; saldo: number }> {
  const [v, tol] = await Promise.all([leerVista(expedienteId), leerTolerancia()]);
  if (v.version !== version) throw new ConflictoVersion();
  if (!["radicado", "con_recaudo", "conciliado"].includes(v.estado)) {
    throw new Error(`El expediente está «${v.estado}»: solo se cierra después de radicar.`);
  }
  const s = saldoDe(v, tol);
  const { porExcepcion } = validarCierre(s, motivo);
  const { data, error } = await createAdminClient()
    .from("incapacidad_expedientes")
    .update({
      estado: "cerrado",
      cerrado_at: new Date().toISOString(),
      cerrado_por_email: actor.email,
      motivo_cierre: motivo?.replace(/\s+/g, " ").trim() || null,
      cierre_por_excepcion: porExcepcion,
    })
    .eq("id", expedienteId)
    .eq("version", version)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new ConflictoVersion();
  await bitacora(expedienteId, "expediente_cerrado", { estado: v.estado, saldo: s.saldo }, { por_excepcion: porExcepcion, motivo, saldo: s.saldo, tolerancia: tol }, actor.email);
  return { porExcepcion, saldo: s.saldo };
}

export async function reabrirExpediente(expedienteId: string, version: number, motivo: string | null, actor: Actor): Promise<void> {
  if (!motivo || motivo.trim().length < 5) throw new Error("Escribe el motivo para reabrir (mínimo 5 caracteres).");
  const v = await leerVista(expedienteId);
  if (v.version !== version) throw new ConflictoVersion();
  if (v.estado !== "cerrado") throw new Error("Solo se reabre un expediente cerrado.");
  const { data, error } = await createAdminClient()
    .from("incapacidad_expedientes")
    .update({ estado: "radicado", cerrado_at: null, cerrado_por_email: null, motivo_cierre: null, cierre_por_excepcion: null })
    .eq("id", expedienteId)
    .eq("version", version)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new ConflictoVersion();
  await bitacora(expedienteId, "expediente_reabierto", { estado: "cerrado", motivo_cierre: v.motivo_cierre }, { motivo }, actor.email);
  await sincronizarEstado(expedienteId, actor);
}
