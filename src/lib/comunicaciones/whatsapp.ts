/**
 * Cliente de la WhatsApp Business Cloud API (Meta) — portado de Varylo y
 * recortado a uso interno: un solo número de la empresa.
 *
 * Las credenciales se registran desde Comunicaciones → Configuración y viven
 * en la tabla wa_canal (secretos cifrados); las variables de entorno
 * WHATSAPP_* / META_APP_SECRET quedan como respaldo si la tabla está vacía.
 */
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { descifrar } from "./cifrado";

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * En desarrollo (GESTIVO_ENTORNO=desarrollo) la base es copia de producción:
 * trae el canal real y los teléfonos de aspirantes y laboratorios reales. Ahí
 * ningún WhatsApp sale de verdad (23-nov-2026): los envíos se dan por hechos
 * con un id «simulado-…», quedan en el chat de Gestivo como cualquier otro y el
 * flujo sigue igual. Las lecturas (descargar medios, listar plantillas) no cambian.
 */
export function whatsappSimulado(entorno: string | undefined = process.env.GESTIVO_ENTORNO): boolean {
  return entorno?.trim().toLowerCase() === "desarrollo";
}

/** Prefijo del id de los mensajes que no salieron (desarrollo). */
export const PREFIJO_WAMID_SIMULADO = "simulado-";

export interface CanalConfig {
  token: string;
  phoneNumberId: string;
  wabaId: string | null;
  appSecret: string | null;
  verifyToken: string | null;
  numeroMostrado: string | null;
  origen: "db" | "env";
}

export async function getCanal(): Promise<CanalConfig | null> {
  const db = createAdminClient();
  const { data } = await db.from("wa_canal").select("*").eq("id", 1).maybeSingle();
  if (data?.access_token && data?.phone_number_id) {
    return {
      token: descifrar(data.access_token as string),
      phoneNumberId: data.phone_number_id as string,
      wabaId: (data.waba_id as string) ?? null,
      appSecret: data.app_secret ? descifrar(data.app_secret as string) : null,
      verifyToken: (data.verify_token as string) ?? null,
      numeroMostrado: (data.numero_mostrado as string) ?? null,
      origen: "db",
    };
  }
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (token && phoneNumberId) {
    return {
      token,
      phoneNumberId,
      wabaId: process.env.WHATSAPP_WABA_ID ?? null,
      appSecret: process.env.META_APP_SECRET ?? null,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? null,
      numeroMostrado: null,
      origen: "env",
    };
  }
  return null;
}

async function getCanalObligatorio(): Promise<CanalConfig> {
  const canal = await getCanal();
  if (!canal) {
    throw new Error("El canal de WhatsApp no está configurado (Comunicaciones → Configuración).");
  }
  return canal;
}

export interface EnvioResultado {
  ok: boolean;
  wamid?: string;
  errorCodigo?: number;
  errorMensaje?: string;
}

/** Envía un mensaje de texto libre (requiere ventana de 24h abierta). */
export async function enviarTexto(telefono: string, texto: string): Promise<EnvioResultado> {
  return postMensaje({ to: telefono, type: "text", text: { preview_url: true, body: texto } });
}

/** Topes de Meta para un mensaje con botones de respuesta. */
export const MAX_CUERPO_BOTONES = 1024;
const MAX_TITULO_BOTON = 20;
const MAX_BOTONES = 3;

/** Cuerpo del mensaje interactivo con botones de respuesta (puro, para probarlo). */
export function cuerpoBotones(telefono: string, texto: string, botones: string[]): Record<string, unknown> {
  return {
    to: telefono,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: texto.slice(0, MAX_CUERPO_BOTONES) },
      action: {
        buttons: botones.slice(0, MAX_BOTONES).map((titulo, i) => ({
          type: "reply",
          reply: { id: `opcion_${i + 1}`, title: titulo.slice(0, MAX_TITULO_BOTON) },
        })),
      },
    },
  };
}

/**
 * Envía un texto con botones de respuesta (hasta 3). Como el texto libre,
 * requiere la ventana de 24 h abierta y no necesita plantilla aprobada. Lo que
 * la persona toca llega al webhook como texto (el título del botón).
 */
export async function enviarBotones(telefono: string, texto: string, botones: string[]): Promise<EnvioResultado> {
  return postMensaje(cuerpoBotones(telefono, texto, botones));
}

async function postMensaje(payload: Record<string, unknown>): Promise<EnvioResultado> {
  if (whatsappSimulado()) {
    // Los números de la lista de prueba (Tiempos y reglas › Entorno de pruebas) sí reciben (24-nov-2026),
    // y lo que se envía por un candidato del chat de prueba también (27-nov-2026: pruebas más reales).
    const { whatsappDePruebaPermitido, envioRealDePrueba } = await import("@/lib/entorno-pruebas");
    if (!envioRealDePrueba() && !(await whatsappDePruebaPermitido(String(payload.to ?? "")))) {
      console.info(`[whatsapp] desarrollo: no sale (simulado) · ${String(payload.type ?? "mensaje")} a ${String(payload.to ?? "?")}`);
      return { ok: true, wamid: `${PREFIJO_WAMID_SIMULADO}${randomUUID()}` };
    }
    console.info(`[whatsapp] desarrollo: sale de verdad al número de prueba ${String(payload.to)}`);
  }
  const { token, phoneNumberId } = await getCanalObligatorio();
  // Con tope de tiempo (27-nov-2026), como las demás llamadas a Meta: sin él, un Meta lento dejaba
  // colgada la acción que enviaba (p. ej. «Lo revisé a mano» con anotación tardaba un montón).
  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    const tiempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ok: false, errorMensaje: tiempo ? "Meta no respondió a tiempo (20 s)." : e instanceof Error ? e.message : String(e) };
  }
  const j = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { code?: number; message?: string };
  };
  if (!res.ok || !j.messages?.[0]?.id) {
    return {
      ok: false,
      errorCodigo: j.error?.code,
      errorMensaje: j.error?.message ?? `HTTP ${res.status}`,
    };
  }
  return { ok: true, wamid: j.messages[0].id };
}

export type MedioTipo = "image" | "video" | "audio" | "document" | "sticker";

/**
 * Envía un adjunto ya subido a Meta (id del endpoint /media). Requiere
 * ventana de 24h abierta, igual que el texto libre.
 */
export async function enviarMedio(
  telefono: string,
  medio: { mediaId: string; tipo: MedioTipo; caption?: string; nombreArchivo?: string }
): Promise<EnvioResultado> {
  const caption = medio.caption?.trim() || undefined;
  const cuerpo: Record<string, unknown> =
    medio.tipo === "image" || medio.tipo === "video"
      ? { id: medio.mediaId, caption }
      : medio.tipo === "document"
        ? { id: medio.mediaId, caption, filename: medio.nombreArchivo ?? "documento" }
        : { id: medio.mediaId };
  return postMensaje({ to: telefono, type: medio.tipo, [medio.tipo]: cuerpo });
}

/** Sube un archivo a Meta para enviarlo después por id (caduca a los 30 días). */
export async function subirMedioAMeta(
  archivo: Buffer,
  mimeType: string,
  nombreArchivo: string
): Promise<{ ok: true; mediaId: string } | { ok: false; error: string }> {
  // En desarrollo el archivo no se sube a Meta: el envío que sigue también es simulado.
  if (whatsappSimulado()) return { ok: true, mediaId: `${PREFIJO_WAMID_SIMULADO}${randomUUID()}` };
  const { token, phoneNumberId } = await getCanalObligatorio();
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", new Blob([new Uint8Array(archivo)], { type: mimeType }), nombreArchivo);
  const res = await fetch(`${GRAPH}/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const j = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok || !j.id) return { ok: false, error: j.error?.message ?? `HTTP ${res.status}` };
  return { ok: true, mediaId: j.id };
}

/**
 * Descarga un medio recibido por webhook: primero se pide la URL temporal del
 * CDN (vale ~5 min) y luego el binario, ambos con el token del canal.
 */
export async function descargarMedioDeMeta(
  mediaId: string
): Promise<{ archivo: Buffer; mimeType: string; nombreArchivo: string | null } | null> {
  try {
    const { token } = await getCanalObligatorio();
    const meta = await fetch(`${GRAPH}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!meta.ok) return null;
    const info = (await meta.json()) as { url?: string; mime_type?: string; filename?: string };
    if (!info.url) return null;
    const bin = await fetch(info.url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!bin.ok) return null;
    return {
      archivo: Buffer.from(await bin.arrayBuffer()),
      mimeType: info.mime_type ?? bin.headers.get("content-type") ?? "application/octet-stream",
      nombreArchivo: info.filename ?? null,
    };
  } catch (e) {
    console.error("descargarMedioDeMeta:", e);
    return null;
  }
}

// ── Plantillas ──────────────────────────────────────────────────────────────

export interface PlantillaComponente {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
  text?: string;
  buttons?: { type: string; text: string; url?: string }[];
}

export interface Plantilla {
  id: string;
  nombre: string;
  idioma: string;
  categoria: string;
  estado: string;
  componentes: PlantillaComponente[];
}

/**
 * Plantillas aprobadas del WABA. Meta exige plantilla para escribir fuera de
 * la ventana de 24h; las crea y aprueba el administrador en el Business Manager.
 */
export async function listarPlantillas(): Promise<
  { ok: true; plantillas: Plantilla[] } | { ok: false; error: string }
> {
  const { token, wabaId } = await getCanalObligatorio();
  if (!wabaId) {
    return {
      ok: false,
      error: "Falta el WABA ID en Comunicaciones → Configurar canal; sin él no se pueden leer las plantillas.",
    };
  }
  const res = await fetch(
    `${GRAPH}/${wabaId}/message_templates?limit=100&fields=id,name,language,status,category,components`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10000) }
  );
  const j = (await res.json().catch(() => ({}))) as {
    data?: {
      id: string; name: string; language: string; status: string; category: string;
      components?: PlantillaComponente[];
    }[];
    error?: { message?: string };
  };
  if (!res.ok) return { ok: false, error: j.error?.message ?? `HTTP ${res.status}` };
  const plantillas = (j.data ?? [])
    .filter((t) => t.status === "APPROVED")
    .map((t) => ({
      id: t.id,
      nombre: t.name,
      idioma: t.language,
      categoria: t.category,
      estado: t.status,
      componentes: t.components ?? [],
    }));
  return { ok: true, plantillas };
}

export interface EstadoPlantilla {
  nombre: string;
  idioma: string;
  estado: string;
  categoria: string;
  /** Texto del cuerpo, con {{1}}, {{2}}… */
  cuerpo: string;
  /** Texto de los botones, tal como los tiene Meta. */
  botones: string[];
}

/** Todas las plantillas del WABA con su estado (APPROVED, PENDING, REJECTED…), para el catálogo de selección. */
export async function listarEstadosPlantillas(): Promise<{ ok: true; plantillas: EstadoPlantilla[] } | { ok: false; error: string }> {
  const { token, wabaId } = await getCanalObligatorio();
  if (!wabaId) return { ok: false, error: "Falta el WABA ID en Comunicaciones → Configurar canal." };
  const plantillas: EstadoPlantilla[] = [];
  let url: string | null = `${GRAPH}/${wabaId}/message_templates?limit=200&fields=name,language,status,category,components`;
  // Meta pagina la lista; se recorren a lo sumo 5 páginas (1000 plantillas).
  for (let pagina = 0; url && pagina < 5; pagina++) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    const j = (await res.json().catch(() => ({}))) as {
      data?: { name: string; language: string; status: string; category: string; components?: PlantillaComponente[] }[];
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (!res.ok) return { ok: false, error: j.error?.message ?? `HTTP ${res.status}` };
    for (const t of j.data ?? []) {
      plantillas.push({
        nombre: t.name,
        idioma: t.language,
        estado: t.status,
        categoria: t.category,
        cuerpo: t.components?.find((c) => c.type === "BODY")?.text ?? "",
        botones: (t.components?.find((c) => c.type === "BUTTONS")?.buttons ?? []).map((b) => b.text),
      });
    }
    url = j.paging?.next ?? null;
  }
  return { ok: true, plantillas };
}

/**
 * Envía una plantilla nueva a aprobación de Meta (N3). El cuerpo va con
 * {{1}}, {{2}}… y un ejemplo por variable; los botones son de respuesta rápida.
 */
export async function crearPlantilla(def: {
  nombre: string;
  categoria: "UTILITY" | "MARKETING";
  cuerpo: string;
  ejemplos: string[];
  botones?: string[];
  idioma?: string;
}): Promise<{ ok: true; id: string; estado: string } | { ok: false; error: string }> {
  // Crearla en desarrollo la mandaría a aprobación en la cuenta real de Meta.
  if (whatsappSimulado()) return { ok: false, error: "En desarrollo no se envían plantillas a aprobación de Meta: créela desde producción." };
  const { token, wabaId } = await getCanalObligatorio();
  if (!wabaId) return { ok: false, error: "Falta el WABA ID en Comunicaciones → Configurar canal." };
  const components: unknown[] = [
    { type: "BODY", text: def.cuerpo, ...(def.ejemplos.length ? { example: { body_text: [def.ejemplos] } } : {}) },
  ];
  if (def.botones?.length) components.push({ type: "BUTTONS", buttons: def.botones.map((text) => ({ type: "QUICK_REPLY", text })) });
  const res = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: def.nombre, language: def.idioma ?? "es", category: def.categoria, components }),
    signal: AbortSignal.timeout(15000),
  });
  const j = (await res.json().catch(() => ({}))) as { id?: string; status?: string; error?: { message?: string; error_user_msg?: string } };
  if (!res.ok || !j.id) return { ok: false, error: j.error?.error_user_msg ?? j.error?.message ?? `HTTP ${res.status}` };
  return { ok: true, id: j.id, estado: j.status ?? "PENDING" };
}

/** Sustituye {{1}}, {{2}}… por los valores dados (para guardar el texto real). */
export function renderizarPlantilla(texto: string, valores: string[]): string {
  return texto.replace(/\{\{(\d+)\}\}/g, (_, n) => valores[Number(n) - 1] ?? "");
}

/** Número de variables {{n}} de un texto de plantilla. */
export function contarVariables(texto: string | undefined): number {
  if (!texto) return 0;
  let max = 0;
  for (const m of texto.matchAll(/\{\{(\d+)\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

/**
 * Envía una plantilla aprobada. Solo se soportan variables de texto en
 * encabezado y cuerpo (los encabezados con imagen o documento no).
 */
export async function enviarPlantilla(
  telefono: string,
  plantilla: { nombre: string; idioma: string; encabezado: string[]; cuerpo: string[] }
): Promise<EnvioResultado> {
  const components: unknown[] = [];
  if (plantilla.encabezado.length) {
    components.push({
      type: "header",
      parameters: plantilla.encabezado.map((text) => ({ type: "text", text })),
    });
  }
  if (plantilla.cuerpo.length) {
    components.push({
      type: "body",
      parameters: plantilla.cuerpo.map((text) => ({ type: "text", text })),
    });
  }
  return postMensaje({
    to: telefono,
    type: "template",
    template: {
      name: plantilla.nombre,
      language: { code: plantilla.idioma },
      ...(components.length ? { components } : {}),
    },
  });
}

/** Chulos azules: marca un mensaje entrante como leído (no crítico). */
export async function marcarLeido(wamid: string): Promise<void> {
  if (whatsappSimulado()) return;
  try {
    const { token, phoneNumberId } = await getCanalObligatorio();
    await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: wamid,
      }),
    });
  } catch {
    // No crítico: no bloquear la recepción si falla.
  }
}

/**
 * Valida unas credenciales contra Meta consultando el propio número.
 * Devuelve el número formateado y el nombre verificado si el token sirve.
 */
export async function probarCredenciales(
  token: string,
  phoneNumberId: string
): Promise<{ ok: boolean; numero?: string; nombre?: string; error?: string }> {
  try {
    const res = await fetch(
      `${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }
    );
    const j = (await res.json().catch(() => ({}))) as {
      display_phone_number?: string;
      verified_name?: string;
      error?: { message?: string };
    };
    if (!res.ok) return { ok: false, error: j.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, numero: j.display_phone_number, nombre: j.verified_name };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sin respuesta de Meta." };
  }
}

// ── Parsing del webhook ─────────────────────────────────────────────────────

export interface MensajeEntrante {
  wamid: string;
  telefono: string;       // del remitente, E.164 sin '+'
  nombre: string | null;  // profile.name
  timestamp: Date;
  contenido: string;
  mediaTipo: string | null;
  mediaId: string | null;
  mimeType: string | null;
  nombreArchivo: string | null;
}

export interface EstadoMensaje {
  wamid: string;
  estado: string;          // sent | delivered | read | failed
  errorCodigo: number | null;
  errorMensaje: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Extrae mensajes entrantes y actualizaciones de estado del payload del
 * webhook de Meta. La estructura (entry[].changes[].value) y el manejo por
 * tipo de mensaje vienen probados de Varylo.
 */
export function parseWebhook(body: any): {
  mensajes: MensajeEntrante[];
  estados: EstadoMensaje[];
} {
  const mensajes: MensajeEntrante[] = [];
  const estados: EstadoMensaje[] = [];

  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      if (!value) continue;

      const nombres = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c?.wa_id && c?.profile?.name) nombres.set(String(c.wa_id), String(c.profile.name));
      }

      for (const m of value.messages ?? []) {
        if (!m?.id || !m?.from) continue;
        const tipo = String(m.type ?? "text");
        let contenido = "";
        let mediaTipo: string | null = null;
        let mediaId: string | null = null;
        let mimeType: string | null = null;
        let nombreArchivo: string | null = null;

        if (tipo === "text") {
          contenido = String(m.text?.body ?? "");
        } else if (["image", "video", "audio", "document", "sticker"].includes(tipo)) {
          const media = m[tipo];
          mediaTipo = tipo;
          mediaId = media?.id ?? null;
          mimeType = media?.mime_type ?? null;
          nombreArchivo = media?.filename ?? null;
          contenido = String(media?.caption ?? "");
        } else if (tipo === "location") {
          contenido = `📍 Ubicación: ${m.location?.latitude}, ${m.location?.longitude}`;
        } else if (tipo === "contacts") {
          contenido = "[Contacto compartido]";
        } else if (tipo === "reaction") {
          contenido = `Reaccionó ${m.reaction?.emoji ?? ""}`;
        } else if (tipo === "button" || tipo === "interactive") {
          contenido = String(
            m.button?.text ?? m.interactive?.button_reply?.title ??
            m.interactive?.list_reply?.title ?? "[Respuesta interactiva]"
          );
        } else {
          contenido = `[${tipo}]`;
        }

        mensajes.push({
          wamid: String(m.id),
          telefono: String(m.from),
          nombre: nombres.get(String(m.from)) ?? null,
          timestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
          contenido,
          mediaTipo,
          mediaId,
          mimeType,
          nombreArchivo,
        });
      }

      for (const s of value.statuses ?? []) {
        if (!s?.id || !s?.status) continue;
        estados.push({
          wamid: String(s.id),
          estado: String(s.status),
          errorCodigo: s.errors?.[0]?.code ?? null,
          errorMensaje: s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? null,
        });
      }
    }
  }
  return { mensajes, estados };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
