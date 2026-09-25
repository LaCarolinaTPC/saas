"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashClave, problemaClaveNueva, verificarClave } from "@/lib/portal-afiliados/clave";
import { BLOQUEO_MIN, INTENTOS_MAXIMOS } from "@/lib/portal-afiliados/sesion";
import {
  RUTA_PORTAL, abrirSesion, cerrarSesionCookie, getCuentaPortal, registrarAcceso, secretoSesion, type FilaCuenta,
} from "@/lib/portal-afiliados/servidor";

const INVALIDO = "Correo o contraseña incorrectos.";
// Hash de relleno: cuando el correo no existe se verifica igual, para que el
// tiempo de respuesta no delate qué correos tienen cuenta.
const HASH_RELLENO = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export async function iniciarSesion(_prev: { error: string } | null, form: FormData): Promise<{ error: string }> {
  const secreto = await secretoSesion();
  if (!secreto) return { error: "El portal no está disponible. Comuníquese con Tesorería." };
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const clave = String(form.get("clave") ?? "").slice(0, 200);
  if (!email || !clave) return { error: INVALIDO };

  const db = createAdminClient();
  const { data } = await db.from("afiliado_cuentas").select("*").eq("email", email).maybeSingle();
  const cuenta = data as FilaCuenta | null;
  if (!cuenta) {
    await verificarClave(clave, HASH_RELLENO);
    await registrarAcceso({ evento: "ingreso_fallido", email, detalle: { motivo: "correo_sin_cuenta" } });
    return { error: INVALIDO };
  }
  if (cuenta.bloqueado_hasta && new Date(cuenta.bloqueado_hasta) > new Date()) {
    await registrarAcceso({ evento: "ingreso_bloqueado", cuentaId: cuenta.id, email });
    return { error: `Demasiados intentos fallidos. Intente de nuevo en ${BLOQUEO_MIN} minutos.` };
  }
  const ok = await verificarClave(clave, cuenta.clave_hash);
  if (!ok || !cuenta.activo) {
    const intentos = cuenta.intentos_fallidos + 1;
    const bloquear = intentos >= INTENTOS_MAXIMOS;
    await db.from("afiliado_cuentas").update({
      intentos_fallidos: bloquear ? 0 : intentos,
      bloqueado_hasta: bloquear ? new Date(Date.now() + BLOQUEO_MIN * 60_000).toISOString() : cuenta.bloqueado_hasta,
      updated_at: new Date().toISOString(),
    }).eq("id", cuenta.id);
    await registrarAcceso({
      evento: "ingreso_fallido", cuentaId: cuenta.id, email,
      detalle: { motivo: cuenta.activo ? "clave" : "cuenta_inactiva", bloqueada: bloquear },
    });
    return { error: INVALIDO };
  }

  await db.from("afiliado_cuentas").update({
    intentos_fallidos: 0, bloqueado_hasta: null, ultimo_ingreso_at: new Date().toISOString(),
  }).eq("id", cuenta.id);
  await abrirSesion(cuenta, secreto);
  await registrarAcceso({ evento: "ingreso", cuentaId: cuenta.id, email });
  redirect(cuenta.debe_cambiar_clave ? `${RUTA_PORTAL}/cambiar-clave` : RUTA_PORTAL);
}

export async function cambiarClave(_prev: { error: string } | null, form: FormData): Promise<{ error: string }> {
  const secreto = await secretoSesion();
  const sesion = await getCuentaPortal();
  if (!secreto || !sesion) redirect(`${RUTA_PORTAL}/login`);
  const actual = String(form.get("actual") ?? "");
  const nueva = String(form.get("nueva") ?? "");
  const confirmar = String(form.get("confirmar") ?? "");
  if (nueva !== confirmar) return { error: "La confirmación no coincide con la contraseña nueva." };
  const problema = problemaClaveNueva(nueva, sesion.email);
  if (problema) return { error: problema };
  if (nueva === actual) return { error: "La contraseña nueva debe ser distinta de la actual." };

  const db = createAdminClient();
  const { data } = await db.from("afiliado_cuentas").select("*").eq("id", sesion.id).single();
  const cuenta = data as FilaCuenta;
  if (!(await verificarClave(actual, cuenta.clave_hash))) return { error: "La contraseña actual no es correcta." };
  // Subir la versión cierra cualquier otra sesión abierta con la clave vieja.
  const version = cuenta.sesion_version + 1;
  const { error } = await db.from("afiliado_cuentas").update({
    clave_hash: await hashClave(nueva),
    debe_cambiar_clave: false,
    sesion_version: version,
    updated_at: new Date().toISOString(),
  }).eq("id", cuenta.id);
  if (error) return { error: "No se pudo guardar la contraseña. Intente de nuevo." };
  await abrirSesion({ id: cuenta.id, sesion_version: version }, secreto);
  await registrarAcceso({ evento: "cambio_clave", cuentaId: cuenta.id, email: cuenta.email });
  redirect(RUTA_PORTAL);
}

export async function salir(): Promise<void> {
  const sesion = await getCuentaPortal();
  if (sesion) await registrarAcceso({ evento: "salida", cuentaId: sesion.id, email: sesion.email });
  await cerrarSesionCookie();
  redirect(`${RUTA_PORTAL}/login`);
}
