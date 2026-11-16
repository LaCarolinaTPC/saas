import { createAdminClient } from "@/lib/supabase/admin";
import {
  calcularIndicadores,
  inicioDiaBogota,
  rangoAnterior,
  rangoUltimosDias,
  sumarDias,
  type ConversacionFila,
  type EjecucionFila,
  type EntradaIndicadores,
  type Filtros,
  type Indicadores,
  type MensajeFila,
  type ProcesoFila,
  type Rango,
} from "./indicadores";

/**
 * Lectura de la base para los indicadores de Comunicaciones (el cálculo está
 * en `indicadores.ts`). Sin migraciones: se piden solo las columnas
 * necesarias del periodo, de 1000 en 1000 (PostgREST corta ahí) y en
 * paralelo: primero se cuenta y luego se piden todas las páginas a la vez.
 *
 * Si una columna no existe en esta base (una migración sin aplicar), se quita
 * de la consulta y se sigue: esa sección se muestra sin datos y el resto sí.
 */

const PAGINA = 1000;
type Admin = ReturnType<typeof createAdminClient>;

/**
 * La base autoalojada atiende peor muchas consultas a la vez: 16 páginas de
 * mensajes tardaban 8 s de a una y 32 s todas juntas. Por eso las consultas
 * de los indicadores pasan de a `MAX_A_LA_VEZ`, compartido entre peticiones.
 */
const MAX_A_LA_VEZ = 2;
let enCurso = 0;
const espera: (() => void)[] = [];
async function turno<T>(f: () => PromiseLike<T>): Promise<T> {
  if (enCurso >= MAX_A_LA_VEZ) await new Promise<void>((listo) => espera.push(listo));
  enCurso++;
  try {
    return await f();
  } finally {
    enCurso--;
    espera.shift()?.();
  }
}

/**
 * Lo leído se guarda unos minutos por tramo: los indicadores no necesitan
 * estar al segundo, y así abrir el panel o cambiar un filtro no vuelve a leer
 * la base. Vive en la memoria del servidor (se pierde al reiniciar).
 */
const VIGENCIA_MS = 5 * 60_000;
const guardado = new Map<string, { hasta: number; datos: Promise<Omit<EntradaIndicadores, "rango" | "filtros">> }>();
// El cliente no tiene tipos generados de la base: el constructor de consultas va sin tipar.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Consulta = any;

/** «column wa_conversaciones.prefiltro does not exist» → «prefiltro». */
function columnaFaltante(error: { code?: string; message?: string } | null): string | null {
  if (!error) return null;
  const m = /column "?(?:[\w]+\.)?([\w]+)"? does not exist/i.exec(error.message ?? "");
  if (m) return m[1];
  // PostgREST con el caché de esquema: «Could not find the 'x' column…».
  const m2 = /find the '([\w]+)' column/i.exec(error.message ?? "");
  return m2 ? m2[1] : null;
}

/**
 * Todas las filas de una consulta. `armar(columnas, conteo)` arma la consulta
 * con sus filtros. Las columnas de `opcionales` que no existan se quitan.
 */
async function leerTodo<T>(
  tabla: string,
  columnas: string[],
  opcionales: string[],
  armar: (sel: string, conteo: boolean) => Consulta,
  orden: string[],
  faltantes: string[]
): Promise<T[]> {
  let cols = [...columnas];
  for (let intento = 0; intento < 8; intento++) {
    const sel = cols.join(", ");
    const { count, error } = await turno(() => armar(sel, true)) as { count: number | null; error: { code?: string; message?: string } | null };
    const falta = columnaFaltante(error);
    if (falta && opcionales.includes(falta) && cols.includes(falta)) {
      faltantes.push(`${tabla}.${falta}`);
      cols = cols.filter((c) => c !== falta);
      continue;
    }
    if (error) {
      faltantes.push(tabla);
      console.error(`[indicadores] ${tabla}:`, error.message);
      return [];
    }
    const paginas = Math.ceil((count ?? 0) / PAGINA);
    const resultados = await Promise.all(
      Array.from({ length: paginas }, (_, i) =>
        turno(() => {
          let q = armar(sel, false);
          for (const o of orden) q = q.order(o, { ascending: true });
          return q.range(i * PAGINA, (i + 1) * PAGINA - 1);
        })
      )
    );
    const out: T[] = [];
    for (const r of resultados as { data: T[] | null; error: { message: string } | null }[]) {
      if (r.error) {
        faltantes.push(tabla);
        console.error(`[indicadores] ${tabla}:`, r.error.message);
        return [];
      }
      out.push(...(r.data ?? []));
    }
    return out;
  }
  return [];
}

const COLS_CONVERSACION = [
  "id",
  "created_at",
  "requiere_humano",
  "agente_pausado",
  "agente_motivo_pausa",
  "agente_pausado_at",
  "proceso_id",
  "prefiltro",
  "reactivacion_paso",
  "reactivacion_ultimo_at",
];
const OPCIONALES_CONVERSACION = COLS_CONVERSACION.filter((c) => c !== "id" && c !== "created_at");
const COLS_MENSAJE = ["conversacion_id", "direccion", "generado_por_ia", "plantilla", "enviado_por", "estado", "timestamp"];
const OPCIONALES_MENSAJE = ["generado_por_ia", "plantilla", "enviado_por", "estado"];

/** Lote de ids por consulta `in(...)`: que la URL no se haga demasiado larga. */
const LOTE_IDS = 100;
/** Hasta cuántas conversaciones conviene pedir los mensajes por id en vez de por fecha. */
const POCAS_CONVERSACIONES = 400;
/** Ventana de «esperando a una persona ahora». */
const DIAS_ESPERANDO = 30;

export interface OpcionesIndicadores {
  dias: number;
  /** false: solo lo del panel principal (sin agente ni selección). */
  completo?: boolean;
}

/** Indicadores de los últimos `dias` días, sin filtros (panel principal). */
export async function leerIndicadores({ dias, completo = true }: OpcionesIndicadores): Promise<Indicadores> {
  const rango = rangoUltimosDias(dias);
  const datos = await leerDatos(rango, completo);
  return calcularIndicadores({ ...datos, rango });
}

export interface IndicadoresComparados {
  actual: Indicadores;
  /** El periodo anterior del mismo largo, con los mismos filtros; null sin «comparar». */
  anterior: Indicadores | null;
}

/**
 * Indicadores de un rango con filtros y, si se pide, los del periodo anterior
 * del mismo largo. Se lee una sola vez todo el tramo (anterior + actual) y
 * cada periodo y filtro se separa en memoria.
 */
export async function leerIndicadoresComparados({
  rango,
  filtros,
  comparar = false,
}: {
  rango: Rango;
  filtros?: Filtros;
  comparar?: boolean;
}): Promise<IndicadoresComparados> {
  const previo = comparar ? rangoAnterior(rango) : null;
  // Cada periodo se lee aparte: así el actual sale de la memoria si ya se leyó
  // sin comparar, y el anterior (a menudo pequeño) no arrastra todo el tramo.
  const [datos, datosPrevio] = await Promise.all([leerDatos(rango, true), previo ? leerDatos(previo, true) : null]);
  return {
    actual: calcularIndicadores({ ...datos, rango, filtros }),
    // «Esperando ahora» es la situación de hoy: no tiene periodo anterior.
    anterior: previo && datosPrevio ? calcularIndicadores({ ...datosPrevio, marcadas: [], rango: previo, filtros }) : null,
  };
}

/** Lo leído para un tramo, desde la memoria si se leyó hace menos de `VIGENCIA_MS`. */
function leerDatos(lectura: Rango, completo: boolean): Promise<Omit<EntradaIndicadores, "rango" | "filtros">> {
  const clave = `${lectura.desde}|${lectura.hasta}|${completo}`;
  const ahora = Date.now();
  const previo = guardado.get(clave);
  if (previo && previo.hasta > ahora) return previo.datos;
  for (const [k, v] of guardado) if (v.hasta <= ahora) guardado.delete(k);
  const datos = leerDatosDeLaBase(lectura, completo);
  guardado.set(clave, { hasta: ahora + VIGENCIA_MS, datos });
  // Si falla, que la próxima vez se vuelva a intentar.
  datos.catch(() => guardado.delete(clave));
  return datos;
}

/** Lo que se lee de la base para un tramo de días de Bogotá (ambos incluidos). */
async function leerDatosDeLaBase(lectura: Rango, completo: boolean): Promise<Omit<EntradaIndicadores, "rango" | "filtros">> {
  const db: Admin = createAdminClient();
  const inicio = inicioDiaBogota(lectura.desde);
  // Hasta el inicio del día siguiente a «hasta», sin incluirlo.
  const fin = inicioDiaBogota(sumarDias(lectura.hasta, 1));
  const faltantes: string[] = [];

  const conversacionesP = leerTodo<ConversacionFila>(
    "wa_conversaciones",
    COLS_CONVERSACION,
    OPCIONALES_CONVERSACION,
    (sel, conteo) =>
      db
        .from("wa_conversaciones")
        .select(sel, conteo ? { count: "exact", head: true } : undefined)
        .gte("created_at", inicio)
        .lt("created_at", fin),
    ["created_at", "id"],
    faltantes
  );

  // Mensajes de las conversaciones creadas en el periodo. Antes se filtraban
  // con un cruce con wa_conversaciones en cada página, y la página tardaba más
  // de un minuto. Ahora: con pocas conversaciones, por sus ids; con muchas,
  // por fecha (desde el inicio del tramo, sin tope, porque los mensajes de
  // esas conversaciones pueden llegar después de «hasta»), filtrando en memoria.
  const enLotes = async <T,>(ids: string[], leer: (lote: string[]) => Promise<T[]>): Promise<T[]> => {
    const lotes = Array.from({ length: Math.ceil(ids.length / LOTE_IDS) }, (_, i) => ids.slice(i * LOTE_IDS, (i + 1) * LOTE_IDS));
    return (await Promise.all(lotes.map(leer))).flat();
  };
  const leerMensajesPorIds = (ids: string[], registrar: string[]) =>
    enLotes(ids, (lote) =>
      leerTodo<MensajeFila>(
        "wa_mensajes",
        COLS_MENSAJE,
        OPCIONALES_MENSAJE,
        (sel, conteo) =>
          db
            .from("wa_mensajes")
            .select(sel, conteo ? { count: "exact", head: true } : undefined)
            .in("conversacion_id", lote),
        ["timestamp", "id"],
        registrar
      )
    );
  const mensajesP = conversacionesP.then((convs) =>
    convs.length <= POCAS_CONVERSACIONES
      ? leerMensajesPorIds(convs.map((c) => c.id), faltantes)
      : leerTodo<MensajeFila>(
          "wa_mensajes",
          COLS_MENSAJE,
          OPCIONALES_MENSAJE,
          (sel, conteo) =>
            db
              .from("wa_mensajes")
              .select(sel, conteo ? { count: "exact", head: true } : undefined)
              .gte("timestamp", inicio),
          ["timestamp", "id"],
          faltantes
        )
  );

  // «Esperando a una persona ahora» mira siempre los últimos 30 días, sea
  // cual sea el periodo: las marcadas en las que el aspirante escribió en ese
  // lapso, aunque la conversación sea más antigua.
  const inicioEsperando = inicioDiaBogota(rangoUltimosDias(DIAS_ESPERANDO).desde);
  const marcadasP = leerTodo<ConversacionFila>(
    "wa_conversaciones",
    COLS_CONVERSACION,
    OPCIONALES_CONVERSACION,
    (sel, conteo) =>
      db
        .from("wa_conversaciones")
        .select(sel, conteo ? { count: "exact", head: true } : undefined)
        .gte("ultimo_entrante_at", inicioEsperando)
        .or("requiere_humano.eq.true,and(agente_pausado.eq.true,agente_motivo_pausa.in.(solicitud,agente))"),
    ["id"],
    []
  );

  const ejecucionesP = completo
    ? leerTodo<EjecucionFila>(
        "wa_agente_ejecuciones",
        [
          "conversacion_id",
          "created_at",
          "modelo_usado",
          "modelo_solicitado",
          "proveedor",
          "tokens_entrada",
          "tokens_salida",
          "duracion_ms",
          "resultado",
          "error",
        ],
        ["modelo_usado", "modelo_solicitado", "proveedor", "tokens_entrada", "tokens_salida", "duracion_ms", "error"],
        (sel, conteo) =>
          db
            .from("wa_agente_ejecuciones")
            .select(sel, conteo ? { count: "exact", head: true } : undefined)
            .gte("created_at", inicio)
            .lt("created_at", fin),
        ["created_at", "id"],
        faltantes
      )
    : Promise.resolve([]);

  const procesosP = completo
    ? leerTodo<ProcesoFila>(
        "procesos_contratacion",
        ["id", "created_at", "preseleccion", "requisito_incumplido", "autorizacion_datos", "hoja_vida_recibida_at"],
        ["preseleccion", "requisito_incumplido", "autorizacion_datos", "hoja_vida_recibida_at"],
        (sel, conteo) =>
          db
            .from("procesos_contratacion")
            .select(sel, conteo ? { count: "exact", head: true } : undefined)
            .eq("origen", "whatsapp_agente")
            .gte("created_at", inicio)
            .lt("created_at", fin),
        ["created_at", "id"],
        faltantes
      )
    : Promise.resolve([]);

  const [conversaciones, mensajesBrutos, marcadas, ejecuciones, procesos] = await Promise.all([
    conversacionesP,
    mensajesP,
    // Sin la columna o el filtro (base antigua), «esperando» cuenta solo las del periodo.
    marcadasP.catch(() => [] as ConversacionFila[]),
    ejecucionesP,
    procesosP,
  ]);
  // Solo los mensajes de las conversaciones creadas en el tramo.
  const delTramo = new Set(conversaciones.map((c) => c.id));
  const mensajes: MensajeFila[] = mensajesBrutos.filter((m) => delTramo.has(m.conversacion_id));

  // Por lotes de ids: los mensajes de las marcadas creadas fuera del tramo y,
  // para el embudo, los procesos enlazados a las conversaciones (vengan o no del chat).
  const idsProcesos = completo ? [...new Set(conversaciones.map((c) => c.proceso_id).filter((x): x is string => !!x))] : [];
  const [extra, vinculados] = await Promise.all([
    // Las creadas dentro del tramo ya trajeron sus mensajes.
    enLotes(
      marcadas
        .filter((c) => {
          const creada = new Date(c.created_at).getTime();
          return creada < new Date(inicio).getTime() || creada >= new Date(fin).getTime();
        })
        .map((c) => c.id),
      (lote) =>
        leerTodo<MensajeFila>(
          "wa_mensajes",
          COLS_MENSAJE,
          OPCIONALES_MENSAJE,
          (sel, conteo) =>
            db
              .from("wa_mensajes")
              .select(sel, conteo ? { count: "exact", head: true } : undefined)
              .in("conversacion_id", lote),
          ["timestamp", "id"],
          []
        )
    ),
    enLotes(idsProcesos, (lote) =>
      leerTodo<ProcesoFila>(
        "procesos_contratacion",
        ["id", "created_at", "autorizacion_datos", "hoja_vida_recibida_at"],
        ["autorizacion_datos", "hoja_vida_recibida_at"],
        (sel, conteo) =>
          db
            .from("procesos_contratacion")
            .select(sel, conteo ? { count: "exact", head: true } : undefined)
            .in("id", lote),
        ["id"],
        []
      )
    ),
  ]);
  mensajes.push(...extra);

  return {
    conversaciones,
    mensajes,
    ejecuciones,
    procesos,
    vinculados,
    marcadas,
    faltantes: [...new Set(faltantes)],
  };
}
