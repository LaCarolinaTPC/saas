/**
 * Envío de correos desde Gestivo por SMTP (primer uso: la orden de exámenes
 * a los laboratorios que la reciben por correo, 21-nov-2026). Solo servidor.
 *
 * Variables de entorno (en .env.local y en Vercel):
 *   SMTP_HOST, SMTP_PORT (587 por defecto), SMTP_USER, SMTP_PASS, SMTP_FROM
 *   (por ejemplo «Salud Ocupacional <ssalud@lacarolina.com.co>»). Con
 *   Microsoft 365: smtp.office365.com, 587, y la cuenta con SMTP autenticado
 *   habilitado.
 * Sin ellas no se envía nada: quien llama muestra lo que habría salido.
 *
 * En desarrollo (GESTIVO_ENTORNO=desarrollo, base copia de producción) los
 * laboratorios y aspirantes son reales: nada sale a sus correos. Con
 * CORREO_DESVIO_DESARROLLO (una bandeja de prueba) todo va ahí, con los
 * destinatarios originales en el asunto; sin ella, no se envía (23-nov-2026).
 */
import nodemailer from "nodemailer";

export interface AdjuntoCorreo {
  nombre: string;
  contenido: Buffer;
  mime: string;
}

export interface CorreoSaliente {
  para: string[];
  copia?: string[];
  asunto: string;
  texto: string;
  html?: string;
  adjuntos?: AdjuntoCorreo[];
}

export function correoConfigurado(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
}

/**
 * En desarrollo, a dónde va el correo en vez de a sus destinatarios. PURO
 * (recibe el entorno) para poder probarlo.
 */
export function destinoEnDesarrollo(
  c: Pick<CorreoSaliente, "para" | "copia" | "asunto">,
  env: { entorno?: string; desvio?: string }
): { desviar: false } | { desviar: true; para: string[]; asunto: string } | { desviar: true; bloqueado: string } {
  if (env.entorno?.trim().toLowerCase() !== "desarrollo") return { desviar: false };
  const desvio = env.desvio?.trim();
  if (!desvio) {
    return { desviar: true, bloqueado: "En desarrollo los correos no salen a destinatarios reales. Defina CORREO_DESVIO_DESARROLLO con una bandeja de prueba para recibirlos ahí." };
  }
  const originales = [...c.para, ...(c.copia ?? [])].join(", ");
  return { desviar: true, para: [desvio], asunto: `[DESARROLLO → ${originales}] ${c.asunto}` };
}

/** Envía el correo. No lanza: devuelve el error para mostrarlo. */
export async function enviarCorreo(c: CorreoSaliente): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!correoConfigurado()) return { ok: false, error: "El correo de salida no está configurado (SMTP_HOST, SMTP_USER, SMTP_PASS y SMTP_FROM)." };
  if (!c.para.length) return { ok: false, error: "El correo no tiene destinatarios." };
  const dev = destinoEnDesarrollo(c, { entorno: process.env.GESTIVO_ENTORNO, desvio: process.env.CORREO_DESVIO_DESARROLLO });
  if (dev.desviar && "bloqueado" in dev) return { ok: false, error: dev.bloqueado };
  if (dev.desviar) c = { ...c, para: dev.para, copia: undefined, asunto: dev.asunto };
  try {
    const puerto = Number(process.env.SMTP_PORT || 587);
    const transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: puerto,
      secure: puerto === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    const info = await transporte.sendMail({
      from: process.env.SMTP_FROM,
      to: c.para,
      cc: c.copia?.length ? c.copia : undefined,
      subject: c.asunto,
      text: c.texto,
      html: c.html,
      attachments: (c.adjuntos ?? []).map((a) => ({ filename: a.nombre, content: a.contenido, contentType: a.mime })),
    });
    return { ok: true, id: String(info.messageId ?? "") };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
