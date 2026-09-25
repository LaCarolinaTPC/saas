/**
 * Sesión del portal de afiliados: un token corto firmado con HMAC-SHA256 que
 * viaja en una cookie HttpOnly. No es un JWT de Supabase y no abre la base:
 * solo lo entiende el servidor de Gestivo. Módulo puro (se prueba sin red).
 *
 * Formato: base64url(JSON {c, v, e}) + "." + base64url(firma).
 *   c = id de la cuenta · v = sesion_version · e = vencimiento (epoch en s).
 */
import { createHmac, timingSafeEqual } from "crypto";

export interface CargaSesion {
  /** Id de afiliado_cuentas. */
  c: string;
  /** afiliado_cuentas.sesion_version al iniciar: si sube, la sesión muere. */
  v: number;
  /** Vencimiento en segundos desde epoch. */
  e: number;
}

export const DURACION_SESION_SEG = 8 * 60 * 60;

function firma(datos: string, secreto: string): Buffer {
  return createHmac("sha256", secreto).update(datos).digest();
}

export function firmarSesion(carga: CargaSesion, secreto: string): string {
  const datos = Buffer.from(JSON.stringify(carga)).toString("base64url");
  return `${datos}.${firma(datos, secreto).toString("base64url")}`;
}

/** Carga de un token válido y vigente, o null si está alterado, mal formado o vencido. */
export function leerSesion(token: string | undefined | null, secreto: string, ahoraSeg: number): CargaSesion | null {
  if (!token) return null;
  const [datos, f, sobra] = token.split(".");
  if (!datos || !f || sobra !== undefined) return null;
  const esperada = firma(datos, secreto);
  const recibida = Buffer.from(f, "base64url");
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
  try {
    const c = JSON.parse(Buffer.from(datos, "base64url").toString("utf8")) as CargaSesion;
    if (typeof c.c !== "string" || typeof c.v !== "number" || typeof c.e !== "number") return null;
    return c.e > ahoraSeg ? c : null;
  } catch {
    return null;
  }
}

/** Bloqueo tras intentos fallidos: 5 seguidos → 15 minutos. */
export const INTENTOS_MAXIMOS = 5;
export const BLOQUEO_MIN = 15;
