/**
 * Lectura de la base para los indicadores de selección (entrega 4, K1). El
 * cálculo está en ./indicadores. Mismo patrón que los de Comunicaciones:
 * páginas de 1000, pocas consultas a la vez, columnas opcionales que se quitan
 * si falta una migración, y lo leído se guarda 5 minutos.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { leerTodo, type Consulta } from "@/lib/comunicaciones/leer-todo";
import { diaBogota, inicioDiaBogota, sumarDias, type Rango } from "@/lib/comunicaciones/indicadores";
import { POCAS_CONVERSACIONES, mensajesDesde } from "@/lib/comunicaciones/indicadores-servidor";
import {
  calcularIndicadoresSeleccion,
  type CitaInd,
  type ConsumoInd,
  type ContratacionInd,
  type EventoInd,
  type IndicadoresSeleccion,
  type ProcesoInd,
  type VerificacionInd,
} from "./indicadores";
import {
  calcularIndicadoresRespuesta,
  type CitaResp,
  type ConversacionResp,
  type IndicadoresRespuesta,
  type MensajeResp,
  type ProcesoResp,
  type ReferidoResp,
} from "./indicadores-respuesta";
import { gastoDelMes, type GastoDelMes } from "./consumos-servidor";
import { guardadoCompartido } from "@/lib/cache-compartido";
import { leerAjustes, valorAjuste } from "./servidor";

const VIGENCIA_MS = 5 * 60_000;
const guardado = new Map<string, { hasta: number; datos: Promise<IndicadoresSeleccion> }>();
const guardadoResp = new Map<string, { hasta: number; datos: Promise<IndicadoresRespuesta> }>();
const LOTE = 150;

function lotes<T>(xs: T[], n = LOTE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function leer(rango: Rango): Promise<IndicadoresSeleccion> {
  const db = createAdminClient();
  const inicio = inicioDiaBogota(rango.desde);
  const fin = inicioDiaBogota(sumarDias(rango.hasta, 1));
  const faltantes: string[] = [];
  const q = (tabla: string) => (sel: string, conteo: boolean): Consulta =>
    db.from(tabla).select(sel, conteo ? { count: "exact", head: true } : undefined);

  const [procesos, eventos, citasCrudas, verificaciones, consumos, ajustes] = await Promise.all([
    leerTodo<ProcesoInd>(
      "procesos_contratacion",
      ["id", "created_at", "estado", "medio_postulacion", "origen", "causa_no_contrato", "hoja_vida_recibida_at"],
      ["origen", "hoja_vida_recibida_at", "medio_postulacion"],
      (sel, c) => q("procesos_contratacion")(sel, c).gte("created_at", inicio).lt("created_at", fin),
      ["created_at", "id"],
      faltantes
    ),
    // Los eventos de la cohorte son posteriores a su creación: basta desde el inicio del periodo.
    leerTodo<EventoInd>(
      "procesos_contratacion_eventos",
      ["proceso_id", "tipo", "estado_anterior", "estado_nuevo", "created_at"],
      [],
      (sel, c) => q("procesos_contratacion_eventos")(sel, c).eq("tipo", "estado").gte("created_at", inicio),
      ["created_at", "id"],
      faltantes
    ),
    leerTodo<CitaInd & { proceso: { origen: string | null } | null }>(
      "seleccion_citas",
      ["proceso_id", "tipo", "estado", "fecha", "proceso:procesos_contratacion(origen)"],
      [],
      (sel, c) => q("seleccion_citas")(sel, c).gte("fecha", rango.desde).lte("fecha", rango.hasta),
      ["fecha", "id"],
      faltantes
    ),
    leerTodo<VerificacionInd>(
      "verificaciones_externas",
      ["proveedor", "consultado_por", "estado"],
      [],
      (sel, c) => q("verificaciones_externas")(sel, c).gte("created_at", inicio).lt("created_at", fin),
      ["created_at", "id"],
      faltantes
    ),
    leerTodo<ConsumoInd>(
      "seleccion_consumos",
      ["concepto", "costo_usd"],
      [],
      (sel, c) => q("seleccion_consumos")(sel, c).gte("created_at", inicio).lt("created_at", fin),
      ["created_at", "id"],
      faltantes
    ),
    leerAjustes().catch(() => []),
  ]);

  // Contratados en el periodo (cualquiera que sea su fecha de creación) y cuándo empezaron.
  const { data: contratadosEv } = await db
    .from("procesos_contratacion_eventos")
    .select("proceso_id, created_at")
    .eq("estado_nuevo", "contratado")
    .gte("created_at", inicio)
    .lt("created_at", fin)
    .limit(5000);
  const contratadoAt = new Map<string, string>();
  for (const e of (contratadosEv ?? []) as { proceso_id: string; created_at: string }[]) {
    if (!contratadoAt.has(e.proceso_id)) contratadoAt.set(e.proceso_id, e.created_at);
  }
  const idsContratados = [...contratadoAt.keys()];
  const inicioDe = new Map<string, string>();
  const deprueba = new Set<string>();
  for (const lote of lotes(idsContratados)) {
    const [{ data: ps }, { data: convs }] = await Promise.all([
      db.from("procesos_contratacion").select("id, created_at, origen").in("id", lote),
      db.from("wa_conversaciones").select("proceso_id, created_at").in("proceso_id", lote),
    ]);
    for (const p of (ps ?? []) as { id: string; created_at: string; origen: string | null }[]) {
      inicioDe.set(p.id, p.created_at);
      if (p.origen === "chat_prueba") deprueba.add(p.id);
    }
    for (const c of (convs ?? []) as { proceso_id: string; created_at: string }[]) {
      const actual = inicioDe.get(c.proceso_id);
      if (!actual || c.created_at < actual) inicioDe.set(c.proceso_id, c.created_at);
    }
  }
  const contrataciones: ContratacionInd[] = idsContratados
    .filter((id) => !deprueba.has(id) && inicioDe.has(id))
    .map((id) => ({ proceso_id: id, contratado_at: contratadoAt.get(id)!, inicio: inicioDe.get(id)! }));

  const citas: CitaInd[] = citasCrudas
    .filter((c) => c.proceso?.origen !== "chat_prueba")
    .map(({ proceso_id, tipo, estado, fecha }) => ({ proceso_id, tipo, estado, fecha }));

  return calcularIndicadoresSeleccion({
    rango,
    hoy: diaBogota(new Date()),
    procesos,
    eventos,
    citas,
    verificaciones,
    consumos,
    contrataciones,
    cromaCostoCop: Number(valorAjuste<unknown>(ajustes, "croma_costo_consulta", 0)) || 0,
    trm: Number(valorAjuste<unknown>(ajustes, "trm", 3270)) || 3270,
    faltantes: [...new Set(faltantes)],
  });
}

/**
 * Lo que hace falta para los indicadores de respuesta de los aspirantes: las
 * conversaciones que empezaron en el periodo, sus mensajes (solo dirección,
 * firma y hora), los procesos enlazados, sus citas y sus registros en el Plan
 * Padrino. Si falla la lectura de una parte opcional, esa sección sale vacía.
 */
async function leerRespuesta(rango: Rango): Promise<IndicadoresRespuesta> {
  const db = createAdminClient();
  const inicio = inicioDiaBogota(rango.desde);
  const fin = inicioDiaBogota(sumarDias(rango.hasta, 1));
  const faltantes: string[] = [];
  const q = (tabla: string) => (sel: string, conteo: boolean): Consulta =>
    db.from(tabla).select(sel, conteo ? { count: "exact", head: true } : undefined);

  const conversaciones = await leerTodo<ConversacionResp>(
    "wa_conversaciones",
    ["id", "created_at", "proceso_id", "prefiltro", "seguimiento_escalado_at"],
    ["proceso_id", "prefiltro", "seguimiento_escalado_at"],
    (sel, c) => q("wa_conversaciones")(sel, c).gte("created_at", inicio).lt("created_at", fin),
    ["created_at", "id"],
    faltantes
  );

  // 24-nov-2026: con muchas conversaciones, los mensajes por fecha (desde el inicio del
  // periodo: los de estas conversaciones son todos posteriores) y filtrados en memoria; es
  // la misma lectura de los indicadores del chat, que se comparte. Con pocas, por sus ids.
  const mensajes: MensajeResp[] = [];
  if (conversaciones.length > POCAS_CONVERSACIONES) {
    const ids = new Set(conversaciones.map((c) => c.id));
    const r = await mensajesDesde(inicio);
    faltantes.push(...r.faltantes);
    for (const m of r.filas) if (ids.has(m.conversacion_id)) mensajes.push(m);
  } else {
    const leidos = await Promise.all(
      lotes(conversaciones.map((c) => c.id), 100).map((lote) =>
        leerTodo<MensajeResp>(
          "wa_mensajes",
          ["conversacion_id", "direccion", "enviado_por", "timestamp"],
          ["enviado_por"],
          (sel, c) => q("wa_mensajes")(sel, c).in("conversacion_id", lote),
          ["timestamp", "id"],
          faltantes
        )
      )
    );
    for (const l of leidos) mensajes.push(...l);
  }

  const idsProceso = [...new Set(conversaciones.map((c) => c.proceso_id).filter((id): id is string => Boolean(id)))];
  const procesos: ProcesoResp[] = [];
  const citas: CitaResp[] = [];
  for (const lote of lotes(idsProceso)) {
    procesos.push(
      ...(await leerTodo<ProcesoResp>(
        "procesos_contratacion",
        ["id", "created_at", "estado", "cedula", "origen"],
        ["origen"],
        (sel, c) => q("procesos_contratacion")(sel, c).in("id", lote),
        ["created_at", "id"],
        faltantes
      ))
    );
    // Aparte y sin hacer fallar lo demás: sin la migración 20261121181420 estas columnas no existen.
    const { data: rec, error } = await db.from("procesos_contratacion").select("id, recomendado_at").in("id", lote).eq("recomendado", true);
    if (error) {
      if (!faltantes.includes("recomendado")) faltantes.push("recomendado");
    } else {
      const cuando = new Map((rec ?? []).map((r) => [r.id as string, (r.recomendado_at as string | null) ?? null]));
      for (const p of procesos) {
        if (cuando.has(p.id)) {
          p.recomendado = true;
          p.recomendado_at = cuando.get(p.id) ?? null;
        }
      }
    }
    citas.push(
      ...(await leerTodo<CitaResp>(
        "seleccion_citas",
        ["proceso_id", "tipo", "estado", "created_at", "confirmada_at", "recordatorio_at", "reprogramada_por"],
        [],
        (sel, c) => q("seleccion_citas")(sel, c).in("proceso_id", lote),
        ["created_at", "id"],
        faltantes
      ))
    );
  }

  // Registros vigentes del Plan Padrino de quienes vienen recomendados.
  const cedulas = [...new Set(procesos.filter((p) => p.recomendado === true && p.cedula).map((p) => String(p.cedula).trim()))];
  const referidos: ReferidoResp[] = [];
  for (const lote of lotes(cedulas)) {
    const { data } = await db.from("padrino_referidos").select("cedula_referido, created_at").in("cedula_referido", lote).is("anulado_at", null);
    referidos.push(...((data ?? []) as ReferidoResp[]));
  }

  return calcularIndicadoresRespuesta({ rango, conversaciones, mensajes, procesos, citas, referidos, faltantes: [...new Set(faltantes)] });
}

// 24-nov-2026: lo calculado se comparte 5 minutos entre todos los servidores (la memoria de
// arriba es solo de esta instancia); se recalcula en segundo plano al vencerse.
const seleccionCompartida = guardadoCompartido((desde: string, hasta: string) => leer({ desde, hasta }), "indicadores-seleccion-v1", VIGENCIA_MS / 1000);
const respuestaCompartida = guardadoCompartido((desde: string, hasta: string) => leerRespuesta({ desde, hasta }), "indicadores-respuesta-v1", VIGENCIA_MS / 1000);

/** Indicadores de respuesta de los aspirantes del periodo (guardados 5 minutos). null si la lectura falla. */
export async function leerIndicadoresRespuesta(rango: Rango): Promise<IndicadoresRespuesta | null> {
  const clave = `${rango.desde}|${rango.hasta}`;
  const ahora = Date.now();
  let e = guardadoResp.get(clave);
  if (!e || e.hasta < ahora) {
    e = { hasta: ahora + VIGENCIA_MS, datos: respuestaCompartida(rango.desde, rango.hasta) };
    guardadoResp.set(clave, e);
    e.datos.catch(() => guardadoResp.delete(clave));
  }
  return e.datos.catch((err) => {
    console.error("[seleccion] indicadores de respuesta:", err);
    return null;
  });
}

export async function leerIndicadoresSeleccion(rango: Rango): Promise<{ ind: IndicadoresSeleccion; gasto: GastoDelMes | null }> {
  const clave = `${rango.desde}|${rango.hasta}`;
  const ahora = Date.now();
  let e = guardado.get(clave);
  if (!e || e.hasta < ahora) {
    e = { hasta: ahora + VIGENCIA_MS, datos: seleccionCompartida(rango.desde, rango.hasta) };
    guardado.set(clave, e);
    e.datos.catch(() => guardado.delete(clave));
  }
  const [ind, gasto] = await Promise.all([e.datos, gastoDelMes().catch(() => null)]);
  return { ind, gasto };
}
