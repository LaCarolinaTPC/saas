/**
 * Correo para la prueba psicotécnica (24-nov-2026). PURO; lo que escribe
 * y envía está en ./correo-psico-servidor.
 *
 * La prueba se presenta en una plataforma externa que necesita el correo del
 * aspirante. Al entrar a exámenes médicos · fase 1 se le pide por WhatsApp;
 * cuando lo escribe se le pregunta si está bien; si dice que sí, le llega un
 * correo con un enlace para confirmarlo. Mientras no lo escriba o no lo
 * confirme se le recuerda que es necesario para el proceso. Con el correo
 * confirmado, Gestión Humana lo inscribe en la plataforma y, al marcarlo,
 * Gestivo le avisa por WhatsApp que le va a llegar la información por correo.
 */

/**
 * pedido: se le pidió y no lo ha escrito (o dijo que el que escribió estaba mal).
 * por_confirmar: escribió uno y se le preguntó si está bien.
 * enviado: dijo que sí y se le envió el correo con el enlace.
 * validado: confirmó en el enlace (o una persona lo dio por bueno).
 * inscrito: Gestión Humana lo inscribió en la plataforma.
 */
export type EstadoCorreo = "pedido" | "por_confirmar" | "enviado" | "validado" | "inscrito";

export const ESTADOS_CORREO: Record<EstadoCorreo, string> = {
  pedido: "Pedido, sin respuesta",
  por_confirmar: "Escribió uno, falta que diga si está bien",
  enviado: "Enviado el correo para confirmarlo",
  validado: "Confirmado: falta inscribirlo en la plataforma",
  inscrito: "Inscrito en la plataforma",
};

/** Etapas en las que se pide el correo (desde la fase 1 hasta antes de contratar). */
export const ESTADOS_PROCESO_CORREO = ["en_examenes", "en_examenes_fase2", "reconocimiento_ruta", "listo_contratar"] as const;

/** Botones de la pregunta «¿Tu correo es …?». */
export const BOTONES_CONFIRMAR = ["Sí, es correcto", "No, lo corrijo"] as const;

/** Días que vale el enlace del correo. */
export const DIAS_VIGENCIA_ENLACE = 7;

const CORREO_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i;

/** ¿Es un correo bien escrito? Sin espacios, con @, dominio y extensión. */
export function correoValido(c: string | null | undefined): boolean {
  const v = String(c ?? "").trim();
  if (v.length > 254 || /\s/.test(v)) return false;
  const m = CORREO_RE.exec(v);
  return !!m && m[0].length === v.length && !v.includes("..");
}

/**
 * El correo que viene en un mensaje, en minúsculas. Acepta «arroba» y «punto»
 * escritos y los espacios alrededor de la @ que pone el teclado del celular.
 */
export function extraerCorreo(texto: string | null | undefined): string | null {
  let t = String(texto ?? "")
    .normalize("NFC")
    .replace(/\s*\(?\s*arroba\s*\)?\s*/gi, "@")
    .replace(/\s*@\s*/g, "@");
  // «gmail punto com» → «gmail.com», solo después de la @.
  t = t.replace(/@([a-z0-9-]+(?:\s+punto\s+[a-z0-9-]+)+)/gi, (_, dom: string) => `@${dom.replace(/\s+punto\s+/gi, ".")}`);
  const m = CORREO_RE.exec(t);
  if (!m) return null;
  const c = m[0].toLowerCase().replace(/\.+$/, "");
  return correoValido(c) ? c : null;
}

const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** «Sí, es correcto» / «No, lo corrijo» y respuestas cortas parecidas. null si no es claro. */
export function interpretarSiNo(texto: string | null | undefined): "si" | "no" | null {
  const t = normalizar(String(texto ?? ""));
  if (!t || t.split(" ").length > 8) return null;
  if (/^(no|nop|nones|negativo|esta mal|no es|no es correcto|no lo corrijo|incorrecto|equivocado|lo corrijo|corrijo|me equivoque)\b/.test(t)) return "no";
  if (/^(si|sii+|sip|claro|correcto|es correcto|si es correcto|exacto|asi es|ok|okay|listo|dale|confirmo|perfecto|afirmativo|ese es|si señor|si señora|esta bien|bien)\b/.test(t)) return "si";
  return null;
}

/** Lo que hace Gestivo con un mensaje del aspirante, según el estado del correo. */
export type AccionEntrante =
  | { tipo: "preguntar"; correo: string }
  | { tipo: "enviar" }
  | { tipo: "corregir" }
  /** El mensaje no es del correo: lo atiende el asistente. */
  | { tipo: "nada" };

export function decidirEntrante(estado: EstadoCorreo | null, texto: string | null | undefined): AccionEntrante {
  if (!estado || estado === "validado" || estado === "inscrito") return { tipo: "nada" };
  const correo = extraerCorreo(texto);
  // Un correo nuevo (o corregido) siempre se vuelve a preguntar.
  if (correo) return { tipo: "preguntar", correo };
  if (estado === "por_confirmar") {
    const r = interpretarSiNo(texto);
    if (r === "si") return { tipo: "enviar" };
    if (r === "no") return { tipo: "corregir" };
  }
  return { tipo: "nada" };
}

export interface AjustesCorreo {
  activo: boolean;
  /** Horas sin respuesta antes de cada recordatorio. */
  horas: number;
  /** Cuántos recordatorios; después, el chat queda para una persona. */
  recordatorios: number;
}

export const AJUSTES_CORREO_POR_DEFECTO: AjustesCorreo = { activo: true, horas: 24, recordatorios: 3 };

export function ajustesCorreo(valor: (clave: string) => unknown): AjustesCorreo {
  const n = (v: unknown, def: number, min: number, max: number) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.min(Math.max(x, min), max) : def;
  };
  const activo = valor("correo_psico_activo");
  return {
    activo: activo === undefined || activo === null ? AJUSTES_CORREO_POR_DEFECTO.activo : activo === true || activo === "true",
    horas: n(valor("correo_psico_horas"), AJUSTES_CORREO_POR_DEFECTO.horas, 1, 24 * 14),
    recordatorios: Math.round(n(valor("correo_psico_recordatorios"), AJUSTES_CORREO_POR_DEFECTO.recordatorios, 0, 10)),
  };
}

export interface ProcesoCorreo {
  estado: string;
  origen: string | null;
  correo_estado: EstadoCorreo | null;
  /** Último mensaje de Gestivo sobre el correo (el pedido o un recordatorio). */
  correo_recordatorio_at: string | null;
  correo_recordatorios: number | null;
  correo_escalado_at: string | null;
}

export type AccionCron = "pedir" | "recordar" | "escalar" | null;

/**
 * Qué toca en la revisión periódica: pedirlo la primera vez, recordarlo tras
 * `horas` sin novedad (hasta `recordatorios` veces) o, agotados, dejar el chat
 * para una persona una sola vez.
 */
export function accionCron(p: ProcesoCorreo, a: AjustesCorreo, ahora: Date): AccionCron {
  if (!a.activo || p.origen === "chat_prueba") return null;
  if (!(ESTADOS_PROCESO_CORREO as readonly string[]).includes(p.estado)) return null;
  if (!p.correo_estado) return "pedir";
  if (p.correo_estado === "validado" || p.correo_estado === "inscrito") return null;
  const ultimo = p.correo_recordatorio_at ? new Date(p.correo_recordatorio_at).getTime() : 0;
  if (ahora.getTime() - ultimo < a.horas * 3_600_000) return null;
  if ((p.correo_recordatorios ?? 0) < a.recordatorios) return "recordar";
  return p.correo_escalado_at ? null : "escalar";
}

/** El mensaje del recordatorio: si ya se envió el correo, que lo busque; si no, que lo escriba. */
export function mensajeRecordatorio(estado: EstadoCorreo | null): "recordatorio_validar_correo" | "recordatorio_correo" {
  return estado === "enviado" ? "recordatorio_validar_correo" : "recordatorio_correo";
}

/** ¿Venció el enlace? */
export function enlaceVencido(vence: string | null | undefined, ahora: Date): boolean {
  return !vence || new Date(vence).getTime() < ahora.getTime();
}
