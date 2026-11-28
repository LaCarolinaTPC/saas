/**
 * Avisos por correo de Selección (27-nov-2026): qué se avisa, con qué ajustes
 * y a quién si no tiene lista propia. Lo usan Selección › Notificaciones, el
 * envío (notificaciones-servidor.ts) y las «Novedades del día» de Candidatos.
 * PURO.
 *
 * Pedido del usuario: «si se necesita algún tipo de revisión manual, que se
 * avise para que lo hagan», con una sección para decir a qué correo va cada cosa.
 */

export type TipoNotificacion = "antecedentes" | "examenes" | "laboratorio" | "documentos" | "chats" | "listo_contratar" | "servicios" | "reporte_diario";

export interface DefinicionNotificacion {
  nombre: string;
  /** Cuándo llega, en una frase para la pestaña. */
  cuando: string;
  /** Revisión manual (sale en las novedades del día) o aviso/reporte. */
  grupo: "revision" | "aviso";
  /** Ajustes: interruptor (si no tiene, siempre está encendido), correos y copia. */
  activo: string | null;
  correos: string;
  copia: string | null;
  /** Sin lista propia: los correos por defecto y, si tampoco hay, los del reporte diario. */
  usaDefecto: boolean;
}

export const NOTIFICACIONES: Record<TipoNotificacion, DefinicionNotificacion> = {
  antecedentes: {
    nombre: "Antecedentes por revisar",
    cuando: "Una fuente trae una anotación que las reglas mandan a revisión, una fuente no respondió, un requisito quedó para una persona o llegó tarde un resultado después del aval.",
    grupo: "revision",
    activo: "antecedentes_alerta_activo",
    correos: "antecedentes_alerta_correos",
    copia: "antecedentes_alerta_copia",
    usaDefecto: true,
  },
  examenes: {
    nombre: "Exámenes por decidir",
    cuando: "El laboratorio dio «no apto» o «aplazado»: una persona decide si el aspirante sigue o no.",
    grupo: "revision",
    activo: "notif_examenes_activo",
    correos: "notif_examenes_correos",
    copia: "notif_examenes_copia",
    usaDefecto: true,
  },
  laboratorio: {
    nombre: "Respuestas del laboratorio por confirmar",
    cuando: "El laboratorio escribió por WhatsApp y Gestivo no pudo confirmar solo el resultado (no reconoció al aspirante o no trae la frase acordada).",
    grupo: "revision",
    activo: "notif_laboratorio_activo",
    correos: "notif_laboratorio_correos",
    copia: "notif_laboratorio_copia",
    usaDefecto: true,
  },
  documentos: {
    nombre: "Documentos por revisar",
    cuando: "Un documento que mandó el aspirante (hoja de vida, carta laboral, cédula…) contradice sus datos: otro nombre, otra cédula, otra fecha de nacimiento o fechas imposibles.",
    grupo: "revision",
    activo: "notif_documentos_activo",
    correos: "notif_documentos_correos",
    copia: "notif_documentos_copia",
    usaDefecto: true,
  },
  chats: {
    nombre: "Chats que requieren una persona",
    cuando: "El asistente pasó el chat a una persona (no supo responder, quedó un mensaje para revisar antes de enviarlo, o el aspirante no confirmó su correo). Un correo con los chats nuevos, cada 15 minutos como máximo.",
    grupo: "revision",
    activo: "notif_chats_activo",
    correos: "notif_chats_correos",
    copia: "notif_chats_copia",
    usaDefecto: true,
  },
  listo_contratar: {
    nombre: "Listo para contratar",
    cuando: "Un aspirante cumplió todas las condiciones y quedó listo para contratar.",
    grupo: "aviso",
    activo: "listo_contratar_avisar",
    correos: "listo_contratar_correos",
    copia: "notif_listo_copia",
    usaDefecto: true,
  },
  servicios: {
    nombre: "Servicios que fallan",
    cuando: "Croma, la IA, WhatsApp o el correo empiezan a fallar (con recordatorio cada 6 horas y aviso cuando vuelven).",
    grupo: "aviso",
    activo: null,
    correos: "alerta_servicios_correos",
    copia: "alerta_servicios_copia",
    usaDefecto: false,
  },
  reporte_diario: {
    nombre: "Reporte diario",
    cuando: "Todos los días a las 7:00, con las cifras de Indicadores.",
    grupo: "aviso",
    activo: "reporte_diario_activo",
    correos: "reporte_diario_correos",
    copia: "reporte_diario_copia",
    usaDefecto: false,
  },
};

export const TIPOS_NOTIFICACION = Object.keys(NOTIFICACIONES) as TipoNotificacion[];
export const AJUSTE_DEFECTO_CORREOS = "notif_defecto_correos";
export const AJUSTE_DEFECTO_COPIA = "notif_defecto_copia";

export const correosDe = (v: unknown): string[] =>
  [...new Set((Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\s]+/) : []).map((x) => String(x).trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))];

/**
 * A quién va un aviso (puro): su lista; si no tiene, los correos por defecto; si
 * tampoco, los del reporte diario. `origen` dice de dónde salieron (para la pestaña).
 */
export function destinatariosDeAjustes(
  tipo: TipoNotificacion,
  valor: (clave: string) => unknown
): { activo: boolean; para: string[]; copia: string[]; origen: "propia" | "defecto" | "reporte" | "ninguna" } {
  const d = NOTIFICACIONES[tipo];
  const activo = d.activo ? valor(d.activo) !== false && valor(d.activo) !== "false" : true;
  const para = correosDe(valor(d.correos));
  if (para.length) return { activo, para, copia: d.copia ? correosDe(valor(d.copia)) : [], origen: "propia" };
  if (!d.usaDefecto) return { activo, para: [], copia: [], origen: "ninguna" };
  const defecto = correosDe(valor(AJUSTE_DEFECTO_CORREOS));
  if (defecto.length) return { activo, para: defecto, copia: correosDe(valor(AJUSTE_DEFECTO_COPIA)), origen: "defecto" };
  const reporte = correosDe(valor("reporte_diario_correos"));
  if (reporte.length) return { activo, para: reporte, copia: correosDe(valor("reporte_diario_copia")), origen: "reporte" };
  return { activo, para: [], copia: [], origen: "ninguna" };
}

/** El correo de un aviso (puro), con el mismo formato para todos. */
export function armarCorreoNotificacion(n: { tipo: TipoNotificacion; titulo: string; detalle?: string | null; enlace?: string | null; prueba?: boolean; desarrollo?: boolean; items?: { titulo: string; detalle?: string | null; enlace?: string | null }[] }) {
  const marca = `${n.desarrollo ? "[Desarrollo] " : ""}${n.prueba ? "[Prueba] " : ""}`;
  const asunto = `${marca}${NOTIFICACIONES[n.tipo].nombre}: ${n.titulo}`.slice(0, 200);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const items = n.items ?? [];
  const texto = [
    `${n.titulo}.`,
    n.detalle ? `\n${n.detalle}` : "",
    ...items.map((i) => `\n· ${i.titulo}${i.detalle ? ` — ${i.detalle}` : ""}${i.enlace ? `\n  ${i.enlace}` : ""}`),
    n.enlace ? `\nAbrir: ${n.enlace}` : "",
    "\n\nAviso automático de Gestivo (Selección). A quién llega se cambia en Selección › Notificaciones.",
  ].join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0f172a;max-width:600px">
<p style="font-size:12px;color:#64748b;margin:0 0 4px">${esc(NOTIFICACIONES[n.tipo].nombre)}</p>
<p style="margin:0 0 8px"><b>${esc(n.titulo)}</b></p>
${n.detalle ? `<p>${esc(n.detalle)}</p>` : ""}
${items.length ? `<ul style="padding-left:18px">${items.map((i) => `<li style="margin-bottom:6px">${i.enlace ? `<a href="${esc(i.enlace)}">${esc(i.titulo)}</a>` : esc(i.titulo)}${i.detalle ? `<br><span style="color:#475569">${esc(i.detalle)}</span>` : ""}</li>`).join("")}</ul>` : ""}
${n.enlace ? `<p style="margin:20px 0"><a href="${esc(n.enlace)}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:bold">Abrir en Gestivo</a></p>` : ""}
<p style="font-size:12px;color:#64748b">Aviso automático de Gestivo (Selección). A quién llega se cambia en Selección › Notificaciones.</p>
</div>`;
  return { asunto, texto, html };
}
