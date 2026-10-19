/**
 * Quién debía marcar cada día.
 *
 * GEMA programa **buses**, no conductores: `pa_ext_get_ProgramacionByFecha`
 * devuelve la columna `conductor_asignado` y la trae SIEMPRE en null (85.104
 * filas en Gestivo, 0 con conductor; verificado contra el procedimiento el
 * 2026-10-19). Y en Gestivo no hay turnos ni programación de personal. Así que
 * el conductor esperado de cada bus programado se resuelve en cascada:
 *
 *   1. despacho   quien sacó ese bus ese día (historico_despacho). Lo más firme.
 *   2. historico  el conductor dominante del bus en los DIAS_HISTORICO previos.
 *   3. vehiculo   el conductor fijo del bus en el maestro (vehiculos).
 *   4. si nada resuelve, el bus queda en `busesSinConductor` y no se inventa cédula.
 *
 * Medido sobre octubre de 2026: los días con despacho sincronizado (06-14, 19)
 * el escalón 1 resuelve el 100 % de los 147-150 buses; los días sin sincronizar
 * (15-18) el histórico fuerte resuelve ~82 %, el débil ~15 % y el maestro 1 %,
 * sin dejar ninguno fuera. `vehiculos.cedula_conductor` coincide con el
 * dominante del histórico en ~80 %, y por eso el histórico va antes.
 *
 * Cuando GEMA entregue `conductor_asignado`, se agrega como escalón 0 aquí y no
 * hay que tocar nada más: la pantalla ya muestra el origen de cada esperado.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { Esperado } from "./dia";

/** Ventana del histórico para deducir el conductor habitual de un bus. */
export const DIAS_HISTORICO = 45;

/** Desde esta proporción de días, el dominante del bus se considera firme. */
export const CONFIANZA_FUERTE = 0.5;

export interface EsperadosDelDia {
  esperados: Map<string, Esperado>;
  /** Buses programados sin ningún conductor deducible. */
  busesSinConductor: string[];
  /** Cédulas que GEMA registró despachadas ese día. */
  despachados: Set<string>;
  /** Último día con viajes en historico_despacho (para avisar si está atrasado). */
  despachoSincronizadoHasta: string | null;
  /** Hubo programación de GEMA para esa fecha. Si no, se usó el maestro. */
  conProgramacion: boolean;
}

export type FuenteEsperados = (fecha: string) => Promise<EsperadosDelDia>;

/** Resta días a una fecha ISO sin pasar por Date local. */
function restarDias(fecha: string, dias: number): string {
  const t = Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10));
  return new Date(t - dias * 86_400_000).toISOString().slice(0, 10);
}

interface DatosConductor {
  nombre: string;
  codigo: string | null;
}

/** Lee todas las filas de una consulta paginada (PostgREST topa en 1.000). */
async function todas<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  etiqueta: string
): Promise<T[]> {
  const salida: T[] = [];
  const paso = 1000;
  for (let desde = 0; ; desde += paso) {
    const { data, error } = await consulta(desde, desde + paso - 1);
    if (error) throw new Error(`${etiqueta}: ${error.message}`);
    const lote = data ?? [];
    salida.push(...lote);
    if (lote.length < paso) break;
  }
  return salida;
}

/**
 * Cascada completa. Una sola pasada por fecha: lee la programación del día, el
 * despacho del día, el histórico de la ventana, el maestro de vehículos y el de
 * conductores, y cruza todo en memoria.
 */
export const esperadosPorCascada: FuenteEsperados = async function esperadosPorCascada(
  fecha: string
): Promise<EsperadosDelDia> {
  const db = createAdminClient();
  const desde = restarDias(fecha, DIAS_HISTORICO);

  const [programacion, despachoDia, historico, vehiculos, conductores, ultimoDespacho] =
    await Promise.all([
      todas<{ codigo_vehiculo: string | null }>(
        (a, b) =>
          db
            .from("programacion")
            .select("codigo_vehiculo")
            .eq("fecha", fecha)
            .range(a, b),
        "programacion"
      ),
      todas<{ codigo: string | null; conductor_ced: string | null }>(
        (a, b) =>
          db
            .from("historico_despacho")
            .select("codigo, conductor_ced")
            .eq("fecha_viaje", fecha)
            .range(a, b),
        "despacho del dia"
      ),
      todas<{ codigo: string | null; conductor_ced: string | null; fecha_viaje: string }>(
        (a, b) =>
          db
            .from("historico_despacho")
            .select("codigo, conductor_ced, fecha_viaje")
            .gte("fecha_viaje", desde)
            .lt("fecha_viaje", fecha)
            .range(a, b),
        "historico de despacho"
      ),
      todas<{ codigo: string; cedula_conductor: string | null }>(
        (a, b) => db.from("vehiculos").select("codigo, cedula_conductor").range(a, b),
        "maestro de vehiculos"
      ),
      todas<{ cedula: string; nombre: string | null; codigo: string | null; estado: string | null; fecha_ingreso: string | null; fecha_retiro: string | null }>(
        (a, b) =>
          db
            .from("conductores")
            .select("cedula, nombre, codigo, estado, fecha_ingreso, fecha_retiro")
            .range(a, b),
        "maestro de conductores"
      ),
      db
        .from("historico_despacho")
        .select("fecha_viaje")
        .order("fecha_viaje", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  // Maestro de conductores: la lista de ausentismo se lleva por cédula y solo
  // cuenta quien existe aquí.
  const maestro = new Map<string, DatosConductor>();
  for (const c of conductores) {
    if (!c.cedula) continue;
    maestro.set(String(c.cedula), { nombre: c.nombre ?? "", codigo: c.codigo ?? null });
  }

  const despachados = new Set<string>();
  // bus -> cédulas que lo sacaron ese día (puede ser más de una: relevos).
  const despachoPorBus = new Map<string, Set<string>>();
  for (const d of despachoDia) {
    if (!d.conductor_ced) continue;
    const ced = String(d.conductor_ced);
    despachados.add(ced);
    const bus = String(d.codigo ?? "");
    if (!bus) continue;
    const set = despachoPorBus.get(bus);
    if (set) set.add(ced);
    else despachoPorBus.set(bus, new Set([ced]));
  }

  // bus -> cédula -> días distintos que lo sacó, en la ventana.
  const diasPorBusCedula = new Map<string, Map<string, Set<string>>>();
  for (const h of historico) {
    if (!h.conductor_ced || !h.codigo) continue;
    const bus = String(h.codigo);
    const ced = String(h.conductor_ced);
    let porCed = diasPorBusCedula.get(bus);
    if (!porCed) {
      porCed = new Map();
      diasPorBusCedula.set(bus, porCed);
    }
    const dias = porCed.get(ced);
    if (dias) dias.add(h.fecha_viaje);
    else porCed.set(ced, new Set([h.fecha_viaje]));
  }

  /** Conductor dominante de un bus en la ventana, con su confianza. */
  function dominante(bus: string): { cedula: string; confianza: number } | null {
    const porCed = diasPorBusCedula.get(bus);
    if (!porCed) return null;
    let mejor: string | null = null;
    let mejorDias = 0;
    let total = 0;
    for (const [ced, dias] of porCed) {
      total += dias.size;
      if (dias.size > mejorDias) {
        mejor = ced;
        mejorDias = dias.size;
      }
    }
    if (!mejor || total === 0) return null;
    return { cedula: mejor, confianza: mejorDias / total };
  }

  const fijoDelBus = new Map<string, string>();
  for (const v of vehiculos) {
    if (v.cedula_conductor) fijoDelBus.set(String(v.codigo), String(v.cedula_conductor));
  }

  const esperados = new Map<string, Esperado>();
  const busesSinConductor: string[] = [];

  /**
   * Agrega un esperado. El primer origen que lo resuelve gana: si la misma
   * persona aparece por dos buses, se conserva el más firme (despacho) y no se
   * duplica la fila.
   */
  const PRIORIDAD: Record<Esperado["origen"], number> = {
    despacho: 0,
    historico: 1,
    vehiculo: 2,
    maestro: 3,
  };
  function agregar(cedula: string, bus: string | null, origen: Esperado["origen"], confianza?: number) {
    const datos = maestro.get(cedula);
    // Fuera del maestro de conductores no entra: el módulo se lleva por ahí
    // (los administrativos del biométrico salen como «no esperados»).
    if (!datos) return false;
    const ya = esperados.get(cedula);
    if (ya && PRIORIDAD[ya.origen] <= PRIORIDAD[origen]) return true;
    esperados.set(cedula, {
      cedula,
      nombre: datos.nombre,
      codigo: datos.codigo,
      bus,
      origen,
      ...(confianza === undefined ? {} : { confianza }),
    });
    return true;
  }

  const busesProgramados = [...new Set(programacion.map((p) => String(p.codigo_vehiculo ?? "")).filter(Boolean))];
  const conProgramacion = busesProgramados.length > 0;

  if (conProgramacion) {
    for (const bus of busesProgramados) {
      // 1. Despacho del día.
      const delDia = despachoPorBus.get(bus);
      if (delDia && delDia.size > 0) {
        let alguno = false;
        for (const ced of delDia) alguno = agregar(ced, bus, "despacho") || alguno;
        if (alguno) continue;
      }
      // 2. Dominante del histórico.
      const dom = dominante(bus);
      if (dom && agregar(dom.cedula, bus, "historico", dom.confianza)) continue;
      // 3. Conductor fijo del maestro.
      const fijo = fijoDelBus.get(bus);
      if (fijo && agregar(fijo, bus, "vehiculo")) continue;
      // 4. Nada: se reporta el bus, sin inventar.
      busesSinConductor.push(bus);
    }
  } else {
    // Sin programación sincronizada para esa fecha: todo conductor que estaba
    // en plantilla ese día. Es el respaldo, y la pantalla lo dice.
    for (const c of conductores) {
      if (!c.cedula) continue;
      const ingreso = c.fecha_ingreso;
      if (ingreso && ingreso > fecha) continue;
      const activo = (c.estado ?? "").toUpperCase() === "ACTIVO";
      const seguiaEse = c.fecha_retiro ? c.fecha_retiro >= fecha : activo;
      if (!activo && !seguiaEse) continue;
      agregar(String(c.cedula), null, "maestro");
    }
  }

  return {
    esperados,
    busesSinConductor: busesSinConductor.sort(),
    despachados,
    despachoSincronizadoHasta: (ultimoDespacho.data?.fecha_viaje as string) ?? null,
    conProgramacion,
  };
};

/** La fuente que usa la pantalla. Cambiarla aquí cambia toda la regla. */
export const esperadosDelDia: FuenteEsperados = esperadosPorCascada;
