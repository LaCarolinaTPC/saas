/**
 * Prueba psicosensotécnica — lectura y escritura (solo servidor).
 *
 * Lo usan la página pública (sin sesión: quien llama ya validó la cédula o la
 * clave del intento) y la bandeja de la psicóloga (quien llama ya revisó el
 * permiso). Aquí no se revisan permisos, salvo en los `assert` del final.
 *
 * Tablas `psico_*` (migración 20261120170136). Reglas puras en ./acceso,
 * ./calificacion, ./config y ./bateria.
 */

import { randomBytes, randomInt } from "crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashApiKey } from "@/lib/external/api-keys";
import { CODIGO_VIDA_MS, generarCodigo, normalizarCodigo } from "@/lib/pantalla/vinculacion-reglas";
import { cedulaNormalizada } from "@/lib/seleccion/vinculo";
import { ACTOR_SISTEMA, registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import { canAccess, canAccessSub, getCurrentPermissions, tienePermiso, type Permissions } from "@/lib/permissions";
import { PRUEBAS, VERSION_BATERIA, esPrueba, validarDatos, type ClavePrueba } from "./bateria";
import { calificar, resumenGlobal, type InformePrueba, type Metrica } from "./calificacion";
import { leerConfig, pruebasActivas, type ConfigPsico } from "./config";
import { MENSAJE_RECHAZO, enCursoVigente, puedePresentar } from "./acceso";
import { RUTA_PUBLICA, type Concepto, type Equipo, type Intento, type IntentoDetalle, type PruebaIntento, type ResumenIntento } from "./tipos";

type Fila = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const ahoraIso = () => new Date().toISOString();

// ── Configuración ──────────────────────────────────────────────────────────
export async function leerConfigPsico(): Promise<ConfigPsico> {
  const { data, error } = await createAdminClient().from("psico_config").select("valor").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  return leerConfig(data?.valor);
}

export async function guardarConfigPsico(config: ConfigPsico, email: string | null): Promise<void> {
  const { error } = await createAdminClient()
    .from("psico_config")
    .upsert({ id: 1, valor: config, updated_at: ahoraIso(), updated_by_email: email }, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

// ── Equipos vinculados ─────────────────────────────────────────────────────
const COOKIE_EQUIPO = "psico_equipo";
const PREFIJO_CLAVE = "pse_";

/** El equipo de la empresa desde el que llega la petición, o null. */
export async function equipoActual(): Promise<{ id: string; nombre: string } | null> {
  const clave = (await cookies()).get(COOKIE_EQUIPO)?.value;
  if (!clave || !clave.startsWith(PREFIJO_CLAVE)) return null;
  const db = createAdminClient();
  const { data } = await db
    .from("psico_equipos")
    .select("id, nombre, last_seen_at")
    .eq("key_hash", hashApiKey(clave))
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  // «Último uso» con una hora de holgura: no hace falta escribir en cada petición.
  const visto = data.last_seen_at ? new Date(data.last_seen_at as string).getTime() : 0;
  if (Date.now() - visto > 3600_000) await db.from("psico_equipos").update({ last_seen_at: ahoraIso() }).eq("id", data.id);
  return { id: data.id as string, nombre: data.nombre as string };
}

/**
 * Canjea el código que alguien de la empresa generó en la configuración. De un
 * solo uso: la clave se entrega al equipo en una cookie y en la base solo
 * queda su SHA-256.
 */
export async function vincularEquipoConCodigo(codigoCrudo: string): Promise<{ nombre: string } | null> {
  const codigo = normalizarCodigo(codigoCrudo);
  if (!codigo) return null;
  const clave = `${PREFIJO_CLAVE}${randomBytes(24).toString("base64url")}`;
  const { data } = await createAdminClient()
    .from("psico_equipos")
    .update({ key_hash: hashApiKey(clave), codigo: null, codigo_expira_at: null, vinculado_at: ahoraIso(), last_seen_at: ahoraIso() })
    .eq("codigo", codigo)
    .eq("is_active", true)
    .gt("codigo_expira_at", ahoraIso())
    .select("nombre")
    .maybeSingle();
  if (!data) return null;
  (await cookies()).set(COOKIE_EQUIPO, clave, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: RUTA_PUBLICA,
    maxAge: 365 * 24 * 3600,
  });
  return { nombre: data.nombre as string };
}

export async function listarEquipos(): Promise<Equipo[]> {
  const { data, error } = await createAdminClient()
    .from("psico_equipos")
    .select("id, nombre, codigo, codigo_expira_at, key_hash, last_seen_at, is_active")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const ahora = Date.now();
  return (data ?? []).map((f) => {
    const vigente = !!f.codigo && !!f.codigo_expira_at && new Date(f.codigo_expira_at as string).getTime() > ahora;
    return {
      id: f.id as string,
      nombre: f.nombre as string,
      vinculado: !!f.key_hash,
      codigo: vigente ? (f.codigo as string) : null,
      codigoExpira: vigente ? (f.codigo_expira_at as string) : null,
      ultimoUso: s(f.last_seen_at),
      activo: f.is_active === true,
    };
  });
}

/**
 * Código nuevo para un equipo (nuevo si no se da `id`). Pedirlo para uno ya
 * vinculado lo desvincula: sirve para pasar el nombre a otra tableta.
 */
export async function generarCodigoDeEquipo(entrada: { id?: string; nombre?: string }, email: string | null): Promise<string> {
  const db = createAdminClient();
  const expira = new Date(Date.now() + CODIGO_VIDA_MS).toISOString();
  for (let intento = 0; intento < 5; intento++) {
    const codigo = generarCodigo(() => randomInt(1_000_000));
    const cambio = { codigo, codigo_expira_at: expira, key_hash: null, vinculado_at: null, is_active: true };
    const { error } = entrada.id
      ? await db.from("psico_equipos").update(cambio).eq("id", entrada.id)
      : await db.from("psico_equipos").insert({ ...cambio, nombre: (entrada.nombre ?? "").trim(), created_by_email: email });
    if (!error) return codigo;
    // 23505 = otro equipo tiene ese código vigente: se prueba otro.
    if (error.code !== "23505") throw new Error(error.message);
  }
  throw new Error("No se pudo generar un código.");
}

export async function revocarEquipoPsico(id: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("psico_equipos")
    .update({ is_active: false, key_hash: null, codigo: null, codigo_expira_at: null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── La persona detrás de una cédula ────────────────────────────────────────
interface Persona {
  nombre: string | null;
  celular: string | null;
  candidateId: string | null;
  procesoId: string | null;
  /** Tiene proceso de selección abierto o ficha de candidato. */
  esCandidato: boolean;
}

async function personaPorCedula(cedula: string): Promise<Persona> {
  const db = createAdminClient();
  const [proceso, candidato, conductor] = await Promise.all([
    db.from("procesos_contratacion").select("id, nombre, celular, candidate_id").eq("cedula", cedula)
      .not("estado", "in", "(contratado,cierre)").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("candidates").select("id, full_name, phone").eq("document_number", cedula).limit(1).maybeSingle(),
    db.from("conductores").select("nombre").eq("cedula", cedula).limit(1).maybeSingle(),
  ]);
  return {
    nombre: s(proceso.data?.nombre) ?? s(candidato.data?.full_name) ?? s(conductor.data?.nombre),
    celular: s(proceso.data?.celular) ?? s(candidato.data?.phone),
    candidateId: s(proceso.data?.candidate_id) ?? s(candidato.data?.id),
    procesoId: s(proceso.data?.id),
    esCandidato: !!proceso.data || !!candidato.data,
  };
}

interface Pendiente {
  id: string;
  estado: "asignado" | "en_curso";
  nombre: string | null;
  iniciadoEn: string | null;
}

/**
 * La prueba pendiente de la cédula (asignada o a medias) y cuántas terminó.
 * Una prueba a medias con más de 24 horas se da por abandonada aquí mismo.
 */
async function situacionDeCedula(cedula: string): Promise<{ pendiente: Pendiente | null; terminadas: number }> {
  const db = createAdminClient();
  const [pend, term] = await Promise.all([
    db.from("psico_intentos").select("id, estado, nombre, iniciado_en").eq("cedula", cedula).in("estado", ["asignado", "en_curso"]).maybeSingle(),
    db.from("psico_intentos").select("id", { count: "exact", head: true }).eq("cedula", cedula).eq("estado", "terminado"),
  ]);
  if (pend.error) throw new Error(pend.error.message);
  let pendiente: Pendiente | null = pend.data
    ? { id: pend.data.id as string, estado: pend.data.estado as Pendiente["estado"], nombre: s(pend.data.nombre), iniciadoEn: s(pend.data.iniciado_en) }
    : null;
  if (pendiente?.estado === "en_curso" && !enCursoVigente(pendiente.iniciadoEn, new Date())) {
    await db.from("psico_intentos").update({ estado: "abandonado", token_hash: null }).eq("id", pendiente.id).eq("estado", "en_curso");
    pendiente = null;
  }
  return { pendiente, terminadas: term.count ?? 0 };
}

// ── Página pública ─────────────────────────────────────────────────────────
type Rechazo = { success: false; error: string };

interface Admision {
  config: ConfigPsico;
  equipoId: string | null;
  persona: Persona;
  pendiente: Pendiente | null;
}

/** Todo lo que decide si esa cédula puede presentar la prueba ahora. */
async function admitir(cedulaCruda: string): Promise<({ success: true; cedula: string } & Admision) | Rechazo> {
  const cedula = cedulaNormalizada(cedulaCruda);
  if (!cedula) return { success: false, error: "Escriba su número de cédula, solo los números." };
  const [config, equipo, persona, situacion] = await Promise.all([leerConfigPsico(), equipoActual(), personaPorCedula(cedula), situacionDeCedula(cedula)]);
  const r = puedePresentar(config, {
    equipoValido: !!equipo,
    tieneAsignacion: situacion.pendiente?.estado === "asignado",
    enCurso: situacion.pendiente?.estado === "en_curso",
    esCandidato: persona.esCandidato,
    terminadas: situacion.terminadas,
  });
  if (!r.ok) return { success: false, error: MENSAJE_RECHAZO[r.motivo] };
  return { success: true, cedula, config, equipoId: equipo?.id ?? null, persona, pendiente: situacion.pendiente };
}

const primerNombre = (nombre: string | null) => nombre?.trim().split(/\s+/)[0] ?? null;

export type Identificacion =
  | { success: true; cedula: string; nombre: string | null; pedirDatos: boolean; retoma: boolean }
  | Rechazo;

export async function identificarCedula(cedulaCruda: string): Promise<Identificacion> {
  const a = await admitir(cedulaCruda);
  if (!a.success) return a;
  const nombre = a.pendiente?.nombre ?? a.persona.nombre;
  // Solo el primer nombre: con una cédula ajena no se obtiene el nombre completo.
  return { success: true, cedula: a.cedula, nombre: primerNombre(nombre), pedirDatos: !nombre, retoma: a.pendiente?.estado === "en_curso" };
}

export interface DatosInicio {
  cedula: string;
  nombre?: string;
  celular?: string;
  autoriza: boolean;
  tipoEntrada: "tactil" | "raton";
}

export type Inicio = { success: true; token: string; pendientes: ClavePrueba[] } | Rechazo;

export async function iniciarIntento(d: DatosInicio, meta: { ip: string | null; equipo: string | null }): Promise<Inicio> {
  if (d.autoriza !== true) return { success: false, error: "Para presentar la prueba debe autorizar el tratamiento de sus datos." };
  const a = await admitir(d.cedula);
  if (!a.success) return a;

  const conocido = a.pendiente?.nombre ?? a.persona.nombre;
  const nombre = conocido ?? (d.nombre ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (nombre.length < 5) return { success: false, error: "Escriba su nombre completo." };
  const celular = a.persona.celular ?? ((d.celular ?? "").replace(/\D/g, "").slice(0, 15) || null);

  const db = createAdminClient();
  const token = randomBytes(32).toString("base64url");
  const sesion = {
    estado: "en_curso",
    token_hash: hashApiKey(token),
    equipo_id: a.equipoId,
    ip: meta.ip?.slice(0, 64) ?? null,
    agente_usuario: meta.equipo?.slice(0, 300) ?? null,
    tipo_entrada: d.tipoEntrada === "tactil" ? "tactil" : "raton",
    version_bateria: VERSION_BATERIA,
  };

  let intentoId: string;
  if (a.pendiente) {
    const primera = a.pendiente.estado === "asignado";
    const { error } = await db
      .from("psico_intentos")
      .update({ ...sesion, nombre, ...(primera ? { iniciado_en: ahoraIso(), autorizacion_datos_en: ahoraIso(), celular } : {}) })
      .eq("id", a.pendiente.id)
      .in("estado", ["asignado", "en_curso"]);
    if (error) throw new Error(error.message);
    intentoId = a.pendiente.id;
  } else {
    const { data, error } = await db
      .from("psico_intentos")
      .insert({
        ...sesion,
        cedula: a.cedula,
        nombre,
        celular,
        candidate_id: a.persona.candidateId,
        proceso_id: a.persona.procesoId,
        origen: a.persona.esCandidato ? "candidato" : "libre",
        iniciado_en: ahoraIso(),
        autorizacion_datos_en: ahoraIso(),
      })
      .select("id")
      .single();
    // 23505: dos pestañas a la vez; la otra ya abrió el intento.
    if (error) return { success: false, error: error.code === "23505" ? "Ya tiene la prueba abierta en otra ventana. Ciérrela y vuelva a entrar." : error.message };
    intentoId = data.id as string;
  }

  const { data: hechas } = await db.from("psico_intento_pruebas").select("prueba").eq("intento_id", intentoId);
  const ya = new Set((hechas ?? []).map((h) => h.prueba as string));
  return { success: true, token, pendientes: pruebasActivas(a.config).filter((p) => !ya.has(p)) };
}

async function intentoDeToken(token: unknown): Promise<{ id: string; procesoId: string | null } | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const { data } = await createAdminClient()
    .from("psico_intentos")
    .select("id, proceso_id, iniciado_en")
    .eq("token_hash", hashApiKey(token))
    .eq("estado", "en_curso")
    .maybeSingle();
  if (!data || !enCursoVigente(s(data.iniciado_en), new Date())) return null;
  return { id: data.id as string, procesoId: s(data.proceso_id) };
}

const SESION_VENCIDA = "La sesión de la prueba venció. Vuelva a entrar con su cédula.";

export async function guardarPruebaDeIntento(token: unknown, prueba: unknown, crudo: unknown): Promise<{ success: true } | Rechazo> {
  const intento = await intentoDeToken(token);
  if (!intento) return { success: false, error: SESION_VENCIDA };
  const config = await leerConfigPsico();
  if (!esPrueba(prueba) || !config.pruebas[prueba]) return { success: false, error: "Esa prueba no está activa." };
  const v = validarDatos(prueba, crudo);
  if (!v.ok) return { success: false, error: v.error };
  const r = calificar(prueba, v.datos, config);
  // Si ya estaba guardada no se pisa: no se repite una prueba para mejorarla.
  const { error } = await createAdminClient()
    .from("psico_intento_pruebas")
    .upsert(
      { intento_id: intento.id, prueba, datos: v.datos, metricas: r.metricas, puntaje: r.puntaje, alertas: r.alertas, ...(r.informe ? { informe: r.informe } : {}) },
      { onConflict: "intento_id,prueba", ignoreDuplicates: true }
    );
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function terminarIntento(token: unknown): Promise<{ success: true } | Rechazo> {
  const intento = await intentoDeToken(token);
  if (!intento) return { success: false, error: SESION_VENCIDA };
  const db = createAdminClient();
  const [config, { data: filas, error }] = await Promise.all([
    leerConfigPsico(),
    db.from("psico_intento_pruebas").select("prueba, puntaje, alertas").eq("intento_id", intento.id),
  ]);
  if (error) throw new Error(error.message);
  const hechas = new Map((filas ?? []).map((f) => [f.prueba as string, f]));
  const activas = pruebasActivas(config);
  if (activas.some((p) => !hechas.has(p))) return { success: false, error: "Todavía faltan pruebas por presentar." };

  const resumen = resumenGlobal(activas.map((p) => ({ puntaje: Number(hechas.get(p)!.puntaje ?? 0), alertas: lista(hechas.get(p)!.alertas) })));
  const { error: e2 } = await db
    .from("psico_intentos")
    .update({ estado: "terminado", token_hash: null, terminado_en: ahoraIso(), puntaje_global: resumen.puntaje, sugerencia: resumen.sugerencia, alertas: resumen.alertas })
    .eq("id", intento.id)
    .eq("estado", "en_curso");
  if (e2) throw new Error(e2.message);
  // Sin puntajes: el historial del proceso lo ve gente sin el módulo.
  if (intento.procesoId) await registrarEvento(intento.procesoId, { tipo: "examen", detalle: { accion: "presentada", intento_id: intento.id } }, ACTOR_SISTEMA);
  return { success: true };
}

// ── Bandeja de la psicóloga ────────────────────────────────────────────────
const SELECT_INTENTO =
  "id, cedula, nombre, celular, candidate_id, proceso_id, origen, estado, asignado_por_email, asignado_en, tipo_entrada, agente_usuario, " +
  "version_bateria, iniciado_en, terminado_en, puntaje_global, sugerencia, alertas, concepto, concepto_observacion, concepto_por_email, " +
  "concepto_en, anulado_en, anulado_por_email, motivo_anulacion, created_at, psico_equipos(nombre)";

function intentoDeFila(f: Fila): Intento {
  const equipo = f.psico_equipos as { nombre?: string } | null;
  return {
    id: String(f.id),
    cedula: String(f.cedula),
    nombre: s(f.nombre),
    celular: s(f.celular),
    candidateId: s(f.candidate_id),
    procesoId: s(f.proceso_id),
    origen: f.origen === "candidato" ? "candidato" : "libre",
    estado: f.estado as Intento["estado"],
    asignadoPorEmail: s(f.asignado_por_email),
    asignadoEn: s(f.asignado_en),
    equipo: equipo?.nombre ?? null,
    tipoEntrada: (f.tipo_entrada as Intento["tipoEntrada"]) ?? null,
    agenteUsuario: s(f.agente_usuario),
    versionBateria: s(f.version_bateria),
    iniciadoEn: s(f.iniciado_en),
    terminadoEn: s(f.terminado_en),
    puntajeGlobal: f.puntaje_global == null ? null : Number(f.puntaje_global),
    sugerencia: (f.sugerencia as Intento["sugerencia"]) ?? null,
    alertas: lista(f.alertas),
    concepto: (f.concepto as Concepto | null) ?? null,
    conceptoObservacion: s(f.concepto_observacion),
    conceptoPorEmail: s(f.concepto_por_email),
    conceptoEn: s(f.concepto_en),
    anuladoEn: s(f.anulado_en),
    anuladoPorEmail: s(f.anulado_por_email),
    motivoAnulacion: s(f.motivo_anulacion),
    createdAt: String(f.created_at),
  };
}

export async function listarIntentos(): Promise<Intento[]> {
  const { data, error } = await createAdminClient().from("psico_intentos").select(SELECT_INTENTO).order("created_at", { ascending: false }).limit(2000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Fila[]).map(intentoDeFila);
}

export async function detalleIntento(id: string): Promise<IntentoDetalle | null> {
  const db = createAdminClient();
  const [{ data, error }, { data: filas }] = await Promise.all([
    db.from("psico_intentos").select(SELECT_INTENTO).eq("id", id).maybeSingle(),
    db.from("psico_intento_pruebas").select("*").eq("intento_id", id),
  ]);
  if (error) throw new Error(error.message);
  if (!data) return null;
  const pruebas: PruebaIntento[] = (filas ?? [])
    .map((f) => ({
      prueba: f.prueba as ClavePrueba,
      metricas: (Array.isArray(f.metricas) ? f.metricas : []) as Metrica[],
      alertas: lista(f.alertas),
      puntaje: f.puntaje == null ? null : Number(f.puntaje),
      // Solo perfil e integridad; «*» para no fallar antes de aplicar la migración que agrega la columna.
      informe: ((f as Fila).informe as InformePrueba | null | undefined) ?? null,
    }))
    .sort((a, b) => PRUEBAS.indexOf(a.prueba) - PRUEBAS.indexOf(b.prueba));
  return { ...intentoDeFila(data as unknown as Fila), pruebas };
}

/** Asigna la prueba a una cédula. Con una pendiente no crea otra. */
export async function asignarPruebaACedula(
  entrada: { cedula: string; nombre?: string | null; candidateId?: string | null },
  actor: ActorProceso
): Promise<{ success: true; id: string } | Rechazo> {
  const cedula = cedulaNormalizada(entrada.cedula);
  if (!cedula) return { success: false, error: "La cédula no es válida: solo números, de 5 a 11 dígitos." };
  const persona = await personaPorCedula(cedula);
  const nombre = persona.nombre ?? ((entrada.nombre ?? "").trim().replace(/\s+/g, " ").slice(0, 120) || null);
  if (!nombre) return { success: false, error: "Esa cédula no está en Gestivo: escriba también el nombre." };
  const candidateId = persona.candidateId ?? entrada.candidateId ?? null;
  const { data, error } = await createAdminClient()
    .from("psico_intentos")
    .insert({
      cedula,
      nombre,
      celular: persona.celular,
      candidate_id: candidateId,
      proceso_id: persona.procesoId,
      origen: candidateId || persona.procesoId ? "candidato" : "libre",
      estado: "asignado",
      asignado_por_email: actor.userEmail,
      asignado_en: ahoraIso(),
    })
    .select("id")
    .single();
  if (error) {
    return { success: false, error: error.code === "23505" ? "Esa cédula ya tiene una prueba pendiente por presentar." : error.message };
  }
  if (persona.procesoId) await registrarEvento(persona.procesoId, { tipo: "examen", detalle: { accion: "asignada", intento_id: data.id } }, actor);
  return { success: true, id: data.id as string };
}

export async function registrarConceptoDeIntento(
  id: string,
  concepto: Concepto,
  observacion: string,
  actor: ActorProceso
): Promise<{ success: true } | Rechazo> {
  const { data, error } = await createAdminClient()
    .from("psico_intentos")
    .update({ concepto, concepto_observacion: observacion.trim().slice(0, 2000) || null, concepto_por_email: actor.userEmail, concepto_en: ahoraIso() })
    .eq("id", id)
    .eq("estado", "terminado")
    .select("proceso_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { success: false, error: "Solo se da el concepto de una prueba terminada." };
  if (data.proceso_id) await registrarEvento(data.proceso_id as string, { tipo: "examen", detalle: { accion: "concepto", concepto, intento_id: id } }, actor);
  return { success: true };
}

export async function anularIntentoPsico(id: string, motivo: string, actor: ActorProceso): Promise<{ success: true } | Rechazo> {
  const texto = motivo.trim().slice(0, 500);
  if (texto.length < 5) return { success: false, error: "Escriba el motivo de la anulación." };
  const { data, error } = await createAdminClient()
    .from("psico_intentos")
    .update({ estado: "anulado", token_hash: null, anulado_en: ahoraIso(), anulado_por_email: actor.userEmail, motivo_anulacion: texto })
    .eq("id", id)
    .neq("estado", "anulado")
    .select("proceso_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { success: false, error: "Esa prueba ya estaba anulada." };
  if (data.proceso_id) await registrarEvento(data.proceso_id as string, { tipo: "examen", detalle: { accion: "anulada", intento_id: id } }, actor);
  return { success: true };
}

/**
 * Las pruebas de un candidato para su ficha. Sin `conPuntajes` solo salen el
 * estado y el concepto. `null` si el módulo no está en la base todavía.
 */
export async function pruebasDeCandidato(candidateId: string, documento: string | null, conPuntajes: boolean): Promise<ResumenIntento[] | null> {
  const cedula = cedulaNormalizada(documento);
  let q = createAdminClient()
    .from("psico_intentos")
    .select("id, estado, asignado_en, terminado_en, concepto, concepto_observacion, concepto_por_email, concepto_en, puntaje_global, sugerencia, alertas")
    .order("created_at", { ascending: false })
    .limit(10);
  q = cedula ? q.or(`candidate_id.eq.${candidateId},cedula.eq.${cedula}`) : q.eq("candidate_id", candidateId);
  const { data, error } = await q;
  if (error) return null;
  return (data ?? []).map((f) => ({
    id: f.id as string,
    estado: f.estado as ResumenIntento["estado"],
    asignadoEn: s(f.asignado_en),
    terminadoEn: s(f.terminado_en),
    concepto: (f.concepto as Concepto | null) ?? null,
    conceptoObservacion: s(f.concepto_observacion),
    conceptoPorEmail: s(f.concepto_por_email),
    conceptoEn: s(f.concepto_en),
    puntajeGlobal: conPuntajes && f.puntaje_global != null ? Number(f.puntaje_global) : null,
    sugerencia: conPuntajes ? ((f.sugerencia as ResumenIntento["sugerencia"]) ?? null) : null,
    alertas: conPuntajes ? lista(f.alertas) : [],
  }));
}

// ── Acceso ─────────────────────────────────────────────────────────────────
export type AccionPsico = "editar" | "concepto";

/** Permisos si tiene el módulo (y, con una acción, `psicosensotecnica.<acción>`); si no, lanza. */
export async function assertPsico(accion: false | AccionPsico = false): Promise<Permissions> {
  const perms = await getCurrentPermissions();
  if (!perms.userId || !canAccess(perms, "psicosensotecnica")) throw new Error("No tienes acceso a la prueba psicosensotécnica.");
  if (accion && !tienePermiso(perms, `psicosensotecnica.${accion}`)) {
    throw new Error(accion === "concepto" ? "No tienes permiso para dar el concepto de la prueba." : "No tienes permiso para asignar o anular pruebas.");
  }
  return perms;
}

/** Permisos si puede cambiar la configuración del módulo; si no, lanza. */
export async function assertPsicoConfig(): Promise<Permissions> {
  const perms = await getCurrentPermissions();
  if (!perms.userId || !canAccessSub(perms, "psicosensotecnica", "psico_config") || !tienePermiso(perms, "psicosensotecnica.config.editar")) {
    throw new Error("No tienes permiso para configurar la prueba psicosensotécnica.");
  }
  return perms;
}

export async function tieneAccesoPsico(): Promise<Permissions | null> {
  const perms = await getCurrentPermissions();
  return perms.userId && canAccess(perms, "psicosensotecnica") ? perms : null;
}
