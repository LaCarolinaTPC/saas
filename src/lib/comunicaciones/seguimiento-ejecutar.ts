/**
 * Ejecuta el seguimiento a quien no responde (reglas en ./seguimiento.ts).
 * Lo llama solo /api/cron/seguimiento-whatsapp, cada 15 min desde el cron de
 * Vercel en vercel.json (no el latido: así no envía desde equipos de desarrollo).
 *
 * Sin la migración 20261109221237 (tabla wa_seguimiento) no hace nada. Sin la
 * 20261119145413 (cuántas veces se recuerda) manda uno solo por silencio, como antes.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarTexto } from "./whatsapp";
import { registrarSaliente } from "./registro";
import {
  SEGUIMIENTO_POR_DEFECTO,
  debeEscalar,
  debeRecordar,
  mensajeDelRecordatorio,
  recordatoriosEnviados,
  textoRecordatorio,
  type ConfigSeguimiento,
  type ConversacionSeguimiento,
} from "./seguimiento";
import { PREFILTRO_VACIO, datosDelChatCompletos, edadEfectiva, type DatosPrefiltro } from "@/lib/seleccion/extraccion";
import { evaluarPreseleccion, type ReglasPreseleccion } from "@/lib/seleccion/preseleccion";
import { leerReglas } from "@/lib/seleccion/servidor";
import { topeAlcanzado } from "@/lib/seleccion/consumos-servidor";
import { conversacionesDeLaboratorio } from "@/lib/seleccion/laboratorio-servidor";

export const FIRMA_SEGUIMIENTO = "Seguimiento automático";
/** Tope de recordatorios por corrida (la siguiente, en 15 min, sigue con el resto). */
const MAX_POR_CORRIDA = 40;

export async function leerConfigSeguimiento(): Promise<{ config: ConfigSeguimiento; disponible: boolean }> {
  const { data, error } = await createAdminClient().from("wa_seguimiento").select("*").eq("id", 1).maybeSingle();
  if (error || !data) return { config: SEGUIMIENTO_POR_DEFECTO, disponible: !error };
  return {
    disponible: true,
    config: {
      activo: data.activo !== false,
      horasEspera: Number(data.horas_espera ?? 2),
      mensaje: String(data.mensaje ?? SEGUIMIENTO_POR_DEFECTO.mensaje),
      horaDesde: String(data.hora_desde ?? "07:00"),
      horaHasta: String(data.hora_hasta ?? "20:00"),
      horasEscalar: Number(data.horas_escalar ?? 24),
      // Sin la columna (migración 20261119145413 sin aplicar), uno por silencio como antes.
      maxRecordatorios: data.max_recordatorios == null ? 1 : Number(data.max_recordatorios),
      // Sin la columna (migración 20261119165325 sin aplicar), todos con el mismo texto.
      mensajesSiguientes: Array.isArray(data.mensajes_siguientes) ? (data.mensajes_siguientes as string[]) : [],
    },
  };
}

/**
 * Guarda la configuración (ya validada). La usan Comunicaciones › Configuración
 * y Selección › Tiempos y reglas.
 */
export async function escribirConfigSeguimiento(c: ConfigSeguimiento, email: string | null): Promise<{ ok: boolean; error?: string }> {
  const { error } = await createAdminClient().from("wa_seguimiento").upsert({
    id: 1,
    activo: c.activo,
    horas_espera: c.horasEspera,
    mensaje: c.mensaje,
    hora_desde: c.horaDesde,
    hora_hasta: c.horaHasta,
    horas_escalar: c.horasEscalar,
    max_recordatorios: c.maxRecordatorios,
    mensajes_siguientes: c.mensajesSiguientes,
    actualizado_por: email,
    updated_at: new Date().toISOString(),
  });
  if (!error) return { ok: true };
  if (/mensajes_siguientes/i.test(error.message)) {
    return { ok: false, error: "Falta aplicar la migración 20261119165325 (textos de cada recordatorio)." };
  }
  if (/max_recordatorios/i.test(error.message)) {
    return { ok: false, error: "Falta aplicar la migración 20261119145413 (veces que se recuerda a quien no responde)." };
  }
  return {
    ok: false,
    error: /wa_seguimiento|does not exist|schema cache/i.test(error.message)
      ? "Falta aplicar la migración 20261109221237 (seguimiento a quien no responde)."
      : error.message,
  };
}

type Fila = {
  id: string;
  estado: string | null;
  ultimo_mensaje_at: string;
  ultimo_entrante_at: string | null;
  seguimiento_enviado_at: string | null;
  seguimiento_escalado_at: string | null;
  requiere_humano: boolean | null;
  seguimiento_conteo?: number | null;
  prefiltro?: Partial<DatosPrefiltro> | null;
  wa_contactos: unknown;
  procesos_contratacion?: unknown;
};

const SELECT_BASE =
  "id, estado, ultimo_mensaje_at, ultimo_entrante_at, seguimiento_enviado_at, seguimiento_escalado_at, requiere_humano, prefiltro, wa_contactos(telefono, nombre), procesos_contratacion(estado, preseleccion)";
const SELECT = `${SELECT_BASE}, seguimiento_conteo`;

/** ¿Falta la columna seguimiento_conteo? (migración 20261119145413 sin aplicar) */
const sinConteo = (e: { message: string } | null) => !!e && /seguimiento_conteo/i.test(e.message);

const uno = <T,>(v: unknown): T | null => ((Array.isArray(v) ? v[0] : v) as T | null) ?? null;

/**
 * Se esperan datos suyos: no ha completado lo que se pide por el chat, su
 * proceso sigue en la preselección (o no tiene), busca trabajo y no se ha
 * visto que no cumple un requisito (pedido de GH del 19-nov-2026: a quien no
 * cumple no se le recuerda; su proceso se cierra solo).
 */
function esperaRespuesta(f: Fila, reglas: ReglasPreseleccion | null, ahora: Date): boolean {
  const proceso = uno<{ estado: string | null; preseleccion: { global?: string } | null }>(f.procesos_contratacion);
  if (proceso?.estado && proceso.estado !== "pendiente") return false;
  if (proceso?.preseleccion?.global === "no_cumple") return false;
  if (!f.prefiltro) return true;
  const d = { ...PREFILTRO_VACIO, ...f.prefiltro };
  if (d.busca_trabajo === false) return false;
  // La licencia no se le pregunta (sale del RUNT).
  if (datosDelChatCompletos(d)) return false;
  // Sin proceso todavía (no dio la cédula): lo que dijo ya basta para saber que no cumple.
  if (!proceso && reglas) {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(ahora);
    const r = evaluarPreseleccion(
      {
        edad: edadEfectiva(d, hoy),
        ciudad: d.ciudad,
        dispuestoTraslado: d.dispuesto_traslado,
        licencia: d.licencia,
        licenciaVerificada: false,
        licenciaRunt: null,
        licenciaRenovara: d.renovara_licencia,
        simitEstado: null,
        simitValor: null,
        simitVerificado: false,
        experienciaMeses: d.experiencia_meses,
      },
      reglas,
      ahora
    );
    if (r.global === "no_cumple") return false;
  }
  return true;
}

function aConversacion(f: Fila, reglas: ReglasPreseleccion | null = null, ahora: Date = new Date()): ConversacionSeguimiento {
  return {
    ultimoMensajeAt: f.ultimo_mensaje_at,
    ultimoEntranteAt: f.ultimo_entrante_at,
    // El webhook pone ultimo_mensaje_at = ultimo_entrante_at al recibir; si es
    // posterior, lo último fue un mensaje nuestro.
    ultimoEsNuestro: !!f.ultimo_entrante_at && Date.parse(f.ultimo_mensaje_at) > Date.parse(f.ultimo_entrante_at),
    seguimientoEnviadoAt: f.seguimiento_enviado_at,
    seguimientoEscaladoAt: f.seguimiento_escalado_at,
    requiereHumano: !!f.requiere_humano,
    cerrada: f.estado === "cerrada",
    seguimientoConteo: f.seguimiento_conteo ?? 0,
    esperaRespuesta: esperaRespuesta(f, reglas, ahora),
  };
}

function contactoDe(f: Fila): { telefono: string; nombre: string | null } | null {
  const c = (Array.isArray(f.wa_contactos) ? f.wa_contactos[0] : f.wa_contactos) as { telefono: string; nombre: string | null } | null;
  return c?.telefono ? c : null;
}

export interface ResultadoSeguimiento {
  omitida?: string;
  recordados: number;
  fallidos: number;
  escalados: number;
}

export async function ejecutarSeguimiento(ahora: Date = new Date()): Promise<ResultadoSeguimiento> {
  const r: ResultadoSeguimiento = { recordados: 0, fallidos: 0, escalados: 0 };
  const { config, disponible } = await leerConfigSeguimiento();
  if (!disponible) return { ...r, omitida: "falta la migración 20261109221237 (wa_seguimiento)" };
  if (!config.activo) return { ...r, omitida: "desactivado" };
  const db = createAdminClient();
  const iso = (msAtras: number) => new Date(ahora.getTime() - msAtras).toISOString();

  // ── Recordatorios: ventana abierta (entrante en 24 h) y silencio de N horas.
  const candidatasDe = (select: string) =>
    db
      .from("wa_conversaciones")
      .select(select)
      .gte("ultimo_entrante_at", iso(24 * 3_600_000))
      .lte("ultimo_mensaje_at", iso(config.horasEspera * 3_600_000))
      .order("ultimo_mensaje_at", { ascending: true })
      .limit(500);
  let conConteo = true;
  let { data: candidatas, error } = await candidatasDe(SELECT);
  if (sinConteo(error)) {
    // Sin la columna de la cuenta: uno por silencio, como antes.
    conConteo = false;
    ({ data: candidatas, error } = await candidatasDe(SELECT_BASE));
  }
  if (error) throw new Error(`seguimiento (candidatas): ${error.message}`);
  const cfgRecordar = conConteo ? config : { ...config, maxRecordatorios: 1 };
  const reglas = await leerReglas().catch(() => null);
  // Tope mensual del gasto alcanzado: no sale nada automático (entrega 3, NF1).
  const sinEnvios = await topeAlcanzado();
  // Los laboratorios no son aspirantes: nunca se les recuerda ni se marcan para GH.
  const laboratorios = await conversacionesDeLaboratorio(((candidatas ?? []) as unknown as Fila[]).map((f) => f.id));

  for (const f of (candidatas ?? []) as unknown as Fila[]) {
    if (sinEnvios || r.recordados + r.fallidos >= MAX_POR_CORRIDA) break;
    if (laboratorios.has(f.id)) continue;
    const conv = aConversacion(f, reglas, ahora);
    if (!debeRecordar(conv, ahora, cfgRecordar)) continue;
    const contacto = contactoDe(f);
    if (!contacto) continue;
    // Se reserva antes de enviar: si otra corrida la tomó primero, no se repite.
    const cambios: Record<string, unknown> = { seguimiento_enviado_at: ahora.toISOString() };
    if (conConteo) cambios.seguimiento_conteo = recordatoriosEnviados(conv) + 1;
    let reserva = db.from("wa_conversaciones").update(cambios).eq("id", f.id);
    reserva = f.seguimiento_enviado_at ? reserva.eq("seguimiento_enviado_at", f.seguimiento_enviado_at) : reserva.is("seguimiento_enviado_at", null);
    const { data: tomada } = await reserva.select("id");
    if (!tomada?.length) continue;

    // Cada recordatorio con su texto (el 1.º, el 2.º…).
    const texto = textoRecordatorio(mensajeDelRecordatorio(config, recordatoriosEnviados(conv) + 1), contacto.nombre);
    const envio = await enviarTexto(contacto.telefono, texto);
    await registrarSaliente(f.id, envio, { contenido: texto }, FIRMA_SEGUIMIENTO, { automatico: true });
    if (envio.ok) r.recordados++;
    else r.fallidos++;
  }

  // ── Para GH: se le recordó y no respondió en N horas.
  if (config.horasEscalar > 0) {
    const { data: sinRespuesta, error: e2 } = await db
      .from("wa_conversaciones")
      .select(conConteo ? SELECT : SELECT_BASE)
      .not("seguimiento_enviado_at", "is", null)
      .lte("seguimiento_enviado_at", iso(config.horasEscalar * 3_600_000))
      .eq("requiere_humano", false)
      .limit(500);
    if (e2) throw new Error(`seguimiento (para GH): ${e2.message}`);
    const filas = (sinRespuesta ?? []) as unknown as Fila[];
    const labs = await conversacionesDeLaboratorio(filas.map((f) => f.id));
    const ids = filas.filter((f) => !labs.has(f.id) && debeEscalar(aConversacion(f, reglas, ahora), ahora, cfgRecordar)).map((f) => f.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error: e3 } = await db
        .from("wa_conversaciones")
        .update({ requiere_humano: true, seguimiento_escalado_at: ahora.toISOString() })
        .in("id", ids.slice(i, i + 200))
        .select("id");
      if (e3) throw new Error(`seguimiento (marcar para GH): ${e3.message}`);
      r.escalados += data?.length ?? 0;
    }
  }

  return r;
}
