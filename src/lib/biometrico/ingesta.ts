/**
 * Guardado del lote que manda el agente del biométrico.
 *
 * Orden de las cosas, y por qué:
 *   1. Abre una fila en `biometrico_envios` (bitácora). Si algo falla después,
 *      el error queda ahí: es lo que lee la pantalla para avisar.
 *   2. Guarda el espejo de personas (pin -> cédula) ANTES de las marcaciones,
 *      para poder atribuirlas con el dato más reciente del equipo.
 *   3. Si alguna cédula cambió, re-resuelve las marcaciones viejas de ese pin
 *      (el CardNo del equipo se llenó después de las primeras marcaciones).
 *   4. Inserta las marcaciones con `biometrico_ingresar_marcaciones`, la
 *      función de la base. **No es un upsert normal**: la llave es la natural
 *      `(device_sn, pin, momento)` y hay que FUSIONAR las dos vías —si la
 *      huella ya la trajo el equipo y ahora llega por Access, se le completa
 *      el `id_zk` en vez de duplicarla—. PostgREST solo sabe hacer
 *      `DO UPDATE SET col = EXCLUDED.col` para todas las columnas del payload,
 *      así que esa condición solo se puede escribir en SQL. La función además
 *      devuelve `nuevas` y `completadas` sin una consulta previa.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LoteValido, PersonaEntrada } from "./lote";

type Admin = SupabaseClient;

/** Mismo tamaño de lote que el sync de GEMA (src/lib/gema/sync.ts). */
const BATCH = 500;

export interface ResumenIngesta {
  envioId: string | null;
  recibidas: number;
  nuevas: number;
  /** Ya existían (las trajo el equipo) y este envío les puso su `id_zk`. */
  completadas: number;
  repetidas: number;
  /** Marca de avance de la vía Access. NULL si el lote vino del equipo. */
  ultimoId: number | null;
  /** Marca de avance de la vía equipo: el momento más nuevo del lote. */
  ultimoMomento: string | null;
  personas: { recibidas: number; cambiadas: number; reresueltas: number };
}

/**
 * Cuántas personas traen una cédula distinta de la que había. Si hay alguna,
 * hay que reatribuir las marcaciones ya cargadas de esos pines.
 *
 * Una persona **nueva** en el equipo cuenta igual cuando trae cédula: su pin
 * puede tener marcaciones viejas —se enroló después de que llegaran, o la
 * borraron y la volvieron a crear; hay 261 pines así, con 38.454 marcaciones
 * sin dueño—. Saltarlas dejaba su historial sin cédula para siempre, que es
 * justo lo que pasó en una prueba con el pin 18.
 *
 * Es pura a propósito: se prueba en personas.test.ts.
 */
export function contarCambiosDeCedula(
  antes: Map<string, string | null>,
  personas: { pin: string; cedula: string | null }[]
): number {
  let cambiadas = 0;
  for (const p of personas) {
    if ((antes.get(p.pin) ?? null) !== p.cedula) cambiadas++;
  }
  return cambiadas;
}

/**
 * Guarda el espejo de personas y devuelve cuántas cédulas cambiaron.
 *
 * `activo_en_zk` se apaga para los pines que ya no vienen en el snapshot (los
 * borraron del equipo). No se borran las filas: sus marcaciones siguen
 * existiendo y el pin sigue siendo la única pista de quién fue.
 */
async function guardarPersonas(
  db: Admin,
  personas: PersonaEntrada[]
): Promise<{ cambiadas: number }> {
  if (!personas.length) return { cambiadas: 0 };

  // Lo que hay hoy, para contar cambios de cédula y apagar los que faltan.
  const { data: previas, error: errorPrevias } = await db
    .from("biometrico_personas")
    .select("pin, cedula");
  if (errorPrevias) throw new Error(`leer biometrico_personas: ${errorPrevias.message}`);

  const antes = new Map((previas ?? []).map((p) => [String(p.pin), p.cedula as string | null]));
  const cambiadas = contarCambiosDeCedula(antes, personas);

  const ahora = new Date().toISOString();
  const filas = personas.map((p) => ({
    pin: p.pin,
    userid: p.userid,
    cedula: p.cedula,
    nombre: p.nombre,
    apellido: p.apellido,
    departamento_id: p.departamentoId,
    activo_en_zk: true,
    visto_at: ahora,
    actualizado_at: ahora,
  }));

  for (let i = 0; i < filas.length; i += BATCH) {
    const { error } = await db
      .from("biometrico_personas")
      .upsert(filas.slice(i, i + BATCH), { onConflict: "pin" });
    if (error) throw new Error(`upsert biometrico_personas: ${error.message}`);
  }

  // Los que estaban y ya no vienen: el equipo los borró.
  const vigentes = new Set(personas.map((p) => p.pin));
  const desaparecidos = [...antes.keys()].filter((pin) => !vigentes.has(pin));
  if (desaparecidos.length) {
    for (let i = 0; i < desaparecidos.length; i += BATCH) {
      const { error } = await db
        .from("biometrico_personas")
        .update({ activo_en_zk: false, actualizado_at: ahora })
        .in("pin", desaparecidos.slice(i, i + BATCH));
      if (error) throw new Error(`apagar pines borrados: ${error.message}`);
    }
  }

  return { cambiadas };
}

/**
 * Ingresa un lote ya validado. Lanza si algo falla; el llamador responde 500 y
 * el error queda escrito en la fila de `biometrico_envios`.
 */
export async function ingresarLote(
  db: Admin,
  lote: LoteValido,
  meta: { ip: string | null }
): Promise<ResumenIngesta> {
  const arranque = Date.now();

  // La marca de avance de la vía Access solo existe si el lote trae ids.
  const ids = lote.marcaciones.map((m) => m.idZk).filter((x): x is number => x !== null);
  const desdeId = ids.length ? Math.min(...ids) : null;
  const hastaId = ids.length ? Math.max(...ids) : null;
  // La de la vía equipo es el momento: los ISO con el mismo offset se ordenan
  // bien como texto, y todos llevan el de Bogotá (ver `momentoDesdeLocal`).
  const ultimoMomento = lote.marcaciones.reduce<string | null>(
    (max, m) => (max === null || m.momento > max ? m.momento : max),
    null
  );

  // Lo que el agente mandó de verdad, antes de colapsar los repetidos del
  // propio lote: si no, «recibidas» no cuadraría con lo que él ve.
  const recibidas = lote.marcaciones.length + lote.repetidasEnLote;

  // 1. Bitácora. Best-effort: si la tabla no existe (migración sin aplicar) el
  //    envío debe fallar con un error claro, no silencioso.
  let envioId: string | null = null;
  {
    const { data, error } = await db
      .from("biometrico_envios")
      .insert({
        agente: lote.agente,
        ip: meta.ip,
        origen: lote.origen,
        desde_id: desdeId,
        hasta_id: hastaId,
        recibidas,
        personas: lote.personas.length,
      })
      .select("id")
      .single();
    if (error) throw new Error(`abrir bitacora de envio: ${error.message}`);
    envioId = (data?.id as string) ?? null;
  }

  const cerrar = async (campos: Record<string, unknown>) => {
    if (!envioId) return;
    const { error } = await db.from("biometrico_envios").update(campos).eq("id", envioId);
    if (error) console.error("[biometrico] no se pudo cerrar la bitacora:", error.message);
  };

  try {
    // 2 y 3. Personas y re-resolución.
    const { cambiadas } = await guardarPersonas(db, lote.personas);
    let reresueltas = 0;
    if (cambiadas > 0) {
      const { data, error } = await db.rpc("biometrico_reresolver_cedulas");
      if (error) throw new Error(`reresolver cedulas: ${error.message}`);
      reresueltas = Number(data ?? 0);
    }

    // 4. Marcaciones. La cédula la resuelve la función con el espejo que acaba
    //    de guardarse, así que aquí no hace falta el mapa pin -> cédula.
    let nuevas = 0;
    let completadas = 0;
    if (lote.marcaciones.length) {
      const filas = lote.marcaciones.map((m) => ({
        id_zk: m.idZk,
        pin: m.pin,
        momento: m.momento,
        fecha: m.fecha,
        device_id: m.deviceId,
        device_name: m.deviceName,
        device_sn: m.deviceSn,
        verificado: m.verificado,
        punto: m.punto,
        origen: m.origen,
        recibido_at: m.recibidoAt,
      }));

      for (let i = 0; i < filas.length; i += BATCH) {
        const { data, error } = await db.rpc("biometrico_ingresar_marcaciones", {
          p_filas: filas.slice(i, i + BATCH),
          p_envio_id: envioId,
        });
        if (error) throw new Error(`ingresar marcaciones: ${error.message}`);
        // La función devuelve una fila (nuevas, completadas).
        const r = (Array.isArray(data) ? data[0] : data) as
          | { nuevas: number | null; completadas: number | null }
          | undefined;
        nuevas += Number(r?.nuevas ?? 0);
        completadas += Number(r?.completadas ?? 0);
      }
    }

    const resumen: ResumenIngesta = {
      envioId,
      recibidas,
      nuevas,
      completadas,
      // Lo que ya estaba tal cual: lo recibido menos lo nuevo y lo completado.
      // Incluye los repetidos que venían dentro del mismo lote.
      repetidas: recibidas - nuevas - completadas,
      ultimoId: hastaId,
      ultimoMomento,
      personas: { recibidas: lote.personas.length, cambiadas, reresueltas },
    };

    await cerrar({
      nuevas: resumen.nuevas,
      completadas: resumen.completadas,
      repetidas: resumen.repetidas,
      personas_cambiadas: cambiadas,
      duracion_ms: Date.now() - arranque,
    });

    return resumen;
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await cerrar({ error: mensaje.slice(0, 2000), duracion_ms: Date.now() - arranque });
    throw e;
  }
}

/** Lo que el agente pregunta antes de leer: hasta dónde llegó Gestivo. */
export async function leerEstado(db: Admin): Promise<{
  ultimoId: number | null;
  ultimoMomento: string | null;
  /** Momento más nuevo de cualquier vía: desde dónde ponerse al día. */
  ultimoMomentoGlobal: string | null;
  /** Momento más nuevo que trajo el equipo, por número de serie. */
  ultimoMomentoEquipo: Record<string, string>;
  personasActualizadasAt: string | null;
  ultimoEnvioAt: string | null;
}> {
  const [marcacion, global, equipo, persona, envio] = await Promise.all([
    // El id_zk solo existe en la vía Access, y en DESC los NULL van primero:
    // sin el filtro, «hasta dónde llegó Access» saldría vacío.
    db
      .from("biometrico_marcaciones")
      .select("id_zk, momento")
      .not("id_zk", "is", null)
      .order("id_zk", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("biometrico_marcaciones")
      .select("momento")
      .order("momento", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.rpc("biometrico_ultimo_momento_por_equipo"),
    db
      .from("biometrico_personas")
      .select("actualizado_at")
      .order("actualizado_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("biometrico_envios")
      .select("recibido_at")
      .order("recibido_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (marcacion.error) throw new Error(`leer ultimo id: ${marcacion.error.message}`);
  if (global.error) throw new Error(`leer ultimo momento: ${global.error.message}`);
  if (equipo.error) throw new Error(`leer ultimo momento por equipo: ${equipo.error.message}`);

  const porEquipo: Record<string, string> = {};
  for (const fila of (equipo.data ?? []) as { device_sn: string; momento: string }[]) {
    if (fila.device_sn) porEquipo[String(fila.device_sn)] = String(fila.momento);
  }

  return {
    ultimoId: marcacion.data ? Number(marcacion.data.id_zk) : null,
    ultimoMomento: (marcacion.data?.momento as string) ?? null,
    ultimoMomentoGlobal: (global.data?.momento as string) ?? null,
    ultimoMomentoEquipo: porEquipo,
    personasActualizadasAt: (persona.data?.actualizado_at as string) ?? null,
    ultimoEnvioAt: (envio.data?.recibido_at as string) ?? null,
  };
}
