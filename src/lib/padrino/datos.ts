/**
 * Lectura de datos del Plan Padrino (solo servidor). Las tablas tienen RLS
 * sin políticas: se leen con el cliente admin después de verificar permisos
 * en la página o la acción que llama.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { causaLabel } from "@/lib/conductores/retiro";
import {
  decidirEsquema, evaluarPadrino, evaluarReferido, politicaVigente, sumarDias, sumarMeses,
  type DecisionEsquema, type EsquemasPolitica, type HechosPadrino, type HechosReferido, type Validacion,
} from "./reglas";
import { PARAMETROS_V2, parametrosDeFila, type ParametrosPolitica } from "./politica";
import type { FiltrosHitos, HitoFila } from "./hitos";

type Admin = ReturnType<typeof createAdminClient>;

export const BUCKET_PADRINO = "plan-padrino";

export function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

/** Día (AAAA-MM-DD, Bogotá) de un instante; null si no hay. */
export const fechaDe = (ts: string | null | undefined) =>
  ts ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(ts)) : null;

// ── Política ────────────────────────────────────────────────────────────────

export interface Politica {
  id: string;
  version: string;
  /** Null solo en un borrador. */
  vigente_desde: string | null;
  vigente_hasta: string | null;
  /** Columna vieja (v2); manda `parametros`. */
  esquemas: EsquemasPolitica;
  estado: "borrador" | "publicada";
  /** Ya validados; si la fila no los trae, derivados de `esquemas` (ver politica.ts). */
  parametros: ParametrosPolitica;
  aprobada_por: string | null;
  soporte: string | null;
  /** Documento firmado en el bucket `plan-padrino` (desde la publicación en la página). */
  soporte_ruta: string | null;
  publicada_por_email: string | null;
  publicada_at: string | null;
}

/**
 * Versiones de la política. Por omisión solo las PUBLICADAS: un borrador
 * nunca rige, aunque tenga fecha. Se lee con `*` para que funcione también
 * antes de aplicar la migración de los parámetros.
 */
export async function getPoliticas(admin: Admin = createAdminClient(), opciones: { borradores?: boolean } = {}): Promise<Politica[]> {
  const { data, error } = await admin.from("padrino_politicas").select("*").order("vigente_desde", { nullsFirst: false });
  if (error) throw new Error(`No se pudo leer la política: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[])
    .map((f) => ({
      id: f.id as string,
      version: f.version as string,
      vigente_desde: (f.vigente_desde as string | null) ?? null,
      vigente_hasta: (f.vigente_hasta as string | null) ?? null,
      esquemas: f.esquemas as EsquemasPolitica,
      estado: (f.estado === "borrador" ? "borrador" : "publicada") as Politica["estado"],
      parametros: parametrosDeFila(f),
      aprobada_por: (f.aprobada_por as string | null) ?? null,
      soporte: (f.soporte as string | null) ?? null,
      soporte_ruta: (f.soporte_ruta as string | null) ?? null,
      publicada_por_email: (f.publicada_por_email as string | null) ?? null,
      publicada_at: (f.publicada_at as string | null) ?? null,
    }))
    .filter((p) => opciones.borradores || p.estado === "publicada");
}

export async function getPoliticaVigente(fecha: string, admin: Admin = createAdminClient()) {
  return politicaVigente(await getPoliticas(admin), fecha);
}

/**
 * Histórico de pagos antes de Gestivo (F6): las cargas (por fuente) y los
 * referidos registrados cuya cédula ya tenía un pago del plan (lo que R11
 * marca como «ya pagado»). `disponible` es falso sin la migración de la v3.
 */
export async function getResumenHistorico(admin: Admin = createAdminClient()) {
  const filas: { cedula: string; anio: number | null; valor: number | null; fuente: string; cargado_por_email: string | null; cargado_at: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("padrino_pagos_historicos").select("cedula, anio, valor, fuente, cargado_por_email, cargado_at").order("id").range(from, from + 999);
    if (error) return { disponible: false, cargas: [], coincidencias: [] };
    filas.push(...((data ?? []) as typeof filas));
    if (!data || data.length < 1000) break;
  }
  const porFuente = new Map<string, typeof filas>();
  for (const f of filas) porFuente.set(f.fuente, [...(porFuente.get(f.fuente) ?? []), f]);
  const cargas = [...porFuente.entries()]
    .map(([fuente, xs]) => {
      const anios = xs.map((x) => x.anio).filter((a): a is number => a !== null);
      return {
        fuente,
        filas: xs.length,
        cedulas: new Set(xs.map((x) => x.cedula)).size,
        desde: anios.length ? Math.min(...anios) : null,
        hasta: anios.length ? Math.max(...anios) : null,
        valor: xs.reduce((s, x) => s + Number(x.valor ?? 0), 0),
        cargadoAt: xs.map((x) => x.cargado_at).sort()[0],
        cargadoPor: xs[0].cargado_por_email,
      };
    })
    .sort((a, b) => b.cargadoAt.localeCompare(a.cargadoAt));

  // Referidos (también anulados y cerrados: sirve para revisar) con pago previo.
  const porCedula = new Map<string, typeof filas>();
  for (const f of filas) porCedula.set(f.cedula, [...(porCedula.get(f.cedula) ?? []), f]);
  const cedulas = [...porCedula.keys()];
  const coincidencias: { id: string; nombre: string | null; cedula: string; estado: string; anulado: boolean; esquema: string; pagos: string }[] = [];
  for (let i = 0; i < cedulas.length; i += 300) {
    const { data } = await admin.from("padrino_referidos").select("id, nombre_referido, cedula_referido, estado, anulado_at, esquema").in("cedula_referido", cedulas.slice(i, i + 300));
    for (const r of data ?? []) {
      const pagos = (porCedula.get(r.cedula_referido as string) ?? [])
        .map((x) => `${x.anio ?? "año sin dato"}${x.valor ? ` $${Number(x.valor).toLocaleString("es-CO")}` : ""}`)
        .join(", ");
      coincidencias.push({ id: r.id as string, nombre: (r.nombre_referido as string | null) ?? null, cedula: r.cedula_referido as string, estado: r.estado as string, anulado: Boolean(r.anulado_at), esquema: r.esquema as string, pagos });
    }
  }
  return { disponible: true, cargas, coincidencias };
}

/**
 * Listas para el editor de la política: las áreas (`departments.name`) y los
 * cargos de los empleados activos, tal como están escritos en la base (la
 * exclusión los compara sin tildes ni mayúsculas).
 */
export async function catalogosPolitica(admin: Admin = createAdminClient()) {
  const [deps, emps] = await Promise.all([
    admin.from("departments").select("name"),
    admin.from("employees").select("position").in("status", ["activo", "periodo_prueba"]).limit(5000),
  ]);
  const limpios = (xs: (string | null | undefined)[]) => [...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  return {
    areas: limpios((deps.data ?? []).map((d) => d.name as string | null)),
    cargos: limpios((emps.data ?? []).map((e) => e.position as string | null)),
  };
}

/** La versión con que se evalúa un referido: la suya, o la vigente si no se encuentra. */
export async function getPoliticaPorId(id: string | null | undefined, admin: Admin = createAdminClient()) {
  const todas = await getPoliticas(admin, { borradores: true });
  return todas.find((p) => p.id === id) ?? politicaVigente(todas.filter((p) => p.estado === "publicada"), hoyBogota());
}

// ── Hechos para la validación ───────────────────────────────────────────────

export async function hechosPadrino(cedula: string, hoy: string, admin: Admin = createAdminClient(), p: ParametrosPolitica = PARAMETROS_V2): Promise<HechosPadrino> {
  // La ventana más larga que mire la versión; cada regla filtra la suya.
  const desde = sumarMeses(hoy, -Math.max(p.padrino.ventana_sanciones_meses, p.padrino.ventana_faltas_graves_meses));
  const [cond, emp, notif, acc, aut] = await Promise.all([
    admin.from("conductores").select("nombre, estado, tipo_conductor, fecha_ingreso, fecha_reingreso").eq("cedula", cedula).maybeSingle(),
    admin.from("employees").select("full_name, status, position, hire_date, departments(name)").eq("document_number", cedula).order("hire_date", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    admin.from("ausentismo_notificaciones").select("nivel, notificado_en").eq("cedula", cedula).is("anulada_en", null).gte("notificado_en", desde),
    admin.from("accidentes").select("fecha_accidente, accidente_evaluaciones(nivel_final, responsabilidad)").eq("conductor_cedula", cedula).gte("fecha_accidente", `${desde}T00:00:00-05:00`),
    admin.from("padrino_empleados_autorizados").select("cedula").eq("cedula", cedula).is("revocado_at", null).maybeSingle(),
  ]);
  const e = emp.data as { full_name: string; status: string; position: string | null; hire_date: string | null; departments: { name: string } | { name: string }[] | null } | null;
  const area = e ? (Array.isArray(e.departments) ? e.departments[0]?.name : e.departments?.name) ?? null : null;
  type Ev = { nivel_final: string | null; responsabilidad: string | null };
  type FilaAcc = { fecha_accidente: string; accidente_evaluaciones: Ev | Ev[] | null };
  return {
    cedula,
    conductor: cond.data ? { nombre: cond.data.nombre, estado: cond.data.estado, tipo: cond.data.tipo_conductor, fechaIngreso: cond.data.fecha_ingreso, fechaReingreso: cond.data.fecha_reingreso ?? null } : null,
    empleado: e ? { nombre: e.full_name, status: e.status, cargo: e.position, area, fechaIngreso: e.hire_date ?? null } : null,
    empleadoAutorizado: Boolean(aut.data),
    notificaciones: (notif.data ?? []).map((n) => ({ nivel: n.nivel as string, fecha: n.notificado_en as string })),
    correctivos: ((acc.data ?? []) as FilaAcc[])
      .map((a) => {
        const ev = Array.isArray(a.accidente_evaluaciones) ? a.accidente_evaluaciones[0] : a.accidente_evaluaciones;
        return { fecha: fechaDe(a.fecha_accidente)!, nivel: ev?.nivel_final ?? "", responsabilidad: ev?.responsabilidad ?? null };
      })
      .filter((c) => ["I", "II", "III", "IV"].includes(c.nivel)),
  };
}

/** Lo que el referido ya tiene en Plan Padrino (no sale del proceso). */
export interface ExtraReferido {
  /** El registro actual: sus propios hitos no cuentan como pago previo. */
  referidoId?: string | null;
  experienciaCertificada?: boolean | null;
  fechaIngreso?: string | null;
  /** Día (AAAA-MM-DD) en que el padrino lo registró en el plan (R13). Sin dato: hoy (se está registrando). */
  registradoEl?: string | null;
  /** Prerregistro sin proceso: la cédula y el nombre los dio el padrino. */
  cedula?: string | null;
  nombre?: string | null;
}

/**
 * Hechos del referido. Con `procesoId`, los del proceso de contratación; sin
 * él (prerregistro: el padrino registró la hoja de vida antes de que empezara
 * la selección), los que dio el padrino (`extra.cedula`, `extra.nombre`) y un
 * proceso vacío cuya fecha es la del registro.
 */
export async function hechosReferido(procesoId: string | null, admin: Admin = createAdminClient(), extra: ExtraReferido = {}): Promise<HechosReferido & { nombre: string; candidateId: string | null }> {
  const registradoEl = extra.registradoEl ?? hoyBogota();
  let p: Record<string, unknown>;
  if (procesoId) {
    const { data, error } = await admin
      .from("procesos_contratacion")
      .select("id, cedula, nombre, candidate_id, fecha_creacion, simit, estado, licencia_categoria, antecedentes, fecha_examenes, fecha_examenes_fase2")
      .eq("id", procesoId)
      .maybeSingle();
    if (error || !data) throw new Error("El proceso de contratación no existe.");
    p = data as Record<string, unknown>;
  } else {
    const ced = (extra.cedula ?? "").trim();
    if (!ced) throw new Error("Falta la cédula del referido.");
    p = { id: "", cedula: ced, nombre: (extra.nombre ?? "").trim() || ced, candidate_id: null, fecha_creacion: registradoEl, simit: null, estado: null };
  }
  const cedula = (p.cedula as string).trim();
  const [otros, cand, cond, retiro, notif, acc, pagados, historicos] = await Promise.all([
    procesoId
      ? admin.from("procesos_contratacion").select("id, estado, fecha_creacion").eq("cedula", cedula).neq("id", procesoId)
      : admin.from("procesos_contratacion").select("id, estado, fecha_creacion").eq("cedula", cedula),
    admin.from("candidates").select("id, created_at").eq("document_number", cedula).maybeSingle(),
    admin.from("conductores").select("estado, fecha_ingreso, fecha_retiro, fecha_reingreso").eq("cedula", cedula).maybeSingle(),
    admin.from("conductores_retiro").select("causa, fecha_retiro").eq("cedula", cedula).order("registrado_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("ausentismo_notificaciones").select("nivel, notificado_en").eq("cedula", cedula).is("anulada_en", null),
    admin.from("accidentes").select("fecha_accidente").eq("conductor_cedula", cedula),
    // Bonificación ya pagada por esta cédula en otro registro (cualquier padrino).
    admin.from("padrino_hitos").select("referido_id, numero, valor, fecha_pago, padrino_referidos!inner(cedula_referido, esquema)").eq("estado", "pagado").eq("padrino_referidos.cedula_referido", cedula),
    // Y antes de Gestivo. Sin la migración la tabla no existe: no hay nada que mirar.
    admin.from("padrino_pagos_historicos").select("anio, valor, fuente").eq("cedula", cedula),
  ]);
  const pesos = (v: unknown) => `$${Number(v ?? 0).toLocaleString("es-CO")}`;
  type Pagado = { referido_id: string; numero: number; valor: number; fecha_pago: string | null; padrino_referidos: { esquema: string } | { esquema: string }[] };
  const pagosPrevios = [
    ...((pagados.data ?? []) as Pagado[])
      .filter((h) => h.referido_id !== extra.referidoId)
      .map((h) => {
        const r = Array.isArray(h.padrino_referidos) ? h.padrino_referidos[0] : h.padrino_referidos;
        return { fuente: "gestivo" as const, detalle: `hito ${r?.esquema ?? ""}${h.numero} pagado${h.fecha_pago ? ` el ${h.fecha_pago.split("-").reverse().join("/")}` : ""} (${pesos(h.valor)})` };
      }),
    ...(historicos.error ? [] : (historicos.data ?? [])).map((x) => ({ fuente: "historico" as const, detalle: `${x.anio ?? "año sin dato"}${x.valor ? `, ${pesos(x.valor)}` : ""} (${x.fuente})` })),
  ];
  return {
    cedula,
    nombre: p.nombre as string,
    candidateId: (p.candidate_id as string | null) ?? ((cand.data?.id as string | undefined) ?? null),
    proceso: {
      id: p.id as string,
      fechaCreacion: p.fecha_creacion as string,
      simit: (p.simit as string | null) ?? null,
      estado: (p.estado as string | null) ?? null,
      licencia: (p.licencia_categoria as string | null) ?? null,
      antecedentes: (p.antecedentes as string | null) ?? null,
      fechaExamenes: (p.fecha_examenes as string | null) ?? null,
      fechaExamenesFase2: (p.fecha_examenes_fase2 as string | null) ?? null,
    },
    candidatoCreado: fechaDe(cand.data?.created_at as string | undefined),
    otrosProcesos: (otros.data ?? []).map((o) => ({ id: o.id as string, estado: o.estado as string, fechaCreacion: o.fecha_creacion as string })),
    conductor: cond.data ? { estado: cond.data.estado, fechaIngreso: cond.data.fecha_ingreso, fechaRetiro: cond.data.fecha_retiro, fechaReingreso: cond.data.fecha_reingreso ?? null } : null,
    causaRetiro: retiro.data?.causa ? causaLabel(retiro.data.causa as string) : null,
    causaRetiroClave: (retiro.data?.causa as string | null | undefined) ?? null,
    notificaciones: (notif.data ?? []).map((n) => ({ nivel: n.nivel as string, fecha: n.notificado_en as string })),
    accidentes: (acc.data ?? []).map((a) => ({ fecha: fechaDe(a.fecha_accidente as string)! })),
    pagosPrevios,
    experienciaCertificada: extra.experienciaCertificada ?? null,
    fechaIngreso: extra.fechaIngreso ?? null,
    sinProceso: !procesoId,
    registradoEl,
  };
}

/**
 * Evalúa los requisitos del padrino y del referido con los datos de hoy y los
 * parámetros de `politica` (por omisión, la vigente hoy). Devuelve también el
 * esquema que le corresponde según el tipo de referido.
 */
export async function validar(
  procesoId: string | null,
  cedulaPadrino: string,
  admin: Admin = createAdminClient(),
  opciones: { politica?: Politica | null } & ExtraReferido = {}
) {
  const hoy = hoyBogota();
  const politica = opciones.politica ?? (await getPoliticaVigente(hoy, admin));
  const p = politica?.parametros ?? PARAMETROS_V2;
  const [hp, hr] = await Promise.all([hechosPadrino(cedulaPadrino, hoy, admin, p), hechosReferido(procesoId, admin, opciones)]);
  const validacion: Validacion = { padrino: evaluarPadrino(hp, hoy, p), referido: evaluarReferido(hr, p), evaluadoEl: hoy, politica: politica?.version };
  const esquema: DecisionEsquema = decidirEsquema(hr, hr.fechaIngreso ?? hr.proceso.fechaCreacion, p);
  return { validacion, padrino: hp, referido: hr, politica, esquema };
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
  esquema: "A" | "B" | "C";
  /** Desde la v3: nuevo o reintegro, cuántos meses estuvo fuera y, si no se bonifica, por qué. */
  tipo_ingreso?: "nuevo" | "reintegro" | null;
  meses_fuera?: number | null;
  sin_bonificacion_motivo?: string | null;
  validacion_contratacion?: Validacion | null;
  hitos_bloqueados_motivo?: string | null;
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
    getPoliticas(admin, { borradores: true }),
    getHitosReferido(id, r),
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

// `*` en las columnas del hito: incluye las del beneficiario sin romper si la
// migración de la v3 todavía no se aplicó (entonces todos son del padrino).
const COLS_HITO =
  "*, padrino_referidos!inner(cedula_referido, nombre_referido, cedula_padrino, nombre_padrino, padrino_tipo, esquema, fecha_ingreso, created_by, created_by_email, anulado_at)";

/** Completa el beneficiario de una fila leída (antes de la migración no existe: es el padrino). */
function conBeneficiario<T extends Record<string, unknown>>(h: T, ref?: { cedula_padrino: string; nombre_padrino: string | null }) {
  const beneficiario = h.beneficiario === "referido" ? "referido" : "padrino";
  return {
    ...h,
    valor: Number(h.valor),
    beneficiario,
    cedula_beneficiario: (h.cedula_beneficiario as string | null | undefined) ?? (beneficiario === "padrino" ? ref?.cedula_padrino ?? null : null),
    nombre_beneficiario: (h.nombre_beneficiario as string | null | undefined) ?? (beneficiario === "padrino" ? ref?.nombre_padrino ?? null : null),
  } as const;
}

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
    for (const h of (data ?? []) as Record<string, unknown>[]) {
      const ref = (Array.isArray(h.padrino_referidos) ? h.padrino_referidos[0] : h.padrino_referidos) as HitoFila["referido"];
      filas.push({ ...(conBeneficiario(h, ref) as unknown as Omit<HitoFila, "referido">), referido: ref });
    }
    if (!data || data.length < 1000) break;
  }
  const t = f.q.trim().toLowerCase();
  return t
    ? filas.filter((h) => [h.referido.cedula_referido, h.referido.nombre_referido, h.referido.cedula_padrino, h.referido.nombre_padrino].some((v) => v?.toLowerCase().includes(t)))
    : filas;
}

export async function getHitosReferido(referidoId: string, ref?: { cedula_padrino: string; nombre_padrino: string | null }): Promise<Omit<HitoFila, "referido">[]> {
  const { data } = await createAdminClient()
    .from("padrino_hitos")
    .select("*")
    .eq("referido_id", referidoId)
    .order("numero")
    .order("beneficiario");
  // Sin la migración no existe `beneficiario` y el orden por esa columna falla: se reintenta sin él.
  const filas = data ?? (await createAdminClient().from("padrino_hitos").select("*").eq("referido_id", referidoId).order("numero")).data ?? [];
  return (filas as Record<string, unknown>[]).map((h) => conBeneficiario(h, ref) as unknown as Omit<HitoFila, "referido">);
}
