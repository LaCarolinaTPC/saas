/**
 * Mantener al día `historico_despacho`, sin depender del cron.
 *
 * **Solo esa tabla.** Es la única que cambia durante la jornada y la única de
 * la que sale la presencia. La `programacion` se publica por adelantado (el
 * cron de las 03:00 ya la tiene) y solo aporta la etiqueta del bus esperado, y
 * los maestros y el resto de lo operacional son asunto del cron.
 *
 * ## El problema
 *
 * El cron de GEMA corre **una vez al día**, a las 08:00 UTC (03:00 en
 * Colombia). A esa hora el día operativo no ha empezado: el primer viaje real
 * sale a las 03:55 y el último a las 16:40. Así que Ausentismo › Marcaciones,
 * que decide la presencia con `historico_despacho`, veía el día de hoy **vacío
 * durante toda la jornada** y no lo completaba hasta la madrugada siguiente.
 *
 * Y no se puede arreglar con otro cron: el plan Hobby de Vercel admite hasta
 * 100 crons, pero cada uno se dispara **una vez al día**, y aquí haría falta
 * refrescar varias veces durante la jornada. Por eso el refresco se hace
 * **cuando alguien abre la pantalla del día**, que es exactamente cuando el
 * dato importa.
 *
 * ## Cuánto cuesta
 *
 * La pata de GEMA es casi gratis, medido el 2026-10-20:
 *
 * | ventana | filas | ms en GEMA |
 * |---|---|---|
 * | hoy | 534 | 204 |
 * | 2 días | 1.069 | 204 |
 * | 45 días (lo que hace el cron) | 22.052 | 2.706 |
 *
 * Pero el total **no** es medio segundo: el reemplazo en Supabase domina. De
 * punta a punta, medido de verdad, dos días de despacho (1.069 filas) son
 * **~2,3 s** (la programación, que ya no se trae aquí, sumaba otros 0,3 s).
 *
 * Esos 2,3 s se los come **la primera carga de la pantalla cada 15 minutos**,
 * no cada visita. Se eligió que bloquee en vez de refrescar por detrás: el
 * sentido de la pantalla es decidir ausencias, y un dato viejo mostrado rápido
 * es peor que un dato correcto que tarda dos segundos.
 *
 * ## Por qué dos días y no uno
 *
 * Un viaje despachado antes de medianoche puede cerrarse después, y el día
 * operativo de Colombia (UTC−5) no coincide con el UTC con que corre el
 * servidor. Y sale casi igual de barato —2,3 s contra 2,0 s, porque el costo
 * fijo por día manda— así que no hay que razonar sobre el borde.
 *
 * `reemplazarPorDia` reemplaza día por día y **se niega a borrar si GEMA
 * devuelve un rango vacío**, así que un fallo del origen no deja el día en
 * blanco.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { syncHistoricoDespacho } from "./sync";

/** Pasada esta edad, el despacho del día se vuelve a traer. */
export const EDAD_MAXIMA_MIN = 15;

/**
 * Ventana en la que un refresco se considera «en curso».
 *
 * Es el candado: **varias pestañas abiertas refrescan a la vez**, y sin esto
 * las tres pasarían la guarda de los 15 minutos y llamarían a GEMA en paralelo.
 * `gema_reemplazar_dia` borra el día y lo reinserta, así que dos corridas
 * simultáneas pueden pisarse: una borraría lo que la otra acaba de insertar.
 *
 * 20 segundos cubren de sobra un refresco que tarda 2-3 s, y también los
 * dobles clics en el botón.
 */
const SEGUNDOS_EN_CURSO = 20;

export interface RefrescoDespacho {
  /** Se trajo algo de GEMA en esta llamada. */
  refrescado: boolean;
  /** Cuándo se trajo por última vez, después de esta llamada. */
  actualizadoAt: string | null;
  /** Minutos de antigüedad del dato, con el reloj del servidor. */
  edadMin: number | null;
  /** Por qué no se refrescó, cuando no se refrescó. */
  motivo?: "no es hoy" | "está fresco" | "lo está trayendo otro" | "falló GEMA";
  /** Lo que tardó, para verlo en la pantalla si hace falta. */
  ms?: number;
  error?: string;
}

/** Minutos entre un instante ISO y ahora. */
function edadEnMinutos(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60_000));
}

/** Resta días a una fecha ISO sin pasar por la zona local. */
function menosDias(fecha: string, dias: number): string {
  const t = Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10));
  return new Date(t - dias * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Trae de GEMA `historico_despacho` del día si el dato está viejo.
 *
 * **Nunca lanza.** La pantalla tiene que pintarse con lo que haya guardado
 * aunque GEMA esté caída: una falla aquí se devuelve en `error` y se muestra,
 * no rompe la página.
 */
export async function refrescarDespachoDelDia(
  fecha: string,
  hoy: string,
  opciones: { forzar?: boolean } = {}
): Promise<RefrescoDespacho> {
  const db = createAdminClient();

  const { data } = await db
    .from("gema_sync_state")
    .select("last_run_at")
    .eq("dataset", "historico_despacho")
    .maybeSingle();
  const antes = (data?.last_run_at as string | null) ?? null;
  const edad = edadEnMinutos(antes);

  // Un día pasado ya no cambia por mirarlo: de eso se encarga la ventana de 45
  // días del cron.
  if (fecha !== hoy) {
    return { refrescado: false, actualizadoAt: antes, edadMin: edad, motivo: "no es hoy" };
  }
  if (!opciones.forzar && edad !== null && edad < EDAD_MAXIMA_MIN) {
    return { refrescado: false, actualizadoAt: antes, edadMin: edad, motivo: "está fresco" };
  }

  // El candado, y es lo único que hace esto seguro con varias pestañas: se
  // "gana" el refresco adelantando `last_run_at` en un solo UPDATE con
  // condición. Quien no gane se va: no es un error, es que otra pestaña (u
  // otra instancia serverless) ya lo está trayendo.
  const umbral = new Date(Date.now() - SEGUNDOS_EN_CURSO * 1000).toISOString();
  const { data: ganado, error: errorCandado } = await db
    .from("gema_sync_state")
    .update({ last_run_at: new Date().toISOString() })
    .eq("dataset", "historico_despacho")
    .or(`last_run_at.is.null,last_run_at.lt.${umbral}`)
    .select("dataset");

  if (errorCandado) {
    console.error("[gema] no se pudo tomar el candado del despacho:", errorCandado.message);
    return {
      refrescado: false,
      actualizadoAt: antes,
      edadMin: edad,
      motivo: "falló GEMA",
      error: errorCandado.message,
    };
  }
  if (!ganado || ganado.length === 0) {
    return {
      refrescado: false,
      actualizadoAt: antes,
      edadMin: edad,
      motivo: "lo está trayendo otro",
    };
  }

  const arranque = Date.now();
  try {
    // SOLO `historico_despacho`. Es la única tabla que cambia durante la
    // jornada y la única que decide la presencia. La `programacion` se publica
    // por adelantado —el cron de las 03:00 ya la tiene— y solo aporta la
    // etiqueta del bus esperado, así que puede esperar al cron.
    await syncHistoricoDespacho(db, menosDias(hoy, 1), hoy);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[gema] no se pudo refrescar el despacho del dia:", error);

    // Devolver el candado: si falló, no hay por qué dejar al dato marcado como
    // recién traído y bloquear los reintentos los próximos 15 minutos.
    const { error: errorVuelta } = await db
      .from("gema_sync_state")
      .update({ last_run_at: antes })
      .eq("dataset", "historico_despacho");
    if (errorVuelta) {
      console.error("[gema] no se pudo devolver el candado:", errorVuelta.message);
    }

    return {
      refrescado: false,
      actualizadoAt: antes,
      edadMin: edad,
      motivo: "falló GEMA",
      ms: Date.now() - arranque,
      error,
    };
  }

  const { data: despues } = await db
    .from("gema_sync_state")
    .select("last_run_at")
    .eq("dataset", "historico_despacho")
    .maybeSingle();
  const ahora = (despues?.last_run_at as string | null) ?? null;

  return {
    refrescado: true,
    actualizadoAt: ahora,
    edadMin: edadEnMinutos(ahora),
    ms: Date.now() - arranque,
  };
}
