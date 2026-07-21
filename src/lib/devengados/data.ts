import { createAdminClient } from "@/lib/supabase/admin";
import { getSettingValue } from "@/lib/settings";
import { nowBogotaISO } from "@/lib/utils";
import { calcularQuincena, quincenaDe, type ResumenQuincena } from "./engine";

/**
 * Acceso a datos del módulo Devengados. SOLO server-side.
 * La producción neta del día es el SALARIO NETO DÍA del cierre de GEMA
 * (cierres_diarios.salario_neto_dia, una fila por ruta: el día es la suma).
 * Los viajes de viajes_recaudados quedan solo como detalle de soporte.
 */

export const SETTING_BASE_DIARIA = "devengados_base_diaria";
const BASE_DIARIA_FALLBACK = 85000;
const PAGE = 1000; // límite de filas por consulta de Supabase

export async function getBaseDiaria(): Promise<number> {
  const raw = await getSettingValue(SETTING_BASE_DIARIA);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : BASE_DIARIA_FALLBACK;
}

export const SETTING_FECHA_OPERATIVA = "devengados_fecha_operativa";

export interface FechaOperativa {
  /** Día contable en el que opera todo el módulo (visualización y entregas). */
  fecha: string;
  /** Hoy real en Bogotá, referencia para volver al modo automático. */
  hoyReal: string;
  /** true cuando un administrador fijó una fecha distinta al día real (modo prueba). */
  esSimulada: boolean;
}

/**
 * Fecha operativa del módulo: el día real de Bogotá, salvo que un
 * administrador haya fijado una fecha anterior (app_settings) para hacer
 * pruebas sobre días ya cerrados. Nunca puede ser futura.
 */
export async function getFechaOperativa(): Promise<FechaOperativa> {
  const hoyReal = nowBogotaISO().slice(0, 10);
  const raw = await getSettingValue(SETTING_FECHA_OPERATIVA);
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= hoyReal) {
    return { fecha: raw, hoyReal, esSimulada: raw !== hoyReal };
  }
  return { fecha: hoyReal, hoyReal, esSimulada: false };
}

export interface ViajeDia {
  numero: number;
  viaje: string | null;
  ruta: string | null;
  hora_despacho: string | null;
  hora_llegada: string | null;
  placa: string | null;
  codigo_vehiculo: string | null;
  bruto: number | null;
  neto: number | null;
  estado: string | null;
  novedad: string | null;
  liquidado: boolean; // ya incluido en una entrega registrada
}

export interface EntregaRow {
  id: string;
  fecha: string;
  periodo: string;
  quincena: number;
  cedula_conductor: string;
  codigo_conductor: string | null;
  conductor_nombre: string | null;
  viajes: number[];
  valor_entregado: number;
  cuenta_contable: string;
  movimiento: string;
  observacion: string | null;
  trasladada_gema: boolean;
  trasladada_at: string | null;
  aprobada_por: string | null;
  created_at: string;
  // Migración 034: devoluciones, segundo pago y saldos por entrega.
  estado: "activa" | "devuelta" | "reverso";
  devolucion_de: string | null;
  devolucion_motivo: string | null;
  devuelta_at: string | null;
  devuelta_por: string | null;
  segundo_pago: boolean;
  autorizado_por: string | null;
  autorizacion_motivo: string | null;
  saldo_antes: number | null;
  saldo_despues: number | null;
  // Migración 035: registro extemporáneo de un día ya cerrado.
  extemporanea: boolean;
  registrada_por: string | null;
  registrada_por_email: string | null;
  registro_motivo: string | null;
  registro_at: string | null;
}

/** Pago vigente: débito no devuelto (los reversos y devueltas no suman). */
export function esPagoVigente(e: Pick<EntregaRow, "movimiento" | "estado">): boolean {
  return e.movimiento === "DEBITO" && (e.estado ?? "activa") === "activa";
}

export interface BloqueoRow {
  id: string;
  cedula_conductor: string;
  conductor_nombre: string | null;
  motivo: string;
  bloqueado_por_email: string | null;
  activo: boolean;
  created_at: string;
}

/** Todos los bloqueos manuales activos (pantalla de parámetros). */
export async function getBloqueosActivos(): Promise<BloqueoRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("devengados_bloqueos")
    .select("id, cedula_conductor, conductor_nombre, motivo, bloqueado_por_email, activo, created_at")
    .eq("activo", true)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as BloqueoRow[];
}

/** Bloqueo manual activo de un conductor (null si puede recibir pagos). */
export async function getBloqueoActivo(cedula: string): Promise<BloqueoRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("devengados_bloqueos")
    .select("id, cedula_conductor, conductor_nombre, motivo, bloqueado_por_email, activo, created_at")
    .eq("cedula_conductor", cedula)
    .eq("activo", true)
    .maybeSingle();
  // Tolerante a la migración 034 sin aplicar: sin tabla no hay bloqueos.
  if (error) return null;
  return (data as BloqueoRow) ?? null;
}

export interface CajeroOpcion {
  id: string;
  nombre: string;
  email: string | null;
}

/**
 * Usuarios que pueden figurar como cajero de una entrega: los perfiles cuyo
 * tipo tiene el módulo de Tesorería. Se usa para acreditar un registro
 * extemporáneo al cajero que realmente entregó el dinero (aunque hoy esté
 * desactivado: su cuadre de aquel día igual debe cerrar).
 */
export async function getCajerosTesoreria(): Promise<CajeroOpcion[]> {
  const supabase = createAdminClient();
  // select("*"): modulos/submodulos varían entre migraciones (ver permissions).
  const { data: tipos } = await supabase.from("user_types").select("*");
  const keys = (tipos ?? [])
    .filter((t) => Array.isArray(t.modulos) && (t.modulos as string[]).includes("tesoreria"))
    .map((t) => t.key as string);
  if (!keys.length) return [];

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("user_type", keys)
    .order("full_name", { ascending: true });
  return (data ?? []).map((p) => ({
    id: p.id as string,
    nombre: (p.full_name as string) || (p.email as string) || "—",
    email: (p.email as string) ?? null,
  }));
}

export interface EstadoConductor {
  cedula: string;
  fecha: string;
  baseDiaria: number;
  quincena: ReturnType<typeof quincenaDe>;
  resumen: ResumenQuincena;
  viajesDia: ViajeDia[];
  produccionDia: number;      // suma de neto de todos los viajes del día
  entregadoDia: number;       // entregas vigentes aprobadas hoy
  pagosHoy: number;           // cantidad de pagos vigentes del día (política 1/día)
  bloqueo: BloqueoRow | null; // bloqueo manual activo (motivo visible al cajero)
  entregas: EntregaRow[];     // entregas de la quincena (hasta la fecha)
}

type ViajeRaw = {
  numero: number;
  fecha_viaje: string;
  cedula_conductor: string | null;
  codigo_conductor: string | null;
  conductor_nombre: string | null;
  viaje: string | null;
  ruta_programada: string | null;
  ruta_reprogramada: string | null;
  hora_despacho: string | null;
  hora_llegada: string | null;
  placa: string | null;
  codigo_vehiculo: string | null;
  bruto: number | null;
  neto: number | null;
  estado: string | null;
  novedad: string | null;
};

const VIAJE_COLS =
  "numero, fecha_viaje, cedula_conductor, codigo_conductor, conductor_nombre, viaje, " +
  "ruta_programada, ruta_reprogramada, hora_despacho, hora_llegada, placa, " +
  "codigo_vehiculo, bruto, neto, estado, novedad";

/** Viajes recaudados de un rango (opcionalmente de un conductor), paginados. */
async function fetchViajes(
  ini: string,
  fin: string,
  cedula?: string
): Promise<ViajeRaw[]> {
  const supabase = createAdminClient();
  const all: ViajeRaw[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("viajes_recaudados")
      .select(VIAJE_COLS)
      .gte("fecha_viaje", ini)
      .lte("fecha_viaje", fin)
      .order("numero", { ascending: true })
      .range(from, from + PAGE - 1);
    if (cedula) query = query.eq("cedula_conductor", cedula);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as unknown as ViajeRaw[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

type CierreRow = {
  cod_conductor: string;
  conductor_nombre: string | null;
  cedula_conductor: string | null;
  fecha: string;
  ruta: string | null;
  salario_neto_dia: number | null;
};

const CIERRE_COLS =
  "cod_conductor, conductor_nombre, cedula_conductor, fecha, ruta, salario_neto_dia";

/** Cierres diarios de un rango (opcionalmente de un conductor), paginados. */
async function fetchCierres(
  ini: string,
  fin: string,
  cedula?: string
): Promise<CierreRow[]> {
  const supabase = createAdminClient();
  const all: CierreRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("cierres_diarios")
      .select(CIERRE_COLS)
      .gte("fecha", ini)
      .lte("fecha", fin)
      .order("fecha", { ascending: true })
      .order("cod_conductor", { ascending: true })
      .range(from, from + PAGE - 1);
    if (cedula) query = query.eq("cedula_conductor", cedula);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as unknown as CierreRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

function mapEntrega(row: Record<string, unknown>): EntregaRow {
  return {
    ...(row as unknown as EntregaRow),
    viajes: Array.isArray(row.viajes) ? (row.viajes as number[]) : [],
    valor_entregado: Number(row.valor_entregado ?? 0),
    // Filas anteriores a la migración 034: pagos vigentes normales.
    estado: (row.estado as EntregaRow["estado"]) ?? "activa",
    segundo_pago: Boolean(row.segundo_pago ?? false),
    // Filas anteriores a la migración 035: entregas del día, no extemporáneas.
    extemporanea: Boolean(row.extemporanea ?? false),
    saldo_antes: row.saldo_antes != null ? Number(row.saldo_antes) : null,
    saldo_despues: row.saldo_despues != null ? Number(row.saldo_despues) : null,
  };
}

/** Estado completo de un conductor para la pantalla de caja. */
export async function getEstadoConductor(
  cedula: string,
  fecha: string
): Promise<EstadoConductor> {
  const supabase = createAdminClient();
  const baseDiaria = await getBaseDiaria();
  const quincena = quincenaDe(fecha);

  // El corte a corte solo considera hasta la fecha consultada. La producción
  // sale de los cierres (salario neto día); los viajes son solo soporte.
  const cierres = await fetchCierres(quincena.ini, fecha, cedula);
  const viajes = await fetchViajes(fecha, fecha, cedula);

  const { data: entRows, error: entErr } = await supabase
    .from("devengados_entregas")
    .select("*")
    .eq("cedula_conductor", cedula)
    .gte("fecha", quincena.ini)
    .lte("fecha", fecha)
    .order("created_at", { ascending: true });
  if (entErr) throw entErr;
  const entregas = (entRows ?? []).map(mapEntrega);

  const porDia = new Map<string, number>();
  for (const c of cierres) {
    porDia.set(c.fecha, (porDia.get(c.fecha) ?? 0) + (c.salario_neto_dia ?? 0));
  }
  // Solo los pagos vigentes descuentan disponible: una devolución total
  // reversa el movimiento y libera el cupo de nuevo.
  const vigentes = entregas.filter(esPagoVigente);
  const entregado = vigentes.reduce((s, e) => s + e.valor_entregado, 0);
  const resumen = calcularQuincena(
    [...porDia.entries()].map(([f, p]) => ({ fecha: f, produccion: p })),
    baseDiaria,
    entregado
  );

  const liquidados = new Set<number>(entregas.flatMap((e) => e.viajes));
  const viajesDia: ViajeDia[] = viajes.map((v) => ({
      numero: v.numero,
      viaje: v.viaje,
      ruta: v.ruta_programada ?? v.ruta_reprogramada,
      hora_despacho: v.hora_despacho,
      hora_llegada: v.hora_llegada,
      placa: v.placa,
      codigo_vehiculo: v.codigo_vehiculo,
      bruto: v.bruto,
      neto: v.neto,
      estado: v.estado,
      novedad: v.novedad,
      liquidado: liquidados.has(v.numero),
    }));

  const pagosDia = vigentes.filter((e) => e.fecha === fecha);
  return {
    cedula,
    fecha,
    baseDiaria,
    quincena,
    resumen,
    viajesDia,
    produccionDia: porDia.get(fecha) ?? 0,
    entregadoDia: pagosDia.reduce((s, e) => s + e.valor_entregado, 0),
    pagosHoy: pagosDia.length,
    bloqueo: await getBloqueoActivo(cedula),
    entregas,
  };
}

export interface FilaAnalisis {
  cedula: string;
  codigo: string | null;
  nombre: string | null;
  resumen: ResumenQuincena;
}

/** Análisis consolidado de la quincena para todos los conductores con viajes. */
export async function getAnalisisQuincena(fecha: string): Promise<{
  baseDiaria: number;
  quincena: ReturnType<typeof quincenaDe>;
  filas: FilaAnalisis[];
}> {
  const supabase = createAdminClient();
  const baseDiaria = await getBaseDiaria();
  const quincena = quincenaDe(fecha);

  const cierres = await fetchCierres(quincena.ini, fecha);

  const { data: entRows, error: entErr } = await supabase
    .from("devengados_entregas")
    .select("cedula_conductor, valor_entregado, movimiento, estado")
    .gte("fecha", quincena.ini)
    .lte("fecha", fecha)
    .eq("movimiento", "DEBITO")
    .eq("estado", "activa");
  if (entErr) throw entErr;

  type Acum = {
    codigo: string | null;
    nombre: string | null;
    porDia: Map<string, number>;
    entregado: number;
  };
  const porConductor = new Map<string, Acum>();
  for (const c of cierres) {
    // Filas viejas sin re-sincronizar aún no traen cédula: se agrupan por
    // código para no perderlas, pero sin cédula no cruzan con entregas.
    const ced = c.cedula_conductor ?? c.cod_conductor;
    if (!ced) continue;
    let acc = porConductor.get(ced);
    if (!acc) {
      acc = {
        codigo: c.cod_conductor,
        nombre: c.conductor_nombre,
        porDia: new Map(),
        entregado: 0,
      };
      porConductor.set(ced, acc);
    }
    acc.porDia.set(
      c.fecha,
      (acc.porDia.get(c.fecha) ?? 0) + (c.salario_neto_dia ?? 0)
    );
  }
  for (const e of entRows ?? []) {
    const acc = porConductor.get(e.cedula_conductor as string);
    if (acc) acc.entregado += Number(e.valor_entregado ?? 0);
  }

  const filas: FilaAnalisis[] = [...porConductor.entries()].map(
    ([cedula, acc]) => ({
      cedula,
      codigo: acc.codigo,
      nombre: acc.nombre,
      resumen: calcularQuincena(
        [...acc.porDia.entries()].map(([f, p]) => ({ fecha: f, produccion: p })),
        baseDiaria,
        acc.entregado
      ),
    })
  );

  filas.sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? ""));
  return { baseDiaria, quincena, filas };
}

/** Entregas de un día (registro para el traslado manual a GEMA). */
export async function getEntregasDia(fecha: string): Promise<EntregaRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("devengados_entregas")
    .select("*")
    .eq("fecha", fecha)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapEntrega);
}

export interface CajeroInfo {
  nombre: string | null;
  email: string | null;
}

export interface DatosEntregasDia {
  entregas: EntregaRow[];
  /** Nombre/email por id de perfil (cajeros que aprobaron o devolvieron). */
  cajeros: Record<string, CajeroInfo>;
  /** Acumulado quincenal vigente por cédula, al corte de la fecha. */
  acumQuincena: Record<string, number>;
}

/**
 * Entregas del día enriquecidas para reportes: cajero pagador identificado
 * y acumulado quincenal por conductor (exportación a Contabilidad).
 */
export async function getDatosEntregasDia(fecha: string): Promise<DatosEntregasDia> {
  const supabase = createAdminClient();
  const entregas = await getEntregasDia(fecha);

  const ids = [
    ...new Set(
      entregas
        .flatMap((e) => [e.aprobada_por, e.devuelta_por])
        .filter((v): v is string => !!v)
    ),
  ];
  const cajeros: Record<string, CajeroInfo> = {};
  if (ids.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    for (const p of data ?? []) {
      cajeros[p.id as string] = {
        nombre: (p.full_name as string) ?? null,
        email: (p.email as string) ?? null,
      };
    }
  }

  const quincena = quincenaDe(fecha);
  const { data: qRows, error: qErr } = await supabase
    .from("devengados_entregas")
    .select("cedula_conductor, valor_entregado, movimiento, estado")
    .gte("fecha", quincena.ini)
    .lte("fecha", fecha)
    .eq("movimiento", "DEBITO")
    .eq("estado", "activa");
  if (qErr) throw qErr;
  const acumQuincena: Record<string, number> = {};
  for (const r of qRows ?? []) {
    const ced = r.cedula_conductor as string;
    acumQuincena[ced] = (acumQuincena[ced] ?? 0) + Number(r.valor_entregado ?? 0);
  }

  return { entregas, cajeros, acumQuincena };
}
