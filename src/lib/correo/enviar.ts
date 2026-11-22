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

/** Envía el correo. No lanza: devuelve el error para mostrarlo. */
export async function enviarCorreo(c: CorreoSaliente): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!correoConfigurado()) return { ok: false, error: "El correo de salida no está configurado (SMTP_HOST, SMTP_USER, SMTP_PASS y SMTP_FROM)." };
  if (!c.para.length) return { ok: false, error: "El correo no tiene destinatarios." };
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
