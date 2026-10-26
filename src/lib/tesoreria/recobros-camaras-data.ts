import { createAdminClient } from "@/lib/supabase/admin";
import { contarAlarma, type Alarma, type CobroEstado, type ResultadoCamaras, type SeguimientoSolicitud } from "./recobros-camaras";

/**
 * Lecturas del seguimiento de solicitudes a cámaras (pestaña «Solicitudes a
 * cámaras» de Revisión cartulina y alarma de Revisión del día y Caja).
 * `disponible` es false mientras la migración 20261026213310 no esté aplicada:
 * las pantallas avisan en vez de fallar.
 */

export interface SolicitudRecobro extends SeguimientoSolicitud {
  id: string;
  fechaViaje: string;
  numero: number;
  placa: string | null;
  viaje: number | null;
  vehiculoCodigo: string | null;
  conductorCedula: string | null;
  conductorNombre: string | null;
  ruta: string | null;
  solicitadoPorEmail: string | null;
  solicitadoAt: string;
  notaSolicitud: string | null;
  notaCamaras: string | null;
  resueltoPorEmail: string | null;
  resueltoAt: string | null;
  vistoPorEmail: string | null;
  cobroValor: number | null;
  cobroFecha: string | null;
  cobroSoporte: string | null;
  cobroMotivo: string | null;
  cobroNota: string | null;
  cobroPorEmail: string | null;
  cobroAt: string | null;
}

export const SELECT_RECOBRO =
  "id, fecha_viaje, numero, placa, viaje, vehiculo_codigo, conductor_cedula, conductor_nombre, ruta, " +
  "estado, solicitado_por_email, solicitado_at, nota_solicitud, resultado, nota_camaras, resuelto_por_email, resuelto_at, " +
  "visto_at, visto_por_email, cobro_estado, cobro_valor, cobro_fecha, cobro_soporte, cobro_motivo, cobro_nota, cobro_por_email, cobro_at";

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
    estado: r.estado === "resuelto" ? "resuelto" : "pendiente",
    solicitadoPorEmail: txt(r.solicitado_por_email),
    solicitadoAt: String(r.solicitado_at),
    notaSolicitud: txt(r.nota_solicitud),
    resultado: res === "recobro" || res === "normalidad_timbradas" ? (res as ResultadoCamaras) : null,
    notaCamaras: txt(r.nota_camaras),
    resueltoPorEmail: txt(r.resuelto_por_email),
    resueltoAt: txt(r.resuelto_at),
    vistoAt: txt(r.visto_at),
    vistoPorEmail: txt(r.visto_por_email),
    cobroEstado: cobro === "cobrado" || cobro === "no_cobrado" ? (cobro as CobroEstado) : null,
    cobroValor: num(r.cobro_valor),
    cobroFecha: txt(r.cobro_fecha),
    cobroSoporte: txt(r.cobro_soporte),
    cobroMotivo: txt(r.cobro_motivo),
    cobroNota: txt(r.cobro_nota),
    cobroPorEmail: txt(r.cobro_por_email),
    cobroAt: txt(r.cobro_at),
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

/**
 * Cuentas de la alarma. Lee solo las resueltas con las cuatro columnas que la
 * regla necesita; null si la migración no está (no se muestra aviso).
 */
export async function getAlarmaRecobros(): Promise<Alarma | null> {
  const db = createAdminClient();
  const filas: SeguimientoSolicitud[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("tesoreria_camaras_solicitudes")
      .select("id, estado, resultado, visto_at, cobro_estado")
      .eq("estado", "resuelto")
      .or("visto_at.is.null,and(resultado.eq.recobro,cobro_estado.is.null)")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return null;
    const rows = (data ?? []) as Record<string, unknown>[];
    for (const r of rows) {
      const { estado, resultado, vistoAt, cobroEstado } = mapRecobro(r);
      filas.push({ estado, resultado, vistoAt, cobroEstado });
    }
    if (rows.length < PAGE) break;
  }
  return contarAlarma(filas);
}

export interface EventoSolicitud {
  id: string;
  accion: "visto" | "cobro_registrado" | "cobro_corregido";
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
    accion: r.accion as EventoSolicitud["accion"],
    antes: (r.antes as Record<string, unknown> | null) ?? null,
    despues: (r.despues as Record<string, unknown> | null) ?? null,
    usuarioEmail: txt(r.usuario_email),
    createdAt: String(r.created_at),
  }));
}
