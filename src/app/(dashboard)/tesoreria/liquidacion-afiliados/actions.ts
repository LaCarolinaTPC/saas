"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, canAccessSub } from "@/lib/permissions";
import { esPlazo } from "@/lib/tesoreria/calendario-pago";
import { generarClaveProvisional, hashClave } from "@/lib/portal-afiliados/clave";
import { registrarAcceso } from "@/lib/portal-afiliados/servidor";

export interface CambioReglaPago {
  plazo: string;
  diaPago: number;
  diaPagoAlterno: number;
  correrSiLunesFestivo: boolean;
  correrSiDiaPagoFestivo: boolean;
}

/**
 * Cambia el día de pago y las reglas de festivo de un plazo. Lo mismo que
 * los parámetros de devengados: solo quien tiene Parámetros de Tesorería.
 * El corte (lunes a domingo, 1-15/16-fin) no se edita aquí: define qué es
 * una semana o una quincena y cambiarlo reescribiría periodos ya pagados.
 */
export async function guardarReglaPago(c: CambioReglaPago): Promise<{ ok: true } | { ok: false; error: string }> {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "tesoreria", "parametros")) {
    return { ok: false, error: "Solo quien tiene Parámetros de Tesorería puede cambiar el calendario de pago." };
  }
  if (!esPlazo(c.plazo)) return { ok: false, error: "Plazo no válido." };
  const dia = (n: number) => Number.isInteger(n) && n >= 1 && n <= 7;
  if (!dia(c.diaPago) || !dia(c.diaPagoAlterno)) return { ok: false, error: "Día de la semana no válido." };
  if (c.diaPago === c.diaPagoAlterno) {
    return { ok: false, error: "El día alterno debe ser distinto del día de pago." };
  }
  const { error } = await createAdminClient()
    .from("tesoreria_calendario_pago")
    .update({
      dia_pago: c.diaPago,
      dia_pago_alterno: c.diaPagoAlterno,
      correr_si_lunes_festivo: !!c.correrSiLunesFestivo,
      correr_si_dia_pago_festivo: !!c.correrSiDiaPagoFestivo,
      updated_at: new Date().toISOString(),
      updated_por_email: perms.userEmail,
    })
    .eq("plazo", c.plazo);
  if (error) {
    return {
      ok: false,
      error: /tesoreria_calendario_pago/.test(error.message)
        ? "Falta aplicar la migración 20260925194027 (calendario de pago) en la base."
        : error.message,
    };
  }
  revalidatePath("/tesoreria/liquidacion-afiliados");
  return { ok: true };
}

// ── Cuentas del portal de afiliados ─────────────────────────────────────────

type ResultadoClave = { ok: true; clave: string } | { ok: false; error: string };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Solo quien tiene la sub-función sensible de cuentas (el admin siempre). */
async function exigirGestionCuentas() {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "tesoreria", "liq_afiliados_cuentas")) {
    throw new Error("No tiene permiso para gestionar cuentas del portal de afiliados.");
  }
  return perms;
}

const errorTabla = (m: string) =>
  /afiliado_cuentas|afiliado_accesos/.test(m)
    ? "Falta aplicar la migración 20260925203623 (portal de afiliados) en la base."
    : m;

/**
 * Crea la cuenta del portal para un propietario AFILIADO y devuelve la clave
 * provisional, que se muestra una sola vez para dictársela. El afiliado la
 * cambia en su primer ingreso.
 */
export async function crearCuentaPortal(cedula: string, email: string, nombre: string): Promise<ResultadoClave> {
  const perms = await exigirGestionCuentas();
  const correo = email.trim().toLowerCase();
  if (!EMAIL_RE.test(correo) || correo.length > 200) return { ok: false, error: "Correo no válido." };
  const db = createAdminClient();
  const { data: prop } = await db
    .from("propietarios")
    .select("cedula, nombre, tipo_propietario")
    .eq("cedula", cedula)
    .maybeSingle();
  if (!prop || prop.tipo_propietario !== "AFILIADO") {
    return { ok: false, error: "La cédula no corresponde a un propietario afiliado en GEMA." };
  }
  const clave = generarClaveProvisional();
  const { data, error } = await db
    .from("afiliado_cuentas")
    .insert({
      cedula_propietario: cedula,
      email: correo,
      nombre: nombre.trim() || prop.nombre,
      clave_hash: await hashClave(clave),
      created_por_email: perms.userEmail,
    })
    .select("id")
    .single();
  if (error) {
    return { ok: false, error: /duplicate|unique/i.test(error.message) ? `Ya existe una cuenta con el correo ${correo}.` : errorTabla(error.message) };
  }
  await registrarAcceso({ evento: "cuenta_creada", cuentaId: data.id, email: correo, actorEmail: perms.userEmail, detalle: { cedula } });
  revalidatePath("/tesoreria/liquidacion-afiliados");
  return { ok: true, clave };
}

/** Nueva clave provisional; cierra las sesiones abiertas y levanta el bloqueo. */
export async function restablecerClavePortal(cuentaId: string): Promise<ResultadoClave> {
  const perms = await exigirGestionCuentas();
  const db = createAdminClient();
  const { data: c, error: e1 } = await db.from("afiliado_cuentas").select("email, sesion_version").eq("id", cuentaId).single();
  if (e1 || !c) return { ok: false, error: e1 ? errorTabla(e1.message) : "Cuenta no encontrada." };
  const clave = generarClaveProvisional();
  const { error } = await db.from("afiliado_cuentas").update({
    clave_hash: await hashClave(clave),
    debe_cambiar_clave: true,
    sesion_version: c.sesion_version + 1,
    intentos_fallidos: 0,
    bloqueado_hasta: null,
    updated_at: new Date().toISOString(),
  }).eq("id", cuentaId);
  if (error) return { ok: false, error: errorTabla(error.message) };
  await registrarAcceso({ evento: "clave_restablecida", cuentaId, email: c.email, actorEmail: perms.userEmail });
  revalidatePath("/tesoreria/liquidacion-afiliados");
  return { ok: true, clave };
}

/** Activa o desactiva una cuenta. Desactivar cierra sus sesiones de inmediato. */
export async function cambiarEstadoCuentaPortal(cuentaId: string, activo: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const perms = await exigirGestionCuentas();
  const db = createAdminClient();
  const { data: c, error: e1 } = await db.from("afiliado_cuentas").select("email, sesion_version").eq("id", cuentaId).single();
  if (e1 || !c) return { ok: false, error: e1 ? errorTabla(e1.message) : "Cuenta no encontrada." };
  const { error } = await db.from("afiliado_cuentas").update({
    activo,
    sesion_version: c.sesion_version + 1,
    updated_at: new Date().toISOString(),
  }).eq("id", cuentaId);
  if (error) return { ok: false, error: errorTabla(error.message) };
  await registrarAcceso({ evento: activo ? "cuenta_reactivada" : "cuenta_desactivada", cuentaId, email: c.email, actorEmail: perms.userEmail });
  revalidatePath("/tesoreria/liquidacion-afiliados");
  return { ok: true };
}
