/**
 * ¿El correo de salida funciona? (27-nov-2026). Dos revisiones que no envían
 * nada, para la barra de estado de los servicios:
 *  - el inicio de sesión en el servidor SMTP (nodemailer `verify`): dice si el
 *    usuario y la clave sirven. Así se vio el «535 Authentication failed» de
 *    Brevo, que dejaba las alertas a GH sin salir y nadie se enteraba;
 *  - la página de estado de Brevo (status.brevo.com, JSON público, sin clave):
 *    los componentes «SMTP» y «Transactional emails delivery».
 * Diez y cinco minutos en memoria. Nunca lanzan. Solo servidor.
 */
import nodemailer from "nodemailer";
import type { PaginaEstado } from "@/lib/estado-servicios";

export interface RevisionSmtp {
  ok: boolean;
  /** El usuario o la clave no sirven (535 y parecidos): no se arregla solo. */
  credenciales: boolean;
  error: string | null;
  at: string;
}

export const URL_ESTADO_BREVO = "https://status.brevo.com";
const COMPONENTES_BREVO = ["SMTP", "Transactional emails delivery"];

let cacheSmtp: { hasta: number; datos: Promise<RevisionSmtp | null> } | null = null;
let cacheBrevo: { hasta: number; datos: Promise<PaginaEstado | null> } | null = null;

/** El SMTP es de Brevo (para leer su página de estado). */
export function esBrevo(): boolean {
  return /brevo|sendinblue/i.test(process.env.SMTP_HOST ?? "");
}

/** Error de credenciales del servidor SMTP (puro, para las pruebas). */
export function esErrorDeCredenciales(texto: string | null | undefined): boolean {
  return /\b(535|534|530)\b|EAUTH|authentication failed|invalid login|username and password not accepted/i.test(String(texto ?? ""));
}

/** Inicia sesión en el SMTP sin enviar nada. null si el correo no está configurado. */
export async function revisarSmtp(opciones: { forzar?: boolean } = {}): Promise<RevisionSmtp | null> {
  if (!opciones.forzar && cacheSmtp && cacheSmtp.hasta > Date.now()) return cacheSmtp.datos;
  const datos = (async (): Promise<RevisionSmtp | null> => {
    const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
    const puerto = Number(process.env.SMTP_PORT || 587);
    const transporte = nodemailer.createTransport({
      host: SMTP_HOST,
      port: puerto,
      secure: puerto === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
    const at = new Date().toISOString();
    try {
      await transporte.verify();
      return { ok: true, credenciales: false, error: null, at };
    } catch (e) {
      const x = e as { code?: string; response?: string; message?: string };
      const error = String(x.response ?? x.message ?? "Error desconocido").slice(0, 300);
      return { ok: false, credenciales: esErrorDeCredenciales(`${x.code ?? ""} ${error}`), error, at };
    } finally {
      transporte.close();
    }
  })();
  cacheSmtp = { hasta: Date.now() + 10 * 60_000, datos };
  return datos;
}

/** Lo que dice la página de estado de Brevo de sus componentes de correo (puro). */
export function interpretarEstadoBrevo(json: unknown): Pick<PaginaEstado, "estado" | "texto"> {
  const o = (json && typeof json === "object" ? json : {}) as { components?: { name?: string; status?: string }[]; status?: { description?: string } };
  const comps = (o.components ?? []).filter((c) => COMPONENTES_BREVO.includes(String(c.name ?? "")));
  if (!comps.length) return { estado: "desconocido", texto: o.status?.description ?? null };
  const mal = comps.filter((c) => c.status && c.status !== "operational");
  if (mal.length) return { estado: "problemas", texto: mal.map((c) => `${c.name}: ${String(c.status).replace(/_/g, " ")}`).join(", ") };
  return { estado: "operativo", texto: "SMTP y envíos transaccionales operativos" };
}

/** La página de estado de Brevo, cinco minutos en memoria. null si no es Brevo o no se pudo leer. */
export async function leerEstadoBrevo(opciones: { forzar?: boolean } = {}): Promise<PaginaEstado | null> {
  if (!esBrevo()) return null;
  if (!opciones.forzar && cacheBrevo && cacheBrevo.hasta > Date.now()) return cacheBrevo.datos;
  const datos = (async () => {
    try {
      const res = await fetch(`${URL_ESTADO_BREVO}/api/v2/summary.json`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      return { ...interpretarEstadoBrevo(await res.json()), url: URL_ESTADO_BREVO, revisadoAt: new Date().toISOString() };
    } catch {
      return null;
    }
  })();
  cacheBrevo = { hasta: Date.now() + 5 * 60_000, datos };
  return datos;
}

/** Para «Actualizar el estado» y las pruebas. */
export function olvidarSaludCorreo(): void {
  cacheSmtp = null;
  cacheBrevo = null;
}
