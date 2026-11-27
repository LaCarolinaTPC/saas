/**
 * Correo para la prueba psicosensotécnica (24-nov-2026): pedirlo por
 * WhatsApp, atender lo que responde el aspirante, enviar el correo con el
 * enlace para confirmarlo, recordarlo y marcar la inscripción en la
 * plataforma. Solo servidor; quien llama desde una pantalla revisa permisos.
 * Reglas puras en ./correo-psico.
 */
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import { enviarBotones, enviarTexto } from "@/lib/comunicaciones/whatsapp";
import { registrarSaliente } from "@/lib/comunicaciones/registro";
import { enHorario } from "@/lib/comunicaciones/seguimiento";
import { leerConfigSeguimiento } from "@/lib/comunicaciones/seguimiento-ejecutar";
import { correoConfigurado, enviarCorreo } from "@/lib/correo/enviar";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import { avisarProceso, type EnvioAgenda } from "./agenda-servidor";
import { FIRMA_SELECCION } from "./envio";
import { primerNombre as primerNombreMensaje, renderizarMensaje } from "./mensajes";
import { leerAjustes, leerMensaje, valorAjuste } from "./servidor";
import {
  BOTONES_CONFIRMAR,
  DIAS_VIGENCIA_ENLACE,
  ESTADOS_PROCESO_CORREO,
  accionCron,
  ajustesCorreo,
  correoValido,
  decidirEntrante,
  enlaceVencido,
  mensajeRecordatorio,
  type AjustesCorreo,
  type EstadoCorreo,
} from "./correo-psico";

type Resultado = { ok: true; aviso?: string } | { ok: false; error: string };

const ACTOR_WHATSAPP: ActorProceso = { tipo: "sistema", userId: null, userEmail: "WhatsApp" };

const SIN_MIGRACION = "Falta aplicar la migración del correo de la psicosensotécnica.";

const COLUMNAS =
  "id, nombre, celular, origen, estado, candidate_id, correo, correo_estado, correo_token_vence, correo_pedido_at, correo_enviado_at, correo_validado_at, correo_validado_por, correo_inscrito_at, correo_inscrito_por, correo_recordatorio_at, correo_recordatorios, correo_escalado_at, correo_error";

export interface CorreoProceso {
  id: string;
  nombre: string | null;
  celular: string | null;
  origen: string | null;
  estado: string;
  candidate_id: string | null;
  correo: string | null;
  correo_estado: EstadoCorreo | null;
  correo_token_vence: string | null;
  correo_pedido_at: string | null;
  correo_enviado_at: string | null;
  correo_validado_at: string | null;
  correo_validado_por: string | null;
  correo_inscrito_at: string | null;
  correo_inscrito_por: string | null;
  correo_recordatorio_at: string | null;
  correo_recordatorios: number | null;
  correo_escalado_at: string | null;
  correo_error: string | null;
}

/** El correo del proceso. null si falta la migración o no existe. */
/** Cerrado o contratado: ya no se le pide ni se le envía nada (24-nov-2026). */
const procesoCerrado = (estado: string | null | undefined) => estado === "cierre" || estado === "contratado";
const PROCESO_CERRADO = "El proceso está cerrado o contratado: ya no se le envían mensajes.";

export async function correoDeProceso(procesoId: string): Promise<CorreoProceso | null> {
  const { data, error } = await createAdminClient().from("procesos_contratacion").select(COLUMNAS).eq("id", procesoId).maybeSingle();
  if (error || !data) return null;
  return data as unknown as CorreoProceso;
}

export async function leerAjustesCorreo(): Promise<AjustesCorreo> {
  const ajustes = await leerAjustes().catch(() => []);
  return ajustesCorreo((clave) => valorAjuste<unknown>(ajustes, clave, undefined));
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Dónde abre el enlace del correo: la URL pública de Gestivo (en desarrollo, la máquina local). */
function urlBase(): string {
  const configurada = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configurada) return configurada.replace(/\/+$/, "");
  if (process.env.GESTIVO_ENTORNO === "desarrollo") return "http://localhost:3000";
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "https://saas-six-vert.vercel.app";
}

/** Mensaje del catálogo de Selección (exámenes, recordatorios…) al aspirante; la fecha no se usa. */
async function avisar(procesoId: string, clave: string, extra: Record<string, string> = {}): Promise<EnvioAgenda> {
  const hoy = fechaBogota(new Date().toISOString());
  const { envio } = await avisarProceso(procesoId, clave, { fecha: hoy, hora: "08:00" }, { directo: false, extra });
  return envio;
}

/** No salió y hay que intentarlo en la próxima vuelta (plantilla sin aprobar o falta un dato). */
const reintentar = (e: EnvioAgenda) => e === "sin_plantilla" || e === "falta_dato" || e === "sin_catalogo";

// ── Pedir el correo ──────────────────────────────────────────────────────────

/**
 * Le pide el correo por WhatsApp y reinicia la cuenta de recordatorios. Lo
 * llaman el paso a exámenes, la revisión periódica y el botón de la ficha.
 */
export async function pedirCorreoPsico(procesoId: string, actor: ActorProceso): Promise<Resultado & { envio?: EnvioAgenda }> {
  const p = await correoDeProceso(procesoId);
  if (!p) return { ok: false, error: SIN_MIGRACION };
  if (procesoCerrado(p.estado)) return { ok: false, error: PROCESO_CERRADO };
  if (p.correo_estado === "validado" || p.correo_estado === "inscrito") return { ok: false, error: "El correo ya está confirmado." };
  const db = createAdminClient();
  const ahora = new Date().toISOString();
  const antes = { correo_estado: p.correo_estado, correo_recordatorio_at: p.correo_recordatorio_at };
  await db
    .from("procesos_contratacion")
    .update({ correo_estado: "pedido", correo: null, correo_pedido_at: ahora, correo_recordatorio_at: ahora, correo_recordatorios: 0, correo_escalado_at: null, correo_error: null })
    .eq("id", procesoId);
  const envio = await avisar(procesoId, "pedir_correo");
  if (reintentar(envio) && !antes.correo_estado) {
    // Sin plantilla aprobada y fuera de las 24 horas: no salió. La revisión periódica lo vuelve a intentar.
    await db.from("procesos_contratacion").update({ correo_estado: null, correo_recordatorio_at: null }).eq("id", procesoId);
  }
  await registrarEvento(procesoId, { tipo: "dato", detalle: { correo_psico: "pedido", envio } }, actor);
  return { ok: true, envio, aviso: textoEnvio(envio) };
}

function textoEnvio(e: EnvioAgenda): string | undefined {
  switch (e) {
    case "enviado":
      return "Se le pidió por WhatsApp.";
    case "prueba":
      return "Es del chat de prueba: no sale nada.";
    case "borrador":
      return "Quedó como borrador en la bandeja de WhatsApp para enviarlo a mano.";
    case "sin_plantilla":
      return "No salió: pasaron más de 24 horas desde su último mensaje y el mensaje no tiene plantilla aprobada en Meta.";
    case "falta_dato":
      return "No salió: le falta un dato a la plantilla.";
    case "sin_conversacion":
      return "No salió: el proceso no tiene celular ni conversación de WhatsApp.";
    case "sin_catalogo":
      return "No salió: falta el mensaje «pedir_correo» en Selección › Mensajes.";
    default:
      return "No salió: falló el envío por WhatsApp.";
  }
}

// ── Lo que responde el aspirante ─────────────────────────────────────────────

/** Texto del catálogo; si falta la fila, el de respaldo. */
async function textoCatalogo(clave: string, valores: Record<string, string>, respaldo: string): Promise<string> {
  const m = await leerMensaje(clave).catch(() => null);
  return renderizarMensaje(m?.texto?.trim() ? m.texto : respaldo, valores);
}

const RESPALDO = {
  correo_confirmar: "¿Tu correo es {correo}? Revísalo bien, por favor: allí te llegará la información para la prueba psicosensotécnica.",
  correo_enviado: "Listo. Te enviamos un correo a {correo}. Ábrelo y toca «Sí, es mi correo» para confirmarlo. Si no lo ves, revisa la carpeta de spam o correo no deseado.",
  correo_corregir: "Está bien. Escríbenos tu correo electrónico correcto, por favor.",
  correo_no_enviado: "Gracias. Tuvimos un problema al enviarte el correo; Gestión Humana lo revisa y te escribimos.",
};

/**
 * Atiende un mensaje del aspirante si tiene que ver con el correo: un correo
 * escrito, o el sí o el no a «¿Tu correo es …?». true = lo atendió (el
 * asistente de IA no responde ese mensaje). Lo llama el webhook de WhatsApp.
 */
export async function procesarCorreoPsico(conversacionId: string, mensajeId: string | null): Promise<boolean> {
  if (!mensajeId) return false;
  const db = createAdminClient();
  const [{ data: conv }, { data: msg }] = await Promise.all([
    db.from("wa_conversaciones").select("id, proceso_id, wa_contactos(telefono, tipo)").eq("id", conversacionId).maybeSingle(),
    db.from("wa_mensajes").select("contenido, direccion").eq("id", mensajeId).maybeSingle(),
  ]);
  if (!conv?.proceso_id || msg?.direccion !== "entrante") return false;
  const contacto = (Array.isArray(conv.wa_contactos) ? conv.wa_contactos[0] : conv.wa_contactos) as { telefono?: string; tipo?: string } | null;
  if (!contacto?.telefono || contacto.tipo === "laboratorio") return false;
  const p = await correoDeProceso(conv.proceso_id as string);
  if (!p || !(ESTADOS_PROCESO_CORREO as readonly string[]).includes(p.estado)) return false;

  const accion = decidirEntrante(p.correo_estado, msg.contenido as string | null);
  if (accion.tipo === "nada") return false;

  const telefono = contacto.telefono;
  const nombre = primerNombre(p.nombre);
  const responder = async (texto: string, botones?: readonly string[]) => {
    const envio = botones ? await enviarBotones(telefono, texto, [...botones]) : await enviarTexto(telefono, texto);
    await registrarSaliente(conversacionId, envio, { contenido: texto }, FIRMA_SELECCION, { automatico: true });
  };
  const ahora = new Date().toISOString();

  if (accion.tipo === "preguntar") {
    await db
      .from("procesos_contratacion")
      .update({ correo: accion.correo, correo_estado: "por_confirmar", correo_error: null, correo_recordatorio_at: ahora, correo_escalado_at: null })
      .eq("id", p.id);
    await registrarEvento(p.id, { tipo: "dato", detalle: { correo_psico: "escrito", correo: accion.correo } }, ACTOR_WHATSAPP);
    await responder(await textoCatalogo("correo_confirmar", { nombre, correo: accion.correo }, RESPALDO.correo_confirmar), BOTONES_CONFIRMAR);
    return true;
  }
  if (accion.tipo === "corregir") {
    await db.from("procesos_contratacion").update({ correo: null, correo_estado: "pedido", correo_recordatorio_at: ahora }).eq("id", p.id);
    await responder(await textoCatalogo("correo_corregir", { nombre }, RESPALDO.correo_corregir));
    return true;
  }
  // Dijo que sí: el correo con el enlace.
  const r = await enviarCorreoValidacion(p.id, ACTOR_WHATSAPP);
  if (r.ok) {
    await responder(await textoCatalogo("correo_enviado", { nombre, correo: p.correo ?? "" }, RESPALDO.correo_enviado));
  } else {
    await db.from("wa_conversaciones").update({ requiere_humano: true }).eq("id", conversacionId);
    await responder(await textoCatalogo("correo_no_enviado", { nombre }, RESPALDO.correo_no_enviado));
  }
  return true;
}

function primerNombre(nombre: string | null): string {
  return !nombre || nombre === "POR CONFIRMAR" ? "" : primerNombreMensaje(nombre);
}

// ── El correo con el enlace ──────────────────────────────────────────────────

function cuerpoCorreo(nombre: string, url: string, empresa: string) {
  const saludo = nombre ? `Hola, ${nombre}:` : "Hola:";
  const texto = [
    saludo,
    "",
    `Para continuar con tu proceso de selección en ${empresa} necesitamos confirmar que este es tu correo. Aquí te llegará la información para presentar la prueba psicosensotécnica.`,
    "",
    "Abre este enlace y toca «Sí, es mi correo»:",
    url,
    "",
    `El enlace vale ${DIAS_VIGENCIA_ENLACE} días. Si no estás en un proceso de selección con nosotros, ignora este mensaje.`,
  ].join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0f172a;max-width:520px">
<p>${esc(saludo)}</p>
<p>Para continuar con tu proceso de selección en ${esc(empresa)} necesitamos confirmar que este es tu correo. Aquí te llegará la información para presentar la prueba psicosensotécnica.</p>
<p style="margin:24px 0"><a href="${esc(url)}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:bold">Confirmar mi correo</a></p>
<p style="font-size:13px;color:#64748b">Si el botón no abre, copia este enlace en el navegador:<br>${esc(url)}</p>
<p style="font-size:13px;color:#64748b">El enlace vale ${DIAS_VIGENCIA_ENLACE} días. Si no estás en un proceso de selección con nosotros, ignora este mensaje.</p>
</div>`;
  return { texto, html };
}

/** Envía (o reenvía) el correo con el enlace para confirmar. Deja el estado en «enviado». */
export async function enviarCorreoValidacion(procesoId: string, actor: ActorProceso): Promise<Resultado> {
  const p = await correoDeProceso(procesoId);
  if (!p) return { ok: false, error: SIN_MIGRACION };
  if (procesoCerrado(p.estado)) return { ok: false, error: PROCESO_CERRADO };
  if (!p.correo || !correoValido(p.correo)) return { ok: false, error: "No hay un correo bien escrito para enviar." };
  if (p.correo_estado === "validado" || p.correo_estado === "inscrito") return { ok: false, error: "El correo ya está confirmado." };
  if (!correoConfigurado()) {
    await createAdminClient().from("procesos_contratacion").update({ correo_error: "El envío de correos no está configurado (SMTP)." }).eq("id", procesoId);
    return { ok: false, error: "El envío de correos no está configurado (SMTP): no se pudo enviar." };
  }
  const token = randomBytes(24).toString("base64url");
  const vence = new Date(Date.now() + DIAS_VIGENCIA_ENLACE * 86_400_000).toISOString();
  const ahora = new Date().toISOString();
  const db = createAdminClient();
  const anterior = p.correo_estado;
  // Primero el enlace y el estado: el aspirante puede abrir el correo apenas llega.
  const { error } = await db
    .from("procesos_contratacion")
    .update({
      correo_estado: "enviado",
      correo_token_hash: hashToken(token),
      correo_token_vence: vence,
      correo_enviado_at: ahora,
      correo_error: null,
      // Los recordatorios cuentan de nuevo para confirmar.
      correo_recordatorio_at: ahora,
      correo_recordatorios: 0,
      correo_escalado_at: null,
    })
    .eq("id", procesoId);
  if (error) return { ok: false, error: SIN_MIGRACION };

  const ajustes = await leerAjustes().catch(() => []);
  const empresa = String(valorAjuste<unknown>(ajustes, "empresa_razon_social", "") || "").trim() || "Transportes La Carolina";
  const { texto, html } = cuerpoCorreo(primerNombre(p.nombre), `${urlBase()}/validar-correo/${token}`, empresa);
  // Sale también en desarrollo: se prueba con correos de verdad (las órdenes a los laboratorios no).
  const r = await enviarCorreo({ para: [p.correo], asunto: `Confirma tu correo · ${empresa}`, texto, html, salirEnDesarrollo: true });
  if (!r.ok) {
    await db
      .from("procesos_contratacion")
      .update({ correo_estado: anterior === "enviado" ? "enviado" : "por_confirmar", correo_token_hash: null, correo_error: r.error.slice(0, 300) })
      .eq("id", procesoId);
    await registrarEvento(procesoId, { tipo: "dato", detalle: { correo_psico: "no_enviado", correo: p.correo, error: r.error.slice(0, 200) } }, actor);
    return { ok: false, error: `No se pudo enviar el correo: ${r.error}` };
  }
  await registrarEvento(procesoId, { tipo: "dato", detalle: { correo_psico: "enviado", correo: p.correo } }, actor);
  return { ok: true };
}

// ── El enlace (página pública) ───────────────────────────────────────────────

export type EstadoEnlace = "pendiente" | "validado" | "corregir" | "vencido" | "no_existe";

/** Lo que muestra la página del enlace: el correo y si todavía se puede responder. */
export async function leerEnlace(token: string): Promise<{ estado: EstadoEnlace; correo?: string; nombre?: string }> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { estado: "no_existe" };
  const { data } = await createAdminClient()
    .from("procesos_contratacion")
    .select("nombre, correo, correo_estado, correo_token_vence")
    .eq("correo_token_hash", hashToken(token))
    .maybeSingle();
  if (!data) return { estado: "no_existe" };
  const base = { correo: (data.correo as string | null) ?? undefined, nombre: primerNombre(data.nombre as string | null) };
  if (data.correo_estado === "validado" || data.correo_estado === "inscrito") return { estado: "validado", ...base };
  if (data.correo_estado !== "enviado") return { estado: "no_existe" };
  if (enlaceVencido(data.correo_token_vence as string | null, new Date())) return { estado: "vencido", ...base };
  return { estado: "pendiente", ...base };
}

/**
 * La respuesta del aspirante en la página del enlace. «Sí»: el correo queda
 * confirmado (y pasa a la ficha del candidato). «No»: se le vuelve a pedir por WhatsApp.
 */
export async function responderEnlace(token: string, respuesta: "si" | "no"): Promise<{ estado: EstadoEnlace }> {
  const vista = await leerEnlace(token);
  if (vista.estado !== "pendiente") return { estado: vista.estado };
  const db = createAdminClient();
  const { data: p } = await db
    .from("procesos_contratacion")
    .select("id, candidate_id, correo, estado")
    .eq("correo_token_hash", hashToken(token))
    .eq("correo_estado", "enviado")
    .maybeSingle();
  if (!p) return { estado: "no_existe" };
  const ahora = new Date().toISOString();
  const actor: ActorProceso = { tipo: "sistema", userId: null, userEmail: "Enlace del correo" };
  // Cerrado o contratado (24-nov-2026): se guarda lo que respondió, pero ya no se le escribe.
  const cerrado = p.estado === "cierre" || p.estado === "contratado";
  if (respuesta === "si") {
    const { data: tomada } = await db
      .from("procesos_contratacion")
      .update({ correo_estado: "validado", correo_validado_at: ahora, correo_validado_por: "enlace", correo_token_hash: null })
      .eq("id", p.id)
      .eq("correo_estado", "enviado")
      .select("id");
    if (!tomada?.length) return { estado: "validado" };
    if (p.candidate_id && p.correo) await db.from("candidates").update({ email: p.correo }).eq("id", p.candidate_id);
    await registrarEvento(p.id as string, { tipo: "dato", detalle: { correo_psico: "validado", correo: p.correo } }, actor);
    if (!cerrado) await avisar(p.id as string, "correo_validado", { correo: (p.correo as string) ?? "" }).catch(() => undefined);
    return { estado: "validado" };
  }
  await db
    .from("procesos_contratacion")
    .update({ correo_estado: "pedido", correo: null, correo_token_hash: null, correo_recordatorio_at: ahora, correo_recordatorios: 0, correo_escalado_at: null })
    .eq("id", p.id)
    .eq("correo_estado", "enviado");
  await registrarEvento(p.id as string, { tipo: "dato", detalle: { correo_psico: "rechazado_en_enlace", correo: p.correo } }, actor);
  if (!cerrado) await avisar(p.id as string, "correo_corregir").catch(() => undefined);
  return { estado: "corregir" };
}

// ── Desde la ficha (Gestión Humana) ──────────────────────────────────────────

/**
 * Gestión Humana escribe el correo. `confirmado`: lo confirmó con el aspirante
 * (por teléfono, en persona) y queda validado; si no, se le envía el enlace.
 */
export async function escribirCorreoPsico(procesoId: string, correo: string, confirmado: boolean, actor: ActorProceso): Promise<Resultado> {
  const c = String(correo ?? "").trim().toLowerCase();
  if (!correoValido(c)) return { ok: false, error: "Escriba un correo válido (por ejemplo, nombre@gmail.com)." };
  const p = await correoDeProceso(procesoId);
  if (!p) return { ok: false, error: SIN_MIGRACION };
  if (procesoCerrado(p.estado)) return { ok: false, error: PROCESO_CERRADO };
  const db = createAdminClient();
  const ahora = new Date().toISOString();
  if (confirmado) {
    await db
      .from("procesos_contratacion")
      .update({ correo: c, correo_estado: "validado", correo_validado_at: ahora, correo_validado_por: actor.userEmail ?? "Gestión Humana", correo_token_hash: null, correo_error: null })
      .eq("id", procesoId);
    if (p.candidate_id) await db.from("candidates").update({ email: c }).eq("id", p.candidate_id);
    await registrarEvento(procesoId, { tipo: "dato", detalle: { correo_psico: "validado_a_mano", correo: c } }, actor);
    return { ok: true };
  }
  await db.from("procesos_contratacion").update({ correo: c, correo_estado: "por_confirmar", correo_error: null }).eq("id", procesoId);
  return enviarCorreoValidacion(procesoId, actor);
}

/**
 * Gestión Humana ya lo inscribió en la plataforma: se le avisa por WhatsApp
 * que le llega la información por correo para presentar la prueba.
 */
export async function marcarInscritoPsico(procesoId: string, actor: ActorProceso): Promise<Resultado & { envio?: EnvioAgenda }> {
  const p = await correoDeProceso(procesoId);
  if (!p) return { ok: false, error: SIN_MIGRACION };
  if (procesoCerrado(p.estado)) return { ok: false, error: PROCESO_CERRADO };
  if (p.correo_estado !== "validado" || !p.correo) return { ok: false, error: "Primero tiene que estar confirmado el correo." };
  const db = createAdminClient();
  const { data: tomada } = await db
    .from("procesos_contratacion")
    .update({ correo_estado: "inscrito", correo_inscrito_at: new Date().toISOString(), correo_inscrito_por: actor.userEmail ?? null })
    .eq("id", procesoId)
    .eq("correo_estado", "validado")
    .select("id");
  if (!tomada?.length) return { ok: false, error: "Alguien más ya lo marcó." };
  const envio = await avisar(procesoId, "psico_inscrito", { correo: p.correo });
  await registrarEvento(procesoId, { tipo: "dato", detalle: { correo_psico: "inscrito", correo: p.correo, envio } }, actor);
  const aviso = envio === "enviado" ? "Se le avisó por WhatsApp que le llega la información por correo." : textoEnvio(envio);
  return { ok: true, envio, aviso };
}

/** Vuelve a «confirmado» si se marcó inscrito por error (no envía nada). */
export async function deshacerInscritoPsico(procesoId: string, actor: ActorProceso): Promise<Resultado> {
  const { data } = await createAdminClient()
    .from("procesos_contratacion")
    .update({ correo_estado: "validado", correo_inscrito_at: null, correo_inscrito_por: null })
    .eq("id", procesoId)
    .eq("correo_estado", "inscrito")
    .select("id");
  if (!data?.length) return { ok: false, error: "No estaba marcado como inscrito." };
  await registrarEvento(procesoId, { tipo: "dato", detalle: { correo_psico: "inscripcion_deshecha" } }, actor);
  return { ok: true };
}

// ── Revisión periódica (cron) ────────────────────────────────────────────────

const ACTOR_SISTEMA: ActorProceso = { tipo: "sistema", userId: null, userEmail: "Sistema" };
const MAX_POR_VUELTA = 40;

/**
 * Pide el correo a quien llegó a la fase 1 y no se le ha pedido, recuerda a
 * quien no lo ha escrito o confirmado, y agotados los recordatorios deja el
 * chat para una persona. Dentro del horario de los recordatorios de WhatsApp.
 */
export async function ejecutarCorreosPsico(ahora = new Date(), opciones: { soloProcesos?: string[] } = {}): Promise<{ pedidos: number; recordatorios: number; escalados: number }> {
  const r = { pedidos: 0, recordatorios: 0, escalados: 0 };
  const a = await leerAjustesCorreo();
  if (!a.activo) return r;
  const { config } = await leerConfigSeguimiento();
  if (!enHorario(ahora, config.horaDesde, config.horaHasta)) return r;
  const db = createAdminClient();
  let consulta = db
    .from("procesos_contratacion")
    .select(COLUMNAS)
    .in("estado", [...ESTADOS_PROCESO_CORREO])
    .or("correo_estado.is.null,correo_estado.in.(pedido,por_confirmar,enviado)")
    .order("updated_at", { ascending: true })
    .limit(300);
  // Simulador del cron en el chat de prueba: solo esos procesos.
  if (opciones.soloProcesos) consulta = consulta.in("id", opciones.soloProcesos.length ? opciones.soloProcesos : ["00000000-0000-0000-0000-000000000000"]);
  const { data, error } = await consulta;
  if (error) return r;
  let hechos = 0;
  for (const p of (data ?? []) as unknown as CorreoProceso[]) {
    if (hechos >= MAX_POR_VUELTA) break;
    const accion = accionCron(p, a, ahora);
    if (!accion) continue;
    hechos++;
    const marca = ahora.toISOString();
    if (accion === "pedir") {
      // Primero la respuesta del banco (fase 1): una pregunta a la vez, hasta 24 horas.
      const { esperandoBanco } = await import("./respuestas-examenes-servidor");
      if (await esperandoBanco(p.id, ahora).catch(() => false)) {
        hechos--;
        continue;
      }
      const { data: tomada } = await db
        .from("procesos_contratacion")
        .update({ correo_estado: "pedido", correo_pedido_at: marca, correo_recordatorio_at: marca, correo_recordatorios: 0 })
        .eq("id", p.id)
        .is("correo_estado", null)
        .select("id");
      if (!tomada?.length) continue;
      const envio = await avisar(p.id, "pedir_correo");
      if (reintentar(envio)) {
        await db.from("procesos_contratacion").update({ correo_estado: null, correo_recordatorio_at: null }).eq("id", p.id).eq("correo_estado", "pedido");
        continue;
      }
      await registrarEvento(p.id, { tipo: "dato", detalle: { correo_psico: "pedido", envio } }, ACTOR_SISTEMA);
      r.pedidos++;
    } else if (accion === "recordar") {
      const consulta = db
        .from("procesos_contratacion")
        .update({ correo_recordatorio_at: marca, correo_recordatorios: (p.correo_recordatorios ?? 0) + 1 })
        .eq("id", p.id);
      const { data: tomada } = await (p.correo_recordatorio_at ? consulta.eq("correo_recordatorio_at", p.correo_recordatorio_at) : consulta.is("correo_recordatorio_at", null)).select("id");
      if (!tomada?.length) continue;
      const clave = mensajeRecordatorio(p.correo_estado);
      const envio = await avisar(p.id, clave, { correo: p.correo ?? "" });
      if (reintentar(envio)) {
        await db
          .from("procesos_contratacion")
          .update({ correo_recordatorio_at: p.correo_recordatorio_at, correo_recordatorios: p.correo_recordatorios ?? 0 })
          .eq("id", p.id)
          .eq("correo_recordatorio_at", marca);
        continue;
      }
      await registrarEvento(p.id, { tipo: "dato", detalle: { correo_psico: "recordatorio", vez: (p.correo_recordatorios ?? 0) + 1, envio } }, ACTOR_SISTEMA);
      r.recordatorios++;
    } else {
      const { data: tomada } = await db.from("procesos_contratacion").update({ correo_escalado_at: marca }).eq("id", p.id).is("correo_escalado_at", null).select("id");
      if (!tomada?.length) continue;
      await db.from("wa_conversaciones").update({ requiere_humano: true }).eq("proceso_id", p.id);
      await registrarEvento(p.id, { tipo: "dato", detalle: { correo_psico: "sin_respuesta" } }, ACTOR_SISTEMA);
      r.escalados++;
    }
  }
  return r;
}

// ── Para el asistente de IA ──────────────────────────────────────────────────

/** Estado del correo para que el asistente sepa qué se le pidió. null si no aplica. */
export async function correoParaAsistente(conversacionId: string): Promise<{ estado: EstadoCorreo; correo: string | null } | null> {
  const db = createAdminClient();
  const { data: conv } = await db.from("wa_conversaciones").select("proceso_id").eq("id", conversacionId).maybeSingle();
  if (!conv?.proceso_id) return null;
  return correoParaAsistenteDeProceso(conv.proceso_id as string);
}

/** Lo mismo a partir del proceso (el chat de prueba no tiene conversación). */
export async function correoParaAsistenteDeProceso(procesoId: string): Promise<{ estado: EstadoCorreo; correo: string | null } | null> {
  const p = await correoDeProceso(procesoId);
  if (!p?.correo_estado || !(ESTADOS_PROCESO_CORREO as readonly string[]).includes(p.estado)) return null;
  return { estado: p.correo_estado, correo: p.correo };
}
