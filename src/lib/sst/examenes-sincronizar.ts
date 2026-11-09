/**
 * Aplica la sincronización del control de exámenes periódicos con el maestro
 * de GEMA (reglas en ./examenes-sincronizacion.ts). La llaman el cron de GEMA
 * (después del sync), el botón «Sincronizar ahora» del módulo y el script
 * `npm run sst:examenes-sincronizar -- --ensayo`. Recibe el cliente de base de
 * datos para que el script no dependa de Next.
 *
 * Freno de arranque: si la tabla `sst_examenes_novedades` no existe (migración
 * 20261109211226 sin aplicar), no escribe nada. Así la primera carga se revisa
 * con el ensayo antes de encenderla.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { SELECT_PERSONA, personaDeFila, type PersonaExamen } from "./examenes";
import {
  PROFESIOGRAMA,
  esEmpresaProfesiograma,
  esTipoCargo,
  type CargoProfesiograma,
  type EmpresaProfesiograma,
  type TablaProfesiograma,
} from "./profesiograma";
import {
  planSincronizacion,
  situacionEnMaestro,
  type ConductorMaestro,
  type EmpleadoMaestro,
  type PlanSincronizacion,
} from "./examenes-sincronizacion";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export interface ResultadoSincronizacionExamenes {
  ok: boolean;
  /** Por qué no se aplicó (migración sin aplicar, maestro vacío). */
  omitida?: string;
  ensayo: boolean;
  altas: number;
  retiros: number;
  reingresos: number;
  completados: number;
  sinProfesiograma: number;
  /** El detalle, para el informe del ensayo. */
  plan?: PlanSincronizacion;
  error?: string;
}

const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const LOTE = 300;

async function paginar<T>(db: Db, tabla: string, select: string, orden: string): Promise<T[]> {
  const out: T[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await db.from(tabla).select(select).order(orden).range(a, a + 999);
    if (error) throw new Error(`leer ${tabla}: ${error.message}`);
    out.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < 1000) return out;
  }
}

/** Conductores y empleados de GEMA, ya en la forma de las reglas. */
export async function leerMaestroGema(db: Db): Promise<{ conductores: ConductorMaestro[]; empleados: EmpleadoMaestro[] }> {
  type FilaC = { cedula: string | null; nombre: string | null; estado: string | null; fecha_ingreso: string | null; fecha_retiro: string | null; reubicado: string | null };
  type FilaE = { document_number: string | null; full_name: string | null; position: string | null; status: string | null; hire_date: string | null; end_date: string | null };
  const [c, e] = await Promise.all([
    paginar<FilaC>(db, "conductores", "cedula, nombre, estado, fecha_ingreso, fecha_retiro, reubicado", "cedula"),
    paginar<FilaE>(db, "employees", "document_number, full_name, position, status, hire_date, end_date", "id"),
  ]);
  return {
    conductores: c
      .filter((f) => f.cedula && f.nombre)
      .map((f) => ({
        cedula: String(f.cedula).replace(/\D/g, ""),
        nombre: String(f.nombre),
        estado: f.estado,
        fechaIngreso: f.fecha_ingreso,
        fechaRetiro: f.fecha_retiro,
        reubicado: (f.reubicado ?? "").toUpperCase() === "SI",
      })),
    empleados: e
      .filter((f) => f.document_number && f.full_name)
      .map((f) => ({
        cedula: String(f.document_number).replace(/\D/g, ""),
        nombre: String(f.full_name),
        cargo: f.position && f.position !== "SIN CARGO" ? f.position : null,
        status: f.status,
        fechaIngreso: f.hire_date,
        fechaRetiro: f.end_date,
      })),
  };
}

/**
 * El profesiograma vigente (`sst_profesiograma`). Si la tabla no existe o está
 * vacía, la versión del código (05/10/2025) con `deTabla: false`.
 */
export async function leerProfesiograma(db: Db): Promise<{ tabla: TablaProfesiograma; deTabla: boolean }> {
  const { data, error } = await db.from("sst_profesiograma").select("empresa, cargo, meses, tipo, orden").order("orden").order("id").limit(2000);
  if (error || !data?.length) return { tabla: PROFESIOGRAMA, deTabla: false };
  const tabla: Record<EmpresaProfesiograma, CargoProfesiograma[]> = { la_carolina: [], metrorecaudo: [], anaya_giraldo: [] };
  for (const f of data as { empresa: string; cargo: string; meses: number; tipo: string }[]) {
    if (esEmpresaProfesiograma(f.empresa) && esTipoCargo(f.tipo)) tabla[f.empresa].push({ cargo: f.cargo, meses: Number(f.meses), tipo: f.tipo });
  }
  return { tabla, deTabla: true };
}

export async function leerPersonasControl(db: Db): Promise<PersonaExamen[]> {
  const filas = await paginar<Record<string, unknown>>(db, "sst_examenes_personas", SELECT_PERSONA, "cedula");
  return filas.map(personaDeFila);
}

/** Calcula el plan y, salvo en ensayo, lo aplica y anota las novedades. */
export async function sincronizarControlExamenes(
  db: Db,
  opciones: { origen: "cron" | "manual"; usuarioEmail?: string | null; ensayo?: boolean; hoy?: string }
): Promise<ResultadoSincronizacionExamenes> {
  const ensayo = !!opciones.ensayo;
  const hoy = opciones.hoy ?? hoyBogota();
  const vacio: ResultadoSincronizacionExamenes = { ok: true, ensayo, altas: 0, retiros: 0, reingresos: 0, completados: 0, sinProfesiograma: 0 };

  if (!ensayo) {
    const { error } = await db.from("sst_examenes_novedades").select("id", { head: true, count: "exact" }).limit(1);
    if (error) return { ...vacio, omitida: "falta la migración 20261109211226 (sst_examenes_novedades)" };
  }

  const [{ conductores, empleados }, personas, { tabla }] = await Promise.all([leerMaestroGema(db), leerPersonasControl(db), leerProfesiograma(db)]);
  // Un maestro vacío es una lectura fallida, no que se retiró todo el mundo.
  if (conductores.length === 0 || empleados.length === 0) {
    return { ...vacio, omitida: `maestro de GEMA incompleto (${conductores.length} conductores, ${empleados.length} empleados)` };
  }

  const plan = planSincronizacion(personas, situacionEnMaestro(conductores, empleados), hoy, tabla);
  const resultado: ResultadoSincronizacionExamenes = {
    ...vacio,
    altas: plan.altas.length,
    retiros: plan.retiros.length,
    reingresos: plan.reingresos.length,
    completados: plan.completar.length,
    sinProfesiograma: [...plan.altas, ...plan.reingresos].filter((a) => a.sinProfesiograma).length,
    plan,
  };
  if (ensayo) return resultado;

  const autor = opciones.usuarioEmail ?? "sincronizacion-gema";
  const ahora = new Date().toISOString();

  // Ingresos (si otra corrida ya lo insertó, se ignora).
  for (let i = 0; i < plan.altas.length; i += LOTE) {
    const { error } = await db.from("sst_examenes_personas").upsert(
      plan.altas.slice(i, i + LOTE).map((a) => ({
        cedula: a.cedula,
        nombre: a.nombre,
        cargo: a.cargo,
        grupo: a.grupo,
        fecha_ingreso: a.fechaIngreso,
        periodicidad_meses: a.periodicidadMeses,
        activo: true,
        origen: "gema",
        created_by_email: autor,
      })),
      { onConflict: "cedula", ignoreDuplicates: true }
    );
    if (error) throw new Error(`ingresos al control: ${error.message}`);
  }

  // Retiros, agrupados por fecha de retiro.
  const porFecha = new Map<string, string[]>();
  for (const r of plan.retiros) porFecha.set(r.fecha, [...(porFecha.get(r.fecha) ?? []), r.cedula]);
  for (const [fecha, cedulas] of porFecha) {
    for (let i = 0; i < cedulas.length; i += LOTE) {
      const { error } = await db
        .from("sst_examenes_personas")
        .update({ activo: false, motivo_inactivo: "retirado", inactivo_desde: fecha, updated_by_email: autor, updated_at: ahora })
        .in("cedula", cedulas.slice(i, i + LOTE))
        .eq("activo", true);
      if (error) throw new Error(`retiros del control: ${error.message}`);
    }
  }

  for (const r of plan.reingresos) {
    const { error } = await db
      .from("sst_examenes_personas")
      .update({
        activo: true, motivo_inactivo: null, inactivo_desde: null, nombre: r.nombre, cargo: r.cargo, grupo: r.grupo,
        fecha_ingreso: r.fechaIngreso, periodicidad_meses: r.periodicidadMeses, updated_by_email: autor, updated_at: ahora,
      })
      .eq("cedula", r.cedula)
      .eq("activo", false);
    if (error) throw new Error(`reingresos al control: ${error.message}`);
  }

  for (const c of plan.completar) {
    const { error } = await db
      .from("sst_examenes_personas")
      .update({
        ...(c.fechaIngreso ? { fecha_ingreso: c.fechaIngreso } : {}),
        ...(c.cargo ? { cargo: c.cargo } : {}),
        updated_by_email: autor,
        updated_at: ahora,
      })
      .eq("cedula", c.cedula);
    if (error) throw new Error(`completar datos del control: ${error.message}`);
  }

  const novedades = [
    ...plan.altas.map((a) => ({ ...novedadDe(a), tipo: "ingreso" })),
    ...plan.reingresos.map((a) => ({ ...novedadDe(a), tipo: "reingreso" })),
    ...plan.retiros.map((r) => ({ cedula: r.cedula, nombre: r.nombre, grupo: r.grupo, cargo: r.cargo, fecha: r.fecha, tipo: "retiro" })),
  ].map((n) => ({ ...n, origen: opciones.origen, usuario_email: opciones.usuarioEmail ?? null }));
  for (let i = 0; i < novedades.length; i += LOTE) {
    const { error } = await db.from("sst_examenes_novedades").insert(novedades.slice(i, i + LOTE));
    if (error) throw new Error(`novedades: ${error.message}`);
  }

  return { ...resultado, plan: undefined };
}

function novedadDe(a: PlanSincronizacion["altas"][number]) {
  return {
    cedula: a.cedula,
    nombre: a.nombre,
    grupo: a.grupo,
    cargo: a.cargo,
    fecha: a.fechaIngreso,
    periodicidad_meses: a.periodicidadMeses,
    sin_profesiograma: a.sinProfesiograma,
  };
}
