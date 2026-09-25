/**
 * Portal de afiliados, lado servidor: cookie de sesión, cuenta actual y
 * bitácora. Todo se lee con service_role y SIEMPRE filtrado por la cédula de
 * la cuenta de la sesión: la cédula nunca sale de la URL ni del formulario.
 */
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestMeta } from "@/lib/devengados/audit";
import { DURACION_SESION_SEG, firmarSesion, leerSesion } from "./sesion";

export const RUTA_PORTAL = "/portal-afiliados";
const COOKIE = "gestivo_afiliado";

let secretoEnMemoria: string | null = null;

/**
 * Secreto de firma de la sesión (32 caracteres o más). Primero la variable
 * AFILIADOS_SESSION_SECRET; si no está, el que genera la base en
 * afiliado_portal_config (migración 20260925222043), que solo lee
 * service_role. Sin ninguno el portal no abre sesiones: falla cerrado.
 */
export async function secretoSesion(): Promise<string | null> {
  const env = process.env.AFILIADOS_SESSION_SECRET ?? "";
  if (env.length >= 32) return env;
  if (secretoEnMemoria) return secretoEnMemoria;
  const { data, error } = await createAdminClient()
    .from("afiliado_portal_config")
    .select("secreto_sesion")
    .eq("id", 1)
    .maybeSingle();
  if (error) console.warn("[portal-afiliados] sin secreto de sesión:", error.message);
  const s = (data?.secreto_sesion as string | undefined) ?? "";
  if (s.length < 32) return null;
  secretoEnMemoria = s;
  return s;
}

export interface CuentaPortal {
  id: string;
  cedula: string;
  email: string;
  nombre: string | null;
  debeCambiarClave: boolean;
}

export interface FilaCuenta {
  id: string;
  cedula_propietario: string;
  email: string;
  nombre: string | null;
  clave_hash: string;
  debe_cambiar_clave: boolean;
  activo: boolean;
  intentos_fallidos: number;
  bloqueado_hasta: string | null;
  sesion_version: number;
  ultimo_ingreso_at: string | null;
  created_at: string;
}

/** La cuenta de la sesión vigente, o null (sin cookie, alterada, vencida, cuenta inactiva o con otra versión). */
export async function getCuentaPortal(): Promise<CuentaPortal | null> {
  const secreto = await secretoSesion();
  if (!secreto) return null;
  const token = (await cookies()).get(COOKIE)?.value;
  const carga = leerSesion(token, secreto, Math.floor(Date.now() / 1000));
  if (!carga) return null;
  const { data } = await createAdminClient()
    .from("afiliado_cuentas")
    .select("id, cedula_propietario, email, nombre, debe_cambiar_clave, activo, sesion_version, bloqueado_hasta")
    .eq("id", carga.c)
    .maybeSingle();
  if (!data || !data.activo || data.sesion_version !== carga.v) return null;
  if (data.bloqueado_hasta && new Date(data.bloqueado_hasta) > new Date()) return null;
  return {
    id: data.id,
    cedula: data.cedula_propietario,
    email: data.email,
    nombre: data.nombre,
    debeCambiarClave: data.debe_cambiar_clave,
  };
}

export async function abrirSesion(cuenta: { id: string; sesion_version: number }, secreto: string): Promise<void> {
  const token = firmarSesion(
    { c: cuenta.id, v: cuenta.sesion_version, e: Math.floor(Date.now() / 1000) + DURACION_SESION_SEG },
    secreto,
  );
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: RUTA_PORTAL,
    maxAge: DURACION_SESION_SEG,
  });
}

export async function cerrarSesionCookie(): Promise<void> {
  (await cookies()).set(COOKIE, "", { httpOnly: true, path: RUTA_PORTAL, maxAge: 0 });
}

export type EventoPortal =
  | "ingreso" | "ingreso_fallido" | "ingreso_bloqueado" | "salida" | "cambio_clave"
  | "consulta" | "exportacion"
  | "cuenta_creada" | "clave_restablecida" | "cuenta_desactivada" | "cuenta_reactivada";

/** Bitácora del portal. Nunca tumba la operación: si falla, queda en el log del servidor. */
export async function registrarAcceso(e: {
  evento: EventoPortal;
  cuentaId?: string | null;
  email?: string | null;
  detalle?: Record<string, unknown>;
  actorEmail?: string | null;
}): Promise<void> {
  try {
    const { ip, equipo } = await getRequestMeta();
    const { error } = await createAdminClient().from("afiliado_accesos").insert({
      cuenta_id: e.cuentaId ?? null,
      email: e.email ?? null,
      evento: e.evento,
      detalle: e.detalle ?? {},
      ip,
      equipo,
      actor_email: e.actorEmail ?? null,
    });
    if (error) throw error;
  } catch (err) {
    console.error("[portal-afiliados] no se pudo registrar el acceso:", err instanceof Error ? err.message : err);
  }
}
