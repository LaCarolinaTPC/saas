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
 * Desde el 24-nov-2026, la lista de correos de prueba (ajuste
 * correos_prueba_desarrollo, en Selección › Tiempos y reglas › Entorno de
 * pruebas, más CORREO_PERMITIDOS_DESARROLLO si está) deja salir tal cual lo
 * que va a esas direcciones: por ejemplo, un laboratorio con un correo de prueba.
 * Las demás direcciones del mismo correo se quitan. Y el correo para que el
 * aspirante confirme su dirección sale siempre (salirEnDesarrollo).
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
  /**
   * También sale en desarrollo, a su destinatario real (24-nov-2026): solo el
   * correo para que el aspirante confirme su dirección, que se prueba con
   * correos de verdad. Lo demás (las órdenes a los laboratorios) sigue sin salir.
   */
  salirEnDesarrollo?: boolean;
}

export function correoConfigurado(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
}

/**
 * En desarrollo, a dónde va el correo en vez de a sus destinatarios. PURO
 * (recibe el entorno) para poder probarlo.
 */
export function destinoEnDesarrollo(
  c: Pick<CorreoSaliente, "para" | "copia" | "asunto" | "salirEnDesarrollo">,
  env: { entorno?: string; desvio?: string; permitidos?: string }
): { desviar: false } | { desviar: true; para: string[]; copia?: string[]; asunto: string } | { desviar: true; bloqueado: string } {
  if (env.entorno?.trim().toLowerCase() !== "desarrollo" || c.salirEnDesarrollo) return { desviar: false };
  // Direcciones de prueba permitidas: sale a ellas; las demás se quitan.
  const lista = (env.permitidos ?? "")
    .split(/[,;\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const permitida = (d: string) => {
    const x = d.trim().toLowerCase();
    return lista.some((l) => (l.startsWith("@") ? x.endsWith(l) : x === l));
  };
  const paraOk = c.para.filter(permitida);
  if (lista.length && paraOk.length) {
    const quitados = [...c.para, ...(c.copia ?? [])].filter((d) => !permitida(d));
    return {
      desviar: true,
      para: paraOk,
      copia: (c.copia ?? []).filter(permitida),
      asunto: quitados.length ? `[DESARROLLO, sin ${quitados.join(", ")}] ${c.asunto}` : `[DESARROLLO] ${c.asunto}`,
    };
  }
  const desvio = env.desvio?.trim();
  if (!desvio) {
    return { desviar: true, bloqueado: "En desarrollo los correos no salen a destinatarios reales. Ponga un correo de prueba en CORREO_PERMITIDOS_DESARROLLO (y en el destinatario, por ejemplo el laboratorio) o defina CORREO_DESVIO_DESARROLLO para recibirlos todos en una bandeja." };
  }
  const originales = [...c.para, ...(c.copia ?? [])].join(", ");
  return { desviar: true, para: [desvio], asunto: `[DESARROLLO → ${originales}] ${c.asunto}` };
}

/**
 * Correos de prueba permitidos en desarrollo: la variable de entorno y el
 * ajuste editable de Selección. Fuera de desarrollo no se lee nada.
 */
async function correosDePrueba(): Promise<string> {
  const { listasDePrueba } = await import("@/lib/entorno-pruebas");
  return (await listasDePrueba()).correos.join(",");
}

/** Envía el correo. No lanza: devuelve el error para mostrarlo. */
export async function enviarCorreo(c: CorreoSaliente): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!correoConfigurado()) return { ok: false, error: "El correo de salida no está configurado (SMTP_HOST, SMTP_USER, SMTP_PASS y SMTP_FROM)." };
  if (!c.para.length) return { ok: false, error: "El correo no tiene destinatarios." };
  // Por un candidato del chat de prueba sale de verdad, también en desarrollo (27-nov-2026).
  const { envioRealDePrueba } = await import("@/lib/entorno-pruebas");
  if (envioRealDePrueba()) c = { ...c, salirEnDesarrollo: true };
  const dev = destinoEnDesarrollo(c, {
    entorno: process.env.GESTIVO_ENTORNO,
    desvio: process.env.CORREO_DESVIO_DESARROLLO,
    permitidos: await correosDePrueba(),
  });
  if (dev.desviar && "bloqueado" in dev) return { ok: false, error: dev.bloqueado };
  if (dev.desviar) c = { ...c, para: dev.para, copia: dev.copia, asunto: dev.asunto };
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
    await anotarEnvio("enviado", c, null);
    return { ok: true, id: String(info.messageId ?? "") };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await anotarEnvio("fallido", c, error);
    return { ok: false, error };
  }
}

/**
 * Bitácora de envíos (27-nov-2026, tabla `correo_envios`): la barra de estado
 * cuenta todos los correos, no solo las órdenes a laboratorios. Sin la migración
 * (20261127215621) no anota nada. Nunca lanza.
 */
async function anotarEnvio(resultado: "enviado" | "fallido", c: CorreoSaliente, error: string | null): Promise<void> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    await createAdminClient()
      .from("correo_envios")
      .insert({ resultado, asunto: c.asunto.slice(0, 200), destinatarios: c.para.length + (c.copia?.length ?? 0), error: error?.slice(0, 300) ?? null });
  } catch {
    // Sin la tabla o sin base: el envío no depende de la bitácora.
  }
}
