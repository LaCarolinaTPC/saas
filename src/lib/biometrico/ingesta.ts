/**
 * Guardado del lote que manda el agente del biométrico.
 *
 * Orden de las cosas, y por qué:
 *   1. Abre una fila en `biometrico_envios` (bitácora). Si algo falla después,
 *      el error queda ahí: es lo que lee la pantalla para avisar.
 *   2. Guarda el espejo de personas (pin -> cédula) ANTES de las marcaciones,
 *      para poder atribuirlas con el dato más reciente del equipo.
 *   3. Si alguna cédula cambió, re-resuelve las marcaciones viejas de ese pin
 *      (el SSN del equipo se llenó después de las primeras marcaciones).
 *   4. Inserta las marcaciones con `ON CONFLICT DO NOTHING` sobre `id_zk`:
 *      reenviar es inofensivo y «nuevas» son solo las que de verdad entraron.
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
  repetidas: number;
  ultimoId: number | null;
  personas: { recibidas: number; cambiadas: number; reresueltas: number };
}

interface FilaPersona {
  pin: string;
  cedula: string | null;
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
  let cambiadas = 0;
  for (const p of personas) {
    if (!antes.has(p.pin)) continue; // nueva: no es un cambio de atribución
    if ((antes.get(p.pin) ?? null) !== p.cedula) cambiadas++;
  }

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

/** Mapa pin -> cédula con lo que hay guardado, para atribuir las marcaciones. */
async function mapaPines(db: Admin): Promise<Map<string, string | null>> {
  const { data, error } = await db.from("biometrico_personas").select("pin, cedula");
  if (error) throw new Error(`leer pines: ${error.message}`);
  return new Map((data ?? []).map((p: FilaPersona) => [String(p.pin), p.cedula ?? null]));
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
  const ids = lote.marcaciones.map((m) => m.idZk);
  const desdeId = ids.length ? Math.min(...ids) : null;
  const hastaId = ids.length ? Math.max(...ids) : null;

  // 1. Bitácora. Best-effort: si la tabla no existe (migración sin aplicar) el
  //    envío debe fallar con un error claro, no silencioso.
  let envioId: string | null = null;
  {
    const { data, error } = await db
      .from("biometrico_envios")
      .insert({
        agente: lote.agente,
        ip: meta.ip,
        desde_id: desdeId,
        hasta_id: hastaId,
        recibidas: lote.marcaciones.length,
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

    // 4. Marcaciones.
    let nuevas = 0;
    if (lote.marcaciones.length) {
      const pines = await mapaPines(db);
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
        cedula: pines.get(m.pin) ?? null,
        envio_id: envioId,
      }));

      for (let i = 0; i < filas.length; i += BATCH) {
        // ignoreDuplicates => ON CONFLICT DO NOTHING, que solo DEVUELVE lo
        // insertado: por eso «nuevas» se cuenta con las filas retornadas y no
        // hace falta consultar antes qué ids ya existían.
        const { data, error } = await db
          .from("biometrico_marcaciones")
          .upsert(filas.slice(i, i + BATCH), {
            onConflict: "id_zk",
            ignoreDuplicates: true,
          })
          .select("id_zk");
        if (error) throw new Error(`upsert biometrico_marcaciones: ${error.message}`);
        nuevas += (data ?? []).length;
      }
    }

    const resumen: ResumenIngesta = {
      envioId,
      recibidas: lote.marcaciones.length,
      nuevas,
      repetidas: lote.marcaciones.length - nuevas,
      ultimoId: hastaId,
      personas: { recibidas: lote.personas.length, cambiadas, reresueltas },
    };

    await cerrar({
      nuevas: resumen.nuevas,
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
  personasActualizadasAt: string | null;
  ultimoEnvioAt: string | null;
}> {
  const [marcacion, persona, envio] = await Promise.all([
    db
      .from("biometrico_marcaciones")
      .select("id_zk, momento")
      .order("id_zk", { ascending: false })
      .limit(1)
      .maybeSingle(),
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

  return {
    ultimoId: marcacion.data ? Number(marcacion.data.id_zk) : null,
    ultimoMomento: (marcacion.data?.momento as string) ?? null,
    personasActualizadasAt: (persona.data?.actualizado_at as string) ?? null,
    ultimoEnvioAt: (envio.data?.recibido_at as string) ?? null,
  };
}
