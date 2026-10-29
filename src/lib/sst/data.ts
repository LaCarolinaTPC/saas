/**
 * Accidentes de trabajo (SST) — lectura y acceso (solo servidor). Reglas puras
 * en ./reglas.ts. Tabla `sst_accidentes_trabajo` (migración 20261029231220).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess, getCurrentPermissions, type Permissions, tienePermiso } from "@/lib/permissions";
import type { AccidenteTrabajo } from "./reglas";

/** Permisos si tiene el módulo (y, con una acción, `accidentes_trabajo.<acción>`); si no, lanza. */
export async function assertAccidentesTrabajo(accion: false | "crear" | "editar" | "anular" = false): Promise<Permissions> {
  const perms = await getCurrentPermissions();
  if (!perms.userId || !canAccess(perms, "accidentes_trabajo")) {
    throw new Error("No tienes acceso a Accidentes de trabajo.");
  }
  if (accion && !tienePermiso(perms, `accidentes_trabajo.${accion}`)) {
    throw new Error(
      accion === "crear"
        ? "No tienes permiso para registrar accidentes de trabajo."
        : accion === "anular"
          ? "No tienes permiso para anular accidentes de trabajo."
          : "No tienes permiso para modificar accidentes de trabajo."
    );
  }
  return perms;
}

export async function tieneAccesoAccidentesTrabajo(): Promise<Permissions | null> {
  const perms = await getCurrentPermissions();
  return perms.userId && canAccess(perms, "accidentes_trabajo") ? perms : null;
}

export const SELECT_AT =
  "id, anio, caso, fecha_at, hora, fecha_notificacion, cedula, nombre, cargo, empresa_usuaria, ciudad, sexo, " +
  "tipo_lesion, parte_cuerpo, parte_cuerpo_grupo, mecanismo, agente, descripcion, accidente_transito, dias_incapacidad, " +
  "estado_investigacion, cierre_administrativo_arl, observaciones, origen, created_by_email, created_at, updated_by_email, updated_at";

export function accidenteDeFila(f: Record<string, unknown>): AccidenteTrabajo {
  const s = (v: unknown) => (v == null ? null : String(v));
  return {
    id: String(f.id),
    anio: Number(f.anio),
    caso: Number(f.caso),
    fechaAt: String(f.fecha_at),
    hora: s(f.hora),
    fechaNotificacion: s(f.fecha_notificacion),
    cedula: s(f.cedula),
    nombre: String(f.nombre),
    cargo: s(f.cargo),
    empresaUsuaria: s(f.empresa_usuaria),
    ciudad: s(f.ciudad),
    sexo: f.sexo === "M" || f.sexo === "F" ? f.sexo : null,
    tipoLesion: String(f.tipo_lesion) as AccidenteTrabajo["tipoLesion"],
    parteCuerpo: s(f.parte_cuerpo),
    parteCuerpoGrupo: String(f.parte_cuerpo_grupo) as AccidenteTrabajo["parteCuerpoGrupo"],
    mecanismo: String(f.mecanismo) as AccidenteTrabajo["mecanismo"],
    agente: String(f.agente) as AccidenteTrabajo["agente"],
    descripcion: s(f.descripcion),
    accidenteTransito: f.accidente_transito === true,
    diasIncapacidad: Number(f.dias_incapacidad ?? 0),
    estadoInvestigacion: (s(f.estado_investigacion) as AccidenteTrabajo["estadoInvestigacion"]) ?? null,
    cierreAdministrativoArl: typeof f.cierre_administrativo_arl === "boolean" ? f.cierre_administrativo_arl : null,
    observaciones: s(f.observaciones),
    origen: f.origen === "historico" ? "historico" : "gestivo",
    createdByEmail: s(f.created_by_email),
    createdAt: String(f.created_at),
    updatedByEmail: s(f.updated_by_email),
    updatedAt: s(f.updated_at),
  };
}

/** Todos los vigentes (no anulados), el más reciente primero. Son decenas al año: se traen todos. */
export async function getAccidentesTrabajo(): Promise<AccidenteTrabajo[]> {
  const db = createAdminClient();
  const salida: AccidenteTrabajo[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db
      .from("sst_accidentes_trabajo")
      .select(SELECT_AT)
      .is("anulado_en", null)
      .order("fecha_at", { ascending: false })
      .order("caso", { ascending: false })
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as unknown as Record<string, unknown>[];
    salida.push(...filas.map(accidenteDeFila));
    if (filas.length < 1000) break;
  }
  return salida;
}

/** Trabajadores del maestro (conductores y empleados) para el buscador del formulario. */
export interface OpcionTrabajador {
  cedula: string;
  nombre: string;
  cargo: string | null;
}

export async function getTrabajadoresParaAt(): Promise<OpcionTrabajador[]> {
  const db = createAdminClient();
  const porCedula = new Map<string, OpcionTrabajador>();
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db.from("conductores").select("cedula, nombre, estado").order("cedula").range(desde, desde + 999);
    if (error) break;
    for (const f of (data ?? []) as { cedula: string | null; nombre: string | null; estado: string | null }[]) {
      if (f.cedula && f.nombre && (f.estado ?? "").toUpperCase() === "ACTIVO") porCedula.set(f.cedula, { cedula: f.cedula, nombre: f.nombre, cargo: "Conductor - cobrador" });
    }
    if ((data ?? []).length < 1000) break;
  }
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db.from("employees").select("document_number, full_name, position, status").order("document_number").range(desde, desde + 999);
    if (error) break;
    for (const f of (data ?? []) as { document_number: string | null; full_name: string | null; position: string | null; status: string | null }[]) {
      const activo = !f.status || /activ/i.test(f.status);
      if (f.document_number && f.full_name && activo && !porCedula.has(f.document_number)) {
        porCedula.set(f.document_number, { cedula: f.document_number, nombre: f.full_name, cargo: f.position });
      }
    }
    if ((data ?? []).length < 1000) break;
  }
  return [...porCedula.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}
