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
import { procesoAbiertoPorCedula } from "@/lib/contratacion/servidor";
import { proveedorSimit } from "@/lib/verificacion/proveedores";
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
import type { DatosPrefiltro } from "./extraccion";
import type { ResultadoPreseleccionGuardado } from "@/lib/contratacion/constants";
import { primerNombre, renderizarMensaje, parametrosPlantilla } from "./mensajes";
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
}

async function contexto(op: OpcionesPrueba, esAdmin: boolean): Promise<ContextoSimulacion> {
  const { config: guardada, claves } = await getAgenteConClaves();
  const config = op.formulario && esAdmin ? configDesdeFormulario(op.formulario) : guardada;
  const [ctx, reglas] = await Promise.all([contextoSeleccion(), leerReglas()]);
  const ahora = op.ahora ? new Date(op.ahora) : new Date();
  return {
    config,
    claves,
    autorizacion: ctx.autorizacion,
    requisitos: ctx.requisitos,
    reglas,
    nombreContacto: "Aspirante de prueba",
    ahora: Number.isNaN(ahora.getTime()) ? new Date() : ahora,
  };
}

function validarMensajes(mensajes: MensajeSimulado[]): string | null {
  if (!Array.isArray(mensajes) || mensajes.length === 0) return "Escribe un mensaje de prueba.";
  if (mensajes.length > MAX_MENSAJES) return `El chat de prueba admite hasta ${MAX_MENSAJES} mensajes: reinícialo.`;
  for (const m of mensajes) {
    if (m.direccion !== "entrante" && m.direccion !== "saliente") return "Mensaje de prueba no válido.";
    if (typeof m.contenido !== "string" || m.contenido.length > MAX_CARACTERES) return `Cada mensaje admite hasta ${MAX_CARACTERES} caracteres.`;
    if (m.mediaTipo !== null && !MEDIOS.has(m.mediaTipo)) return "Tipo de archivo no válido.";
  }
  if (mensajes[mensajes.length - 1].direccion !== "entrante") return "El último mensaje debe ser del aspirante.";
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
  const preseleccion = extraido ? simularPreseleccion(extraido, op.simit, ctx.reglas, ctx.ahora) : null;
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
export async function responderPrueba(mensajes: MensajeSimulado[], op: OpcionesPrueba): Promise<RespuestaPrueba> {
  const perms = await exigirPrueba();
  const error = validarMensajes(mensajes);
  if (error) return { ok: false, error };
  const ctx = await contexto(op, perms.isAdmin);
  try {
    const resp = await responderSimulado(mensajes, ctx);
    const texto = resp.motivo && !resp.texto ? ctx.config.mensajeTransferencia.trim() : resp.texto;
    return { ok: true, ...resp, texto };
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
    const texto = renderizarMensaje(m.texto, valores);
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
