/**
 * Ejecuta el seguimiento a quien no responde (reglas en ./seguimiento.ts).
 * Lo llama solo /api/cron/seguimiento-whatsapp, cada 15 min desde la tarea
 * programada de Coolify (no el latido: así no envía desde equipos de desarrollo).
 *
 * Sin la migración 20261109221237 (tabla wa_seguimiento) no hace nada.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarTexto } from "./whatsapp";
import { registrarSaliente } from "./registro";
import {
  SEGUIMIENTO_POR_DEFECTO,
  debeEscalar,
  debeRecordar,
  textoRecordatorio,
  type ConfigSeguimiento,
  type ConversacionSeguimiento,
} from "./seguimiento";

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
    },
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
  wa_contactos: unknown;
};

const SELECT =
  "id, estado, ultimo_mensaje_at, ultimo_entrante_at, seguimiento_enviado_at, seguimiento_escalado_at, requiere_humano, wa_contactos(telefono, nombre)";

function aConversacion(f: Fila): ConversacionSeguimiento {
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
  const { data: candidatas, error } = await db
    .from("wa_conversaciones")
    .select(SELECT)
    .gte("ultimo_entrante_at", iso(24 * 3_600_000))
    .lte("ultimo_mensaje_at", iso(config.horasEspera * 3_600_000))
    .order("ultimo_mensaje_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(`seguimiento (candidatas): ${error.message}`);

  for (const f of (candidatas ?? []) as Fila[]) {
    if (r.recordados + r.fallidos >= MAX_POR_CORRIDA) break;
    if (!debeRecordar(aConversacion(f), ahora, config)) continue;
    const contacto = contactoDe(f);
    if (!contacto) continue;
    // Se reserva antes de enviar: si otra corrida la tomó primero, no se repite.
    let reserva = db.from("wa_conversaciones").update({ seguimiento_enviado_at: ahora.toISOString() }).eq("id", f.id);
    reserva = f.seguimiento_enviado_at ? reserva.eq("seguimiento_enviado_at", f.seguimiento_enviado_at) : reserva.is("seguimiento_enviado_at", null);
    const { data: tomada } = await reserva.select("id");
    if (!tomada?.length) continue;

    const texto = textoRecordatorio(config.mensaje, contacto.nombre);
    const envio = await enviarTexto(contacto.telefono, texto);
    await registrarSaliente(f.id, envio, { contenido: texto }, FIRMA_SEGUIMIENTO, { automatico: true });
    if (envio.ok) r.recordados++;
    else r.fallidos++;
  }

  // ── Para GH: se le recordó y no respondió en N horas.
  if (config.horasEscalar > 0) {
    const { data: sinRespuesta, error: e2 } = await db
      .from("wa_conversaciones")
      .select(SELECT)
      .not("seguimiento_enviado_at", "is", null)
      .lte("seguimiento_enviado_at", iso(config.horasEscalar * 3_600_000))
      .eq("requiere_humano", false)
      .limit(500);
    if (e2) throw new Error(`seguimiento (para GH): ${e2.message}`);
    const ids = ((sinRespuesta ?? []) as Fila[]).filter((f) => debeEscalar(aConversacion(f), ahora, config)).map((f) => f.id);
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
