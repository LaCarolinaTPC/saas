/**
 * Procesos disciplinarios — lectura y acceso (solo servidor). Reglas puras en
 * ./reglas.ts. Tabla `procesos_disciplinarios` (migración 20261027200246).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess, getCurrentPermissions, type Permissions, tienePermiso } from "@/lib/permissions";
import type { Proceso } from "./reglas";

/**
 * Permisos si el usuario tiene el módulo `disciplinarios` (y, con una acción,
 * `disciplinarios.<acción>`); si no, lanza.
 */
export async function assertDisciplinarios(accion: false | "crear" | "editar" | "anular" = false): Promise<Permissions> {
  const perms = await getCurrentPermissions();
  if (!perms.userId || !canAccess(perms, "disciplinarios")) {
    throw new Error("No tienes acceso a Procesos disciplinarios.");
  }
  if (accion && !tienePermiso(perms, `disciplinarios.${accion}`)) {
    throw new Error(
      accion === "crear"
        ? "No tienes permiso para registrar procesos disciplinarios."
        : accion === "anular"
          ? "No tienes permiso para anular procesos disciplinarios."
          : "No tienes permiso para modificar procesos disciplinarios."
    );
  }
  return perms;
}

export async function tieneAccesoDisciplinarios(): Promise<Permissions | null> {
  const perms = await getCurrentPermissions();
  return perms.userId && canAccess(perms, "disciplinarios") ? perms : null;
}

export const SELECT_PROCESO =
  "id, consecutivo, cedula, codigo, nombre, tipo, fecha_hecho, motivo, motivo_detalle, descripcion, fecha_citacion, " +
  "fecha_descargos, asistio, resumen_descargos, medida, dias_suspension, fecha_medida, medida_detalle, responsable, " +
  "norma_incumplida, cargo, area, realizado_por, origen, " +
  "created_by_email, created_at, updated_by_email, updated_at";

export type FilaProceso = {
  id: string;
  consecutivo: number;
  cedula: string;
  codigo: string | null;
  nombre: string;
  tipo: Proceso["tipo"];
  fecha_hecho: string;
  motivo: Proceso["motivo"];
  motivo_detalle: string | null;
  descripcion: string | null;
  fecha_citacion: string | null;
  fecha_descargos: string | null;
  asistio: boolean | null;
  resumen_descargos: string | null;
  medida: Proceso["medida"];
  dias_suspension: number | null;
  fecha_medida: string | null;
  medida_detalle: string | null;
  responsable: string | null;
  norma_incumplida: Proceso["normaIncumplida"];
  cargo: string | null;
  area: Proceso["area"];
  realizado_por: string | null;
  origen: Proceso["origen"] | null;
  created_by_email: string | null;
  created_at: string;
  updated_by_email: string | null;
  updated_at: string | null;
};

export function procesoDeFila(f: FilaProceso): Proceso {
  return {
    id: f.id,
    consecutivo: Number(f.consecutivo),
    cedula: f.cedula,
    codigo: f.codigo,
    nombre: f.nombre,
    tipo: f.tipo,
    fechaHecho: f.fecha_hecho,
    motivo: f.motivo,
    motivoDetalle: f.motivo_detalle,
    descripcion: f.descripcion,
    fechaCitacion: f.fecha_citacion,
    fechaDescargos: f.fecha_descargos,
    asistio: f.asistio,
    resumenDescargos: f.resumen_descargos,
    medida: f.medida,
    diasSuspension: f.dias_suspension,
    fechaMedida: f.fecha_medida,
    medidaDetalle: f.medida_detalle,
    responsable: f.responsable,
    normaIncumplida: f.norma_incumplida,
    cargo: f.cargo,
    area: f.area,
    realizadoPor: f.realizado_por,
    origen: f.origen ?? "gestivo",
    createdByEmail: f.created_by_email,
    createdAt: f.created_at,
    updatedByEmail: f.updated_by_email,
    updatedAt: f.updated_at,
  };
}

/**
 * Todos los procesos vigentes (no anulados), el más reciente primero. Son
 * pocos cientos al año: se traen todos y la pantalla filtra.
 */
export async function getProcesos(): Promise<Proceso[]> {
  const db = createAdminClient();
  const salida: Proceso[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db
      .from("procesos_disciplinarios")
      .select(SELECT_PROCESO)
      .is("anulado_en", null)
      .order("fecha_hecho", { ascending: false })
      .order("consecutivo", { ascending: false })
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as unknown as FilaProceso[];
    salida.push(...filas.map(procesoDeFila));
    if (filas.length < 1000) break;
  }
  return salida;
}

/** Procesos vigentes de un trabajador, el más reciente primero. */
export async function getProcesosDe(cedula: string): Promise<Proceso[]> {
  const { data, error } = await createAdminClient()
    .from("procesos_disciplinarios")
    .select(SELECT_PROCESO)
    .eq("cedula", cedula)
    .is("anulado_en", null)
    .order("fecha_hecho", { ascending: false })
    .order("consecutivo", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FilaProceso[]).map(procesoDeFila);
}

export interface OpcionConductor {
  cedula: string;
  nombre: string;
  codigo: string | null;
  retirado: boolean;
}

/** Conductores del maestro para el buscador del formulario (activos primero). */
export async function getConductoresParaProcesos(): Promise<OpcionConductor[]> {
  const db = createAdminClient();
  const salida: OpcionConductor[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db.from("conductores").select("cedula, nombre, codigo, estado").order("nombre").range(desde, desde + 999);
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as { cedula: string | null; nombre: string | null; codigo: string | null; estado: string | null }[];
    for (const f of filas) {
      if (!f.cedula || !f.nombre) continue;
      salida.push({ cedula: f.cedula, nombre: f.nombre, codigo: f.codigo, retirado: (f.estado ?? "").toUpperCase() !== "ACTIVO" });
    }
    if (filas.length < 1000) break;
  }
  return salida.sort((a, b) => Number(a.retirado) - Number(b.retirado) || a.nombre.localeCompare(b.nombre));
}
