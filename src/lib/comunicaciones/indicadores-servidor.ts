import { createAdminClient } from "@/lib/supabase/admin";
import { leerTodo } from "./leer-todo";
import { guardadoCompartido } from "@/lib/cache-compartido";
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

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Lo leído se guarda unos minutos por tramo: los indicadores no necesitan
 * estar al segundo, y así abrir el panel o cambiar un filtro no vuelve a leer
 * la base. Vive en la memoria del servidor (se pierde al reiniciar).
 */
const VIGENCIA_MS = 5 * 60_000;
const guardado = new Map<string, { hasta: number; datos: Promise<Omit<EntradaIndicadores, "rango" | "filtros">> }>();

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
export const POCAS_CONVERSACIONES = 400;

/**
 * Todos los mensajes desde `inicio` (24-nov-2026). Los indicadores del chat y
 * los de respuesta de Selección leen el mismo conjunto en la misma página: se
 * lee una vez y se comparte unos minutos (la base atiende de a dos consultas y
 * cada viaje cuesta ~130 ms).
 */
const memoMensajes = new Map<string, { hasta: number; datos: Promise<{ filas: MensajeFila[]; faltantes: string[] }> }>();
export function mensajesDesde(inicio: string): Promise<{ filas: MensajeFila[]; faltantes: string[] }> {
  const ahora = Date.now();
  for (const [k, v] of memoMensajes) if (v.hasta < ahora) memoMensajes.delete(k);
  const previo = memoMensajes.get(inicio);
  if (previo) return previo.datos;
  const faltantes: string[] = [];
  const db: Admin = createAdminClient();
  const datos = leerTodo<MensajeFila>(
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
  ).then((filas) => ({ filas, faltantes }));
  memoMensajes.set(inicio, { hasta: ahora + 2 * 60_000, datos });
  datos.catch(() => memoMensajes.delete(inicio));
  return datos;
}
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
  completo = true,
}: {
  rango: Rango;
  filtros?: Filtros;
  comparar?: boolean;
  /** false: sin el asistente ni la selección (están en Candidatos › Indicadores desde el 21-nov-2026). */
  completo?: boolean;
}): Promise<IndicadoresComparados> {
  const previo = comparar ? rangoAnterior(rango) : null;
  // Cada periodo se lee aparte: así el actual sale de la memoria si ya se leyó
  // sin comparar, y el anterior (a menudo pequeño) no arrastra todo el tramo.
  const [datos, datosPrevio] = await Promise.all([leerDatos(rango, completo), previo ? leerDatos(previo, completo) : null]);
  return {
    actual: calcularIndicadores({ ...datos, rango, filtros }),
    // «Esperando ahora» es la situación de hoy: no tiene periodo anterior.
    anterior: previo && datosPrevio ? calcularIndicadores({ ...datosPrevio, marcadas: [], rango: previo, filtros }) : null,
  };
}

/**
 * Los del chat de un periodo, sin filtros ni comparación (Candidatos › Indicadores
 * y el reporte diario): lo calculado se comparte 5 minutos entre todos los
 * servidores (24-nov-2026). Lo leído de la base es demasiado grande para eso.
 */
export const leerIndicadoresDelPeriodo = guardadoCompartido(
  async (desde: string, hasta: string): Promise<Indicadores> => {
    const rango = { desde, hasta };
    return calcularIndicadores({ ...(await leerDatos(rango, true)), rango });
  },
  "indicadores-chat-v1",
  VIGENCIA_MS / 1000
);

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
      : mensajesDesde(inicio).then((r) => {
          faltantes.push(...r.faltantes);
          return r.filas;
        })
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
