/**
 * Lectura de datos del Plan Padrino (solo servidor). Las tablas tienen RLS
 * sin políticas: se leen con el cliente admin después de verificar permisos
 * en la página o la acción que llama.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { causaLabel } from "@/lib/conductores/retiro";
import {
  MESES_SANCIONES, evaluarPadrino, evaluarReferido, politicaVigente, sumarDias, sumarMeses,
  type EsquemasPolitica, type HechosPadrino, type HechosReferido, type Validacion,
} from "./reglas";
import type { FiltrosHitos, HitoFila } from "./hitos";

type Admin = ReturnType<typeof createAdminClient>;

export const BUCKET_PADRINO = "plan-padrino";

export function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

const fechaDe = (ts: string | null | undefined) =>
  ts ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(ts)) : null;

// ── Política ────────────────────────────────────────────────────────────────

export interface Politica {
  id: string;
  version: string;
  vigente_desde: string;
  vigente_hasta: string | null;
  esquemas: EsquemasPolitica;
}

export async function getPoliticas(admin: Admin = createAdminClient()): Promise<Politica[]> {
  const { data, error } = await admin.from("padrino_politicas").select("id, version, vigente_desde, vigente_hasta, esquemas").order("vigente_desde");
  if (error) throw new Error(`No se pudo leer la política: ${error.message}`);
  return (data ?? []) as Politica[];
}

export async function getPoliticaVigente(fecha: string, admin: Admin = createAdminClient()) {
  return politicaVigente(await getPoliticas(admin), fecha);
}

// ── Hechos para la validación ───────────────────────────────────────────────

export async function hechosPadrino(cedula: string, hoy: string, admin: Admin = createAdminClient()): Promise<HechosPadrino> {
  const desde = sumarMeses(hoy, -MESES_SANCIONES);
  const [cond, emp, notif, acc, aut] = await Promise.all([
    admin.from("conductores").select("nombre, estado, tipo_conductor, fecha_ingreso").eq("cedula", cedula).maybeSingle(),
    admin.from("employees").select("full_name, status, position, departments(name)").eq("document_number", cedula).order("hire_date", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    admin.from("ausentismo_notificaciones").select("nivel, notificado_en").eq("cedula", cedula).is("anulada_en", null).gte("notificado_en", desde),
    admin.from("accidentes").select("fecha_accidente, accidente_evaluaciones(nivel_final)").eq("conductor_cedula", cedula).gte("fecha_accidente", `${desde}T00:00:00-05:00`),
    admin.from("padrino_empleados_autorizados").select("cedula").eq("cedula", cedula).is("revocado_at", null).maybeSingle(),
  ]);
  const e = emp.data as { full_name: string; status: string; position: string | null; departments: { name: string } | { name: string }[] | null } | null;
  const area = e ? (Array.isArray(e.departments) ? e.departments[0]?.name : e.departments?.name) ?? null : null;
  type FilaAcc = { fecha_accidente: string; accidente_evaluaciones: { nivel_final: string | null } | { nivel_final: string | null }[] | null };
  return {
    cedula,
    conductor: cond.data ? { nombre: cond.data.nombre, estado: cond.data.estado, tipo: cond.data.tipo_conductor, fechaIngreso: cond.data.fecha_ingreso } : null,
    empleado: e ? { nombre: e.full_name, status: e.status, cargo: e.position, area } : null,
    empleadoAutorizado: Boolean(aut.data),
    notificaciones: (notif.data ?? []).map((n) => ({ nivel: n.nivel as string, fecha: n.notificado_en as string })),
    correctivos: ((acc.data ?? []) as FilaAcc[])
      .map((a) => {
        const ev = Array.isArray(a.accidente_evaluaciones) ? a.accidente_evaluaciones[0] : a.accidente_evaluaciones;
        return { fecha: fechaDe(a.fecha_accidente)!, nivel: ev?.nivel_final ?? "" };
      })
      .filter((c) => ["I", "II", "III", "IV"].includes(c.nivel)),
  };
}

export async function hechosReferido(procesoId: string, admin: Admin = createAdminClient()): Promise<HechosReferido & { nombre: string; candidateId: string | null }> {
  const { data: p, error } = await admin
    .from("procesos_contratacion")
    .select("id, cedula, nombre, candidate_id, fecha_creacion, simit")
    .eq("id", procesoId)
    .maybeSingle();
  if (error || !p) throw new Error("El proceso de contratación no existe.");
  const cedula = (p.cedula as string).trim();
  const [otros, cand, cond, retiro, notif, acc] = await Promise.all([
    admin.from("procesos_contratacion").select("id, estado, fecha_creacion").eq("cedula", cedula).neq("id", procesoId),
    admin.from("candidates").select("created_at").eq("document_number", cedula).maybeSingle(),
    admin.from("conductores").select("estado, fecha_ingreso, fecha_retiro, fecha_reingreso").eq("cedula", cedula).maybeSingle(),
    admin.from("conductores_retiro").select("causa, fecha_retiro").eq("cedula", cedula).order("registrado_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("ausentismo_notificaciones").select("nivel, notificado_en").eq("cedula", cedula).is("anulada_en", null),
    admin.from("accidentes").select("fecha_accidente").eq("conductor_cedula", cedula),
  ]);
  return {
    cedula,
    nombre: p.nombre as string,
    candidateId: (p.candidate_id as string | null) ?? null,
    proceso: { id: p.id as string, fechaCreacion: p.fecha_creacion as string, simit: (p.simit as string | null) ?? null },
    candidatoCreado: fechaDe(cand.data?.created_at as string | undefined),
    otrosProcesos: (otros.data ?? []).map((o) => ({ id: o.id as string, estado: o.estado as string, fechaCreacion: o.fecha_creacion as string })),
    conductor: cond.data ? { estado: cond.data.estado, fechaIngreso: cond.data.fecha_ingreso, fechaRetiro: cond.data.fecha_retiro, fechaReingreso: cond.data.fecha_reingreso ?? null } : null,
    causaRetiro: retiro.data?.causa ? causaLabel(retiro.data.causa as string) : null,
    notificaciones: (notif.data ?? []).map((n) => ({ nivel: n.nivel as string, fecha: n.notificado_en as string })),
    accidentes: (acc.data ?? []).map((a) => ({ fecha: fechaDe(a.fecha_accidente as string)! })),
  };
}

/** Evalúa P1-P3 y R1-R5 con los datos de hoy. */
export async function validar(procesoId: string, cedulaPadrino: string, admin: Admin = createAdminClient()) {
  const hoy = hoyBogota();
  const [hp, hr] = await Promise.all([hechosPadrino(cedulaPadrino, hoy, admin), hechosReferido(procesoId, admin)]);
  const validacion: Validacion = { padrino: evaluarPadrino(hp, hoy), referido: evaluarReferido(hr), evaluadoEl: hoy };
  return { validacion, padrino: hp, referido: hr };
}

// ── Usuario actual ──────────────────────────────────────────────────────────

/**
 * Cédula del usuario de Gestivo: la de su perfil si la tiene; si no, la del
 * conductor o empleado con su mismo correo. Sirve para que el padrino no vea
 * ni edite su propio registro (RQ-07).
 */
export async function cedulaDelUsuario(userId: string | null, email: string | null, admin: Admin = createAdminClient()): Promise<string | null> {
  if (userId) {
    const { data } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
    const c = (data as { cedula?: string | null } | null)?.cedula?.trim();
    if (c) return c;
  }
  if (!email) return null;
  const correo = email.trim().toLowerCase();
  const [cond, emp] = await Promise.all([
    admin.from("conductores").select("cedula").ilike("correo", correo).limit(1).maybeSingle(),
    admin.from("employees").select("document_number").ilike("email", correo).limit(1).maybeSingle(),
  ]);
  return (cond.data?.cedula as string | undefined) ?? (emp.data?.document_number as string | undefined) ?? null;
}

// ── Listado y detalle ───────────────────────────────────────────────────────

export interface ReferidoFila {
  id: string;
  politica_id: string;
  candidate_id: string | null;
  proceso_id: string | null;
  cedula_referido: string;
  nombre_referido: string | null;
  cedula_padrino: string;
  nombre_padrino: string | null;
  padrino_tipo: "conductor" | "empleado";
  padrino_cargo: string | null;
  esquema: "A" | "B";
  experiencia_certificada: boolean;
  certificado_ruta: string | null;
  certificado_nombre: string | null;
  certificado_subido_por_email: string | null;
  certificado_subido_at: string | null;
  certificado_validado_por_email: string | null;
  certificado_validado_at: string | null;
  estado: string;
  validacion: Validacion;
  validacion_at: string | null;
  elegibilidad_excepcion: boolean;
  elegibilidad_observacion: string | null;
  elegibilidad_por_email: string | null;
  elegibilidad_at: string | null;
  fecha_ingreso: string | null;
  cierre_observacion: string | null;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
  anulado_at: string | null;
  anulado_por_email: string | null;
  motivo_anulacion: string | null;
}

export interface ProcesoResumen {
  id: string;
  estado: string;
  fecha_contrato: string | null;
  vacante: string | null;
}

/** Referidos visibles para el usuario (nunca el suyo como padrino). */
export async function listarReferidos(f: { estado?: string; q?: string; anulados?: boolean }, cedulaUsuario: string | null) {
  const admin = createAdminClient();
  const filas: ReferidoFila[] = [];
  for (let from = 0; ; from += 1000) {
    let q = admin.from("padrino_referidos").select("*").order("created_at", { ascending: false }).order("id").range(from, from + 999);
    if (!f.anulados) q = q.is("anulado_at", null);
    if (f.estado && f.estado !== "todos") q = q.eq("estado", f.estado);
    if (cedulaUsuario) q = q.neq("cedula_padrino", cedulaUsuario);
    if (f.q) {
      const t = f.q.replace(/[%,()]/g, " ").trim();
      if (t) q = q.or(`cedula_referido.ilike.%${t}%,nombre_referido.ilike.%${t}%,cedula_padrino.ilike.%${t}%,nombre_padrino.ilike.%${t}%`);
    }
    const { data, error } = await q;
    if (error) throw new Error(`No se pudieron leer los referidos: ${error.message}`);
    filas.push(...((data ?? []) as ReferidoFila[]));
    if (!data || data.length < 1000) break;
  }
  const ids = [...new Set(filas.map((r) => r.proceso_id).filter(Boolean))] as string[];
  const procesos = new Map<string, ProcesoResumen>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("procesos_contratacion").select("id, estado, fecha_contrato, vacancies(title)").in("id", ids.slice(i, i + 200));
    for (const p of data ?? []) {
      const v = p.vacancies as { title: string } | { title: string }[] | null;
      procesos.set(p.id as string, { id: p.id as string, estado: p.estado as string, fecha_contrato: (p.fecha_contrato as string | null) ?? null, vacante: (Array.isArray(v) ? v[0]?.title : v?.title) ?? null });
    }
  }
  return filas.map((r) => ({ ...r, proceso: r.proceso_id ? procesos.get(r.proceso_id) ?? null : null }));
}

export interface Evento {
  id: string;
  accion: string;
  detalle: Record<string, unknown>;
  usuario_email: string | null;
  created_at: string;
}

export async function getReferido(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("padrino_referidos").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const r = data as ReferidoFila;
  const [proc, eventos, politicas, hitos] = await Promise.all([
    r.proceso_id
      ? admin.from("procesos_contratacion").select("id, estado, fecha_contrato, fecha_creacion, causa_no_contrato, vacancies(title)").eq("id", r.proceso_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("padrino_eventos").select("id, accion, detalle, usuario_email, created_at").eq("referido_id", id).order("created_at", { ascending: false }),
    getPoliticas(admin),
    getHitosReferido(id),
  ]);
  const p = proc.data as (ProcesoResumen & { fecha_creacion: string; causa_no_contrato: string | null; vacancies?: { title: string } | { title: string }[] | null }) | null;
  const vac = p?.vacancies;
  return {
    referido: r,
    proceso: p ? { id: p.id, estado: p.estado, fecha_contrato: p.fecha_contrato, fecha_creacion: p.fecha_creacion, causa_no_contrato: p.causa_no_contrato, vacante: (Array.isArray(vac) ? vac[0]?.title : vac?.title) ?? null } : null,
    eventos: (eventos.data ?? []) as Evento[],
    politica: politicas.find((x) => x.id === r.politica_id) ?? null,
    hitos,
  };
}

/** Proceso para precargar el registro cuando se entra desde Procesos de contratación. */
export async function getProcesoOpcion(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data: p } = await createAdminClient()
    .from("procesos_contratacion")
    .select("id, cedula, nombre, estado, fecha_creacion, vacancies(title)")
    .eq("id", id)
    .maybeSingle();
  if (!p) return null;
  const v = p.vacancies as { title: string } | { title: string }[] | null;
  return {
    id: p.id as string,
    cedula: p.cedula as string,
    nombre: p.nombre as string,
    estado: p.estado as string,
    fecha_creacion: p.fecha_creacion as string,
    vacante: (Array.isArray(v) ? v[0]?.title : v?.title) ?? null,
  };
}

/** Registro vigente (no anulado) de un referido por cédula. */
export async function referidoVigente(cedula: string, admin: Admin = createAdminClient()) {
  const { data } = await admin
    .from("padrino_referidos")
    .select("id, cedula_padrino, nombre_padrino, created_by_email, created_at")
    .eq("cedula_referido", cedula)
    .is("anulado_at", null)
    .maybeSingle();
  return data as { id: string; cedula_padrino: string; nombre_padrino: string | null; created_by_email: string | null; created_at: string } | null;
}

// ── Hitos (fase 2) ──────────────────────────────────────────────────────────

export { VISTAS_HITOS, type FiltrosHitos, type HitoFila } from "./hitos";

const COLS_HITO =
  "id, referido_id, numero, descripcion, valor, requiere_desempeno, fecha_causacion, estado, motivo, evaluado_at, desempeno_satisfactorio, aprobado_por_email, aprobado_at, observacion_aprobacion, pagado_por_email, fecha_pago, referencia_pago, padrino_referidos!inner(cedula_referido, nombre_referido, cedula_padrino, nombre_padrino, padrino_tipo, esquema, fecha_ingreso, created_by, created_by_email, anulado_at)";

/** Hitos de referidos vigentes, nunca los del usuario como padrino. */
export async function listarHitos(f: FiltrosHitos, cedulaUsuario: string | null): Promise<HitoFila[]> {
  const admin = createAdminClient();
  const hoy = hoyBogota();
  const filas: HitoFila[] = [];
  for (let from = 0; ; from += 1000) {
    let q = admin
      .from("padrino_hitos")
      .select(COLS_HITO)
      .is("padrino_referidos.anulado_at", null)
      .order("fecha_causacion")
      .order("id")
      .range(from, from + 999);
    if (f.vista === "por_aprobar" || f.vista === "aprobado") q = q.eq("estado", f.vista);
    // 30 días exactos: el mismo corte que usa el indicador del tablero.
    if (f.vista === "proximos") q = q.eq("estado", "pendiente").lte("fecha_causacion", sumarDias(hoy, 30));
    if (f.desde) q = q.gte("fecha_causacion", f.desde);
    if (f.hasta) q = q.lte("fecha_causacion", f.hasta);
    if (cedulaUsuario) q = q.neq("padrino_referidos.cedula_padrino", cedulaUsuario);
    const { data, error } = await q;
    if (error) throw new Error(`No se pudieron leer los hitos: ${error.message}`);
    for (const h of data ?? []) {
      const ref = (Array.isArray(h.padrino_referidos) ? h.padrino_referidos[0] : h.padrino_referidos) as HitoFila["referido"];
      filas.push({ ...(h as unknown as Omit<HitoFila, "referido">), valor: Number(h.valor), referido: ref });
    }
    if (!data || data.length < 1000) break;
  }
  const t = f.q.trim().toLowerCase();
  return t
    ? filas.filter((h) => [h.referido.cedula_referido, h.referido.nombre_referido, h.referido.cedula_padrino, h.referido.nombre_padrino].some((v) => v?.toLowerCase().includes(t)))
    : filas;
}

export async function getHitosReferido(referidoId: string): Promise<Omit<HitoFila, "referido">[]> {
  const { data } = await createAdminClient()
    .from("padrino_hitos")
    .select("id, referido_id, numero, descripcion, valor, requiere_desempeno, fecha_causacion, estado, motivo, evaluado_at, desempeno_satisfactorio, aprobado_por_email, aprobado_at, observacion_aprobacion, pagado_por_email, fecha_pago, referencia_pago")
    .eq("referido_id", referidoId)
    .order("numero");
  return ((data ?? []) as Omit<HitoFila, "referido">[]).map((h) => ({ ...h, valor: Number(h.valor) }));
}
