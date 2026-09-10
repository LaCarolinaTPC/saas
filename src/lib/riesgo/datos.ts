/**
 * Lectura de las cinco fuentes del análisis de riesgo y armado de las series
 * por conductor.
 *
 * Todo se pagina de 1000 en 1000 porque PostgREST recorta la respuesta a 1.000
 * filas por petición, pase lo que pase en `limit`: `cierres_diarios` desde
 * 2025-10-01 son decenas de miles de filas y sin paginar el panel saldría
 * mutilado en silencio.
 *
 * Y se pagina **ordenando por `id`**. Sin ORDER BY, Postgres no garantiza el
 * orden de las filas, así que `range()` puede repetir una fila en una página y
 * saltarse otra en la siguiente: con 36 páginas de cierres eso no es teórico.
 * Además el orden de llegada movía los empates de fecha dentro de cada serie y
 * los promedios se sumaban en otro orden, así que dos corridas seguidas con los
 * mismos datos entrenaban pesos ligeramente distintos: 184 de 191 conductores
 * cambiaban de probabilidad entre corrida y corrida (hasta 3 puntos), y esa es
 * la explicación de que el informe y `docs/` publicaran cifras distintas del
 * mismo corte del 9 de septiembre. Con el orden fijo, una corrida es
 * reproducible.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { dig } from "./fechas";
import {
  serieVacia,
  type Cierre,
  type Conductor,
  type Incapacidad,
  type Registro,
  type Serie,
  type ViajePerdido,
} from "./variables";

// El esquema no está tipado en el proyecto; las consultas se validan por las
// interfaces de `variables.ts`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, any, any>;

/** Desde cuándo se leen los datos operacionales (decisión del análisis original). */
export const OPERACION_DESDE = "2025-10-01";

const PAGINA = 1000;

/**
 * Trae una tabla completa paginando por `range`, con orden estable.
 *
 * `orden` debe ser una columna única (por defecto la llave primaria) o la
 * paginación deja de ser fiable.
 */
export async function todo<T>(
  db: Db,
  tabla: string,
  cols: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filtro?: (q: any) => any,
  orden = "id"
): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    let q = db
      .from(tabla)
      .select(cols)
      .order(orden, { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGINA) break;
  }
  return out;
}

/**
 * Filas del maestro que no son personas: el comodín con el que GEMA absorbe lo
 * que no tiene conductor asignado.
 *
 * Hoy es uno solo — cédula 99999999, código 10735, «NO DEFINIDO NO DEFINIDO
 * NO DEFINIDO NO DEFINIDO», activo desde 2019 — y no es inofensivo: tiene
 * 2.735 viajes perdidos, el 9,6 % de todos, porque ahí caen los turnos sin
 * conductor. Salía tercero en el ranking de riesgo con 770 viajes perdidos en
 * 30 días, y peor aún, entraba al entrenamiento: un valor así infla la media y
 * la desviación de esas variables, y al estandarizar comprime los puntajes de
 * los conductores de verdad.
 *
 * Se reconoce por dos criterios independientes (los dos aciertan en el caso
 * conocido) para que un comodín nuevo con otro nombre o otra cédula tampoco
 * pase. El umbral de longitud es 6 porque en el maestro hay 156 cédulas
 * legítimas de 7 dígitos.
 */
export function esComodin(c: { cedula: unknown; nombre: unknown }): boolean {
  const d = String(c.cedula ?? "").replace(/\D/g, "");
  // Una cédula colombiana no pasa de 10 dígitos ni baja de 6 (en el maestro hay
  // 156 legítimas de 7). Fuera de ese rango es un error de digitación: había
  // dos, y en los dos casos era otra cédula del maestro con un dígito de más.
  if (!d || d.length < 6 || d.length > 10) return true;
  // 99999999, 00000000: relleno, no un documento.
  if (/^(\d)\1+$/.test(d)) return true;
  return /NO DEFINID|SIN DEFINIR|POR DEFINIR|NO REGISTRA|XXX/.test(
    String(c.nombre ?? "").toUpperCase()
  );
}

/**
 * Ficha del maestro sin código de conductor: existe la persona pero no un
 * conductor en operación.
 *
 * Sin código no hay despacho posible en GEMA, y los datos lo confirman: de las
 * 19 fichas sin código, **ninguna tiene un solo cierre**; dos tienen una o dos
 * ausencias registradas y nada más. Les falta también el tipo de conductor y la
 * fecha de nacimiento. Son altas administrativas —o conductores pendientes de
 * habilitar—, y el modelo no puede decir nada de ellas: todas sus variables de
 * actividad son cero, así que su puntaje sale solo de la antigüedad. Aparecían
 * en el listado con nombre y cédula como si fueran conductores evaluados.
 */
export function esFichaSinOperacion(c: { codigo: unknown }): boolean {
  return !String(c.codigo ?? "").trim();
}

/** Filas de una tabla con el mismo filtro con que las lee la corrida. */
async function contar(db: Db, tabla: string, desdeFecha?: string): Promise<number> {
  let q = db.from(tabla).select("id", { count: "exact", head: true });
  if (desdeFecha) q = q.gte("fecha", desdeFecha);
  const { count, error } = await q;
  if (error) throw new Error(`${tabla}: ${error.message}`);
  return count ?? 0;
}

/**
 * Comprueba que las fuentes no cambiaron mientras se leían.
 *
 * La sincronización de GEMA reescribe `viajes_perdidos` y `cierres_diarios`
 * por ventanas, y una corrida que lee en ese momento entrena con datos a
 * medias sin que nada lo delate: pasó el 2026-09-10, con una corrida que vio
 * 22.802 viajes perdidos de los 28.549 que había: el 20 % de la variable más
 * pesada del modelo, ausente. Los números salieron plausibles — AUC 0,808 —
 * así que el error no se habría notado. Mejor fallar que guardar una corrida
 * silenciosamente mala.
 */
async function exigirLecturaEstable(
  db: Db,
  leidos: { viajesPerdidos: number; cierres: number }
): Promise<void> {
  const [vp, ci] = await Promise.all([
    contar(db, "viajes_perdidos", OPERACION_DESDE),
    contar(db, "cierres_diarios", OPERACION_DESDE),
  ]);
  if (vp !== leidos.viajesPerdidos || ci !== leidos.cierres) {
    throw new Error(
      "Las fuentes cambiaron mientras se leían (probablemente una sincronización de GEMA en curso): " +
        `viajes perdidos ${leidos.viajesPerdidos}→${vp}, cierres ${leidos.cierres}→${ci}. ` +
        "Vuelva a intentarlo en unos minutos."
    );
  }
}

export interface Fuentes {
  conductores: Conductor[];
  /** Series por cédula (solo dígitos). */
  series: Map<string, Serie>;
  /** Cierres que no se pudieron atribuir a ninguna cédula, ni por código. */
  cierresSinCedula: number;
  conteos: {
    conductores: number;
    registros: number;
    viajesPerdidos: number;
    cierres: number;
    incapacidades: number;
    /** Filas del maestro descartadas por no ser personas (ver `esComodin`). */
    comodinesOmitidos: number;
    /** Fichas sin código de conductor (ver `esFichaSinOperacion`). */
    sinOperacionOmitidas: number;
    /** Fichas descartadas por compartir código con otra que sí opera. */
    duplicadasPorCodigo: number;
  };
}

const SEL_CONDUCTORES =
  "cedula, nombre, codigo, tipo_conductor, estado, fecha_ingreso, fecha_retiro, " +
  "fecha_nacimiento, num_hijos, estado_civil, nivel_educativo";

/**
 * Lee las cinco fuentes y las convierte en series ordenadas por fecha.
 *
 * Dos cruces que no son evidentes: los viajes perdidos solo cuentan cuando son
 * imputables al conductor (`tipologia = CONDUCTOR` o la novedad habla de
 * ausencia o pérdida de turno), y los cierres que llegan sin `cedula_conductor`
 * se rescatan por el código del conductor del maestro.
 */
export async function leerFuentes(db: Db): Promise<Fuentes> {
  const [maestro, registros, viajes, cierres, incapacidades] = await Promise.all([
    todo<Conductor>(db, "conductores", SEL_CONDUCTORES),
    todo<Registro>(db, "ausentismo_registros", "cedula, fecha, tipo, soporte, contacto"),
    todo<ViajePerdido>(db, "viajes_perdidos", "cedula_conductor, fecha, novedad, tipologia", (q) =>
      q.gte("fecha", OPERACION_DESDE)
    ),
    todo<Cierre>(
      db,
      "cierres_diarios",
      "cedula_conductor, cod_conductor, fecha, viajes, bruto",
      (q) => q.gte("fecha", OPERACION_DESDE)
    ),
    todo<Incapacidad>(
      db,
      "ausentismo",
      "cedula, fecha_inicio, fecha_fin, dias_it_pagados, origen",
      (q) => q.is("eliminado_at", null)
    ),
  ]);

  await exigirLecturaEstable(db, { viajesPerdidos: viajes.length, cierres: cierres.length });

  // ── Depuración del maestro ─────────────────────────────────────────────────
  // Todo se descarta antes de cualquier cálculo: así no entra al panel, no se
  // entrena y no se puntúa. Los cierres de lo descartado quedan sin cédula
  // resoluble, que es lo correcto: no son de nadie.

  const sinComodines = maestro.filter((c) => !esComodin(c));
  const comodinesOmitidos = maestro.length - sinComodines.length;

  const conOperacion = sinComodines.filter((c) => !esFichaSinOperacion(c));
  const sinOperacionOmitidas = sinComodines.length - conOperacion.length;

  // Cédulas que aparecen en algún dato operacional. Sirve para resolver los
  // códigos duplicados: cuando dos fichas comparten código, la real es la que
  // tiene la operación.
  const conDatos = new Set<string>();
  for (const r of registros) conDatos.add(dig(r.cedula));
  for (const v of viajes) if (v.cedula_conductor) conDatos.add(dig(v.cedula_conductor));
  for (const x of cierres) if (x.cedula_conductor) conDatos.add(dig(x.cedula_conductor));
  for (const i of incapacidades) conDatos.add(dig(i.cedula));

  // Un código no puede identificar a dos conductores. Los dos casos del maestro
  // son la misma persona con la cédula mal digitada en una de las dos fichas, y
  // la operación siempre está en una sola: se conserva esa.
  const grupos = new Map<string, Conductor[]>();
  for (const c of conOperacion) {
    const k = String(c.codigo).trim();
    grupos.set(k, [...(grupos.get(k) ?? []), c]);
  }
  const conductores: Conductor[] = [];
  for (const grupo of grupos.values()) {
    if (grupo.length === 1) {
      conductores.push(grupo[0]);
      continue;
    }
    const conDato = grupo.filter((c) => conDatos.has(dig(c.cedula)));
    // Sin operación en ninguna, se queda la de cédula más corta: la larga es la
    // que lleva el dígito de más.
    const elegida =
      conDato.length === 1
        ? conDato[0]
        : [...grupo].sort((a, b) => dig(a.cedula).length - dig(b.cedula).length)[0];
    conductores.push(elegida);
  }
  const duplicadasPorCodigo = conOperacion.length - conductores.length;

  const porCodigo = new Map(
    conductores.filter((c) => c.codigo).map((c) => [String(c.codigo).trim(), dig(c.cedula)])
  );
  const series = new Map<string, Serie>();
  const serie = (ced: string) => {
    let s = series.get(ced);
    if (!s) {
      s = serieVacia();
      series.set(ced, s);
    }
    return s;
  };

  for (const r of registros) serie(dig(r.cedula)).registros.push(r);

  for (const v of viajes) {
    const esConductor =
      (v.tipologia ?? "").toUpperCase() === "CONDUCTOR" ||
      /AUSENCIA CONDUCTOR|PERDIDA TURNO/i.test(v.novedad ?? "");
    if (esConductor && v.cedula_conductor) serie(dig(v.cedula_conductor)).viajesPerdidos.push(v.fecha);
  }

  let cierresSinCedula = 0;
  for (const c of cierres) {
    const ced = dig(c.cedula_conductor) || porCodigo.get(String(c.cod_conductor).trim()) || "";
    if (!ced) {
      cierresSinCedula++;
      continue;
    }
    serie(ced).cierres.push({
      fecha: c.fecha,
      viajes: Number(c.viajes ?? 0),
      bruto: Number(c.bruto ?? 0),
    });
  }

  for (const i of incapacidades) if (i.fecha_inicio) serie(dig(i.cedula)).incapacidades.push(i);

  for (const s of series.values()) {
    s.registros.sort((a, b) => a.fecha.localeCompare(b.fecha));
    s.viajesPerdidos.sort();
    s.cierres.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  return {
    conductores,
    series,
    cierresSinCedula,
    conteos: {
      conductores: conductores.length,
      comodinesOmitidos,
      sinOperacionOmitidas,
      duplicadasPorCodigo,
      registros: registros.length,
      viajesPerdidos: viajes.length,
      cierres: cierres.length,
      incapacidades: incapacidades.length,
    },
  };
}
