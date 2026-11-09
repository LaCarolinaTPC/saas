/**
 * Exámenes periódicos (SST) — lectura y acceso (solo servidor). Reglas puras en
 * ./examenes.ts. Tablas `sst_examenes_personas` y `sst_examenes_periodicos`
 * (migración 20261105161614_sst_examenes_periodicos.sql).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess, getCurrentPermissions, type Permissions, tienePermiso } from "@/lib/permissions";
import { SELECT_PERSONA, personaDeFila, type ExamenPeriodico } from "./examenes";
import { clasificarConductor, clasificarEmpleado } from "./examenes-sincronizacion";
import { leerProfesiograma } from "./examenes-sincronizar";
import type { TablaProfesiograma } from "./profesiograma";

// Viven en ./examenes (puras) para que también los use el script de sincronización.
export { SELECT_PERSONA, personaDeFila };

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

export const SELECT_EXAMEN =
  "id, cedula, nombre, cargo, fecha_atencion, fecha_entrega, periodicidad_meses, proximo_examen, recomendaciones, observaciones, " +
  "origen, created_by_email, created_at, updated_by_email, updated_at";

const s = (v: unknown) => (v == null ? null : String(v));

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

export interface CargaProfesiograma {
  id: number;
  origen: "archivo" | "edicion" | "siembra";
  archivo: string | null;
  fechaDocumento: string | null;
  cargos: number;
  cambios: number;
  personasAplicadas: number;
  usuarioEmail: string | null;
  cargadoAt: string;
}

export interface DatosProfesiograma {
  tabla: TablaProfesiograma;
  /** false = la migración 20261109213335 no está aplicada: se usa la versión del código y no se puede editar. */
  editable: boolean;
  cargas: CargaProfesiograma[];
}

/** El profesiograma vigente y sus últimas cargas. */
export async function getProfesiograma(): Promise<DatosProfesiograma> {
  const db = createAdminClient();
  const { tabla, deTabla } = await leerProfesiograma(db);
  if (!deTabla) return { tabla, editable: false, cargas: [] };
  const { data } = await db
    .from("sst_profesiograma_cargas")
    .select("id, origen, archivo, fecha_documento, cargos, cambios, personas_aplicadas, usuario_email, cargado_at")
    .order("cargado_at", { ascending: false })
    .limit(10);
  return {
    tabla,
    editable: true,
    cargas: (data ?? []).map((f) => ({
      id: Number(f.id),
      origen: f.origen as CargaProfesiograma["origen"],
      archivo: s(f.archivo),
      fechaDocumento: s(f.fecha_documento),
      cargos: Number(f.cargos),
      cambios: Array.isArray(f.cambios) ? f.cambios.length : 0,
      personasAplicadas: Number(f.personas_aplicadas ?? 0),
      usuarioEmail: s(f.usuario_email),
      cargadoAt: String(f.cargado_at),
    })),
  };
}

export interface NovedadExamenes {
  id: number;
  cedula: string;
  nombre: string;
  grupo: string;
  cargo: string | null;
  tipo: "ingreso" | "retiro" | "reingreso";
  fecha: string | null;
  periodicidadMeses: number | null;
  sinProfesiograma: boolean;
  detectadoAt: string;
  origen: "cron" | "manual";
  usuarioEmail: string | null;
}

/**
 * Novedades de la sincronización con GEMA de los últimos `dias` días.
 * `disponible: false` si la migración 20261109211226 no está aplicada.
 */
export async function getNovedadesExamenes(dias = 30): Promise<{ disponible: boolean; novedades: NovedadExamenes[] }> {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await createAdminClient()
    .from("sst_examenes_novedades")
    .select("id, cedula, nombre, grupo, cargo, tipo, fecha, periodicidad_meses, sin_profesiograma, detectado_at, origen, usuario_email")
    .gte("detectado_at", desde)
    .order("detectado_at", { ascending: false })
    .limit(500);
  if (error) return { disponible: false, novedades: [] };
  return {
    disponible: true,
    novedades: (data ?? []).map((f) => ({
      id: Number(f.id),
      cedula: String(f.cedula),
      nombre: String(f.nombre),
      grupo: String(f.grupo),
      cargo: s(f.cargo),
      tipo: f.tipo as NovedadExamenes["tipo"],
      fecha: s(f.fecha),
      periodicidadMeses: f.periodicidad_meses == null ? null : Number(f.periodicidad_meses),
      sinProfesiograma: f.sin_profesiograma === true,
      detectadoAt: String(f.detectado_at),
      origen: f.origen === "manual" ? "manual" : "cron",
      usuarioEmail: s(f.usuario_email),
    })),
  };
}

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
      const k = clasificarConductor(f.estado);
      if (k === "activo") activos.add(f.cedula);
      else if (k === "retirado") retirados.add(f.cedula);
    }
    for (const f of (e.data ?? []) as { document_number: string; status: string | null }[]) {
      const k = clasificarEmpleado(f.status);
      if (k === "activo") activos.add(f.document_number);
      else if (k === "retirado") retirados.add(f.document_number);
    }
  }
  // Activo en cualquiera de los dos maestros gana (p. ej. un conductor que pasó a empleado).
  return [...retirados].filter((c) => !activos.has(c));
}
