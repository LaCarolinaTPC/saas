"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, canAccess } from "@/lib/permissions";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { REPORTE_SELECT, mapReporte } from "@/lib/operativo/velocidad";
import type { ReporteRrhh } from "@/lib/operativo/velocidad-reglas";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

async function assertVelocidad(editar: boolean) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "operativo")) {
    throw new Error("No tienes acceso al módulo Operativo.");
  }
  if (editar && !perms.isAdmin && !perms.puedeEditar) {
    throw new Error("Tu tipo de usuario es de solo consulta.");
  }
  return perms;
}

type Resultado<T = undefined> = { success: boolean; error?: string } & (T extends undefined ? object : { dato?: T });

export interface ReporteInput {
  cedula: string;
  codigo: string | null;
  nombre: string;
  semanaDesde: string;
  semanaHasta: string;
  incidencias: number;
  velocidadMax: number | null;
  reportadoEn: string;
  observaciones?: string | null;
}

/** Marca a un conductor como reportado a RRHH por la semana indicada. */
export async function marcarReporteVelocidad(
  input: ReporteInput
): Promise<{ success: boolean; error?: string; reporte?: ReporteRrhh; existente?: boolean }> {
  try {
    const perms = await assertVelocidad(true);
    const cedula = input.cedula.replace(/\D/g, "");
    if (!cedula) throw new Error("Falta la cédula del conductor.");
    const nombre = input.nombre.trim();
    if (!nombre) throw new Error("Falta el nombre del conductor.");
    for (const [campo, v] of [
      ["inicio de la semana", input.semanaDesde],
      ["fin de la semana", input.semanaHasta],
      ["reporte", input.reportadoEn],
    ] as const) {
      if (!FECHA_RE.test(v)) throw new Error(`Fecha de ${campo} no válida.`);
    }
    if (input.semanaHasta < input.semanaDesde) throw new Error("La semana termina antes de empezar.");
    const incidencias = Math.trunc(Number(input.incidencias));
    if (!Number.isFinite(incidencias) || incidencias < 1) throw new Error("El reporte exige al menos una incidencia.");
    const observaciones = input.observaciones?.trim() || null;
    if (observaciones && observaciones.length > 300) throw new Error("Las observaciones no pueden pasar de 300 caracteres.");

    const db = createAdminClient();
    const { data: vigente } = await db
      .from("operativo_velocidad_reportes")
      .select(REPORTE_SELECT)
      .eq("cedula", cedula)
      .eq("semana_desde", input.semanaDesde)
      .is("anulada_en", null)
      .maybeSingle();
    if (vigente) return { success: true, existente: true, reporte: mapReporte(vigente as unknown as Parameters<typeof mapReporte>[0]) };

    const { data, error } = await db
      .from("operativo_velocidad_reportes")
      .insert({
        cedula,
        codigo: input.codigo?.trim() || null,
        nombre,
        semana_desde: input.semanaDesde,
        semana_hasta: input.semanaHasta,
        incidencias,
        velocidad_max: input.velocidadMax,
        reportado_en: input.reportadoEn,
        observaciones,
        created_by: perms.userId,
        created_by_email: perms.userEmail,
      })
      .select(REPORTE_SELECT)
      .single();
    if (error) throw new Error(error.message);
    const reporte = mapReporte(data as unknown as Parameters<typeof mapReporte>[0]);

    await logTesoreriaAudit({
      accion: "velocidad_reportado_rrhh",
      modulo: "operativo",
      cedulaConductor: cedula,
      conductorNombre: nombre,
      valor: incidencias,
      rol: perms.userType,
      valorNuevo: `Semana ${input.semanaDesde} a ${input.semanaHasta} · ${incidencias} incidencias · máx ${input.velocidadMax ?? "—"} km/h`,
      detalle: { reporte_id: reporte.id, reportado_en: input.reportadoEn, observaciones, codigo: input.codigo },
    });

    revalidatePath("/operativo/velocidad");
    return { success: true, reporte };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Anula una marca de reporte con motivo; la fila se conserva como rastro. */
export async function anularReporteVelocidad(id: string, motivo: string): Promise<Resultado> {
  try {
    const perms = await assertVelocidad(true);
    const m = motivo.trim();
    if (m.length < 5) throw new Error("Indica el motivo de la anulación (mínimo 5 caracteres).");
    if (m.length > 200) throw new Error("El motivo no puede pasar de 200 caracteres.");
    const db = createAdminClient();
    const { data, error } = await db
      .from("operativo_velocidad_reportes")
      .update({ anulada_en: new Date().toISOString(), anulada_por_email: perms.userEmail, motivo_anulacion: m })
      .eq("id", id)
      .is("anulada_en", null)
      .select(REPORTE_SELECT);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error("El reporte no existe o ya estaba anulado.");
    const r = mapReporte(data[0] as unknown as Parameters<typeof mapReporte>[0]);

    await logTesoreriaAudit({
      accion: "velocidad_reporte_anulado",
      modulo: "operativo",
      cedulaConductor: r.cedula,
      conductorNombre: r.nombre,
      valor: r.incidencias,
      rol: perms.userType,
      valorAnterior: `Reportado el ${r.reportadoEn} · semana ${r.semanaDesde} a ${r.semanaHasta}`,
      valorNuevo: "Anulado",
      detalle: { reporte_id: id, motivo: m },
    });

    revalidatePath("/operativo/velocidad");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Cambia el umbral, el mínimo de incidencias y los minutos de agrupación. */
export async function actualizarParametrosVelocidad(input: {
  umbralKmh: number;
  minimoIncidencias: number;
  minutosAgrupacion: number;
}): Promise<Resultado> {
  try {
    const perms = await assertVelocidad(true);
    const umbral = Number(input.umbralKmh);
    const minimo = Math.trunc(Number(input.minimoIncidencias));
    const minutos = Math.trunc(Number(input.minutosAgrupacion));
    if (!Number.isFinite(umbral) || umbral < 50 || umbral > 150) {
      throw new Error("El umbral debe estar entre 50 y 150 km/h (GEMA no reporta por debajo de 50).");
    }
    if (!Number.isFinite(minimo) || minimo < 1 || minimo > 100) throw new Error("El mínimo de incidencias debe estar entre 1 y 100.");
    if (!Number.isFinite(minutos) || minutos < 1 || minutos > 120) throw new Error("Los minutos de agrupación deben estar entre 1 y 120.");

    const db = createAdminClient();
    const { data: prev } = await db
      .from("operativo_velocidad_parametros")
      .select("umbral_kmh, minimo_incidencias, minutos_agrupacion")
      .eq("id", 1)
      .maybeSingle();
    const { error } = await db
      .from("operativo_velocidad_parametros")
      .upsert({
        id: 1,
        umbral_kmh: umbral,
        minimo_incidencias: minimo,
        minutos_agrupacion: minutos,
        updated_by_email: perms.userEmail,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);

    await logTesoreriaAudit({
      accion: "velocidad_parametros",
      modulo: "operativo",
      rol: perms.userType,
      valorAnterior: prev ? `${prev.umbral_kmh} km/h · ${prev.minimo_incidencias} incid. · ${prev.minutos_agrupacion} min` : null,
      valorNuevo: `${umbral} km/h · ${minimo} incid. · ${minutos} min`,
      detalle: { umbral_kmh: umbral, minimo_incidencias: minimo, minutos_agrupacion: minutos },
    });

    revalidatePath("/operativo/velocidad");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
