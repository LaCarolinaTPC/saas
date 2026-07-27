"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, canAccess } from "@/lib/permissions";
import {
  CONTACTO_KEYS,
  SOPORTE_KEYS,
  TIPO_KEYS,
} from "@/lib/ausentismo/constants";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Todas las acciones exigen el módulo en el servidor (no solo en la UI). */
async function assertAusentismo() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "ausentismo")) {
    throw new Error("No tienes acceso al módulo de Ausentismo.");
  }
  return perms;
}

/**
 * Bitácora del módulo: cualquier creación, edición o eliminación deja rastro
 * con el antes/después y quién lo hizo. Nunca bloquea la operación.
 */
async function logAusentismo(entry: {
  registroId: string;
  accion: "creado" | "editado" | "eliminado";
  anterior?: Record<string, unknown> | null;
  nuevo?: Record<string, unknown> | null;
  userId: string | null;
  userEmail: string | null;
}) {
  try {
    const supabase = createAdminClient();
    await supabase.from("ausentismo_log").insert({
      registro_id: entry.registroId,
      accion: entry.accion,
      datos_anteriores: entry.anterior ?? null,
      datos_nuevos: entry.nuevo ?? null,
      user_id: entry.userId,
      user_email: entry.userEmail,
    });
  } catch (e) {
    console.error("[ausentismo] no se pudo escribir la bitácora:", e);
  }
}

export interface RegistroInput {
  fecha: string;
  cedula: string;
  codigo: string | null;
  nombre: string;
  telefono: string | null;
  tipo: string;
  contacto: string | null;
  justificacion: string | null;
  incapacidadInicio: string | null;
  incapacidadFin: string | null;
  reintegro: string | null;
  soporte: string;
}

function validar(input: RegistroInput) {
  if (!FECHA_RE.test(input.fecha)) throw new Error("Fecha no válida.");
  const cedula = input.cedula.replace(/\D/g, "");
  if (!cedula) throw new Error("Falta la cédula del conductor.");
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("Falta el nombre del conductor.");
  if (!TIPO_KEYS.has(input.tipo)) throw new Error("Tipo de ausencia no válido.");
  if (input.contacto && !CONTACTO_KEYS.has(input.contacto)) {
    throw new Error("Detalle de contacto no válido.");
  }
  if (!SOPORTE_KEYS.has(input.soporte)) throw new Error("Soporte no válido.");
  for (const [campo, v] of [
    ["inicio de incapacidad", input.incapacidadInicio],
    ["fin de incapacidad", input.incapacidadFin],
    ["reintegro", input.reintegro],
  ] as const) {
    if (v && !FECHA_RE.test(v)) throw new Error(`Fecha de ${campo} no válida.`);
  }
  if (
    input.incapacidadInicio &&
    input.incapacidadFin &&
    input.incapacidadFin < input.incapacidadInicio
  ) {
    throw new Error("El fin de la incapacidad no puede ser antes del inicio.");
  }
  return {
    fecha: input.fecha,
    cedula,
    codigo: input.codigo?.trim() || null,
    nombre,
    telefono: input.telefono?.trim() || null,
    tipo: input.tipo,
    contacto: input.contacto || null,
    justificacion: input.justificacion?.trim() || null,
    incapacidad_inicio: input.incapacidadInicio || null,
    incapacidad_fin: input.incapacidadFin || null,
    reintegro: input.reintegro || null,
    soporte: input.soporte,
  };
}

export async function crearRegistro(
  input: RegistroInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertAusentismo();
    const fila = validar(input);
    const supabase = createAdminClient();

    // Evita el doble registro del mismo conductor el mismo día.
    const { data: existente } = await supabase
      .from("ausentismo_registros")
      .select("id")
      .eq("fecha", fila.fecha)
      .eq("cedula", fila.cedula)
      .maybeSingle();
    if (existente) {
      return {
        success: false,
        error: "Este conductor ya tiene un registro en esa fecha. Edítalo en la lista.",
      };
    }

    // El buscador no trae teléfono: se completa del maestro de conductores.
    if (!fila.telefono) {
      const { data: cond } = await supabase
        .from("conductores")
        .select("celular, telefono")
        .eq("cedula", fila.cedula)
        .maybeSingle();
      fila.telefono = cond?.celular || cond?.telefono || null;
    }

    const { data, error } = await supabase
      .from("ausentismo_registros")
      .insert({
        ...fila,
        created_by: perms.userId,
        created_by_email: perms.userEmail,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await logAusentismo({
      registroId: data.id,
      accion: "creado",
      nuevo: fila,
      userId: perms.userId,
      userEmail: perms.userEmail,
    });

    revalidatePath("/ausentismo");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function actualizarRegistro(
  id: string,
  input: RegistroInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertAusentismo();
    const fila = validar(input);
    const supabase = createAdminClient();

    const { data: prev, error: readError } = await supabase
      .from("ausentismo_registros")
      .select("*")
      .eq("id", id)
      .single();
    if (readError) throw new Error("Registro no encontrado.");

    const { error } = await supabase
      .from("ausentismo_registros")
      .update(fila)
      .eq("id", id);
    if (error) throw new Error(error.message);

    await logAusentismo({
      registroId: id,
      accion: "editado",
      anterior: prev,
      nuevo: fila,
      userId: perms.userId,
      userEmail: perms.userEmail,
    });

    revalidatePath("/ausentismo");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function eliminarRegistro(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertAusentismo();
    const supabase = createAdminClient();

    const { data: prev, error: readError } = await supabase
      .from("ausentismo_registros")
      .select("*")
      .eq("id", id)
      .single();
    if (readError) throw new Error("Registro no encontrado.");

    const { error } = await supabase
      .from("ausentismo_registros")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);

    await logAusentismo({
      registroId: id,
      accion: "eliminado",
      anterior: prev,
      userId: perms.userId,
      userEmail: perms.userEmail,
    });

    revalidatePath("/ausentismo");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
