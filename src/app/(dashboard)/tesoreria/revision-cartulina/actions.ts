"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { MARCA_SELECT, mapMarca, type MarcaRevision } from "@/lib/tesoreria/revision-timbradas-data";
import { ESTADOS, RESULTADOS_REVISION, type EstadoTimbrada, type ResultadoRevision } from "@/lib/tesoreria/revision-timbradas-reglas";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const RUTA = "/tesoreria/revision-cartulina";

async function assertRevisor() {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "tesoreria", "cartulina")) {
    throw new Error("No tienes acceso a la revisión de cartulina.");
  }
  if (!perms.isAdmin && !perms.puedeEditar) {
    throw new Error("Tu tipo de usuario es de solo consulta.");
  }
  return perms;
}

export interface MarcaInput {
  fecha: string;
  numero: number;
  placa: string;
  viaje: number;
  /** Opcional: sin resultado es el check simple de revisado. */
  resultado?: ResultadoRevision | null;
  nota?: string | null;
  estadoCalculado: EstadoTimbrada;
}

/** Marca un viaje como revisado (check), con resultado y nota opcionales; reemplaza la marca anterior. */
export async function marcarViajeRevisado(
  input: MarcaInput,
): Promise<{ success: boolean; error?: string; marca?: MarcaRevision }> {
  try {
    const perms = await assertRevisor();
    if (!FECHA_RE.test(input.fecha)) throw new Error("Fecha no válida.");
    const numero = Math.trunc(Number(input.numero));
    if (!Number.isFinite(numero) || numero <= 0) throw new Error("Viaje no válido.");
    const resultado = input.resultado || null;
    if (resultado && !(RESULTADOS_REVISION as readonly string[]).includes(resultado)) throw new Error("Resultado no válido.");
    if (!(ESTADOS as readonly string[]).includes(input.estadoCalculado)) throw new Error("Estado no válido.");
    const nota = input.nota?.trim() || null;
    if (nota && nota.length > 500) throw new Error("La nota no puede pasar de 500 caracteres.");
    if (resultado === "Otro (ver nota)" && !nota) throw new Error("Con «Otro» escribe la nota.");

    const db = createAdminClient();
    const { data, error } = await db
      .from("tesoreria_revision_timbradas")
      .upsert(
        {
          fecha_viaje: input.fecha,
          numero,
          placa: input.placa,
          viaje: input.viaje,
          resultado,
          nota,
          estado_calculado: input.estadoCalculado,
          revisado_por: perms.userId,
          revisado_por_email: perms.userEmail,
          revisado_at: new Date().toISOString(),
        },
        { onConflict: "fecha_viaje,numero" },
      )
      .select(MARCA_SELECT)
      .single();
    if (error) throw new Error(error.message);

    await logTesoreriaAudit({
      accion: "timbrada_revisada",
      modulo: "tesoreria",
      rol: perms.userType,
      valorNuevo: `${resultado ?? "Revisado"}${nota ? ` · ${nota}` : ""}`,
      detalle: { fecha: input.fecha, numero, placa: input.placa, viaje: input.viaje, estado: input.estadoCalculado },
    });

    revalidatePath(RUTA);
    return { success: true, marca: mapMarca(data as Record<string, unknown>) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Quita la marca de revisión de un viaje (queda el rastro en la auditoría). */
export async function quitarRevisionViaje(fecha: string, numero: number): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertRevisor();
    if (!FECHA_RE.test(fecha)) throw new Error("Fecha no válida.");
    const db = createAdminClient();
    const { data, error } = await db
      .from("tesoreria_revision_timbradas")
      .delete()
      .eq("fecha_viaje", fecha)
      .eq("numero", numero)
      .select(MARCA_SELECT);
    if (error) throw new Error(error.message);
    const previa = data?.[0] ? mapMarca(data[0] as Record<string, unknown>) : null;

    await logTesoreriaAudit({
      accion: "timbrada_revision_quitada",
      modulo: "tesoreria",
      rol: perms.userType,
      valorAnterior: previa ? `${previa.resultado ?? "Revisado"}${previa.nota ? ` · ${previa.nota}` : ""} (${previa.revisadoPorEmail ?? "—"})` : null,
      detalle: { fecha, numero },
    });

    revalidatePath(RUTA);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
