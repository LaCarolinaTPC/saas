"use server";

/**
 * Chat de prueba de la selección: simula todo el flujo sin enviar WhatsApp ni
 * escribir en la base (respuesta del asistente, extracción, semáforo, proceso,
 * reactivación) y corre los casos del banco. Lo usan la pantalla del agente
 * (con la configuración del formulario, solo administradores) y Candidatos ›
 * Selección › Probar el asistente (con la configuración guardada).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, puedeEditarEn, tienePermiso } from "@/lib/permissions";
import { getAgenteConClaves } from "@/lib/comunicaciones/agente/config";
import { configDesdeFormulario, type AgenteFormulario } from "@/lib/comunicaciones/agente/formulario";
import { leerConfigSeguimiento } from "@/lib/comunicaciones/seguimiento-ejecutar";
import { actorUsuario, cambiarEstadoProceso, procesoAbiertoPorCedula, registrarEvento } from "@/lib/contratacion/servidor";
import {
  consultarRuntConIdentidad,
  primerApellidoDeApellidos,
  proveedorRnmc,
  proveedorRunt,
  proveedorSimit,
  type ResumenRnmc,
  type ResumenRunt,
} from "@/lib/verificacion/proveedores";
import { licenciaVerificadaDesdeRunt } from "./preseleccion";
import { contextoSeleccion, leerAjustes, leerMensajes, leerReglas, valoresFijos } from "./servidor";
import { correrCaso, extraerDeConversacion, responderSimulado, type ContextoSimulacion } from "./evaluacion/ejecutor";
import { casoPorId } from "./evaluacion/casos";
import {
  queHariaGestivo,
  revisarCaso,
  simularPreseleccion,
  simularSilencio,
  type ChequeoCaso,
  type MensajeSimulado,
  type QueHariaGestivo,
  type ResultadoConversacion,
} from "./simulacion";
import { interpretarExtraccion, type DatosPrefiltro } from "./extraccion";
import { INSTRUCCION_LECTURA_CEDULA, SISTEMA_LECTURA_CEDULA, interpretarLecturaCedula, type LecturaCedula } from "./lectura-cedula";
import { leerImagen, type ImagenEntrada } from "@/lib/comunicaciones/agente/proveedores";
import type { CitaAsistente, FechaRechazada } from "@/lib/comunicaciones/agente/motor";
import { citaParaAsistente, citaVigenteDeProceso, reprogramarPorAsistente, vistaCitacion } from "./agenda-servidor";
import {
  fechaExpedicionRechazada,
  verificacionEnCurso,
  resolverAntecedentesPendientes,
  resolverPoliciaPendientes,
  resolverRnmcPendientes,
  resolverSimitPendientes,
} from "@/lib/verificacion/servidor";
import { simularCromaProceso } from "@/lib/verificacion/servidor";
import { escenarioValido, type EscenarioCroma } from "@/lib/seleccion/escenario-croma";
import { NOMBRE_POR_CONFIRMAR, motivoRegreso, procesoDePrueba, reabrirSiVuelve, registrarAspirante } from "./proceso-desde-chat";
import { vinculoDeCedulas } from "./vinculo-servidor";
import { cedulasMencionadas } from "./vinculo";
import { marcarListoParaCitar, marcarRevisionAntecedentes } from "./servidor";
import type { ProcesoContratacion, ResultadoPreseleccionGuardado } from "@/lib/contratacion/constants";
import { primerNombre, renderizarConLineas, parametrosPlantilla } from "./mensajes";
import { tiemposDesdeAjustes } from "./reactivacion";

const MAX_MENSAJES = 120;
const MAX_CARACTERES = 2000;
const MEDIOS = new Set(["image", "document", "audio", "sticker", "video"]);

async function exigirPrueba() {
  const perms = await getCurrentPermissions();
  const puede =
    perms.isAdmin || tienePermiso(perms, "candidatos.seleccion_config.ver") || puedeEditarEn(perms, "candidatos.seleccion_config");
  if (!puede) throw new Error("No tienes permiso para usar el chat de prueba de la selección.");
  return perms;
}

export interface OpcionesPrueba {
  /** Configuración del formulario del agente, sin guardar (solo administradores). */
  formulario?: AgenteFormulario;
  /** SIMIT simulado en pesos; null = sin consultar. */
  simit: number | null;
  /** Fecha y hora simuladas (ISO); por defecto, ahora. */
  ahora?: string | null;
  /**
   * RUNT consultado de verdad en Croma desde el chat de prueba (casilla
   * «Consultar Croma de verdad»): el asistente y el semáforo lo usan igual que
   * en el flujo real. null = no consultado.
   */
  runt?: ResumenRunt | null;
  /** Licencia vencida en el RUNT: ¿dijo que la va a renovar? (lo leído del chat de prueba). */
  renovaraLicencia?: boolean | null;
  /** Turno de seguimiento de la revisión: el asistente escribe por su cuenta (el último mensaje es suyo). */
  seguimiento?: boolean;
  /** Cédula ya leída del chat de prueba (para saber si ya es conductor de la empresa). */
  cedula?: string | null;
  /** El RNMC dijo que la fecha de expedición no corresponde a la cédula: el asistente la vuelve a pedir. */
  fechaRechazada?: FechaRechazada | null;
  /** Croma no respondió la verificación de la cédula: el asistente no dice que ya revisamos. */
  verificacionDemorada?: boolean;
  /** Candidato guardado desde este chat: si ya tiene cita, el asistente la conoce (entrega 2). */
  procesoId?: string | null;
}

/** La cita en pie de un candidato del chat de prueba (nunca de un proceso real). */
async function citaDePrueba(procesoId: string | null | undefined): Promise<CitaAsistente | null> {
  if (!procesoId || typeof procesoId !== "string") return null;
  const { data } = await createAdminClient().from("procesos_contratacion").select("origen").eq("id", procesoId).maybeSingle();
  return data?.origen === "chat_prueba" ? citaParaAsistente(procesoId).catch(() => null) : null;
}

/** Si el candidato de prueba se cerró solo: el asistente retoma con quien vuelve. */
async function regresoDePrueba(procesoId: string | null | undefined) {
  if (!procesoId || typeof procesoId !== "string") return null;
  const p = await procesoDePrueba(procesoId).catch(() => null);
  return p?.estado === "cierre" ? motivoRegreso(procesoId).catch(() => null) : null;
}

async function contexto(op: OpcionesPrueba, esAdmin: boolean): Promise<ContextoSimulacion> {
  const { config: guardada, claves } = await getAgenteConClaves();
  const config = op.formulario && esAdmin ? configDesdeFormulario(op.formulario) : guardada;
  const [ctx, reglas, cita, regreso] = await Promise.all([contextoSeleccion(), leerReglas(), citaDePrueba(op.procesoId), regresoDePrueba(op.procesoId)]);
  const ahora = op.ahora ? new Date(op.ahora) : new Date();
  const ahoraValida = Number.isNaN(ahora.getTime()) ? new Date() : ahora;
  return {
    // La respuesta a salario u horario, del catálogo de mensajes (como en el chat real).
    config: ctx.respuestaReservada ? { ...config, respuestaReservada: ctx.respuestaReservada } : config,
    claves,
    autorizacion: ctx.autorizacion,
    bienvenida: ctx.bienvenida,
    nombreAsistente: ctx.nombreAsistente,
    respuestas: ctx.respuestas,
    requisitos: ctx.requisitos,
    reglas,
    nombreContacto: "Aspirante de prueba",
    ahora: ahoraValida,
    licenciaVerificada: licenciaVerificadaDesdeRunt(op.runt ?? null, reglas, ahoraValida, op.renovaraLicencia ?? null),
    seguimientoRevision: op.seguimiento === true,
    fechaRechazada: fechaRechazadaValida(op.fechaRechazada),
    verificacionDemorada: op.verificacionDemorada === true,
    cita,
    regreso,
  };
}

/** Nombres y apellidos de la foto que manda el navegador, validados. */
function fotoValida(f: { nombres: string | null; apellidos: string | null } | null | undefined): { nombres: string | null; apellidos: string | null } | null {
  if (!f || typeof f !== "object") return null;
  const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, 80) : null);
  const apellidos = t(f.apellidos);
  return apellidos ? { nombres: t(f.nombres), apellidos } : null;
}

/** Lo que manda el navegador, validado. */
function fechaRechazadaValida(f: FechaRechazada | null | undefined): FechaRechazada | null {
  if (!f || typeof f !== "object") return null;
  const fecha = typeof f.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.fecha) ? f.fecha : null;
  const intentos = Math.min(Math.max(Math.round(Number(f.intentos)) || 1, 1), 10);
  return { fecha, intentos };
}

function validarMensajes(mensajes: MensajeSimulado[], seguimiento = false): string | null {
  if (!Array.isArray(mensajes) || mensajes.length === 0) return "Escribe un mensaje de prueba.";
  if (mensajes.length > MAX_MENSAJES) return `El chat de prueba admite hasta ${MAX_MENSAJES} mensajes: reinícialo.`;
  for (const m of mensajes) {
    if (m.direccion !== "entrante" && m.direccion !== "saliente") return "Mensaje de prueba no válido.";
    if (typeof m.contenido !== "string" || m.contenido.length > MAX_CARACTERES) return `Cada mensaje admite hasta ${MAX_CARACTERES} caracteres.`;
    if (m.lectura != null && (typeof m.lectura !== "string" || m.lectura.length > 1000)) return "Lectura de la foto no válida.";
    if (m.mediaTipo !== null && !MEDIOS.has(m.mediaTipo)) return "Tipo de archivo no válido.";
  }
  const ultimo = mensajes[mensajes.length - 1].direccion;
  if (seguimiento ? ultimo !== "saliente" : ultimo !== "entrante") {
    return seguimiento ? "El seguimiento va después de un mensaje del asistente." : "El último mensaje debe ser del aspirante.";
  }
  return null;
}

export interface PanelPrueba {
  extraido: DatosPrefiltro | null;
  preseleccion: ResultadoPreseleccionGuardado | null;
  gestivo: QueHariaGestivo;
  /** Postulaciones anteriores con esa cédula (B3). */
  anteriores: { fecha: string; estado: string; causa: string | null }[];
}

async function armarPanel(extraido: DatosPrefiltro | null, op: OpcionesPrueba, ctx: ContextoSimulacion, transferencia: ResultadoConversacion["transferencia"]): Promise<PanelPrueba> {
  const preseleccion = extraido ? simularPreseleccion(extraido, op.simit, ctx.reglas, ctx.ahora, op.runt ?? null) : null;
  let abierto = null;
  let anteriores: PanelPrueba["anteriores"] = [];
  if (extraido?.cedula) {
    const cedula = extraido.cedula;
    const [a, { data }] = await Promise.all([
      procesoAbiertoPorCedula(cedula),
      createAdminClient()
        .from("procesos_contratacion")
        .select("fecha_creacion, estado, causa_no_contrato")
        .eq("cedula", cedula)
        .order("fecha_creacion", { ascending: false })
        .limit(10),
    ]);
    abierto = a ? { id: a.id, estado: a.estado, causa_no_contrato: null, fecha_creacion: "" } : null;
    anteriores = (data ?? []).map((d) => ({ fecha: d.fecha_creacion as string, estado: d.estado as string, causa: (d.causa_no_contrato as string | null) ?? null }));
  }
  return { extraido, preseleccion, gestivo: queHariaGestivo({ datos: extraido, preseleccion, abierto, transferencia }), anteriores };
}

export type RespuestaPrueba =
  | {
      ok: true;
      texto: string;
      motivo: "frase" | "marca" | "rechazo" | "vacio" | null;
      /** El asistente movió la cita del candidato de prueba en esta respuesta. */
      reprogramada?: boolean;
      modelo: string | null;
      tokensEntrada: number;
      tokensSalida: number;
      ms: number;
    }
  | { ok: false; error: string };

/**
 * Respuesta del asistente a la conversación de prueba: UNA llamada al modelo.
 * El panel («qué pasaría en Gestivo») se pide aparte, solo cuando se quiere ver.
 */
/**
 * Botones de respuesta rápida de las plantillas de Meta, por mensaje del
 * catálogo: el chat de prueba los muestra bajo el mensaje, como WhatsApp.
 */
export async function botonesPlantillasPrueba(): Promise<Record<string, string[]>> {
  await exigirPrueba();
  const mensajes = await leerMensajes();
  return Object.fromEntries(mensajes.filter((m) => m.plantilla_nombre && m.plantilla_botones?.length).map((m) => [m.clave, m.plantilla_botones]));
}

export async function responderPrueba(mensajes: MensajeSimulado[], op: OpcionesPrueba): Promise<RespuestaPrueba> {
  const perms = await exigirPrueba();
  const error = validarMensajes(mensajes, op.seguimiento === true);
  if (error) return { ok: false, error };
  const ctx = await contexto(op, perms.isAdmin);
  // Como en WhatsApp: si la cédula ya es de un conductor de la empresa, el asistente lo sabe.
  // Del más reciente al más viejo; si el último mensaje trae una cédula, manda
  // esa (la leída del chat de prueba es del turno anterior).
  const textos = mensajes.filter((m) => m.direccion === "entrante").map((m) => m.contenido).reverse();
  const enUltimo = cedulasMencionadas(textos.slice(0, 1))[0];
  const vinculo = await vinculoDeCedulas([enUltimo, op.cedula], textos);
  ctx.vinculoEmpresa = vinculo?.tipo ?? null;
  try {
    const resp = await responderSimulado(mensajes, ctx);
    let texto = resp.motivo && !resp.texto ? ctx.config.mensajeTransferencia.trim() : resp.texto;
    // Entrega 2: el asistente movió la cita al día que eligió la persona (solo candidatos de prueba).
    let reprogramada = false;
    if (resp.reprogramar && ctx.cita && op.procesoId && !resp.motivo) {
      const movida = await reprogramarPorAsistente(op.procesoId, resp.reprogramar, actorUsuario(perms)).catch(() => ({ ok: false as const }));
      reprogramada = movida.ok;
      if (!movida.ok) texto = "Déjame confirmar ese día con Gestión Humana y te escribimos enseguida para dejar lista tu nueva cita.";
    }
    return { ok: true, ...resp, texto, reprogramada };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "El modelo no respondió." };
  }
}

/**
 * Panel «qué pasaría en Gestivo» de la conversación de prueba: UNA llamada al
 * modelo (la extracción); el semáforo, el proceso y los eventos se calculan sin IA.
 */
export async function panelPrueba(
  mensajes: MensajeSimulado[],
  op: OpcionesPrueba & { transferencia?: ResultadoConversacion["transferencia"] }
): Promise<{ ok: true; panel: PanelPrueba } | { ok: false; error: string }> {
  const perms = await exigirPrueba();
  if (!Array.isArray(mensajes) || !mensajes.some((m) => m.direccion === "entrante")) return { ok: false, error: "Todavía no hay mensajes del aspirante." };
  if (mensajes.length > MAX_MENSAJES) return { ok: false, error: "Conversación demasiado larga." };
  const ctx = await contexto(op, perms.isAdmin);
  const extraido = await extraerDeConversacion(mensajes, ctx.config, ctx.claves);
  if (!extraido) return { ok: false, error: "No se pudieron leer los datos (el modelo no respondió o no devolvió un JSON válido)." };
  return { ok: true, panel: await armarPanel(extraido, op, ctx, op.transferencia ?? null) };
}

/** Semáforo y proceso recalculados con otro SIMIT simulado, sin volver a llamar a la IA. */
export async function recalcularPanel(extraido: DatosPrefiltro, op: OpcionesPrueba & { transferencia?: ResultadoConversacion["transferencia"] }): Promise<PanelPrueba> {
  const perms = await exigirPrueba();
  const ctx = await contexto(op, perms.isAdmin);
  return armarPanel(extraido, op, ctx, op.transferencia ?? null);
}

export type ResultadoCasoPrueba =
  | { ok: true; resultado: ResultadoConversacion; aprobado: boolean; chequeos: ChequeoCaso[]; panel: PanelPrueba }
  | { ok: false; error: string };

/** Corre un caso del banco completo (turnos fijos y aspirante simulado) y lo revisa. */
export async function correrCasoPrueba(casoId: string, op: OpcionesPrueba): Promise<ResultadoCasoPrueba> {
  const perms = await exigirPrueba();
  const caso = casoPorId(casoId);
  if (!caso) return { ok: false, error: "El caso no existe." };
  const ctx = await contexto(op, perms.isAdmin);
  const resultado = await correrCaso(caso, ctx);
  const { ok, chequeos } = revisarCaso(caso, resultado);
  const panel = await armarPanel(resultado.extraido, { ...op, simit: caso.simit ?? 0 }, ctx, resultado.transferencia);
  return { ok: true, resultado, aprobado: ok, chequeos, panel };
}

export type ResultadoCromaPrueba =
  | { ok: true; estado: string; valor: number | null; multas: number | null; acuerdos: number | null; pendiente: boolean; error?: string }
  | { ok: false; error: string };

/**
 * Consulta REAL del SIMIT en Croma desde el chat de prueba (no se guarda en la
 * base). Solo con la autorización aceptada en la conversación de prueba.
 */
export async function consultarCromaPrueba(cedula: string, autorizado: boolean): Promise<ResultadoCromaPrueba> {
  await exigirPrueba();
  const limpia = String(cedula ?? "").replace(/\D/g, "");
  if (!autorizado) return { ok: false, error: "En la conversación de prueba el aspirante todavía no ha autorizado el tratamiento de datos." };
  if (limpia.length < 5) return { ok: false, error: "No hay una cédula válida en la conversación." };
  const proveedor = proveedorSimit();
  if (!proveedor) return { ok: false, error: "Croma no está configurado (falta CROMA_API_KEY)." };
  const r = await proveedor.consultarSimit(limpia);
  const crudo = r.crudo as { fines?: unknown[]; payment_agreements?: unknown[] } | null;
  return {
    ok: true,
    estado: r.estado,
    valor: r.valor,
    multas: Array.isArray(crudo?.fines) ? crudo!.fines!.length : null,
    acuerdos: Array.isArray(crudo?.payment_agreements) ? crudo!.payment_agreements!.length : null,
    pendiente: r.estado === "pendiente",
    error: r.error,
  };
}

/**
 * ¿La cédula es de un conductor de la empresa? Va antes de cualquier consulta a
 * Croma (pedido de GH del 18-nov-2026): si ya trabaja aquí, no se consulta nada.
 */
export async function vinculoPrueba(cedula: string): Promise<"activo" | "retirado" | null> {
  await exigirPrueba();
  const v = await vinculoDeCedulas([cedula], []).catch(() => null);
  return v?.tipo ?? null;
}

export type ResultadoRuntPrueba =
  | { ok: true; resumen: ResumenRunt }
  | { ok: false; error: string; pendiente?: boolean };

/**
 * Consulta REAL del RUNT en Croma desde el chat de prueba (no se guarda en la
 * base): licencia, nombre y restricciones. Solo con la autorización aceptada
 * en la conversación de prueba. Si Croma la deja en curso, espera unos
 * segundos más antes de rendirse.
 */
export async function consultarRuntPrueba(
  cedula: string,
  autorizado: boolean,
  nombreRegistro: string | null = null,
  /** Primer apellido (escrito o leído en la foto de la cédula): va primero. */
  apellido: string | null = null
): Promise<ResultadoRuntPrueba> {
  await exigirPrueba();
  const limpia = String(cedula ?? "").replace(/\D/g, "");
  if (!autorizado) return { ok: false, error: "En la conversación de prueba el aspirante todavía no ha autorizado el tratamiento de datos." };
  if (limpia.length < 5) return { ok: false, error: "No hay una cédula válida en la conversación." };
  const proveedor = proveedorRunt();
  if (!proveedor) return { ok: false, error: "Croma no está configurado (falta CROMA_API_KEY)." };
  // Igual que el flujo real: con el nombre del RNMC se consulta con su primer apellido.
  // Llega el primer apellido escrito o los apellidos de la foto: vale el primero.
  const primero = typeof apellido === "string" ? primerApellidoDeApellidos(apellido.slice(0, 80)) : null;
  let { resultado: r } = await consultarRuntConIdentidad(proveedor, limpia, nombreRegistro, primero);
  for (let i = 0; i < 3 && r.estado === "pendiente" && r.trabajoId; i++) {
    await new Promise((ok) => setTimeout(ok, 5000));
    r = await proveedor.consultarTrabajoRunt(r.trabajoId);
  }
  if (r.estado === "pendiente") return { ok: false, pendiente: true, error: "Croma dejó la consulta del RUNT en curso. En el flujo real el resultado llega solo; aquí vuelve a intentar en un momento." };
  if (r.estado !== "ok" || !r.resumen) return { ok: false, error: r.error ?? "Croma no devolvió el RUNT." };
  return { ok: true, resumen: { ...r.resumen, cedula: limpia } };
}

export type ResultadoGuardarPrueba =
  | {
      ok: true;
      procesoId: string;
      nombre: string;
      runt: ResumenRunt | null;
      simitValor: number | null;
      simitConsultado: boolean;
      preseleccion: ResultadoPreseleccionGuardado | null;
      /** Aviso que se le enviaría al aspirante si sus antecedentes quedaron para revisión. */
      avisoRevision: string | null;
      /** La fecha de expedición no corresponde a la cédula (RNMC): el RUNT no se consultó. */
      fechaRechazada: FechaRechazada | null;
      /** Croma no respondió el RNMC: nada más se consultó; se reintenta con el siguiente mensaje. */
      verificacionDemorada: boolean;
      /** El candidato se había cerrado solo y este mensaje lo reabrió (en WhatsApp, el chat queda para una persona). */
      reabierto?: boolean;
      /** Quedó «Listo para citar» y Gestivo lo citó solo: el texto de la citación. */
      citacion?: string | null;
    }
  | { ok: false; error: string };

/**
 * Casilla «Guardar en Candidatos» del chat de prueba: hace lo mismo que el
 * flujo real con lo leído del chat (crea o completa el proceso apenas hay
 * cédula y autorización, consulta el RUNT y el SIMIT en Croma y lo guarda
 * todo en el candidato), con origen «chat_prueba». No toca procesos reales:
 * si hay uno abierto con esa cédula que no salió del chat de prueba, se niega.
 */
/**
 * Reinicia un candidato del chat de prueba para volver a probar con la misma
 * cédula (pedido de GH del 18-nov-2026): queda el mismo candidato, de vuelta en
 * «Pendiente», sin los datos del chat ni los resultados de Croma, y con la
 * novedad «Reiniciado» en la línea de tiempo. Las consultas anteriores no se
 * borran: quedan con estado «reiniciada», que ninguna regla cuenta, así RNMC,
 * RUNT, SIMIT y antecedentes se vuelven a consultar. Solo procesos «chat_prueba».
 */
async function reiniciarProcesoPrueba(procesoId: string, actor: ReturnType<typeof actorUsuario>): Promise<void> {
  const db = createAdminClient();
  const { data: p } = await db.from("procesos_contratacion").select("estado, origen").eq("id", procesoId).maybeSingle();
  if (!p || p.origen !== "chat_prueba" || p.estado === "contratado") return;
  if (p.estado !== "pendiente") {
    await cambiarEstadoProceso(procesoId, "pendiente", { actor, detalle: { motivo: "Reiniciado desde el chat de prueba." } });
  }
  await db.from("verificaciones_externas").update({ estado: "reiniciada" }).eq("proceso_id", procesoId).neq("estado", "reiniciada");
  // Las citas y lo que registró el profesor en pruebas anteriores son datos de
  // prueba: se borran, para que la conversación nueva empiece sin cita, sin
  // reprogramaciones contadas y sin concepto del profesor. (Siguen en el historial.)
  for (const tabla of ["seleccion_citas", "seleccion_pruebas_manejo", "seleccion_clases_escuela", "seleccion_reconocimientos_ruta", "seleccion_observaciones_profesor"]) {
    await db.from(tabla).delete().eq("proceso_id", procesoId);
  }
  await db
    .from("procesos_contratacion")
    .update({ fecha_citacion: null, fecha_prueba_manejo: null, fecha_examenes: null, fecha_examenes_fase2: null })
    .eq("id", procesoId);
  // Columnas de la entrega 2: aparte, para no fallar si falta la migración.
  await db
    .from("procesos_contratacion")
    .update({ profesor_concepto: null, profesor_concepto_nota: null, profesor_concepto_por: null, profesor_concepto_at: null, escuela_recordatorio_fecha: null })
    .eq("id", procesoId);
  const { error } = await db
    .from("procesos_contratacion")
    .update({
      nombre: NOMBRE_POR_CONFIRMAR,
      reingreso: false,
      causa_no_contrato: null,
      simit: null,
      simit_valor: 0,
      antecedentes: null,
      licencia_categoria: null,
      licencia_runt: null,
      licencia_verificada_runt: false,
      edad: null,
      ciudad_residencia: null,
      dispuesto_traslado: null,
      experiencia_meses: null,
      hoja_vida_recibida_at: null,
      autorizacion_datos: null,
      autorizacion_datos_at: null,
      autorizacion_datos_texto: null,
      autorizacion_mensaje_id: null,
      preseleccion: null,
      requisito_incumplido: null,
    })
    .eq("id", procesoId);
  if (error) throw new Error(`No se pudo reiniciar el candidato de prueba: ${error.message}`);
  // Columnas de la migración 20261117214219: aparte, para no fallar si falta.
  await db.from("procesos_contratacion").update({ fecha_nacimiento: null, cedula_fecha_expedicion: null, renovara_licencia: null }).eq("id", procesoId);
  // Después de esta novedad, las marcas de «una sola vez» vuelven a valer (inicioVigenteProceso).
  await registrarEvento(procesoId, { tipo: "dato", detalle: { reiniciado: true, origen: "chat_prueba" } }, actor);
}

/**
 * Con `reconsultar` (casilla «Reconsultar en Croma»): si ya hay un candidato
 * de prueba con esa cédula (abierto o cerrado), se reinicia en el mismo
 * candidato y Croma se vuelve a consultar. Sirve para probar casos distintos
 * con la misma cédula. Nunca toca procesos reales.
 */
export async function guardarPruebaEnCandidatos(
  extraido: DatosPrefiltro,
  opciones: {
    reconsultar?: boolean;
    procesoId?: string | null;
    /** Nombres y apellidos leídos en la foto de la cédula del chat de prueba (para el apellido del RUNT). */
    fotoCedula?: { nombres: string | null; apellidos: string | null } | null;
    /**
     * Croma simulado (casilla «Consultar Croma de verdad» apagada): no se
     * consulta Croma; el candidato queda con el RUNT de la licencia que dijo,
     * el SIMIT simulado del chat y, si pasa, los antecedentes limpios.
     */
    simular?: { simit: number | null; escenario?: EscenarioCroma | null } | null;
  } = {}
): Promise<ResultadoGuardarPrueba> {
  const perms = await exigirPrueba();
  if (!perms.isAdmin && !puedeEditarEn(perms, "candidatos.seleccion_config")) {
    return { ok: false, error: "Para guardar en Candidatos necesitas permiso de edición en la configuración de selección." };
  }
  // Lo que manda el navegador se vuelve a validar como si viniera del modelo.
  const datos = interpretarExtraccion(JSON.stringify(extraido ?? {}));
  if (!datos?.cedula) return { ok: false, error: "Todavía no hay una cédula válida en la conversación." };
  if (datos.autorizacion !== "si") return { ok: false, error: "Se guarda como candidato apenas el aspirante acepte la autorización." };

  const db = createAdminClient();
  const abierto = await procesoAbiertoPorCedula(datos.cedula);
  if (abierto) {
    const { data } = await db.from("procesos_contratacion").select("origen").eq("id", abierto.id).maybeSingle();
    if (data?.origen !== "chat_prueba") {
      return { ok: false, error: `Ya hay un proceso real abierto con la cédula ${datos.cedula}: el chat de prueba no lo modifica. Use otra cédula.` };
    }
  }
  if (opciones.reconsultar) {
    // El último candidato de prueba con esa cédula, aunque esté cerrado (p. ej. por la preselección).
    const { data: previo } = await db
      .from("procesos_contratacion")
      .select("id")
      .eq("cedula", datos.cedula)
      .eq("origen", "chat_prueba")
      .neq("estado", "contratado")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // Con un proceso real abierto ya se devolvió arriba; uno real cerrado no impide reiniciar el de prueba.
    if (previo && (!abierto || abierto.id === previo.id)) await reiniciarProcesoPrueba(previo.id as string, actorUsuario(perms));
  }
  // Lo que Croma dejó en curso (SIMIT, RNMC, Policía, antecedentes) lo recoge
  // el cron cada 15 min, y en desarrollo el cron no corre: aquí se recoge antes
  // de guardar, para que la prueba avance como en producción.
  await Promise.all(
    [resolverSimitPendientes, resolverRnmcPendientes, resolverPoliciaPendientes, resolverAntecedentesPendientes].map((f) =>
      f().catch((e) => console.error("[seleccion] consultas pendientes (chat de prueba):", e))
    )
  );
  // El candidato de esta conversación de prueba: si el aspirante corrige la
  // cédula, se sigue con el mismo (como la conversación de WhatsApp enlazada).
  let enlazado =
    opciones.procesoId && typeof opciones.procesoId === "string" ? await procesoDePrueba(opciones.procesoId).catch(() => null) : null;
  // Como en WhatsApp: si el candidato de esta conversación se cerró solo y la
  // persona vuelve a escribir, se reabre el mismo (no se crea otro) cuando
  // cambió lo que lo descartó; si no, sigue cerrado.
  let reabierto = false;
  if (enlazado?.estado === "cierre") {
    const que = await reabrirSiVuelve(enlazado, datos);
    if (que !== "reabierto") {
      const { data: c } = await db.from("procesos_contratacion").select("causa_no_contrato").eq("id", enlazado.id).maybeSingle();
      const causa = (c?.causa_no_contrato as string | null) ?? "sin causa";
      return {
        ok: false,
        error:
          que === "sigue_cerrado"
            ? `El candidato de prueba sigue cerrado («${causa}»): este mensaje no cambia lo que lo descartó. Se reabre si cambia esa respuesta.`
            : `El candidato de prueba está cerrado («${causa}») y ese cierre no se reabre solo. Reinicia el chat para probar otra vez con la misma cédula.`,
      };
    }
    reabierto = true;
    enlazado = { ...enlazado, estado: "pendiente" };
  }
  const r = await registrarAspirante({
    datos,
    procesoEnlazado: enlazado,
    celular: null,
    autorizacionAt: null,
    autorizacionMensajeId: null,
    origen: "chat_prueba",
    antecedentesSiempre: true,
    // Sin el límite de 60 s del webhook: Croma puede tardar más en responder.
    tiempoMs: 220_000,
    fotoCedula: fotoValida(opciones.fotoCedula),
    sinCroma: Boolean(opciones.simular),
  });
  if (r && opciones.simular) {
    const simit = opciones.simular.simit == null ? null : Number(opciones.simular.simit);
    // El nombre que traería el RUNT: el de la foto de la cédula si la mandó (como en el real), o el que dijo.
    const fotoNombre = opciones.fotoCedula?.apellidos ? [opciones.fotoCedula.nombres, opciones.fotoCedula.apellidos].filter(Boolean).join(" ").slice(0, 120) : null;
    await simularCromaProceso(r.procesoId, { licencia: datos.licencia, nombre: fotoNombre ?? datos.nombre ?? (datos.primer_apellido ? `ASPIRANTE ${datos.primer_apellido}` : null), simit: Number.isFinite(simit as number) ? simit : null, escenario: opciones.simular.escenario ? escenarioValido(opciones.simular.escenario) : null }, actorUsuario(perms)).catch((e) =>
      console.error("[seleccion] Croma simulado (chat de prueba):", e)
    );
  }
  // Sin conversación de WhatsApp: «Listo para citar» se revisa con lo leído del chat de prueba.
  const quedoListo = r ? await marcarListoParaCitar(r.procesoId, datos).catch(() => false) : false;
  // Si al quedar listo se citó solo, la citación va al chat de prueba (no sale por WhatsApp).
  let citacion: string | null = null;
  if (r && quedoListo) {
    const cita = await citaVigenteDeProceso(r.procesoId).catch(() => null);
    if (cita) citacion = (await vistaCitacion(r.procesoId, { fecha: cita.fecha, hora: cita.hora }).catch(() => null))?.texto ?? null;
  }
  // Con hallazgos: revisión por una persona; el aviso se muestra en el chat de prueba.
  const avisoRevision = r ? await marcarRevisionAntecedentes(r.procesoId).catch(() => null) : null;
  if (!r) return { ok: false, error: "No se pudo guardar el candidato (revise el registro del servidor)." };
  const { data: p } = await db
    .from("procesos_contratacion")
    .select("nombre, licencia_runt, simit_valor, preseleccion")
    .eq("id", r.procesoId)
    .maybeSingle();
  const { count } = await db
    .from("verificaciones_externas")
    .select("id", { count: "exact", head: true })
    .eq("proceso_id", r.procesoId)
    .eq("fuente", "simit")
    .neq("estado", "reiniciada");
  return {
    ok: true,
    procesoId: r.procesoId,
    nombre: (p?.nombre as string | undefined) ?? "",
    runt: (p?.licencia_runt as ResumenRunt | null) ?? null,
    simitValor: (count ?? 0) > 0 ? ((p?.simit_valor as number | null) ?? null) : null,
    simitConsultado: (count ?? 0) > 0,
    preseleccion: (p?.preseleccion as ResultadoPreseleccionGuardado | null) ?? r.preseleccion,
    avisoRevision,
    fechaRechazada: await fechaExpedicionRechazada(r.procesoId).catch(() => null),
    verificacionDemorada: await verificacionEnCurso(r.procesoId).catch(() => false),
    reabierto,
    citacion,
  };
}

/** Consulta REAL del RNMC en Croma desde el chat de prueba (sin guardar). Exige autorización y fecha de expedición. */
export async function consultarRnmcPrueba(
  cedula: string,
  fechaExpedicion: string,
  autorizado: boolean
): Promise<{ ok: true; resumen: ResumenRnmc } | { ok: false; error: string }> {
  await exigirPrueba();
  const limpia = String(cedula ?? "").replace(/\D/g, "");
  if (!autorizado) return { ok: false, error: "En la conversación de prueba el aspirante todavía no ha autorizado el tratamiento de datos." };
  if (limpia.length < 5 || !/^\d{4}-\d{2}-\d{2}$/.test(fechaExpedicion ?? "")) return { ok: false, error: "Faltan la cédula o la fecha de expedición." };
  const proveedor = proveedorRnmc();
  if (!proveedor) return { ok: false, error: "Croma no está configurado (falta CROMA_API_KEY)." };
  // La fuente de la Policía puede tardar hasta 45 s (Croma, 18-nov-2026, recomienda esperar 60 s).
  let r = await proveedor.consultarRnmc(limpia, fechaExpedicion, { esperaSegundos: 55, timeoutMs: 75_000 });
  for (let i = 0; i < 3 && r.estado === "pendiente" && r.trabajoId; i++) {
    await new Promise((ok) => setTimeout(ok, 5000));
    r = await proveedor.consultarTrabajoRnmc(r.trabajoId);
  }
  if (r.estado !== "ok" || !r.resumen) return { ok: false, error: r.error ?? "Croma dejó el RNMC en curso; vuelve a intentar en un momento." };
  return { ok: true, resumen: r.resumen };
}

export type ResultadoLecturaPrueba =
  | { ok: true; lectura: LecturaCedula; modelo: string; tokensEntrada: number | null; tokensSalida: number | null; ms: number; crudo: string }
  | { ok: false; error: string };

/**
 * Prueba de lectura de la foto de la cédula con el modelo del asistente (no se
 * guarda nada). El navegador manda la foto ya reducida (máx. 1280 px), en base64.
 */
export async function leerCedulaPrueba(imagen: ImagenEntrada, op: { formulario?: AgenteFormulario } = {}): Promise<ResultadoLecturaPrueba> {
  const perms = await exigirPrueba();
  if (!imagen || !["image/jpeg", "image/png", "image/webp"].includes(imagen.tipo)) return { ok: false, error: "La foto debe ser JPG, PNG o WebP." };
  if (typeof imagen.base64 !== "string" || imagen.base64.length < 100) return { ok: false, error: "No llegó la foto." };
  // La foto ya viene reducida desde el navegador (máx. 1280 px, menos de 1 MB).
  if (imagen.base64.length > 1_000_000) return { ok: false, error: "La foto es demasiado grande: redúcela e inténtalo de nuevo." };
  const { config: guardada, claves } = await getAgenteConClaves();
  const config = op.formulario && perms.isAdmin ? configDesdeFormulario(op.formulario) : guardada;
  const inicio = Date.now();
  try {
    const r = await leerImagen(config, claves, SISTEMA_LECTURA_CEDULA, INSTRUCCION_LECTURA_CEDULA, imagen);
    const lectura = interpretarLecturaCedula(r.texto);
    if (!lectura) return { ok: false, error: `El modelo no devolvió un JSON válido: «${r.texto.slice(0, 200)}»` };
    return { ok: true, lectura, modelo: r.modeloUsado, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida, ms: Date.now() - inicio, crudo: r.texto };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "El modelo no respondió." };
  }
}

/**
 * Foto subida en el chat de prueba con «Guardar en Candidatos»: queda en la
 * ficha del candidato de prueba (bucket «whatsapp», carpeta procesos/<id>/),
 * con su lectura al lado. Solo procesos del chat de prueba.
 */
export async function guardarFotoPrueba(procesoId: string, base64: string, lectura: string | null): Promise<{ ok: boolean; error?: string; ruta?: string }> {
  const perms = await exigirPrueba();
  if (!perms.isAdmin && !puedeEditarEn(perms, "candidatos.seleccion_config")) return { ok: false, error: "Sin permiso para guardar." };
  if (typeof base64 !== "string" || base64.length < 100 || base64.length > 1_000_000) return { ok: false, error: "Foto no válida." };
  const db = createAdminClient();
  const { data: p } = await db.from("procesos_contratacion").select("origen").eq("id", procesoId).maybeSingle();
  if (p?.origen !== "chat_prueba") return { ok: false, error: "Solo se guardan fotos en candidatos del chat de prueba." };
  const ruta = `procesos/${procesoId}/${Date.now()}-foto.jpg`;
  const { error } = await db.storage.from("whatsapp").upload(ruta, Buffer.from(base64, "base64"), { contentType: "image/jpeg", upsert: false });
  if (error) return { ok: false, error: error.message };
  if (lectura) {
    await db.storage
      .from("whatsapp")
      .upload(`${ruta}.lectura.txt`, Buffer.from(lectura, "utf-8"), { contentType: "text/plain; charset=utf-8", upsert: true });
  }
  return { ok: true, ruta };
}

/**
 * Borra de la ficha de prueba una foto que otra mejor del mismo lado reemplazó
 * (como en WhatsApp, para no guardar fotos que no sirven).
 */
export async function descartarFotoPrueba(procesoId: string, ruta: string): Promise<{ ok: boolean; error?: string }> {
  const perms = await exigirPrueba();
  if (!perms.isAdmin && !puedeEditarEn(perms, "candidatos.seleccion_config")) return { ok: false, error: "Sin permiso." };
  if (typeof ruta !== "string" || !/^procesos\/[0-9a-f-]+\/\d+-foto\.jpg$/.test(ruta) || !ruta.startsWith(`procesos/${procesoId}/`)) {
    return { ok: false, error: "Ruta no válida." };
  }
  const db = createAdminClient();
  const { data: p } = await db.from("procesos_contratacion").select("origen").eq("id", procesoId).maybeSingle();
  if (p?.origen !== "chat_prueba") return { ok: false, error: "Solo candidatos del chat de prueba." };
  const { error } = await db.storage.from("whatsapp").remove([ruta, `${ruta}.lectura.txt`]);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** La ficha guardada desde el chat de prueba, tal como la ve Candidatos. */
export async function fichaPrueba(procesoId: string): Promise<ProcesoContratacion | null> {
  await exigirPrueba();
  const { data } = await createAdminClient().from("procesos_contratacion").select("*").eq("id", procesoId).maybeSingle();
  return (data as ProcesoContratacion | null) ?? null;
}

export interface PasoSilencio {
  horas: number;
  accion: "aviso1" | "aviso2" | "llamar" | "incomunicado";
  /** Cómo saldría: texto libre, plantilla de Meta, borrador para revisar, o no sale. */
  como: "texto" | "plantilla" | "borrador" | "no_sale" | "marca";
  plantilla: string | null;
  estadoPlantilla: string | null;
  texto: string | null;
  nota: string;
}

/** Qué haría la reactivación si el aspirante deja de responder durante `horas`. */
export async function simularSilencioPrueba(p: {
  horas: number;
  ahora?: string | null;
  extraido: DatosPrefiltro | null;
}): Promise<{ ok: true; pasos: PasoSilencio[]; horario: string } | { ok: false; error: string }> {
  await exigirPrueba();
  const horas = Math.min(Math.max(Number(p.horas) || 0, 1), 24 * 14);
  const ahora = p.ahora ? new Date(p.ahora) : new Date();
  const [ajustes, mensajes, seguimiento] = await Promise.all([leerAjustes(), leerMensajes(), leerConfigSeguimiento()]);
  if (!mensajes.length) return { ok: false, error: "Falta aplicar la migración del catálogo de selección." };
  const tiempos = tiemposDesdeAjustes(ajustes, seguimiento.config);
  const { pasos } = simularSilencio({
    horas,
    ahora: Number.isNaN(ahora.getTime()) ? new Date() : ahora,
    tiempos,
    hojaVida: !!p.extraido?.hoja_vida,
    buscaTrabajo: p.extraido?.busca_trabajo !== false,
    procesoEstado: null,
  });
  const valores = { ...valoresFijos(ajustes), nombre: primerNombre(p.extraido?.nombre) };
  const salida: PasoSilencio[] = pasos.map((x) => {
    if (x.accion === "llamar") {
      return { ...x, como: "marca", plantilla: null, estadoPlantilla: null, texto: null, nota: "El chat queda marcado «Llamar» en la bandeja para que Gestión Humana lo llame." };
    }
    if (x.accion === "incomunicado") {
      return { ...x, como: "marca", plantilla: null, estadoPlantilla: null, texto: null, nota: "El proceso se cierra con la causa «Incomunicado» (queda en el historial)." };
    }
    const m = mensajes.find((y) => y.clave === (x.accion === "aviso1" ? "reactivacion_1" : "reactivacion_2"))!;
    const texto = renderizarConLineas(m.texto, valores);
    // A las 24 h o más sin que el aspirante escriba, la ventana de WhatsApp ya está cerrada.
    const ventanaAbierta = x.horas < 23.75;
    if (m.modo === "revisar") {
      return { ...x, como: "borrador", plantilla: m.plantilla_nombre, estadoPlantilla: m.plantilla_estado, texto, nota: "Queda sugerido en el chat de la bandeja para que una persona lo revise y lo envíe." };
    }
    if (ventanaAbierta) return { ...x, como: "texto", plantilla: null, estadoPlantilla: null, texto, nota: "Sale como mensaje normal (la ventana de 24 h sigue abierta)." };
    const aprobada = m.plantilla_estado === "APPROVED";
    const params = parametrosPlantilla(m.plantilla_variables, valores);
    if (!aprobada) {
      return { ...x, como: "no_sale", plantilla: m.plantilla_nombre, estadoPlantilla: m.plantilla_estado, texto, nota: "No sale: la ventana está cerrada y Meta todavía no aprueba la plantilla. Se reintenta cada 15 minutos." };
    }
    if (!params) {
      return { ...x, como: "no_sale", plantilla: m.plantilla_nombre, estadoPlantilla: m.plantilla_estado, texto, nota: "No sale: falta el nombre del aspirante para la plantilla." };
    }
    return { ...x, como: "plantilla", plantilla: m.plantilla_nombre, estadoPlantilla: m.plantilla_estado, texto, nota: "Sale como plantilla aprobada de Meta." };
  });
  return { ok: true, pasos: salida, horario: `${seguimiento.config.horaDesde} a ${seguimiento.config.horaHasta}` };
}
