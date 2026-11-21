"use server";

/**
 * Configuración de la selección de conductores (N1–N5, B1): textos de los
 * mensajes, modo de envío, plantillas de Meta, tiempos y reglas del semáforo.
 * Cada cambio queda en seleccion_cambios con quién lo hizo.
 */
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, puedeEditarEn, tienePermiso } from "@/lib/permissions";
import { validarTextoMensaje, type MensajeSeleccion } from "@/lib/seleccion/mensajes";
import { enviarVersionPlantilla, sincronizarPlantillas } from "@/lib/seleccion/plantillas";
import type { AjusteSeleccion } from "@/lib/seleccion/servidor";
import { validarAjuste } from "@/lib/seleccion/ajustes";
import { validarSeguimiento, type ConfigSeguimiento } from "@/lib/comunicaciones/seguimiento";
import { escribirConfigSeguimiento, leerConfigSeguimiento } from "@/lib/comunicaciones/seguimiento-ejecutar";

const RUTA = "/candidatos/seleccion";

async function exigirEdicion() {
  const perms = await getCurrentPermissions();
  if (!puedeEditarEn(perms, "candidatos.seleccion_config")) {
    throw new Error("No tienes permiso para cambiar la configuración de la selección.");
  }
  return perms;
}

type Resultado = { ok: true; aviso?: string } | { ok: false; error: string };

async function registrarCambio(tipo: "mensaje" | "ajuste", clave: string, campo: string, anterior: unknown, nuevo: unknown, email: string | null) {
  await createAdminClient().from("seleccion_cambios").insert({
    tipo,
    clave,
    campo,
    valor_anterior: anterior === undefined ? null : anterior,
    valor_nuevo: nuevo === undefined ? null : nuevo,
    usuario_email: email,
  });
}

export async function guardarMensaje(clave: string, cambios: { texto?: string; modo?: "automatico" | "revisar" }): Promise<Resultado> {
  const perms = await exigirEdicion();
  const db = createAdminClient();
  const { data } = await db.from("seleccion_mensajes").select("*").eq("clave", clave).maybeSingle();
  if (!data) return { ok: false, error: "El mensaje no existe." };
  const m = data as MensajeSeleccion;

  const patch: Record<string, unknown> = {};
  if (cambios.texto !== undefined) {
    const texto = cambios.texto.trim();
    const errores = validarTextoMensaje(texto, m.variables);
    if (errores.length) return { ok: false, error: errores.join(" ") };
    if (texto !== m.texto) patch.texto = texto;
  }
  if (cambios.modo && cambios.modo !== m.modo) {
    if (cambios.modo !== "automatico" && cambios.modo !== "revisar") return { ok: false, error: "Modo de envío no válido." };
    patch.modo = cambios.modo;
  }
  if (!Object.keys(patch).length) return { ok: true };

  const { error } = await db
    .from("seleccion_mensajes")
    .update({ ...patch, actualizado_por: perms.userEmail, updated_at: new Date().toISOString() })
    .eq("clave", clave);
  if (error) return { ok: false, error: error.message };
  for (const [campo, nuevo] of Object.entries(patch)) {
    await registrarCambio("mensaje", clave, campo, (m as unknown as Record<string, unknown>)[campo], nuevo, perms.userEmail);
  }
  revalidatePath(RUTA);
  const aviso =
    "texto" in patch && m.plantilla_nombre
      ? "Guardado. Dentro de la ventana de 24 horas ya sale con el texto nuevo; fuera de ella sigue la plantilla aprobada hasta que envíe y Meta apruebe la versión nueva."
      : undefined;
  return { ok: true, aviso };
}

export async function restaurarMensaje(clave: string): Promise<Resultado> {
  await exigirEdicion();
  const { data } = await createAdminClient().from("seleccion_mensajes").select("texto_sugerido").eq("clave", clave).maybeSingle();
  if (!data) return { ok: false, error: "El mensaje no existe." };
  return guardarMensaje(clave, { texto: data.texto_sugerido as string });
}

export async function guardarAjuste(clave: string, valor: unknown): Promise<Resultado> {
  const perms = await exigirEdicion();
  const db = createAdminClient();
  const { data: filas } = await db.from("seleccion_ajustes").select("*");
  const ajustes = (filas ?? []) as AjusteSeleccion[];
  const a = ajustes.find((x) => x.clave === clave);
  if (!a) return { ok: false, error: "El ajuste no existe." };
  const v = validarAjuste(a, valor, ajustes);
  if (!v.ok) return v;
  if (JSON.stringify(v.valor) === JSON.stringify(a.valor)) return { ok: true };
  const { error } = await db
    .from("seleccion_ajustes")
    .update({ valor: v.valor, actualizado_por: perms.userEmail, updated_at: new Date().toISOString() })
    .eq("clave", clave);
  if (error) return { ok: false, error: error.message };
  await registrarCambio("ajuste", clave, "valor", a.valor, v.valor, perms.userEmail);
  revalidatePath(RUTA);
  return { ok: true };
}

export async function restaurarAjuste(clave: string): Promise<Resultado> {
  await exigirEdicion();
  const { data } = await createAdminClient().from("seleccion_ajustes").select("valor_sugerido").eq("clave", clave).maybeSingle();
  if (!data) return { ok: false, error: "El ajuste no existe." };
  return guardarAjuste(clave, data.valor_sugerido);
}

/** Campos del recordatorio con su nombre en el historial (clave «seguimiento»). */
const CAMPOS_SEGUIMIENTO: Record<keyof ConfigSeguimiento, string> = {
  activo: "activo",
  horasEspera: "horas de espera",
  maxRecordatorios: "veces",
  horasEscalar: "horas para pasar a una persona",
  mensaje: "mensaje",
  mensajesSiguientes: "recordatorios siguientes",
  horaDesde: "horario desde",
  horaHasta: "horario hasta",
};

/**
 * Recordatorio a quien deja de responder y horario de los mensajes
 * automáticos (wa_seguimiento). Es la misma configuración de Comunicaciones,
 * editable aquí con el permiso de la selección.
 */
export async function guardarSeguimientoSeleccion(datos: ConfigSeguimiento): Promise<Resultado> {
  const perms = await exigirEdicion();
  const v = validarSeguimiento(datos);
  if (!v.ok) return v;
  const { config: anterior } = await leerConfigSeguimiento();
  const r = await escribirConfigSeguimiento(v.config, perms.userEmail ?? null);
  if (!r.ok) return { ok: false, error: r.error ?? "No se pudo guardar." };
  for (const [k, campo] of Object.entries(CAMPOS_SEGUIMIENTO) as [keyof ConfigSeguimiento, string][]) {
    if (JSON.stringify(anterior[k]) !== JSON.stringify(v.config[k])) await registrarCambio("ajuste", "seguimiento", campo, anterior[k], v.config[k], perms.userEmail);
  }
  revalidatePath(RUTA);
  revalidatePath("/comunicaciones/configuracion");
  return { ok: true };
}

export async function actualizarEstadoPlantillas(): Promise<Resultado> {
  await exigirEdicion();
  const r = await sincronizarPlantillas();
  revalidatePath(RUTA);
  return r.ok ? { ok: true, aviso: `Estado de ${r.actualizadas} plantillas actualizado con Meta.` } : r;
}

export async function enviarPlantillaAAprobacion(clave: string): Promise<Resultado> {
  await exigirEdicion();
  const r = await enviarVersionPlantilla(clave);
  revalidatePath(RUTA);
  return r.ok ? { ok: true, aviso: `Enviada a Meta como «${r.nombre}». Mientras la aprueba se sigue usando la versión anterior.` } : r;
}

export interface CambioSeleccion {
  id: string;
  campo: string;
  valor_anterior: unknown;
  valor_nuevo: unknown;
  usuario_email: string | null;
  created_at: string;
}

export async function historialCambios(tipo: "mensaje" | "ajuste", clave: string): Promise<CambioSeleccion[]> {
  const perms = await getCurrentPermissions();
  if (!tienePermiso(perms, "candidatos.seleccion_config.ver") && !puedeEditarEn(perms, "candidatos.seleccion_config")) {
    throw new Error("Sin permiso.");
  }
  const { data } = await createAdminClient()
    .from("seleccion_cambios")
    .select("id, campo, valor_anterior, valor_nuevo, usuario_email, created_at")
    .eq("tipo", tipo)
    .eq("clave", clave)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as CambioSeleccion[];
}
