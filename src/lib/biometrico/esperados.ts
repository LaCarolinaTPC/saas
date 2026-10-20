/**
 * Quién debía trabajar cada día.
 *
 * Esto resuelve la lista de ESPERADOS. Quién de ellos vino lo decide
 * `despacho.ts` con el primer viaje que salió a rodar; aquí solo se lee la
 * misma consulta del día una vez y se devuelve resuelto, para no leer
 * `historico_despacho` dos veces por carga.
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
 * Y A ESO SE SUMA LA PLANTILLA: todo conductor **activo y sin reubicar**
 * (`plantilla.ts`) que no haya salido por ningún bus. Sin ese paso la pantalla no sirve para lo que se pidió:
 * si los esperados salen del despacho, entonces todos fueron despachados, luego
 * todos trabajaron, y «sin marcación» da cero SIEMPRE. Medido sobre octubre de
 * 2026: con solo la cascada de buses, 0 ausencias cada día; con la plantilla
 * aparecen los 47-49 activos diarios que ni manejaron ni marcaron, que son los
 * candidatos de verdad. Esa lista incluye los descansos —Gestivo no tiene
 * calendario de turnos—, y por eso nada se registra solo.
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
import { presenciaDelDia, salioARodar, type FilaDespacho, type PrimerViaje } from "./despacho";
import { entraEnPlantilla, esPersona, type FilaConductor } from "./plantilla";

/** Ventana del histórico para deducir el conductor habitual de un bus. */
export const DIAS_HISTORICO = 45;

/** Desde esta proporción de días, el dominante del bus se considera firme. */
export const CONFIANZA_FUERTE = 0.5;

export interface EsperadosDelDia {
  esperados: Map<string, Esperado>;
  /** Buses programados sin ningún conductor deducible. */
  busesSinConductor: string[];
  /**
   * Cédula -> primer viaje que salió a rodar. Es la señal de presencia: estar
   * aquí es «no está ausente». La regla, en `despacho.ts`.
   */
  trabajaron: Map<string, PrimerViaje>;
  /** Cédulas con viajes asignados hoy de los que ninguno ha salido todavía. */
  porSalir: Set<string>;
  /**
   * Último día de los `DIAS_HISTORICO` previos en que cada conductor rodó.
   * Para leer «lleva N días sin rodar» y separar un descanso de un ausente
   * de hace semanas.
   */
  ultimoDiaRodado: Map<string, string>;
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

/** Lo que hace falta del histórico: el bus, quién y si ese viaje rodó. */
interface FilaHistorico extends Pick<FilaDespacho, "codigo" | "conductor_ced" | "estado" | "timbradas"> {
  fecha_viaje: string;
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
      todas<FilaDespacho>(
        (a, b) =>
          db
            .from("historico_despacho")
            .select(
              "codigo, conductor_ced, hora_despacho, turno, viaje, estado, ruta_programada, timbradas"
            )
            .eq("fecha_viaje", fecha)
            .range(a, b),
        "despacho del dia"
      ),
      todas<FilaHistorico>(
        (a, b) =>
          db
            .from("historico_despacho")
            .select("codigo, conductor_ced, fecha_viaje, estado, timbradas")
            .gte("fecha_viaje", desde)
            .lt("fecha_viaje", fecha)
            .range(a, b),
        "historico de despacho"
      ),
      todas<{ codigo: string; cedula_conductor: string | null }>(
        (a, b) => db.from("vehiculos").select("codigo, cedula_conductor").range(a, b),
        "maestro de vehiculos"
      ),
      todas<FilaConductor & { nombre: string | null; codigo: string | null }>(
        (a, b) =>
          db
            .from("conductores")
            .select(
              "cedula, nombre, codigo, estado, reubicado, fecha_ingreso, created_at, solo_informativo"
            )
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
  // Las cédulas de relleno se quedan fuera del maestro, no solo de la
  // plantilla: así `agregar()` tampoco las mete por un bus cuyo conductor
  // asignado sea `99999999` («CONDUCTOR  SIN .» en el despacho).
  const maestro = new Map<string, DatosConductor>();
  for (const c of conductores) {
    if (!esPersona(c.cedula)) continue;
    maestro.set(String(c.cedula), { nombre: c.nombre ?? "", codigo: c.codigo ?? null });
  }

  // Presencia: quién salió a rodar y quién tiene turno más tarde.
  const { trabajaron, porSalir } = presenciaDelDia(despachoDia);

  // bus -> cédulas asignadas a ese bus ese día (puede ser más de una: relevos).
  // Aquí sí entran los viajes que aún no salen: para saber a quién se le
  // esperaba en un bus, basta que GEMA le haya asignado el turno.
  const despachoPorBus = new Map<string, Set<string>>();
  for (const d of despachoDia) {
    if (!d.conductor_ced) continue;
    const ced = String(d.conductor_ced);
    const bus = String(d.codigo ?? "");
    if (!bus) continue;
    const set = despachoPorBus.get(bus);
    if (set) set.add(ced);
    else despachoPorBus.set(bus, new Set([ced]));
  }

  // Último día de la ventana en que cada conductor rodó de verdad. Es la
  // columna «lleva N días sin rodar» de la lista de candidatos a ausencia:
  // sirve para distinguir un descanso de alguien que no aparece desde hace
  // semanas. Sale de la misma lectura, sin consultas extra.
  const ultimoDiaRodado = new Map<string, string>();
  for (const h of historico) {
    if (!h.conductor_ced || !salioARodar(h)) continue;
    const ced = String(h.conductor_ced);
    const ya = ultimoDiaRodado.get(ced);
    if (!ya || h.fecha_viaje > ya) ultimoDiaRodado.set(ced, h.fecha_viaje);
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
  }

  // QUIEN RODÓ ESE DÍA ENTRA SIEMPRE, aunque hoy no esté en la plantilla.
  //
  // La plantilla decide quién PUEDE FALTAR; el despacho decide quién VINO, y
  // son dos preguntas distintas. Sin este paso, alguien que trabajó pero que
  // hoy ya no está activo desaparecía de la pantalla en TODOS los buckets,
  // porque el resumen recorre los esperados.
  //
  // Medido sobre los 45 días previos al 2026-10-19: eran 31 personas y 360
  // apariciones. 29 de ellas `RETIRADO` con `fecha_retiro` POSTERIOR a los días
  // que rodaron (una se retiró el 17 de octubre y había rodado 34 días), y una
  // `ACTIVO` pero reubicada que rodó 11 días.
  //
  // Es seguro por construcción: quien rodó cae en «trabajaron», así que esto no
  // puede inventar un candidato a ausencia. Y evita tener que reconstruir la
  // plantilla histórica, que es la otra forma de arreglarlo.
  for (const [cedula, v] of trabajaron) {
    agregar(cedula, v.bus, "despacho");
  }

  // Y la plantilla, SIEMPRE: los activos que no salieron por ningún bus son
  // justamente los candidatos a ausencia. Van de últimos, así que a quien ya
  // resolvió un bus se le conserva su origen (y su bus) por la prioridad.
  for (const c of conductores) {
    if (!entraEnPlantilla(c, fecha)) continue;
    agregar(String(c.cedula), null, "maestro");
  }

  return {
    esperados,
    busesSinConductor: busesSinConductor.sort(),
    trabajaron,
    porSalir,
    ultimoDiaRodado,
    despachoSincronizadoHasta: (ultimoDespacho.data?.fecha_viaje as string) ?? null,
    conProgramacion,
  };
};

/** La fuente que usa la pantalla. Cambiarla aquí cambia toda la regla. */
export const esperadosDelDia: FuenteEsperados = esperadosPorCascada;
