// Consultas del control de cámaras y sensores. Entran por createAdminClient()
// (service_role) desde Server Components y Server Actions: las tablas tienen
// RLS sin políticas y Gestivo valida el permiso. Todo lector de
// camaras_revisiones filtra eliminado_at IS NULL.
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConductorOrigen, Elemento, TipoNovedad } from "./camaras-reglas";

const PAGINA = 1000;

/** Lee todas las páginas: PostgREST corta en 1.000 filas aunque se pida más. */
async function paginar<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  tope = 20000,
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; desde < tope; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as T[];
    filas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return filas;
}

export interface VehiculoCamaras {
  codigo: string;
  placa: string | null;
  ruta: string | null;
}

export interface ConductorCamaras {
  cedula: string;
  nombre: string;
  codigo: string | null;
}

/** Un viaje del bus en el despacho de GEMA, con lo que cobró la caja. */
export interface ViajeDespacho {
  numero: number;
  viaje: number | null;
  horaDespacho: string | null;
  horaLlegada: string | null;
  ruta: string | null;
  estado: string | null;
  conductorCedula: string | null;
  conductorNombre: string | null;
  /** Timbradas brutas de caja (viajes_recaudados.timbradas_real); null si no se recaudó. */
  recaudoCaja: number | null;
}

export interface RevisionCamaras {
  id: string;
  fecha_viaje: string;
  /** Día en que se vio el video; null en el histórico sin hora creíble. */
  fecha_revision: string | null;
  vehiculo_codigo: string;
  viaje: string;
  despacho_numero: number | null;
  conductor_cedula: string | null;
  conductor_nombre: string | null;
  conductor_origen: ConductorOrigen;
  elemento: Elemento;
  tipo_novedad: string;
  con_falla: boolean;
  dfs_optocontrol: number | null;
  aforo: number | null;
  revision_repetida: boolean;
  observaciones: string | null;
  mantenimiento_reporte_id: string | null;
  tecnico_email: string | null;
  origen: "formulario" | "migracion";
  alertas: string[];
  created_at: string;
}

export const SELECT_REVISION =
  "id, fecha_viaje, fecha_revision, vehiculo_codigo, viaje, despacho_numero, conductor_cedula, conductor_nombre, conductor_origen, " +
  "elemento, tipo_novedad, con_falla, dfs_optocontrol, aforo, revision_repetida, observaciones, " +
  "mantenimiento_reporte_id, tecnico_email, origen, alertas, created_at";

export async function getTiposNovedad(): Promise<TipoNovedad[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("camaras_tipos_novedad")
    .select("clave, elemento, nombre, es_falla, exige_dfs, exige_aforo, activo, orden")
    .order("elemento")
    .order("orden");
  if (error) throw new Error(error.message);
  return (data ?? []) as TipoNovedad[];
}

/** Vehículos activos (`estado = 1` en el maestro que sincroniza GEMA). */
export async function getVehiculosCamaras(): Promise<VehiculoCamaras[]> {
  const db = createAdminClient();
  return paginar<VehiculoCamaras>((a, b) =>
    db.from("vehiculos").select("codigo, placa, ruta").eq("estado", 1).order("codigo").range(a, b));
}

export async function getConductoresCamaras(): Promise<ConductorCamaras[]> {
  const db = createAdminClient();
  return paginar<ConductorCamaras>((a, b) =>
    db.from("conductores").select("cedula, nombre, codigo").eq("estado", "ACTIVO").order("nombre").range(a, b));
}

/**
 * Viajes del bus ese día en el despacho de GEMA, con las timbradas de caja de
 * cada uno. Se excluyen los que no salieron (sin número de viaje).
 */
export async function getViajesDelDia(fecha: string, codigo: string): Promise<ViajeDespacho[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("historico_despacho")
    .select("numero, viaje, hora_despacho, hora_llegada, ruta_programada, estado, conductor, conductor_ced")
    .eq("fecha_viaje", fecha)
    .eq("codigo", codigo)
    .order("viaje", { ascending: true, nullsFirst: false })
    .order("hora_despacho");
  if (error) throw new Error(error.message);
  const viajes = (data ?? []).filter((v) => v.viaje != null);
  if (viajes.length === 0) return [];

  const { data: caja, error: errCaja } = await db
    .from("viajes_recaudados")
    .select("numero, timbradas_real")
    .in("numero", viajes.map((v) => v.numero));
  if (errCaja) throw new Error(errCaja.message);
  const recaudo = new Map((caja ?? []).map((c) => [Number(c.numero), c.timbradas_real as number | null]));

  return viajes.map((v) => ({
    numero: Number(v.numero),
    viaje: v.viaje,
    horaDespacho: v.hora_despacho,
    horaLlegada: v.hora_llegada,
    ruta: v.ruta_programada,
    estado: v.estado,
    conductorCedula: v.conductor_ced,
    conductorNombre: v.conductor,
    recaudoCaja: recaudo.get(Number(v.numero)) ?? null,
  }));
}

/** Revisiones vigentes de un bus en un día, para marcar los viajes ya revisados. */
export async function getRevisionesBusDia(fecha: string, codigo: string): Promise<RevisionCamaras[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("camaras_revisiones")
    .select(SELECT_REVISION)
    .eq("fecha_viaje", fecha)
    .eq("vehiculo_codigo", codigo)
    .is("eliminado_at", null)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RevisionCamaras[];
}

/** Lo último que se registró desde el formulario, para la lista de la pantalla. */
export async function getUltimasRevisiones(limite = 30): Promise<RevisionCamaras[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("camaras_revisiones")
    .select(SELECT_REVISION)
    .eq("origen", "formulario")
    .is("eliminado_at", null)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RevisionCamaras[];
}

/** Timbradas brutas de caja por número de despacho. */
export async function getRecaudoPorNumero(numeros: number[]): Promise<Map<number, number | null>> {
  const salida = new Map<number, number | null>();
  if (numeros.length === 0) return salida;
  const db = createAdminClient();
  for (let i = 0; i < numeros.length; i += 500) {
    const { data, error } = await db
      .from("viajes_recaudados")
      .select("numero, timbradas_real")
      .in("numero", numeros.slice(i, i + 500));
    if (error) throw new Error(error.message);
    for (const c of data ?? []) salida.set(Number(c.numero), c.timbradas_real as number | null);
  }
  return salida;
}

export type CampoFechaCamaras = "viaje" | "revision";

export interface FiltrosHistorialCamaras {
  desde: string;
  hasta: string;
  /** Fecha sobre la que actúa el periodo: la del viaje o la de la revisión. */
  campoFecha: CampoFechaCamaras;
  codigo: string | null;
  /** Cédula exacta o parte del nombre. */
  conductor: string | null;
  elemento: Elemento | null;
  tipo: string | null;
  /** true solo con falla, false solo sin falla. */
  falla: boolean | null;
  origen: "formulario" | "migracion" | null;
  /** Solo las que traen avisos de calidad (histórico migrado). */
  conAlertas: boolean;
}

/** Revisiones vigentes del periodo con los filtros de la pantalla, más recientes primero. */
export async function getHistorialCamaras(f: FiltrosHistorialCamaras): Promise<RevisionCamaras[]> {
  const db = createAdminClient();
  const columna = f.campoFecha === "revision" ? "fecha_revision" : "fecha_viaje";
  return paginar<RevisionCamaras>((a, b) => {
    let q = db
      .from("camaras_revisiones")
      .select(SELECT_REVISION)
      .is("eliminado_at", null)
      .gte(columna, f.desde)
      .lte(columna, f.hasta);
    if (f.codigo) q = q.eq("vehiculo_codigo", f.codigo);
    if (f.conductor) {
      q = /^\d+$/.test(f.conductor)
        ? q.eq("conductor_cedula", f.conductor)
        : q.ilike("conductor_nombre", `%${f.conductor.replace(/[%_,()]/g, " ").trim()}%`);
    }
    if (f.elemento) q = q.eq("elemento", f.elemento);
    if (f.tipo) q = q.eq("tipo_novedad", f.tipo);
    if (f.falla != null) q = q.eq("con_falla", f.falla);
    if (f.origen) q = q.eq("origen", f.origen);
    if (f.conAlertas) q = q.neq("alertas", "{}");
    return q
      .order(columna, { ascending: false })
      .order("fecha_viaje", { ascending: false })
      .order("vehiculo_codigo")
      .order("viaje")
      .order("id")
      .range(a, b);
  }, 50000);
}

/** Viajes despachados en el periodo según GEMA, para medir la cobertura de revisión. */
export async function contarViajesDespachados(desde: string, hasta: string): Promise<number> {
  const db = createAdminClient();
  const { count, error } = await db
    .from("historico_despacho")
    .select("numero", { count: "exact", head: true })
    .gte("fecha_viaje", desde)
    .lte("fecha_viaje", hasta)
    .not("viaje", "is", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// ── Solicitudes de revisión (abonos de GEMA y Revisión cartulina → Cámaras) ──
export type ResultadoCamaras = "recobro" | "normalidad_timbradas" | "sin_conteo";
export type FiltroSolicitudes = "pendiente" | "resuelto" | "anulada" | "todas";

export interface SolicitudTesoreria {
  id: string;
  fecha_viaje: string;
  numero: number;
  placa: string | null;
  viaje: number | null;
  vehiculo_codigo: string | null;
  conductor_cedula: string | null;
  conductor_nombre: string | null;
  ruta: string | null;
  estado: "pendiente" | "resuelto";
  tipo: "camara" | "cartulina";
  origen: "abono_gema" | "cartulina" | "mantenimiento" | "migracion";
  abono_id: number | null;
  abono_fecha: string | null;
  anulada_at: string | null;
  anulada_motivo: string | null;
  tomado_por_email: string | null;
  tomado_at: string | null;
  solicitado_por_email: string | null;
  solicitado_at: string;
  nota_solicitud: string | null;
  resultado: ResultadoCamaras | null;
  nota_camaras: string | null;
  camaras_revision_id: string | null;
  resuelto_por_email: string | null;
  resuelto_at: string | null;
  conteo_camara: number | null;
  timbradas_registradora: number | null;
  diferencia: number | null;
  valor_recobro: number | null;
  alertas: string[];
}

export const SELECT_SOLICITUD =
  "id, fecha_viaje, numero, placa, viaje, vehiculo_codigo, conductor_cedula, conductor_nombre, ruta, " +
  "estado, tipo, origen, abono_id, abono_fecha, anulada_at, anulada_motivo, tomado_por_email, tomado_at, " +
  "solicitado_por_email, solicitado_at, nota_solicitud, resultado, nota_camaras, " +
  "camaras_revision_id, resuelto_por_email, resuelto_at, conteo_camara, timbradas_registradora, diferencia, valor_recobro, alertas";

/** Lo que la bandeja muestra además de la solicitud: el viaje en GEMA y lo ya revisado. */
export interface SolicitudBandeja extends SolicitudTesoreria {
  /** Timbradas de la registradora según GEMA (hoy, no la instantánea). */
  timbradasGema: number | null;
  pasajeGema: number | null;
  /** Revisiones de ese viaje que Mantenimiento ya registró por el formulario. */
  revisiones: Pick<RevisionCamaras, "id" | "elemento" | "tipo_novedad" | "aforo" | "tecnico_email" | "created_at">[];
}

/**
 * Solicitudes de revisión de cámara. Las pendientes van de la más antigua a
 * la más nueva (se atienden en orden); las demás, de la más nueva a la más
 * antigua. Las solicitudes de cartulina no se listan: las resuelve la
 * auxiliar de Tesorería.
 */
export async function getSolicitudesTesoreria(estado: FiltroSolicitudes = "pendiente"): Promise<SolicitudTesoreria[]> {
  const db = createAdminClient();
  return paginar<SolicitudTesoreria>((a, b) => {
    let q = db.from("tesoreria_camaras_solicitudes").select(SELECT_SOLICITUD).eq("tipo", "camara");
    if (estado === "anulada") q = q.not("anulada_at", "is", null);
    else if (estado !== "todas") q = q.eq("estado", estado).is("anulada_at", null);
    return q.order("solicitado_at", { ascending: estado === "pendiente" }).order("id").range(a, b);
  });
}

export async function getBandejaSolicitudes(estado: FiltroSolicitudes = "pendiente"): Promise<SolicitudBandeja[]> {
  const solicitudes = await getSolicitudesTesoreria(estado);
  const pendientes = solicitudes.filter((s) => s.estado === "pendiente" && !s.anulada_at).map((s) => Number(s.numero));
  const db = createAdminClient();
  const viajes = new Map<number, { timbradas: number | null; pasaje: number | null }>();
  const revisiones = new Map<number, SolicitudBandeja["revisiones"]>();
  for (let i = 0; i < pendientes.length; i += 300) {
    const lote = pendientes.slice(i, i + 300);
    const [desp, rec, revs] = await Promise.all([
      db.from("historico_despacho").select("numero, timbradas").in("numero", lote),
      db.from("viajes_recaudados").select("numero, pasaje").in("numero", lote),
      db.from("camaras_revisiones")
        .select("id, despacho_numero, elemento, tipo_novedad, aforo, tecnico_email, created_at")
        .in("despacho_numero", lote)
        .is("eliminado_at", null)
        .order("created_at", { ascending: false }),
    ]);
    for (const r of [desp, rec, revs]) if (r.error) throw new Error(r.error.message);
    for (const d of desp.data ?? []) {
      viajes.set(Number(d.numero), { timbradas: d.timbradas == null ? null : Number(d.timbradas), pasaje: null });
    }
    for (const r of rec.data ?? []) {
      const v = viajes.get(Number(r.numero)) ?? { timbradas: null, pasaje: null };
      v.pasaje = r.pasaje == null ? null : Number(r.pasaje);
      viajes.set(Number(r.numero), v);
    }
    for (const r of revs.data ?? []) {
      const n = Number(r.despacho_numero);
      const l = revisiones.get(n) ?? [];
      l.push({
        id: r.id, elemento: r.elemento as Elemento, tipo_novedad: r.tipo_novedad,
        aforo: r.aforo == null ? null : Number(r.aforo), tecnico_email: r.tecnico_email, created_at: r.created_at,
      });
      revisiones.set(n, l);
    }
  }
  return solicitudes.map((s) => ({
    ...s,
    alertas: Array.isArray(s.alertas) ? s.alertas : [],
    timbradasGema: viajes.get(Number(s.numero))?.timbradas ?? null,
    pasajeGema: viajes.get(Number(s.numero))?.pasaje ?? null,
    revisiones: revisiones.get(Number(s.numero)) ?? [],
  }));
}
