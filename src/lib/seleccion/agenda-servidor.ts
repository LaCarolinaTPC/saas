/**
 * Agenda de citas, del lado del servidor (entrega 2, D1–D4): citar,
 * reprogramar, confirmar, registrar la llegada o la inasistencia, y los días en
 * que el profesor no puede. La lógica de fechas está en agenda.ts (pura).
 *
 * Con candidatos del chat de prueba (origen «chat_prueba») no sale nada por
 * WhatsApp: el texto del mensaje se devuelve para mostrarlo en el chat de prueba.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTOR_SISTEMA, cambiarEstadoProceso, registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import { ventanaAbierta } from "@/lib/comunicaciones/seguimiento";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import {
  ajustesAgenda,
  citaVigente,
  citasAfectadas,
  fechaEnTexto,
  hhmm,
  horaDelDia,
  horaEnTexto,
  proximaCita,
  reprogramacionesDe,
  superaReprogramaciones,
  type AjustesAgenda,
  type Cita,
  type ExcepcionProfesor,
} from "./agenda";
import { enviarMensajeDirecto, enviarMensajeSeleccion, prepararMensaje, type ResultadoEnvio } from "./envio";
import { primerNombre } from "./mensajes";
import { notaCitacion } from "./preseleccion";
import { evaluarAntecedentesProceso, leerAjustes, leerMensaje, valorAjuste, valoresFijos } from "./servidor";
import type { ResumenRunt } from "@/lib/verificacion/proveedores";
import type { CitaAsistente } from "@/lib/comunicaciones/agente/motor";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Resultado de un envío de la agenda: lo de WhatsApp o «prueba» (no sale nada; el texto va al chat de prueba). */
export type EnvioAgenda = ResultadoEnvio | "prueba" | "sin_conversacion" | "sin_catalogo";

export interface ResultadoAgenda {
  ok: boolean;
  error?: string;
  citaId?: string;
  /** Texto del mensaje (enviado, dejado como borrador o, en el chat de prueba, para mostrarlo). */
  texto?: string;
  envio?: EnvioAgenda;
  /** El aspirante ya gastó las reprogramaciones permitidas: se propone cerrar por desistimiento. */
  proponeCierre?: boolean;
}

interface ProcesoAgenda {
  id: string;
  nombre: string | null;
  cedula: string | null;
  celular: string | null;
  estado: string;
  origen: string | null;
  licencia_runt: ResumenRunt | null;
}

const COLUMNAS_PROCESO = "id, nombre, cedula, celular, estado, origen, licencia_runt";

async function leerProceso(procesoId: string): Promise<ProcesoAgenda | null> {
  const { data } = await createAdminClient().from("procesos_contratacion").select(COLUMNAS_PROCESO).eq("id", procesoId).maybeSingle();
  return (data as ProcesoAgenda | null) ?? null;
}

export async function leerAjustesAgenda(): Promise<AjustesAgenda> {
  return ajustesAgenda(await leerAjustes());
}

/** Días en que el profesor no puede o puede a otra hora, en el rango (vacío si falta la migración). */
export async function leerDisponibilidad(desde: string, hasta: string): Promise<ExcepcionProfesor[]> {
  const { data, error } = await createAdminClient()
    .from("seleccion_disponibilidad_profesor")
    .select("fecha, disponible, hora, motivo, nota")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha");
  if (error) return [];
  return (data ?? []) as ExcepcionProfesor[];
}

const hoy = (ahora: Date = new Date()) => fechaBogota(ahora.toISOString());
const enDias = (fecha: string, n: number) => {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Excepciones del profesor de hoy en adelante (dos meses). */
export async function excepcionesProximas(ahora: Date = new Date()): Promise<ExcepcionProfesor[]> {
  const h = hoy(ahora);
  return leerDisponibilidad(h, enDias(h, 62));
}

/** Fecha y hora que se proponen para citar (saltan los días sin profesor). */
export async function citaPropuesta(ahora: Date = new Date(), desdeManana = false): Promise<{ fecha: string; hora: string }> {
  const [a, ex] = await Promise.all([leerAjustesAgenda(), excepcionesProximas(ahora)]);
  return proximaCita(ahora, a, ex, desdeManana);
}

interface ConversacionAgenda {
  id: string;
  telefono: string;
  ultimoEntranteAt: string | null;
}

/**
 * Conversación de WhatsApp del proceso: la enlazada o, si el proceso se creó a
 * mano, la del celular (crea el contacto y la conversación si no existen).
 * null si es un candidato del chat de prueba o no tiene celular.
 */
export async function conversacionDeProceso(p: Pick<ProcesoAgenda, "id" | "celular" | "origen" | "nombre">): Promise<ConversacionAgenda | null> {
  if (p.origen === "chat_prueba") return null;
  const db = createAdminClient();
  const { data: enlazada } = await db
    .from("wa_conversaciones")
    .select("id, ultimo_entrante_at, wa_contactos(telefono)")
    .eq("proceso_id", p.id)
    .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const tel = (c: unknown) => ((Array.isArray(c) ? c[0] : c) as { telefono?: string } | null)?.telefono ?? null;
  if (enlazada && tel(enlazada.wa_contactos)) {
    return { id: enlazada.id as string, telefono: tel(enlazada.wa_contactos)!, ultimoEntranteAt: (enlazada.ultimo_entrante_at as string | null) ?? null };
  }
  const d = (p.celular ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  const telefono = d.length === 10 ? `57${d}` : d;
  const { data: contacto, error: eContacto } = await db
    .from("wa_contactos")
    .upsert({ telefono, updated_at: new Date().toISOString() }, { onConflict: "telefono" })
    .select("id")
    .single();
  if (eContacto || !contacto) return null;
  const { data: conv, error: eConv } = await db
    .from("wa_conversaciones")
    .upsert({ contacto_id: contacto.id }, { onConflict: "contacto_id" })
    .select("id, ultimo_entrante_at, proceso_id")
    .single();
  if (eConv || !conv) return null;
  if (!conv.proceso_id) await db.from("wa_conversaciones").update({ proceso_id: p.id }).eq("id", conv.id);
  return { id: conv.id as string, telefono, ultimoEntranteAt: (conv.ultimo_entrante_at as string | null) ?? null };
}

/** Variables de los mensajes de cita para ese proceso, fecha y hora. */
async function valoresDeCita(p: ProcesoAgenda, fecha: string, hora: string): Promise<Record<string, string>> {
  const ajustes = await leerAjustes();
  const nombre = p.nombre && p.nombre !== "POR CONFIRMAR" ? primerNombre(p.nombre) : "";
  return { ...valoresFijos(ajustes), nombre, fecha: fechaEnTexto(fecha), hora: horaEnTexto(hora) };
}

export interface VistaCitacion {
  texto: string;
  /** Cómo saldría: texto libre, plantilla de Meta, solo en el chat de prueba, o no se puede enviar. */
  canal: "texto" | "plantilla" | "prueba" | "no_sale";
  aviso: string | null;
}

/** Lo que saldría al citar: el texto y por dónde, o por qué no se puede enviar. */
export async function vistaCitacion(procesoId: string, cuando: { fecha: string; hora: string }, clave: "citacion" | "cita_reprogramada" = "citacion"): Promise<VistaCitacion | null> {
  const p = await leerProceso(procesoId);
  const m = await leerMensaje(clave);
  if (!p || !m) return null;
  const valores = await valoresDeCita(p, cuando.fecha, cuando.hora);
  const { texto, aprobada, parametros } = prepararMensaje(m, valores, clave === "citacion" ? notaCitacion(p.licencia_runt) : null);
  const sinDireccion = !valores.direccion?.trim() ? "Falta la dirección de la sede (Candidatos › Selección › Datos de los mensajes): el mensaje sale sin ella." : null;
  if (p.origen === "chat_prueba") return { texto, canal: "prueba", aviso: sinDireccion };
  const conv = await conversacionDeProceso(p);
  if (!conv) return { texto, canal: "no_sale", aviso: "El proceso no tiene celular ni conversación de WhatsApp: la cita se crea, pero hay que avisarle por otro medio." };
  if (ventanaAbierta(conv.ultimoEntranteAt, new Date())) return { texto, canal: "texto", aviso: sinDireccion };
  if (aprobada && parametros) return { texto, canal: "plantilla", aviso: "Han pasado más de 24 horas desde su último mensaje: sale por la plantilla aprobada de WhatsApp." };
  return {
    texto,
    canal: "no_sale",
    aviso: !aprobada
      ? "Han pasado más de 24 horas desde su último mensaje y este mensaje no tiene plantilla aprobada: queda como borrador en la bandeja."
      : "Han pasado más de 24 horas y falta la dirección de la sede para la plantilla: queda como borrador en la bandeja.",
  };
}

/** Envía un mensaje de cita (o lo devuelve para el chat de prueba). */
async function avisar(
  p: ProcesoAgenda,
  clave: string,
  cuando: { fecha: string; hora: string },
  opciones: { directo: boolean; nota?: string | null; firma?: string | null; extra?: Record<string, string> }
): Promise<{ envio: EnvioAgenda; texto: string }> {
  const m = await leerMensaje(clave);
  if (!m) return { envio: "sin_catalogo", texto: "" };
  const valores = { ...(await valoresDeCita(p, cuando.fecha, cuando.hora)), ...(opciones.extra ?? {}) };
  const { texto } = prepararMensaje(m, valores, opciones.nota);
  if (p.origen === "chat_prueba") return { envio: "prueba", texto };
  const conv = await conversacionDeProceso(p);
  if (!conv) return { envio: "sin_conversacion", texto };
  if (opciones.directo) {
    const r = await enviarMensajeDirecto({
      conversacionId: conv.id,
      telefono: conv.telefono,
      ultimoEntranteAt: conv.ultimoEntranteAt,
      mensaje: m,
      valores,
      nota: opciones.nota,
      firma: opciones.firma,
      borradorSiNoSale: true,
    });
    return { envio: r.resultado, texto: r.texto };
  }
  // A un mensaje automático le falta un dato (por ejemplo, el laboratorio sin
  // configurar): no sale a medias; queda como borrador para que una persona lo complete.
  const faltan = (m.variables ?? []).filter((v) => !valores[v]?.trim());
  if (faltan.length > 0) {
    const r = await enviarMensajeDirecto({ conversacionId: conv.id, telefono: conv.telefono, ultimoEntranteAt: conv.ultimoEntranteAt, mensaje: m, valores, soloBorrador: true });
    return { envio: r.resultado, texto: r.texto };
  }
  const resultado = await enviarMensajeSeleccion({ conversacionId: conv.id, telefono: conv.telefono, ultimoEntranteAt: conv.ultimoEntranteAt, mensaje: m, valores });
  return { envio: resultado, texto };
}

/** Mensaje del catálogo para un proceso (exámenes, escuela…), con las mismas reglas de envío. */
export async function avisarProceso(
  procesoId: string,
  clave: string,
  cuando: { fecha: string; hora: string },
  opciones: { directo: boolean; firma?: string | null } = { directo: false }
): Promise<{ envio: EnvioAgenda; texto: string }> {
  const p = await leerProceso(procesoId);
  if (!p) return { envio: "sin_conversacion", texto: "" };
  return avisar(p, clave, cuando, opciones);
}

function validarCuando(c: { fecha: string; hora: string }): string | null {
  if (!FECHA_RE.test(c.fecha ?? "")) return "La fecha de la cita no es válida.";
  if (!HORA_RE.test(hhmm(c.hora))) return "La hora de la cita no es válida.";
  return null;
}

/** Citas del proceso, de la más reciente a la más vieja (vacío si falta la migración). */
export async function citasDeProceso(procesoId: string): Promise<Cita[]> {
  const { data, error } = await createAdminClient().from("seleccion_citas").select("*").eq("proceso_id", procesoId).order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as Cita[];
}

/** La cita de prueba de manejo que sigue en pie, si la hay. */
export async function citaVigenteDeProceso(procesoId: string): Promise<Cita | null> {
  return (await citasDeProceso(procesoId)).find((c) => c.tipo === "prueba_manejo" && citaVigente(c)) ?? null;
}

/**
 * La cita de prueba de manejo sobre la que conversa el asistente: la que sigue
 * en pie o, si no hay, la última si quedó en «No asistió» (para ofrecerle
 * reprogramar). `citas` viene de la más reciente a la más vieja.
 */
function citaQueAtiendeElAsistente(citas: Cita[]): Cita | null {
  const deManejo = citas.filter((c) => c.tipo === "prueba_manejo");
  const vigente = deManejo.find((c) => citaVigente(c));
  if (vigente) return vigente;
  const ultima = deManejo.find((c) => c.estado !== "reprogramada" && c.estado !== "cancelada");
  return ultima?.estado === "no_asistio" ? ultima : null;
}

/** Próximos días con prueba de manejo (desde mañana), sin el de la cita actual: a esos puede mover la cita el asistente. */
async function diasParaReprogramar(fechaActual: string, cuantos = 6): Promise<{ fecha: string; hora: string }[]> {
  const ahora = new Date();
  const [a, ex] = await Promise.all([leerAjustesAgenda(), excepcionesProximas(ahora)]);
  const dias: { fecha: string; hora: string }[] = [];
  let d = hoy(ahora);
  for (let i = 0; i < 30 && dias.length < cuantos; i++) {
    d = enDias(d, 1);
    const hora = horaDelDia(d, a, ex);
    if (hora && d !== fechaActual) dias.push({ fecha: d, hora });
  }
  return dias;
}

/**
 * El asistente mueve la cita al día que eligió la persona. Solo a un día con
 * prueba de la lista que se le dio, solo de un proceso que sigue «Citado» y
 * solo si no ha gastado las reprogramaciones. No envía «cita_reprogramada»:
 * el asistente ya se lo dice en su respuesta.
 */
export async function reprogramarPorAsistente(procesoId: string, fecha: string, actor: ActorProceso): Promise<ResultadoAgenda> {
  const todas = await citasDeProceso(procesoId);
  const cita = citaQueAtiendeElAsistente(todas);
  if (!cita) return { ok: false, error: "No tiene una cita que mover." };
  const a = await leerAjustesAgenda();
  if (reprogramacionesDe(todas) >= a.reprogramacionesMax) return { ok: false, error: "Ya gastó las reprogramaciones permitidas." };
  const dia = (await diasParaReprogramar(cita.fecha, 12)).find((d) => d.fecha === fecha);
  if (!dia) return { ok: false, error: "Ese día no hay prueba de manejo." };
  return reprogramarCita(cita.id, dia, "aspirante", actor, { avisar: false });
}

/** La cita en pie del proceso, en palabras, para que el asistente responda cuándo y dónde es. */
export async function citaParaAsistente(procesoId: string | null | undefined): Promise<CitaAsistente | null> {
  if (!procesoId) return null;
  const todas = await citasDeProceso(procesoId);
  const cita = citaQueAtiendeElAsistente(todas);
  if (!cita) return null;
  const ajustes = await leerAjustes();
  const a = ajustesAgenda(ajustes);
  return {
    noAsistio: cita.estado === "no_asistio",
    opciones: (await diasParaReprogramar(cita.fecha)).map((d) => ({ fecha: d.fecha, texto: fechaEnTexto(d.fecha), hora: horaEnTexto(d.hora) })),
    puedeReprogramar: reprogramacionesDe(todas) < a.reprogramacionesMax,
    fecha: fechaEnTexto(cita.fecha),
    hora: horaEnTexto(cita.hora),
    direccion: valoresFijos(ajustes).direccion.trim(),
    confirmada: cita.estado === "confirmada",
    pideOtraFecha: cita.estado === "pide_otra_fecha",
  };
}

/** Lo mismo, a partir de la conversación de WhatsApp. */
export async function citaDeConversacion(conversacionId: string): Promise<CitaAsistente | null> {
  const { data } = await createAdminClient().from("wa_conversaciones").select("proceso_id").eq("id", conversacionId).maybeSingle();
  return citaParaAsistente((data?.proceso_id as string | null) ?? null);
}

async function crearCita(procesoId: string, tipo: Cita["tipo"], cuando: { fecha: string; hora: string }, actor: ActorProceso): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("seleccion_citas")
    .insert({ proceso_id: procesoId, tipo, fecha: cuando.fecha, hora: hhmm(cuando.hora), creada_por: actor.userEmail })
    .select("id")
    .single();
  if (error) {
    console.error("[agenda] no se pudo crear la cita:", error.message);
    return null;
  }
  return data.id as string;
}

/** Cita de otro tipo (laboratorio…) sin mensaje: la crea quien registra el paso anterior. */
export async function crearCitaSimple(procesoId: string, tipo: Cita["tipo"], cuando: { fecha: string; hora: string }, actor: ActorProceso): Promise<string | null> {
  return crearCita(procesoId, tipo, cuando, actor);
}

/**
 * Cita al aspirante a la prueba de manejo: crea la cita, pasa el proceso a
 * «Citado», llena la fecha de citación y envía la citación de una vez (la
 * persona que cita ya vio el mensaje). Si ya tiene una cita en pie, la reprograma.
 */
export async function citarProceso(procesoId: string, cuando: { fecha: string; hora: string }, actor: ActorProceso): Promise<ResultadoAgenda> {
  const mal = validarCuando(cuando);
  if (mal) return { ok: false, error: mal };
  const p = await leerProceso(procesoId);
  if (!p) return { ok: false, error: "El proceso no existe." };
  if (p.estado === "contratado" || p.estado === "cierre") return { ok: false, error: "El proceso ya está cerrado o contratado." };

  const vigente = await citaVigenteDeProceso(procesoId);
  if (vigente) return reprogramarCita(vigente.id, cuando, "empresa", actor);
  // Quien ya presentó la prueba (escuela, exámenes…) no vuelve a «Citado».
  if (!["pendiente", "antecedentes", "citado"].includes(p.estado)) return { ok: false, error: "Este aspirante ya pasó por la prueba de manejo: no se cita de nuevo desde aquí." };

  const ajustes = await leerAjustes();
  if (valorAjuste<unknown>(ajustes, "citar_exige_antecedentes", false) === true) {
    const ev = await evaluarAntecedentesProceso(procesoId);
    if (ev?.resultado !== "limpio") return { ok: false, error: "Para citar hay que tener los antecedentes resueltos (ajuste de Selección)." };
  }

  const citaId = await crearCita(procesoId, "prueba_manejo", cuando, actor);
  if (!citaId) return { ok: false, error: "No se pudo crear la cita (¿falta aplicar la migración de la entrega 2?)." };
  await cambiarEstadoProceso(procesoId, "citado", { actor, detalle: { motivo: "Citado a la prueba de manejo." } });
  await createAdminClient().from("procesos_contratacion").update({ fecha_citacion: cuando.fecha }).eq("id", procesoId);
  const { envio, texto } = await avisar(p, "citacion", cuando, { directo: true, nota: notaCitacion(p.licencia_runt), firma: actor.userEmail });
  await registrarEvento(procesoId, { tipo: "cita", detalle: { accion: "citado", fecha: cuando.fecha, hora: hhmm(cuando.hora), envio } }, actor);
  return { ok: true, citaId, texto, envio };
}

/**
 * Cita sola al aspirante que acaba de quedar «Listo para citar» (ajuste
 * `cita_automatica`, pedido de GH del 18-nov-2026): al siguiente cupo de la
 * prueba de manejo, con la misma citación que enviaría una persona. Si no
 * puede, el asistente le pregunta qué día puede y mueve la cita.
 * No cita (queda para una persona, como antes) si el ajuste está apagado, si
 * falta la respuesta del RNMC, si falta la dirección de la sede o si ya tiene
 * cita. Devuelve null cuando no citó.
 */
export async function citarAutomaticamente(procesoId: string, opciones: { faltaRnmc?: boolean } = {}): Promise<ResultadoAgenda | null> {
  const ajustes = await leerAjustes();
  if (valorAjuste<unknown>(ajustes, "cita_automatica", true) === false) return null;
  if (opciones.faltaRnmc) return null;
  const p = await leerProceso(procesoId);
  if (!p || !["pendiente", "antecedentes"].includes(p.estado)) return null;
  if (p.origen !== "chat_prueba" && !valoresFijos(ajustes).direccion.trim()) return null;
  if (await citaVigenteDeProceso(procesoId)) return null;
  const r = await citarProceso(procesoId, await citaPropuesta(), ACTOR_SISTEMA);
  if (!r.ok) {
    console.error("[agenda] no se pudo citar automáticamente:", r.error);
    return null;
  }
  // Ya está citado y avisado: el chat deja de estar pendiente para Gestión Humana.
  if (r.envio === "enviado") await createAdminClient().from("wa_conversaciones").update({ requiere_humano: false }).eq("proceso_id", procesoId);
  return r;
}

/**
 * Mueve la cita: la anterior queda «reprogramada» (por el aspirante o por la
 * empresa) y se crea la nueva. Avisa con «cita_reprogramada»: directo con la
 * ventana de 24 h abierta; si no, queda como borrador (ese mensaje no tiene
 * plantilla). Las de la empresa no cuentan contra el máximo del aspirante.
 */
export async function reprogramarCita(
  citaId: string,
  cuando: { fecha: string; hora: string },
  por: "aspirante" | "empresa",
  actor: ActorProceso,
  /** `avisar: false` cuando quien la mueve ya se lo dice a la persona (el asistente, en su respuesta). */
  opciones: { avisar?: boolean } = {}
): Promise<ResultadoAgenda> {
  const mal = validarCuando(cuando);
  if (mal) return { ok: false, error: mal };
  const db = createAdminClient();
  const { data: cita } = await db.from("seleccion_citas").select("*").eq("id", citaId).maybeSingle();
  if (!cita) return { ok: false, error: "La cita no existe." };
  const c = cita as Cita;
  const p = await leerProceso(c.proceso_id);
  if (!p) return { ok: false, error: "El proceso no existe." };
  if (p.estado === "contratado" || p.estado === "cierre") return { ok: false, error: "El proceso ya está cerrado o contratado." };
  // Solo se mueve una cita en pie o una a la que no llegó: una ya reprogramada,
  // cancelada o cumplida no (dos clics seguidos dejarían dos citas en pie).
  if (!citaVigente(c) && c.estado !== "no_asistio") return { ok: false, error: "Esa cita ya no está en pie (se movió, se canceló o ya asistió)." };
  if (c.fecha === cuando.fecha && hhmm(c.hora) === hhmm(cuando.hora) && citaVigente(c)) return { ok: false, error: "La cita ya está para esa fecha y hora." };

  // Solo si sigue como estaba (dos clics seguidos no crean dos citas).
  const { data: tomada } = await db
    .from("seleccion_citas")
    .update({ estado: "reprogramada", reprogramada_por: por })
    .eq("id", citaId)
    .eq("estado", c.estado)
    .select("id");
  if (!tomada?.length) return { ok: false, error: "La cita cambió mientras tanto: vuelve a intentarlo." };

  const nuevaId = await crearCita(c.proceso_id, c.tipo, cuando, actor);
  if (!nuevaId) return { ok: false, error: "No se pudo crear la cita nueva." };
  if (c.tipo === "prueba_manejo") {
    if (p.estado !== "citado") await cambiarEstadoProceso(c.proceso_id, "citado", { actor, detalle: { motivo: "Cita reprogramada." } }).catch(() => null);
    await db.from("procesos_contratacion").update({ fecha_citacion: cuando.fecha }).eq("id", c.proceso_id);
  }
  const { envio, texto }: { envio: EnvioAgenda | undefined; texto: string } =
    opciones.avisar === false ? { envio: undefined, texto: "" } : await avisar(p, "cita_reprogramada", cuando, { directo: true, firma: actor.userEmail });
  await registrarEvento(
    c.proceso_id,
    { tipo: "cita", detalle: { accion: "reprogramada", por, fecha: cuando.fecha, hora: hhmm(cuando.hora), antes: `${c.fecha} ${hhmm(c.hora)}`, envio } },
    actor
  );
  const a = await leerAjustesAgenda();
  const proponeCierre = por === "aspirante" && superaReprogramaciones(await citasDeProceso(c.proceso_id), a);
  return { ok: true, citaId: nuevaId, texto, envio, proponeCierre };
}

async function cambiarCita(
  citaId: string,
  desde: Cita["estado"][],
  patch: Record<string, unknown>,
  evento: Record<string, unknown>,
  actor: ActorProceso
): Promise<{ ok: boolean; error?: string; cita?: Cita }> {
  const db = createAdminClient();
  const { data } = await db.from("seleccion_citas").update(patch).eq("id", citaId).in("estado", desde).select("*");
  const c = (data?.[0] as Cita | undefined) ?? null;
  if (!c) return { ok: false, error: "La cita ya no está en ese estado (alguien la cambió antes)." };
  await registrarEvento(c.proceso_id, { tipo: "cita", detalle: { ...evento, fecha: c.fecha, hora: hhmm(c.hora) } }, actor);
  return { ok: true, cita: c };
}

/** El aspirante confirmó que viene. */
export async function confirmarCita(citaId: string, actor: ActorProceso): Promise<ResultadoAgenda> {
  const r = await cambiarCita(citaId, ["programada", "pide_otra_fecha"], { estado: "confirmada", confirmada_at: new Date().toISOString() }, { accion: "confirmada" }, actor);
  return { ok: r.ok, error: r.error, citaId };
}

/** El aspirante pidió otra fecha: queda marcada para que una persona la mueva. */
export async function pedirOtraFecha(citaId: string, actor: ActorProceso): Promise<ResultadoAgenda> {
  const r = await cambiarCita(citaId, ["programada", "confirmada"], { estado: "pide_otra_fecha" }, { accion: "pide_otra_fecha" }, actor);
  return { ok: r.ok, error: r.error, citaId };
}

/** Llegó a la prueba de manejo: la cita queda «asistió» y el proceso pasa a «Prueba de manejo». */
export async function marcarLlegada(citaId: string, actor: ActorProceso): Promise<ResultadoAgenda> {
  const r = await cambiarCita(
    citaId,
    ["programada", "confirmada", "pide_otra_fecha", "no_asistio"],
    { estado: "asistio", llego_at: new Date().toISOString() },
    { accion: "llego" },
    actor
  );
  if (!r.ok || !r.cita) return { ok: false, error: r.error };
  if (r.cita.tipo === "prueba_manejo") {
    const p = await leerProceso(r.cita.proceso_id);
    if (p && (p.estado === "citado" || p.estado === "antecedentes" || p.estado === "pendiente")) {
      await cambiarEstadoProceso(p.id, "prueba_manejo", { actor, detalle: { motivo: "Llegó a la prueba de manejo." } }).catch(() => null);
    }
  }
  return { ok: true, citaId };
}

/**
 * No asistió: lo marca una persona o el cron a la hora + tolerancia. El aviso
 * «inasistencia» queda como borrador (lo revisa una persona). Reversible.
 */
export async function marcarNoAsistio(citaId: string, actor: ActorProceso): Promise<ResultadoAgenda> {
  const r = await cambiarCita(
    citaId,
    ["programada", "confirmada", "pide_otra_fecha"],
    { estado: "no_asistio", inasistencia_at: new Date().toISOString() },
    { accion: "no_asistio" },
    actor
  );
  if (!r.ok || !r.cita) return { ok: false, error: r.error };
  const p = await leerProceso(r.cita.proceso_id);
  if (!p) return { ok: true, citaId };
  const { envio, texto } = await avisar(p, "inasistencia", { fecha: r.cita.fecha, hora: r.cita.hora }, { directo: false });
  return { ok: true, citaId, envio, texto };
}

/** Se marcó «no asistió» por error (llegó tarde o nadie registró la llegada): vuelve a estar en pie. */
export async function deshacerNoAsistio(citaId: string, actor: ActorProceso): Promise<ResultadoAgenda> {
  const db = createAdminClient();
  const { data: cita } = await db.from("seleccion_citas").select("confirmada_at").eq("id", citaId).maybeSingle();
  // inasistencia_at se conserva: así el cron no la vuelve a marcar sola.
  const r = await cambiarCita(citaId, ["no_asistio"], { estado: cita?.confirmada_at ? "confirmada" : "programada" }, { accion: "deshacer_no_asistio" }, actor);
  return { ok: r.ok, error: r.error, citaId };
}

/** Cita con los datos del aspirante, para la agenda del día y la vista del profesor. */
export interface CitaDelDia extends Cita {
  nombre: string;
  cedula: string;
  celular: string | null;
  procesoEstado: string;
  origen: string | null;
  lentes: boolean;
  reprogramaciones: number;
  /** Ya gastó las reprogramaciones permitidas: se propone cerrar por desistimiento. */
  proponeCierre: boolean;
}

/**
 * Citas de prueba de manejo de un día, por hora. `soloPrueba`: solo candidatos
 * del chat de prueba (para probar en Selección); si no, se excluyen.
 */
export async function citasDelDia(fecha: string, opciones: { soloPrueba?: boolean } = {}): Promise<CitaDelDia[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("seleccion_citas")
    .select("*, procesos_contratacion!inner(nombre, cedula, celular, estado, origen, licencia_runt)")
    .eq("fecha", fecha)
    .eq("tipo", "prueba_manejo")
    .neq("estado", "reprogramada")
    .neq("estado", "cancelada")
    .order("hora");
  if (error || !data?.length) return [];
  const a = await leerAjustesAgenda();
  const filas = data.filter((f) => {
    const p = (Array.isArray(f.procesos_contratacion) ? f.procesos_contratacion[0] : f.procesos_contratacion) as { origen?: string | null } | null;
    return opciones.soloPrueba ? p?.origen === "chat_prueba" : p?.origen !== "chat_prueba";
  });
  const out: CitaDelDia[] = [];
  for (const f of filas) {
    const p = (Array.isArray(f.procesos_contratacion) ? f.procesos_contratacion[0] : f.procesos_contratacion) as {
      nombre: string;
      cedula: string;
      celular: string | null;
      estado: string;
      origen: string | null;
      licencia_runt: ResumenRunt | null;
    };
    const todas = await citasDeProceso(f.proceso_id as string);
    const { procesos_contratacion: _p, ...cita } = f as Record<string, unknown>;
    void _p;
    out.push({
      ...(cita as unknown as Cita),
      nombre: p.nombre,
      cedula: p.cedula,
      celular: p.celular,
      procesoEstado: p.estado,
      origen: p.origen,
      lentes: Boolean(notaCitacion(p.licencia_runt)),
      reprogramaciones: reprogramacionesDe(todas),
      proponeCierre: superaReprogramaciones(todas, a),
    });
  }
  return out;
}

// ── Disponibilidad del profesor ────────────────────────────────────────────

export interface ResultadoDisponibilidad {
  ok: boolean;
  error?: string;
  /** Citas de ese día que ya no caben (hay que reprogramarlas). */
  afectadas: { id: string; nombre: string; hora: string }[];
}

async function citasVigentesDe(fecha: string): Promise<(Cita & { nombre: string; origen: string | null })[]> {
  const { data, error } = await createAdminClient()
    .from("seleccion_citas")
    .select("*, procesos_contratacion!inner(nombre, origen)")
    .eq("fecha", fecha)
    .eq("tipo", "prueba_manejo")
    .in("estado", ["programada", "confirmada", "pide_otra_fecha"]);
  if (error) return [];
  return (data ?? []).map((f) => {
    const p = (Array.isArray(f.procesos_contratacion) ? f.procesos_contratacion[0] : f.procesos_contratacion) as { nombre: string; origen: string | null };
    return { ...(f as unknown as Cita), nombre: p.nombre, origen: p.origen };
  });
}

/**
 * Marca un día en que el profesor no puede (disponible = false) o puede a otra
 * hora (disponible = true y hora). Devuelve las citas de ese día que ya no caben.
 */
export async function guardarDisponibilidad(
  ex: { fecha: string; disponible: boolean; hora?: string | null; motivo?: string | null; nota?: string | null },
  actor: ActorProceso
): Promise<ResultadoDisponibilidad> {
  if (!FECHA_RE.test(ex.fecha ?? "")) return { ok: false, error: "La fecha no es válida.", afectadas: [] };
  const hora = ex.disponible && ex.hora ? hhmm(ex.hora) : null;
  if (ex.disponible && !HORA_RE.test(hora ?? "")) return { ok: false, error: "Escribe la hora a la que puede ese día.", afectadas: [] };
  const motivos = ["enfermedad", "permiso", "otra_hora", "otro"];
  const motivo = ex.disponible ? "otra_hora" : motivos.includes(ex.motivo ?? "") ? ex.motivo! : "otro";
  const { error } = await createAdminClient()
    .from("seleccion_disponibilidad_profesor")
    .upsert(
      { fecha: ex.fecha, disponible: ex.disponible, hora, motivo, nota: (ex.nota ?? "").trim().slice(0, 300) || null, registrado_por: actor.userEmail },
      { onConflict: "fecha" }
    );
  if (error) return { ok: false, error: error.message, afectadas: [] };
  const afectadas = citasAfectadas(await citasVigentesDe(ex.fecha), { fecha: ex.fecha, disponible: ex.disponible, hora });
  return { ok: true, afectadas: afectadas.map((c) => ({ id: c.id, nombre: c.nombre, hora: hhmm(c.hora) })) };
}

/** El día vuelve a ser normal. */
export async function quitarDisponibilidad(fecha: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await createAdminClient().from("seleccion_disponibilidad_profesor").delete().eq("fecha", fecha);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export interface ResultadoReprogramarDia {
  ok: boolean;
  error?: string;
  movidas: { procesoId: string; nombre: string; fecha: string; hora: string; envio: EnvioAgenda | undefined; texto?: string }[];
}

/**
 * El profesor no puede ese día (o puede a otra hora): mueve cada cita afectada
 * al siguiente cupo (si el día sigue pero a otra hora, solo cambia la hora) y
 * avisa a cada aspirante. No le cuenta como reprogramación al aspirante.
 */
export async function reprogramarCitasDelDia(fecha: string, actor: ActorProceso, opciones: { soloPrueba?: boolean } = {}): Promise<ResultadoReprogramarDia> {
  if (!FECHA_RE.test(fecha ?? "")) return { ok: false, error: "La fecha no es válida.", movidas: [] };
  const [a, excepciones] = await Promise.all([leerAjustesAgenda(), leerDisponibilidad(fecha, enDias(fecha, 62))]);
  const ex = excepciones.find((e) => e.fecha === fecha);
  if (!ex) return { ok: false, error: "Ese día no tiene marcada ninguna novedad del profesor.", movidas: [] };
  const afectadas = citasAfectadas(await citasVigentesDe(fecha), ex).filter((c) => (opciones.soloPrueba ? c.origen === "chat_prueba" : c.origen !== "chat_prueba"));
  const mismoDia = horaDelDia(fecha, a, excepciones);
  // Desde el final de ese día: el siguiente con prueba (saltando los demás días sin profesor).
  const nueva = mismoDia ? { fecha, hora: mismoDia } : proximaCita(new Date(`${fecha}T23:00:00-05:00`), a, excepciones, true);
  const movidas: ResultadoReprogramarDia["movidas"] = [];
  for (const c of afectadas) {
    const r = await reprogramarCita(c.id, nueva, "empresa", actor);
    if (r.ok) movidas.push({ procesoId: c.proceso_id, nombre: c.nombre, fecha: nueva.fecha, hora: nueva.hora, envio: r.envio, texto: r.texto });
  }
  return { ok: true, movidas };
}
