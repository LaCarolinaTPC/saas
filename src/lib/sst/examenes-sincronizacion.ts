/**
 * Exámenes periódicos ↔ maestro de GEMA (GMAS) — reglas PURAS de la
 * sincronización del control (`sst_examenes_personas`). Se prueban con
 * `npm run test:sst`; las ejecuta `examenes-sincronizar.ts`.
 *
 * ## Por qué
 *
 * El control se llenaba a mano: quien ingresaba a la empresa no entraba al
 * control hasta que alguien lo agregaba, y quien se retiraba seguía contando
 * como vencido. Ahora, cada noche, después del sync de GEMA:
 *
 * - **Ingreso**: activo en GEMA y no está en el control → entra con su fecha de
 *   ingreso y la periodicidad del profesiograma, así que su primer examen
 *   periódico ya tiene fecha (ingreso + periodicidad).
 * - **Retiro**: activo en el control y retirado en GEMA → sale del control con
 *   la fecha de retiro de GEMA. Su historial se conserva.
 * - **Reingreso**: salió del control por retiro y volvió a ingresar después →
 *   vuelve con la nueva fecha de ingreso.
 * - **Completar**: si en el control le falta la fecha de ingreso o el cargo,
 *   se toman de GEMA. Lo que SST ya escribió (cargo, periodicidad) no se toca.
 *
 * Solo los grupos de La Carolina (GEMA no trae Metrorecaudo ni Anaya
 * Giraldo, que se siguen llevando a mano).
 */
import type { GrupoExamen, PersonaExamen } from "./examenes";
import { PROFESIOGRAMA, periodicidadPorCargo, type TablaProfesiograma } from "./profesiograma";

/** Grupos que alimenta GEMA. */
export const GRUPOS_GEMA: readonly GrupoExamen[] = ["conductores", "reubicados", "administrativos"];
export const CARGO_CONDUCTOR = "Conductor - Cobrador";

export type Clasificacion = "activo" | "retirado" | "otro";

/** `conductores.estado` de GEMA. */
export function clasificarConductor(estado: string | null | undefined): Clasificacion {
  const e = (estado ?? "").trim().toUpperCase();
  if (e === "ACTIVO") return "activo";
  if (/RETIR/.test(e)) return "retirado";
  return "otro";
}

/** `employees.status` (activo, periodo_prueba, permiso… = trabaja). */
export function clasificarEmpleado(status: string | null | undefined): Clasificacion {
  const s = status ?? "";
  if (/activ|periodo_prueba|permiso/i.test(s) && !/inactiv/i.test(s)) return "activo";
  if (/retir/i.test(s)) return "retirado";
  return "otro";
}

export interface ConductorMaestro {
  cedula: string;
  nombre: string;
  estado: string | null;
  fechaIngreso: string | null;
  fechaRetiro: string | null;
  reubicado: boolean;
}

export interface EmpleadoMaestro {
  cedula: string;
  nombre: string;
  cargo: string | null;
  status: string | null;
  fechaIngreso: string | null;
  fechaRetiro: string | null;
}

/** Cómo está una cédula en GEMA, uniendo conductores y empleados. */
export interface SituacionMaestro {
  activo: boolean;
  retirado: boolean;
  nombre: string;
  cargo: string | null;
  grupo: GrupoExamen;
  fechaIngreso: string | null;
  fechaRetiro: string | null;
}

const CEDULA = /^[0-9]{5,12}$/;
const masReciente = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

/**
 * Une los dos maestros por cédula. Activo en cualquiera gana (un conductor que
 * pasó a empleado sigue trabajando). Entre dos activos manda el conductor.
 */
export function situacionEnMaestro(conductores: readonly ConductorMaestro[], empleados: readonly EmpleadoMaestro[]): Map<string, SituacionMaestro> {
  const out = new Map<string, SituacionMaestro>();
  const poner = (cedula: string, s: SituacionMaestro) => {
    if (!CEDULA.test(cedula)) return;
    const prev = out.get(cedula);
    if (!prev) return out.set(cedula, s);
    if (prev.activo) return; // ya hay uno activo (el conductor va primero)
    if (s.activo) return out.set(cedula, s);
    // Los dos inactivos: retirado si alguno lo está, con la fecha de retiro más reciente.
    out.set(cedula, { ...prev, retirado: prev.retirado || s.retirado, fechaRetiro: masReciente(prev.fechaRetiro, s.fechaRetiro) });
  };
  for (const c of conductores) {
    const k = clasificarConductor(c.estado);
    poner(c.cedula, {
      activo: k === "activo",
      retirado: k === "retirado",
      nombre: c.nombre,
      cargo: CARGO_CONDUCTOR,
      grupo: c.reubicado ? "reubicados" : "conductores",
      fechaIngreso: c.fechaIngreso,
      fechaRetiro: c.fechaRetiro,
    });
  }
  for (const e of empleados) {
    const k = clasificarEmpleado(e.status);
    poner(e.cedula, {
      activo: k === "activo",
      retirado: k === "retirado",
      nombre: e.nombre,
      cargo: e.cargo,
      grupo: "administrativos",
      fechaIngreso: e.fechaIngreso,
      fechaRetiro: e.fechaRetiro,
    });
  }
  return out;
}

export interface AltaControl {
  cedula: string;
  nombre: string;
  cargo: string | null;
  grupo: GrupoExamen;
  fechaIngreso: string | null;
  periodicidadMeses: number;
  /** El cargo no está en el profesiograma: se usó la periodicidad por defecto. */
  sinProfesiograma: boolean;
}

export interface RetiroControl {
  cedula: string;
  nombre: string;
  cargo: string | null;
  grupo: GrupoExamen;
  fecha: string;
}

export interface CompletarControl {
  cedula: string;
  fechaIngreso?: string;
  cargo?: string;
}

export interface PlanSincronizacion {
  altas: AltaControl[];
  retiros: RetiroControl[];
  reingresos: AltaControl[];
  completar: CompletarControl[];
}

function alta(cedula: string, s: SituacionMaestro, tabla: TablaProfesiograma): AltaControl {
  const p = periodicidadPorCargo(s.cargo, s.grupo, tabla);
  return {
    cedula,
    nombre: s.nombre.trim().toUpperCase(),
    cargo: s.cargo,
    grupo: s.grupo,
    fechaIngreso: s.fechaIngreso,
    periodicidadMeses: p.meses,
    sinProfesiograma: !p.cargo,
  };
}

/** Qué hay que cambiar en el control para que refleje GEMA a la fecha `hoy`. */
export function planSincronizacion(
  personas: readonly PersonaExamen[],
  maestro: ReadonlyMap<string, SituacionMaestro>,
  hoy: string,
  tabla: TablaProfesiograma = PROFESIOGRAMA
): PlanSincronizacion {
  const plan: PlanSincronizacion = { altas: [], retiros: [], reingresos: [], completar: [] };
  const porCedula = new Map(personas.map((p) => [p.cedula, p]));

  for (const [cedula, s] of maestro) {
    if (!s.activo) continue;
    // Un ingreso programado (fecha futura) entra cuando llegue el día.
    if (s.fechaIngreso && s.fechaIngreso > hoy) continue;
    const p = porCedula.get(cedula);
    if (!p) {
      plan.altas.push(alta(cedula, s, tabla));
      continue;
    }
    if (!p.activo) {
      const volvio = p.motivoInactivo === "retirado" && !!s.fechaIngreso && (!p.inactivoDesde || s.fechaIngreso > p.inactivoDesde);
      if (volvio) plan.reingresos.push(alta(cedula, s, tabla));
      continue;
    }
    const c: CompletarControl = { cedula };
    if (!p.fechaIngreso && s.fechaIngreso) c.fechaIngreso = s.fechaIngreso;
    if (!p.cargo?.trim() && s.cargo?.trim()) c.cargo = s.cargo.trim();
    if (c.fechaIngreso || c.cargo) plan.completar.push(c);
  }

  for (const p of personas) {
    if (!p.activo || !GRUPOS_GEMA.includes(p.grupo)) continue;
    const s = maestro.get(p.cedula);
    if (!s || s.activo || !s.retirado) continue;
    const fecha = s.fechaRetiro && s.fechaRetiro <= hoy ? s.fechaRetiro : hoy;
    plan.retiros.push({ cedula: p.cedula, nombre: p.nombre, cargo: p.cargo, grupo: p.grupo, fecha });
  }

  return plan;
}
