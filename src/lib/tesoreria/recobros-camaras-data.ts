import { createAdminClient } from "@/lib/supabase/admin";
import { type CobroEstado, type RecobroIndicador, type ResultadoCamaras } from "./recobros-camaras";

/**
 * Lecturas del seguimiento de solicitudes a cámaras (pestaña «Solicitudes a
 * cámaras» de Revisión cartulina y alarma de Revisión del día y Caja).
 * `disponible` es false mientras las migraciones 20261026213310 y
 * 20261027155032 no estén aplicadas: las pantallas avisan en vez de fallar.
 */

export interface SolicitudRecobro extends RecobroIndicador {
  id: string;
  fechaViaje: string;
  numero: number;
  placa: string | null;
  viaje: number | null;
  vehiculoCodigo: string | null;
  conductorCedula: string | null;
  conductorNombre: string | null;
  ruta: string | null;
  /** camara o cartulina (recobro que define la auxiliar). */
  tipo: "camara" | "cartulina";
  diferencia: number | null;
  valorRecobro: number | null;
  solicitadoPorEmail: string | null;
  solicitadoAt: string;
  notaSolicitud: string | null;
  notaCamaras: string | null;
  resueltoPorEmail: string | null;
  cobroSoporte: string | null;
  cobroNota: string | null;
  cobroPorEmail: string | null;
  cobroAt: string | null;
  gestionUltimaFecha: string | null;
  incobrableMotivo: string | null;
  incobrableSolicitadoPorEmail: string | null;
  incobrableAutorizadoPorEmail: string | null;
  incobrableRechazoNota: string | null;
  incobrableRechazadoPorEmail: string | null;
  incobrableRechazadoAt: string | null;
}

export const SELECT_RECOBRO =
  "id, fecha_viaje, numero, placa, viaje, vehiculo_codigo, conductor_cedula, conductor_nombre, ruta, " +
  "estado, anulada_at, tipo, diferencia, valor_recobro, solicitado_por_email, solicitado_at, nota_solicitud, resultado, nota_camaras, resuelto_por_email, resuelto_at, " +
  "cobro_estado, cobro_valor, cobro_fecha, cobro_soporte, cobro_nota, cobro_por_email, cobro_at, " +
  "gestiones_n, gestion_ultima_fecha, gestion_proxima_fecha, incobrable_motivo, incobrable_solicitado_por_email, " +
  "incobrable_solicitado_at, incobrable_autorizado_por_email, incobrable_autorizado_at, incobrable_rechazo_nota, " +
  "incobrable_rechazado_por_email, incobrable_rechazado_at";

const PAGE = 1000;
const txt = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

export function mapRecobro(r: Record<string, unknown>): SolicitudRecobro {
  const res = txt(r.resultado);
  const cobro = txt(r.cobro_estado);
  return {
    id: String(r.id),
    fechaViaje: String(r.fecha_viaje),
    numero: Number(r.numero),
    placa: txt(r.placa),
    viaje: num(r.viaje),
    vehiculoCodigo: txt(r.vehiculo_codigo),
    conductorCedula: txt(r.conductor_cedula),
    conductorNombre: txt(r.conductor_nombre),
    ruta: txt(r.ruta),
    tipo: r.tipo === "cartulina" ? "cartulina" : "camara",
    diferencia: num(r.diferencia),
    valorRecobro: num(r.valor_recobro),
    estado: r.estado === "resuelto" ? "resuelto" : "pendiente",
    solicitadoPorEmail: txt(r.solicitado_por_email),
    solicitadoAt: String(r.solicitado_at),
    notaSolicitud: txt(r.nota_solicitud),
    resultado: res === "recobro" || res === "normalidad_timbradas" || res === "sin_conteo" ? (res as ResultadoCamaras) : null,
    anuladaAt: txt(r.anulada_at),
    notaCamaras: txt(r.nota_camaras),
    resueltoPorEmail: txt(r.resuelto_por_email),
    resueltoAt: txt(r.resuelto_at),
    cobroEstado: cobro === "cobrado" || cobro === "incobrable" ? (cobro as CobroEstado) : null,
    cobroValor: num(r.cobro_valor),
    cobroFecha: txt(r.cobro_fecha),
    cobroSoporte: txt(r.cobro_soporte),
    cobroNota: txt(r.cobro_nota),
    cobroPorEmail: txt(r.cobro_por_email),
    cobroAt: txt(r.cobro_at),
    gestionesN: Number(r.gestiones_n ?? 0),
    gestionUltimaFecha: txt(r.gestion_ultima_fecha),
    gestionProximaFecha: txt(r.gestion_proxima_fecha),
    incobrableMotivo: txt(r.incobrable_motivo),
    incobrableSolicitadoPorEmail: txt(r.incobrable_solicitado_por_email),
    incobrableSolicitadoAt: txt(r.incobrable_solicitado_at),
    incobrableAutorizadoPorEmail: txt(r.incobrable_autorizado_por_email),
    incobrableAutorizadoAt: txt(r.incobrable_autorizado_at),
    incobrableRechazoNota: txt(r.incobrable_rechazo_nota),
    incobrableRechazadoPorEmail: txt(r.incobrable_rechazado_por_email),
    incobrableRechazadoAt: txt(r.incobrable_rechazado_at),
  };
}

/** Todas las solicitudes, más nuevas primero (paginado: PostgREST corta en 1.000). */
export async function getSolicitudesRecobro(): Promise<{ disponible: boolean; solicitudes: SolicitudRecobro[] }> {
  const db = createAdminClient();
  const out: SolicitudRecobro[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("tesoreria_camaras_solicitudes")
      .select(SELECT_RECOBRO)
      .order("solicitado_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return { disponible: false, solicitudes: [] };
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    out.push(...rows.map(mapRecobro));
    if (rows.length < PAGE) break;
  }
  return { disponible: true, solicitudes: out };
}

export interface GestionRecobro {
  id: string;
  solicitudId: string;
  fecha: string;
  gestion: string;
  proximaFecha: string | null;
  origen: "caja" | "migracion";
  usuarioEmail: string | null;
  createdAt: string;
}

export const SELECT_GESTION = "id, solicitud_id, fecha, gestion, proxima_fecha, origen, usuario_email, created_at";

export function mapGestion(r: Record<string, unknown>): GestionRecobro {
  return {
    id: String(r.id),
    solicitudId: String(r.solicitud_id),
    fecha: String(r.fecha),
    gestion: String(r.gestion),
    proximaFecha: txt(r.proxima_fecha),
    origen: r.origen === "migracion" ? "migracion" : "caja",
    usuarioEmail: txt(r.usuario_email),
    createdAt: String(r.created_at),
  };
}

/** Todas las gestiones, más recientes primero (histórico de cada tarjeta). */
export async function getGestionesRecobros(): Promise<GestionRecobro[]> {
  const db = createAdminClient();
  const out: GestionRecobro[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("tesoreria_camaras_recobro_gestiones")
      .select(SELECT_GESTION)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return [];
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows.map(mapGestion));
    if (rows.length < PAGE) break;
  }
  return out;
}

export type AccionEvento =
  | "visto" | "cobro_registrado" | "cobro_corregido" | "migrado_a_seguimiento"
  | "incobrable_solicitado" | "incobrable_autorizado" | "incobrable_rechazado" | "incobrable_reabierto";

export interface EventoSolicitud {
  id: string;
  accion: AccionEvento;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  usuarioEmail: string | null;
  createdAt: string;
}

export async function getEventosSolicitud(solicitudId: string): Promise<EventoSolicitud[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("tesoreria_camaras_solicitudes_eventos")
    .select("id, accion, antes, despues, usuario_email, created_at")
    .eq("solicitud_id", solicitudId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    accion: r.accion as AccionEvento,
    antes: (r.antes as Record<string, unknown> | null) ?? null,
    despues: (r.despues as Record<string, unknown> | null) ?? null,
    usuarioEmail: txt(r.usuario_email),
    createdAt: String(r.created_at),
  }));
}
