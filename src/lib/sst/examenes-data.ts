/**
 * Exámenes periódicos (SST) — lectura y acceso (solo servidor). Reglas puras en
 * ./examenes.ts. Tablas `sst_examenes_personas` y `sst_examenes_periodicos`
 * (migración 20261105161614_sst_examenes_periodicos.sql).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess, getCurrentPermissions, type Permissions, tienePermiso } from "@/lib/permissions";
import { esGrupo, type ExamenPeriodico, type MotivoInactivo, type PersonaExamen } from "./examenes";

export type AccionExamenes = "crear" | "editar" | "anular";

/** Permisos si tiene el módulo (y, con una acción, `examenes_periodicos.<acción>`); si no, lanza. */
export async function assertExamenes(accion: false | AccionExamenes = false): Promise<Permissions> {
  const perms = await getCurrentPermissions();
  if (!perms.userId || !canAccess(perms, "examenes_periodicos")) {
    throw new Error("No tienes acceso a Exámenes periódicos.");
  }
  if (accion && !tienePermiso(perms, `examenes_periodicos.${accion}`)) {
    throw new Error(
      accion === "crear"
        ? "No tienes permiso para registrar exámenes periódicos."
        : accion === "anular"
          ? "No tienes permiso para anular exámenes periódicos."
          : "No tienes permiso para modificar exámenes periódicos."
    );
  }
  return perms;
}

export async function tieneAccesoExamenes(): Promise<Permissions | null> {
  const perms = await getCurrentPermissions();
  return perms.userId && canAccess(perms, "examenes_periodicos") ? perms : null;
}

export const SELECT_PERSONA =
  "cedula, nombre, cargo, grupo, fecha_ingreso, periodicidad_meses, activo, motivo_inactivo, inactivo_desde, observaciones, origen";
export const SELECT_EXAMEN =
  "id, cedula, nombre, cargo, fecha_atencion, fecha_entrega, periodicidad_meses, proximo_examen, recomendaciones, observaciones, " +
  "origen, created_by_email, created_at, updated_by_email, updated_at";

const s = (v: unknown) => (v == null ? null : String(v));

export function personaDeFila(f: Record<string, unknown>): PersonaExamen {
  return {
    cedula: String(f.cedula),
    nombre: String(f.nombre),
    cargo: s(f.cargo),
    grupo: esGrupo(f.grupo) ? f.grupo : "administrativos",
    fechaIngreso: s(f.fecha_ingreso),
    periodicidadMeses: Number(f.periodicidad_meses ?? 12),
    activo: f.activo !== false,
    motivoInactivo: f.motivo_inactivo === "retirado" || f.motivo_inactivo === "otro" ? (f.motivo_inactivo as MotivoInactivo) : null,
    inactivoDesde: s(f.inactivo_desde),
    observaciones: s(f.observaciones),
    origen: f.origen === "historico" ? "historico" : "gestivo",
  };
}

export function examenDeFila(f: Record<string, unknown>): ExamenPeriodico {
  return {
    id: String(f.id),
    cedula: String(f.cedula),
    nombre: String(f.nombre),
    cargo: s(f.cargo),
    fechaAtencion: String(f.fecha_atencion),
    fechaEntrega: s(f.fecha_entrega),
    periodicidadMeses: Number(f.periodicidad_meses ?? 12),
    proximoExamen: String(f.proximo_examen),
    recomendaciones: s(f.recomendaciones),
    observaciones: s(f.observaciones),
    origen: f.origen === "historico" ? "historico" : "gestivo",
    createdByEmail: s(f.created_by_email),
    createdAt: String(f.created_at),
    updatedByEmail: s(f.updated_by_email),
    updatedAt: s(f.updated_at),
  };
}

async function todas<T>(tabla: string, select: string, mapa: (f: Record<string, unknown>) => T, filtro?: (q: any) => any): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const db = createAdminClient();
  const salida: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    let q = db.from(tabla).select(select);
    if (filtro) q = filtro(q);
    const { data, error } = await q.order(tabla === "sst_examenes_personas" ? "cedula" : "id").range(desde, desde + 999);
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as unknown as Record<string, unknown>[];
    salida.push(...filas.map(mapa));
    if (filas.length < 1000) break;
  }
  return salida;
}

/** Toda la población en control (activos e inactivos). Son unos cientos: se traen todos. */
export const getPersonasExamenes = () => todas("sst_examenes_personas", SELECT_PERSONA, personaDeFila);

/** Todos los exámenes no anulados (unos mil): se traen todos y se cruzan en el cliente. */
export const getExamenes = () => todas("sst_examenes_periodicos", SELECT_EXAMEN, examenDeFila, (q) => q.is("anulado_en", null));

/**
 * Cédulas que el maestro (GEMA o Empleados) da por retiradas: si siguen activas
 * en el control, la pantalla lo avisa para sacarlas.
 */
export async function getRetiradosEnMaestro(cedulas: string[]): Promise<string[]> {
  if (!cedulas.length) return [];
  const db = createAdminClient();
  const retirados = new Set<string>();
  const activos = new Set<string>();
  for (let i = 0; i < cedulas.length; i += 300) {
    const lote = cedulas.slice(i, i + 300);
    const [c, e] = await Promise.all([
      db.from("conductores").select("cedula, estado").in("cedula", lote),
      db.from("employees").select("document_number, status").in("document_number", lote),
    ]);
    for (const f of (c.data ?? []) as { cedula: string; estado: string | null }[]) {
      if ((f.estado ?? "").toUpperCase() === "ACTIVO") activos.add(f.cedula);
      else if (/RETIR/i.test(f.estado ?? "")) retirados.add(f.cedula);
    }
    for (const f of (e.data ?? []) as { document_number: string; status: string | null }[]) {
      if (/activ|periodo_prueba|permiso/i.test(f.status ?? "") && !/inactiv/i.test(f.status ?? "")) activos.add(f.document_number);
      else if (/retir/i.test(f.status ?? "")) retirados.add(f.document_number);
    }
  }
  // Activo en cualquiera de los dos maestros gana (p. ej. un conductor que pasó a empleado).
  return [...retirados].filter((c) => !activos.has(c));
}
