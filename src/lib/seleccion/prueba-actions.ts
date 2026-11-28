"use server";

/**
 * Chat de prueba de la selección: simula todo el flujo sin enviar WhatsApp ni
 * escribir en la base (respuesta del asistente, extracción, semáforo, proceso,
 * reactivación) y corre los casos del banco. Lo usan la pantalla del agente
 * (con la configuración del formulario, solo administradores) y Candidatos ›
 * Selección › Probar el asistente (con la configuración guardada).
 */
import { siCromaActivo } from "@/lib/verificacion/pausa";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, puedeEditarEn, tienePermiso } from "@/lib/permissions";
import { getAgenteConClaves } from "@/lib/comunicaciones/agente/config";
import { configDesdeFormulario, type AgenteFormulario } from "@/lib/comunicaciones/agente/formulario";
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
import {
  antecedentesEnRevisionDeProceso,
  cerradoPorAntecedentesDeProceso,
  contextoSeleccion,
  leerMensajes,
  leerReglas,
} from "./servidor";
import { correrCaso, extraerDeConversacion, responderSimulado, type ContextoSimulacion } from "./evaluacion/ejecutor";
import { casoPorId } from "./evaluacion/casos";
import {
  queHariaGestivo,
  revisarCaso,
  simularPreseleccion,
  type ChequeoCaso,
  type MensajeSimulado,
  type QueHariaGestivo,
  type ResultadoConversacion,
} from "./simulacion";
import { interpretarExtraccion, type DatosPrefiltro } from "./extraccion";
import { INSTRUCCION_LECTURA_CEDULA, SISTEMA_LECTURA_CEDULA, interpretarLecturaCedula, type LecturaCedula } from "./lectura-cedula";
import { leerImagen, type ImagenEntrada } from "@/lib/comunicaciones/agente/proveedores";
import type { CitaAsistente, FechaRechazada } from "@/lib/comunicaciones/agente/motor";
import { citaParaAsistente, citaVigenteDeProceso, examenParaAsistente, reprogramarPorAsistente, vistaCitacion } from "./agenda-servidor";
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
import { preguntaExamenDeProceso } from "./respuestas-examenes-servidor";
import { correoParaAsistenteDeProceso } from "./correo-psico-servidor";
import { NOMBRE_POR_CONFIRMAR, motivoRegreso, procesoDePrueba, reabrirSiVuelve, registrarAspirante } from "./proceso-desde-chat";
import { vinculoDeCedulas } from "./vinculo-servidor";
import { cedulasMencionadas } from "./vinculo";
import { marcarListoParaCitar, marcarRevisionAntecedentes } from "./servidor";
import type { ProcesoContratacion, ResultadoPreseleccionGuardado } from "@/lib/contratacion/constants";
import { pasosDeSilencio, type PasoSilencio } from "./silencio-prueba-servidor";
import { archivoParaModelo, mimeDeFormato } from "./lectura/formatos";
import { MAX_BYTES_DOCUMENTO_PRUEBA } from "./lectura/formatos-aceptados";
import { leerArchivos } from "./lectura/leer";
import { itemDeClase, resumenParaAsistente } from "./lectura/interpretar";
import { conContradicciones, type DatosAspirante, type LecturaPrevia } from "./lectura/contradicciones";
import { NOMBRE_CLASE, type CampoLeido, type ClaseDocumento } from "./lectura/esquema";
import { validarDocumentosAutomaticos } from "./lectura/revision-servidor";
import { ADJUNTO_MIMES, guardarAdjuntoSeleccion, itemsCarpeta, marcarItemCarpeta, tipoDeItem } from "./carpeta-servidor";
import { registrarConsumo } from "./consumos-servidor";
import { costoUsd } from "./consumos";
import { configDocumentos } from "@/lib/comunicaciones/agente/config";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import { transcribirAudio } from "@/lib/ia/transcripcion";
import { modeloDeControl } from "./audios";
import { audioParaModelo, calidadTranscripcion, transcripcionParaGuardar, type CalidadAudio } from "./calidad-audio";

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

/**
 * Lo que el chat real sabe de los antecedentes del candidato (revisión por una
 * persona, cierre por antecedentes), para que el de prueba responda igual.
 * Solo candidatos «chat_prueba».
 */
async function antecedentesDePrueba(procesoId: string | null | undefined): Promise<{ enRevision: boolean; cerrado: boolean; autorizada: boolean }> {
  const nada = { enRevision: false, cerrado: false, autorizada: false };
  if (!procesoId || typeof procesoId !== "string") return nada;
  const { data } = await createAdminClient().from("procesos_contratacion").select("origen, autorizacion_datos").eq("id", procesoId).maybeSingle();
  if (data?.origen !== "chat_prueba") return nada;
  const [enRevision, cerrado] = await Promise.all([
    antecedentesEnRevisionDeProceso(procesoId).catch(() => false),
    cerradoPorAntecedentesDeProceso(procesoId).catch(() => false),
  ]);
  return { enRevision, cerrado, autorizada: data.autorizacion_datos === "si" };
}

/** Si el candidato de prueba se cerró solo: el asistente retoma con quien vuelve. */
async function regresoDePrueba(procesoId: string | null | undefined) {
  if (!procesoId || typeof procesoId !== "string") return null;
  const p = await procesoDePrueba(procesoId).catch(() => null);
  return p?.estado === "cierre" ? motivoRegreso(procesoId).catch(() => null) : null;
}

/**
 * Lo demás que el chat real le pasa al asistente (27-nov-2026): la pregunta del
 * mensaje de exámenes que espera respuesta, en qué va el correo de la
 * psicotécnica y el nombre del candidato. Sin esto el asistente del chat
 * de prueba no sabía que le habíamos enviado los exámenes y decía que ese
 * mensaje no era nuestro. Solo candidatos «chat_prueba».
 */
async function seguimientoDePrueba(procesoId: string | null | undefined) {
  const nada = { preguntaExamen: null, correoPsico: null, examen: null, nombre: null } as const;
  if (!procesoId || typeof procesoId !== "string") return nada;
  const { data } = await createAdminClient().from("procesos_contratacion").select("origen, nombre").eq("id", procesoId).maybeSingle();
  if (data?.origen !== "chat_prueba") return nada;
  const [preguntaExamen, correoPsico, examen] = await Promise.all([
    preguntaExamenDeProceso(procesoId).catch(() => null),
    correoParaAsistenteDeProceso(procesoId).catch(() => null),
    examenParaAsistente(procesoId).catch(() => null),
  ]);
  const nombre = typeof data.nombre === "string" && data.nombre.trim() && data.nombre !== NOMBRE_POR_CONFIRMAR ? data.nombre : null;
  return { preguntaExamen, correoPsico, examen, nombre };
}

async function contexto(op: OpcionesPrueba, esAdmin: boolean): Promise<ContextoSimulacion> {
  const { config: guardada, claves } = await getAgenteConClaves();
  const config = op.formulario && esAdmin ? configDesdeFormulario(op.formulario) : guardada;
  const [ctx, reglas, cita, regreso, antecedentes, seguimiento] = await Promise.all([
    contextoSeleccion(),
    leerReglas(),
    citaDePrueba(op.procesoId),
    regresoDePrueba(op.procesoId),
    antecedentesDePrueba(op.procesoId),
    seguimientoDePrueba(op.procesoId),
  ]);
  // Como el chat real: con el proceso cerrado por antecedentes no se le pide nada más.
  const sigue = !antecedentes.cerrado;
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
    nombreContacto: seguimiento.nombre ?? "Aspirante de prueba",
    preguntaExamen: sigue ? seguimiento.preguntaExamen : null,
    correoPsico: sigue ? seguimiento.correoPsico : null,
    examen: sigue ? seguimiento.examen : null,
    ahora: ahoraValida,
    licenciaVerificada: licenciaVerificadaDesdeRunt(op.runt ?? null, reglas, ahoraValida, op.renovaraLicencia ?? null),
    seguimientoRevision: op.seguimiento === true,
    fechaRechazada: fechaRechazadaValida(op.fechaRechazada),
    verificacionDemorada: op.verificacionDemorada === true,
    antecedentesEnRevision: antecedentes.enRevision,
    cerradoPorAntecedentes: antecedentes.cerrado,
    autorizada: antecedentes.autorizada,
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
    // La lectura de un documento (hoja de vida con varios empleos) es más larga que la de una foto.
    if (m.lectura != null && (typeof m.lectura !== "string" || m.lectura.length > 4000)) return "Lectura del archivo no válida.";
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
  const proveedor = await siCromaActivo(proveedorSimit());
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
  const proveedor = await siCromaActivo(proveedorRunt());
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
  const proveedor = await siCromaActivo(proveedorRnmc());
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

export type { PasoSilencio } from "./silencio-prueba-servidor";

/** Qué haría la reactivación si el aspirante deja de responder durante `horas`. */
export async function simularSilencioPrueba(p: {
  horas: number;
  ahora?: string | null;
  extraido: DatosPrefiltro | null;
}): Promise<{ ok: true; pasos: PasoSilencio[]; horario: string } | { ok: false; error: string }> {
  await exigirPrueba();
  return pasosDeSilencio({ horas: p.horas, ahora: p.ahora, hojaVida: !!p.extraido?.hoja_vida, buscaTrabajo: p.extraido?.busca_trabajo !== false, nombre: p.extraido?.nombre ?? null });
}

// ── Documentos en el chat de prueba (23-nov-2026) ───────────────────────────

export type ResultadoDocumentoPrueba =
  | { ok: true; resumen: string; clase: string; estado: "leido" | "ilegible"; modelo: string; ms: number; guardado: boolean; nota: string | null; avisos: string[] }
  | { ok: false; error: string };

/**
 * Un documento de verdad subido en el chat de prueba (PDF, Word, OpenDocument,
 * RTF o texto): se lee con la IA de «Documentos», como los que llegan por
 * WhatsApp, y lo leído va con el mensaje para que el asistente lo use. Con
 * «Guardar en Candidatos» y el candidato ya creado, el archivo queda en su
 * carpeta y la lectura en «Documentos leídos» (y las cartas que coinciden con
 * la hoja de vida se validan solas). Recibe un FormData: archivo, procesoId y
 * formulario (JSON, opcional).
 */
export async function leerDocumentoPrueba(datos: FormData): Promise<ResultadoDocumentoPrueba> {
  try {
    const perms = await exigirPrueba();
    const archivo = datos.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "No llegó el archivo." };
    if (archivo.size > MAX_BYTES_DOCUMENTO_PRUEBA) return { ok: false, error: "El archivo pesa más de 4 MB: en el chat de prueba ese es el tope (por WhatsApp se leen hasta 8 MB)." };
    const bytes = Buffer.from(await archivo.arrayBuffer());
    const a = await archivoParaModelo(bytes, archivo.type, archivo.name);
    if (!a.ok) return { ok: false, error: a.error };

    let formulario: AgenteFormulario | undefined;
    const f = datos.get("formulario");
    if (typeof f === "string" && f) {
      try {
        formulario = JSON.parse(f) as AgenteFormulario;
      } catch {
        formulario = undefined;
      }
    }
    const { config: guardada, claves } = await getAgenteConClaves();
    const config = formulario && perms.isAdmin ? configDesdeFormulario(formulario) : guardada;

    // Candidato de prueba de esta conversación (solo chat_prueba), para guardar en su ficha.
    const db = createAdminClient();
    const procesoId = typeof datos.get("procesoId") === "string" ? String(datos.get("procesoId")) : "";
    const { data: proc } = procesoId
      ? await db.from("procesos_contratacion").select("id, origen, cedula, nombre, fecha_nacimiento, edad, ciudad_residencia, celular, experiencia_meses").eq("id", procesoId).maybeSingle()
      : { data: null };
    const dePrueba = proc?.origen === "chat_prueba" ? proc : null;

    const inicio = Date.now();
    const hoy = fechaBogota(new Date().toISOString());
    const r = await leerArchivos([a.archivo], { config, claves, hoy, cedulaProceso: (dePrueba?.cedula as string | null) ?? null });
    const costo = r.costoUsd ?? costoUsd(r.modelo, r.tokensEntrada, r.tokensSalida);
    await registrarConsumo({ concepto: "lectura", proveedor: configDocumentos(config).proveedor, modelo: r.modelo, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida, costoUsd: costo, procesoId: dePrueba?.id as string | undefined }).catch(() => undefined);
    const leido = r.docs?.[0];
    if (!leido) return { ok: false, error: `El modelo no devolvió una lectura válida: «${r.texto.slice(0, 200)}»` };
    // ¿Contradice lo que ya sabemos? (27-nov-2026): contra el candidato y sus otros documentos o, si
    // todavía no es candidato, contra lo que dijo en el chat. Las advertencias van como nota del campo.
    let aspirante: DatosAspirante = {};
    let previas: LecturaPrevia[] = [];
    if (dePrueba) {
      aspirante = {
        nombre: dePrueba.nombre as string | null,
        cedula: dePrueba.cedula as string | null,
        fecha_nacimiento: dePrueba.fecha_nacimiento as string | null,
        edad: dePrueba.edad as number | null,
        ciudad_residencia: dePrueba.ciudad_residencia as string | null,
        celular: dePrueba.celular as string | null,
        experiencia_meses: dePrueba.experiencia_meses as number | null,
      };
      const { data: otras } = await db.from("seleccion_lecturas").select("clase, campos").eq("proceso_id", dePrueba.id).eq("estado", "leido");
      previas = ((otras ?? []) as { clase: ClaseDocumento; campos: CampoLeido[] | null }[]).map((o) => ({ clase: o.clase, campos: o.campos ?? [] }));
    } else {
      try {
        const chat = JSON.parse(String(datos.get("datosChat") ?? "null")) as Partial<DatosPrefiltro> | null;
        if (chat) aspirante = { nombre: chat.nombre, cedula: chat.cedula, fecha_nacimiento: chat.fecha_nacimiento, edad: chat.edad, ciudad_residencia: chat.ciudad, experiencia_meses: chat.experiencia_meses };
      } catch {
        // Sin datos del chat: no se compara.
      }
    }
    const revisado = leido.estado === "leido" ? conContradicciones(leido.clase, leido.campos, aspirante, previas, hoy) : { campos: leido.campos, avisos: [] };
    const d = { ...leido, campos: revisado.campos };
    const resumen = resumenParaAsistente(d).slice(0, 4000);

    let guardado = false;
    let nota: string | null = null;
    if (dePrueba && (perms.isAdmin || puedeEditarEn(perms, "candidatos.seleccion_config"))) {
      try {
        const actor = actorUsuario(perms);
        const item = itemDeClase(d.clase, await itemsCarpeta());
        const mime = mimeDeFormato(a.formato, archivo.type, archivo.name);
        const adjuntoId = await guardarAdjuntoSeleccion(
          { procesoId: dePrueba.id as string, tipo: item ? tipoDeItem(item) : "otro", nombre: archivo.name || `${d.clase}.${ADJUNTO_MIMES[mime] ?? "bin"}`, mime, buffer: bytes, origen: "subido" },
          actor
        );
        const { data: lectura, error } = await db
          .from("seleccion_lecturas")
          .insert({
            proceso_id: dePrueba.id,
            adjunto_id: adjuntoId,
            clase: d.clase,
            estado: d.estado,
            campos: d.campos,
            resumen: d.resumen,
            modelo: r.modelo,
            costo_usd: costo,
          })
          .select("id")
          .maybeSingle();
        if (error) throw new Error(error.message);
        guardado = true;
        // Contradice los datos del aspirante de prueba: el aviso sale de verdad, marcado [Prueba].
        const claras = revisado.avisos.filter((x) => x.startsWith("⚠"));
        if (claras.length && lectura?.id) {
          const { notificar, enlaceProceso } = await import("./notificaciones-servidor");
          await notificar("documentos", {
            clave: lectura.id as string,
            procesoId: dePrueba.id as string,
            prueba: true,
            titulo: `${aspirante.nombre?.trim() || "Aspirante de prueba"}: el documento no cuadra con sus datos`,
            detalle: `${claras.join(" ")} Revíselo en Candidatos › ficha › Documentos leídos.`,
            enlace: enlaceProceso((dePrueba.cedula as string | null) ?? null, dePrueba.id as string),
          });
        }
        await validarDocumentosAutomaticos(dePrueba.id as string).catch((e) => console.error("[seleccion] validación automática (chat de prueba):", e));
      } catch (e) {
        nota = `Se leyó, pero no se pudo guardar en la ficha: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else if (procesoId === "") {
      nota = "Todavía no es candidato: el documento se leyó para el asistente, pero no queda en ninguna ficha.";
    }
    if (!dePrueba && !Object.values(aspirante).some((v) => v != null && v !== "")) {
      nota = [nota, "No se comparó con los datos del aspirante: el chat todavía no tiene ninguno."].filter(Boolean).join(" ");
    }
    return { ok: true, resumen, clase: d.clase, estado: d.estado, modelo: r.modelo, ms: Date.now() - inicio, guardado, nota, avisos: revisado.avisos };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo leer el documento." };
  }
}

/**
 * Documento simulado en el chat de prueba (27-nov-2026): «si se simula, se dice
 * que está bien». El tipo sale del pie (claseDePie, en el navegador); con el
 * candidato de prueba guardado, ese documento queda «recibido» en su carpeta,
 * con la nota de que fue simulado. Solo candidatos del chat de prueba.
 */
export async function documentoSimuladoPrueba(procesoId: string, clase: ClaseDocumento): Promise<{ ok: boolean; nota: string }> {
  try {
    const perms = await exigirPrueba();
    const db = createAdminClient();
    const { data: p } = await db.from("procesos_contratacion").select("id, origen").eq("id", procesoId).maybeSingle();
    if (p?.origen !== "chat_prueba") return { ok: false, nota: "Solo se marcan documentos de candidatos del chat de prueba." };
    const item = itemDeClase(clase, await itemsCarpeta());
    if (!item) return { ok: true, nota: `Documento simulado (${NOMBRE_CLASE[clase].toLowerCase()}): se da por bueno; no corresponde a ningún documento de la carpeta.` };
    const r = await marcarItemCarpeta(procesoId, item, "validado", "Simulado en el chat de prueba: se da por bueno.", actorUsuario(perms));
    return r.ok
      ? { ok: true, nota: `Documento simulado: «${item}» quedó recibido en la carpeta del candidato (se da por bueno).` }
      : { ok: false, nota: `Documento simulado, pero no se pudo marcar en la carpeta: ${r.error ?? "error"}` };
  } catch (e) {
    return { ok: false, nota: e instanceof Error ? e.message : "No se pudo marcar el documento simulado." };
  }
}

// ── Probar lectura sin el chat (23-nov-2026) ────────────────────────────────

/** Un empleo o una referencia leídos, en una línea: «Cootrasol — Conductor (2019-03 a 2023-08)». */
function itemEnTexto(it: Record<string, unknown>): string {
  const t = (k: string) => (it[k] == null || it[k] === "" ? null : String(it[k]));
  if (t("empresa") && !t("nombre")) {
    const fechas = t("desde") || t("hasta") ? ` (${t("desde") ?? "?"} a ${t("hasta") ?? "hoy"})` : "";
    return `${t("empresa")}${t("cargo") ? ` — ${t("cargo")}` : ""}${fechas}${it.conduccion === false ? " · no es de conducción" : ""}`;
  }
  if (t("nombre")) {
    return [t("nombre"), t("tipo") ? `(${t("tipo")})` : null, t("empresa"), t("telefono")].filter(Boolean).join(" · ");
  }
  return Object.entries(it)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

/** Un valor leído en texto, para mostrarlo en la prueba (las listas, un elemento por renglón). */
function valorEnTexto(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((it) => (it && typeof it === "object" ? itemEnTexto(it as Record<string, unknown>) : String(it))).join("\n") || "—";
  if (typeof v === "object") return itemEnTexto(v as Record<string, unknown>);
  return String(v);
}

export type ResultadoProbarDocumento =
  | {
      ok: true;
      clase: string;
      estado: "leido" | "ilegible";
      resumen: string;
      campos: { campo: string; valor: string; confianza: string; calculado: boolean }[];
      paraAsistente: string;
      modelo: string;
      ms: number;
      costoUsd: number;
    }
  | { ok: false; error: string };

/**
 * Prueba la lectura de un documento o una foto sin pasar por el chat ni guardar
 * nada: lo lee la IA de «Documentos», como uno que llega por WhatsApp, y devuelve
 * lo leído campo por campo y lo que recibiría el asistente. FormData: archivo.
 */
export async function probarLecturaDocumento(datos: FormData): Promise<ResultadoProbarDocumento> {
  try {
    await exigirPrueba();
    const archivo = datos.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "No llegó el archivo." };
    if (archivo.size > MAX_BYTES_DOCUMENTO_PRUEBA) return { ok: false, error: "El archivo pesa más de 4 MB: en la prueba ese es el tope (por WhatsApp se leen hasta 8 MB)." };
    const a = await archivoParaModelo(Buffer.from(await archivo.arrayBuffer()), archivo.type, archivo.name);
    if (!a.ok) return { ok: false, error: a.error };
    const { config, claves } = await getAgenteConClaves();
    const inicio = Date.now();
    const r = await leerArchivos([a.archivo], { config, claves, hoy: fechaBogota(new Date().toISOString()), cedulaProceso: null });
    const costo = r.costoUsd ?? costoUsd(r.modelo, r.tokensEntrada, r.tokensSalida);
    await registrarConsumo({ concepto: "lectura", proveedor: configDocumentos(config).proveedor, modelo: r.modelo, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida, costoUsd: costo }).catch(() => undefined);
    const d = r.docs?.[0];
    if (!d) return { ok: false, error: `El modelo no devolvió una lectura válida: «${r.texto.slice(0, 200)}»` };
    return {
      ok: true,
      clase: d.clase,
      estado: d.estado,
      resumen: d.resumen,
      campos: d.campos.map((c) => ({ campo: c.campo, valor: valorEnTexto(c.valor), confianza: c.confianza, calculado: !!c.calculado })),
      paraAsistente: resumenParaAsistente(d),
      modelo: r.modelo,
      ms: Date.now() - inicio,
      costoUsd: costo,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo leer el documento." };
  }
}

export type ResultadoProbarAudio =
  | {
      ok: true;
      principal: { texto: string; modelo: string };
      control: { texto: string; modelo: string } | null;
      calidad: CalidadAudio;
      paraAsistente: string;
      ms: number;
      costoUsd: number;
    }
  | { ok: false; error: string };

const MIMES_AUDIO = /^(audio\/|video\/(ogg|webm|mp4))/;
const EXT_AUDIO = /\.(ogg|opus|oga|mp3|m4a|mp4|aac|wav|webm|amr|flac)$/i;

/**
 * Prueba la transcripción de un audio sin pasar por el chat ni guardar nada:
 * los dos modelos de «Voz», como un audio que llega por WhatsApp, y la calidad
 * (si no coinciden, no se confía en lo transcrito). FormData: archivo.
 */
export async function probarAudio(datos: FormData): Promise<ResultadoProbarAudio> {
  try {
    await exigirPrueba();
    const archivo = datos.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "No llegó el audio." };
    if (!MIMES_AUDIO.test(archivo.type) && !EXT_AUDIO.test(archivo.name)) return { ok: false, error: "Suba un audio (OGG/Opus de WhatsApp, MP3, M4A, WAV o WebM)." };
    if (archivo.size > MAX_BYTES_DOCUMENTO_PRUEBA) return { ok: false, error: "El audio pesa más de 4 MB: en la prueba ese es el tope." };
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const { config } = await getAgenteConClaves();
    const modelo = config.vozModelo;
    const proveedor = config.vozProveedor;
    const mime = archivo.type || "audio/ogg";
    const inicio = Date.now();
    const r = await transcribirAudio(bytes, mime, archivo.name, { modelo, proveedor });
    if (!r.ok) return { ok: false, error: r.error };
    await registrarConsumo({ concepto: "transcripcion", proveedor: r.proveedor, modelo: r.modelo, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida, costoUsd: r.costoUsd }).catch(() => undefined);
    let costo = r.costoUsd;
    let control: Awaited<ReturnType<typeof transcribirAudio>> | null = null;
    if (r.texto?.trim()) {
      control = await transcribirAudio(bytes, mime, archivo.name, { modelo: modeloDeControl(modelo), proveedor });
      if (control.ok) {
        costo += control.costoUsd;
        await registrarConsumo({ concepto: "transcripcion", proveedor: control.proveedor, modelo: control.modelo, tokensEntrada: control.tokensEntrada, tokensSalida: control.tokensSalida, costoUsd: control.costoUsd }).catch(() => undefined);
      }
    }
    const calidad = calidadTranscripcion(r.texto, control?.ok ? control.texto : null, !r.texto?.trim() || control?.ok === true);
    return {
      ok: true,
      principal: { texto: r.texto, modelo: r.modelo },
      control: control?.ok ? { texto: control.texto, modelo: control.modelo } : null,
      calidad,
      paraAsistente: audioParaModelo(transcripcionParaGuardar(r.texto, calidad)),
      ms: Date.now() - inicio,
      costoUsd: costo,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo transcribir el audio." };
  }
}
